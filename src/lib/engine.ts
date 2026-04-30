import { GoogleGenAI, Type } from "@google/genai";
import { IdeaNode, ActionConfig, AIProviderConfig, AIModelConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { Node, Edge } from '@xyflow/react';
import { buildLayout, releaseDirections, computeNodeGroup, computeNewNodePositions } from '@/lib/layout';

const taskRegistry = new Map<string, {
  abortController: AbortController;
  worker?: Worker;
  nodeIds: string[];
}>();

export function cancelTask(taskId: string) {
  const task = taskRegistry.get(taskId);
  if (task) {
    task.abortController.abort();
    if (task.worker) {
      task.worker.terminate();
    }
  }
  clearTask(taskId);
}

function clearTask(taskId: string) {
  const task = taskRegistry.get(taskId);
  if (!task) return;

  const store = useStore.getState();
  store.setNodes(
    store.nodes.map((node) => {
      if (task.nodeIds.includes(node.id)) {
        return {
          ...node,
          data: {
            ...node.data,
            runningActions: (node.data.runningActions || []).filter((ra) => ra.taskId !== taskId),
          },
        };
      }
      return node;
    })
  );

  taskRegistry.delete(taskId);
}

async function callAI(prompt: string, modelId?: string, signal?: AbortSignal) {
  if (!modelId) {
    throw new Error('此动作未配置 AI 模型，请在动作配置中心选择模型。');
  }

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const store = useStore.getState();
  
  let providerConfig: AIProviderConfig | null = null;
  let modelConfig: AIModelConfig | null = null;

  for (const p of store.providers || []) {
    const m = p.models.find(mod => mod.id === modelId);
    if (m) {
      providerConfig = p;
      modelConfig = m;
      break;
    }
  }

  if (!providerConfig || !modelConfig) {
    throw new Error(`未找到 ID 为 "${modelId}" 的模型配置，请在模型配置中心检查配置。`);
  }

  const type = modelConfig.type || 'text';

  const textInstruction = '\n\n请务必只输出严格的 JSON 数组格式，例如 [{"content": "生成的内容1"}, {"content": "生成的内容2"}]。请根据任务要求决定输出的数组元素个数，如果任务没有明确要求拆分节点，则务必将所有内容整合到一个对象的 content 中，即数组中只有一个对象。不要输出任何额外的标记或解释文字。';

  if (providerConfig.provider === 'gemini') {
    const apiKey = providerConfig.apiKey || process.env.GEMINI_API_KEY || "";
    const modelName = modelConfig.model;
    const googleAi = new GoogleGenAI({ apiKey });
    
    if (type !== 'text') {
      throw new Error("Gemini SDK wrapper currently only configured for text models here. Please use custom endpoint or text.");
    }

    const response = await googleAi.models.generateContent({
      model: modelName,
      contents: prompt + textInstruction.replace(/\n/g, '\n'),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              content: {
                type: Type.STRING,
              }
            },
            required: ["content"],
          }
        }
      }
    });

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let text = response.text || "[]";
    text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(text);
  }

  // OpenAI or Custom (assumed OpenAI compatible format)
  if (providerConfig.provider === 'openai' || providerConfig.provider === 'custom') {
    let endpoint = providerConfig.endpoint || 'https://api.openai.com/v1/chat/completions';
    
    let body: any = {};
    if (type === 'text') {
      const baseUrl = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint.replace(/\/$/, '')}/chat/completions`;
      endpoint = baseUrl;
      body = {
        model: modelConfig.model,
        messages: [
          { role: 'user', content: prompt + textInstruction.replace(/\n/g, '\n') }
        ]
      };
    } else if (type === 'image') {
      const baseUrl = endpoint.endsWith('/images/generations') ? endpoint : `${endpoint.replace(/\/$/, '')}/images/generations`;
      endpoint = baseUrl;
      body = {
        model: modelConfig.model,
        prompt: prompt,
        n: 1
      };
    } else if (type === 'video') {
      body = {
        model: modelConfig.model,
        prompt: prompt
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${providerConfig.apiKey}`
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
    }

    const data = await response.json();
    
    if (type === 'text') {
      let text = data.choices[0]?.message?.content || "[]";
      text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      return JSON.parse(text);
    } else if (type === 'image') {
      const url = data.data?.[0]?.url || "";
      return [{ content: `![Generated Image](${url})`, payload: data }];
    } else {
      return [{ content: "Video/Other Generated", payload: data }];
    }
  }

  // Anthropic
  if (providerConfig.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': providerConfig.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerously-allow-browser': 'true'
      },
      body: JSON.stringify({
        model: modelConfig.model,
        max_tokens: 4096,
        messages: [
          { role: 'user', content: prompt + textInstruction.replace(/\n/g, '\n') }
        ]
      }),
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
    }

    const data = await response.json();
    let text = data.content?.[0]?.text || "[]";
    text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
    return JSON.parse(text);
  }

  throw new Error('Unsupported AI provider');
}

// Ensure the worker is imported with ?worker suffix for Vite
import ActionWorker from './actionWorker?worker';

export async function executeWorkerCode(
  code: string,
  nodes: IdeaNode[],
  options?: { signal?: AbortSignal; onWorker?: (worker: Worker) => void }
): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new ActionWorker();

    if (options?.onWorker) {
      options.onWorker(worker);
    }

    if (options?.signal) {
      const onAbort = () => {
        worker.terminate();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    const messageId = Math.random().toString(36).substring(7);

    worker.onmessage = async (e) => {
      const data = e.data;
      if (data.type === 'CALL_AI') {
        try {
          const result = await callAI(data.prompt, data.modelId, options?.signal);
          worker.postMessage({ type: 'AI_RESULT', callId: data.callId, result });
        } catch (err: any) {
          worker.postMessage({ type: 'AI_RESULT', callId: data.callId, error: err.message });
        }
      } else if (data.type === 'EXECUTE_RESULT' && data.messageId === messageId) {
        worker.terminate();
        resolve(data.result);
      } else if (data.type === 'EXECUTE_ERROR' && data.messageId === messageId) {
        worker.terminate();
        reject(new Error(data.error));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };

    worker.postMessage({ code, nodes, messageId });
  });
}

// ─────────────────────────────────────────────────────────────
// 布局提交辅助函数
// ─────────────────────────────────────────────────────────────

function commitLayout(
  action: ActionConfig,
  sourceNodes: IdeaNode[],
  results: any[],
  sourceMeta: Record<string, any>,
  taskId?: string
) {
  const store = useStore.getState();
  const { newNodes, newEdges, updatedSourceNodes } = buildLayout({
    actionConnectionType: action.output.connectionType,
    sourceNodes,
    results,
    sourceMeta,
    existingNodes: store.nodes,
    existingEdges: store.edges,
    taskId,
  });

  store.setNodes([
    ...store.nodes.map((node) => {
      const updated = updatedSourceNodes.find((u) => u.id === node.id);
      return updated || node;
    }),
    ...newNodes,
  ]);
  store.setEdges([...store.edges, ...newEdges]);
}

// Execute an Action
export async function processAction(action: ActionConfig, selectedNodes: IdeaNode[]) {
  const taskId = uuidv4();
  const abortController = new AbortController();

  taskRegistry.set(taskId, {
    abortController,
    nodeIds: selectedNodes.map((n) => n.id),
  });

  const store = useStore.getState();
  const runningAction = { taskId, actionId: action.id, actionName: action.name };

  store.setNodes(
    store.nodes.map((node) => {
      if (selectedNodes.find((s) => s.id === node.id)) {
        return {
          ...node,
          data: {
            ...node.data,
            runningActions: [...(node.data.runningActions || []), runningAction],
          },
        };
      }
      return node;
    })
  );

  try {
    const combinedContent = selectedNodes.map(n => n.data.content).join('\n\n---\n\n');
    let results: any = null;
    let providerName = '';
    let modelName = '';

    if (action.processor.type === 'llm') {
      const freshStore = useStore.getState();
      if (action.processor.modelId) {
        for (const p of freshStore.providers || []) {
          const m = p.models.find((mod: any) => mod.id === action.processor.modelId);
          if (m) {
            providerName = p.name;
            modelName = m.name;
            break;
          }
        }
      }

      let basePrompt = action.processor.payload.replace(/\{\{selected_content\}\}/g, combinedContent);
      selectedNodes.forEach((node, index) => {
        basePrompt = basePrompt.replace(new RegExp(`\\\{\{node_${index}\}\}`, 'g'), node.data.content);
      });

      try {
        results = await callAI(basePrompt, action.processor.modelId, abortController.signal);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        console.error("Failed to parse JSON response", e);
        const msg = e instanceof Error ? e.message : String(e);
        results = [{ content: `请求失败: ${msg}` }];
      }

    } else if (action.processor.type === 'code') {
      try {
        results = await executeWorkerCode(action.processor.payload, selectedNodes, {
          signal: abortController.signal,
          onWorker: (w) => {
            const task = taskRegistry.get(taskId);
            if (task) task.worker = w;
          },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        console.error("Failed to execute code logic", e);
        results = [{ content: "Error executing custom code: " + (e instanceof Error ? e.message : String(e)) }];
      }
    }

    // Process the results based on structure
    if (results) {
      const sourceMeta = {
        sourceType: action.processor.type === 'llm' || action.processor.type === 'code' ? 'ai' : 'manual',
        sourceAction: action.name,
        sourceProvider: providerName,
        sourceModel: modelName,
      };

      if (Array.isArray(results)) {
        if (results.length > 0) {
          commitLayout(action, selectedNodes, results, sourceMeta, taskId);
        }
      } else if (typeof results === 'object') {
        if (results.nodes || results.edges) {
          // Custom graph override mapping explicitly provided nodes and edges
          applyCustomGraphConfig(selectedNodes, results, sourceMeta);
        } else if (results.content) {
          // Single object acting as a node payload
          commitLayout(action, selectedNodes, [results], sourceMeta, taskId);
        } else {
          // Fallback, treat it as empty or missing expected fields
          commitLayout(action, selectedNodes, [results], sourceMeta, taskId);
        }
      } else if (typeof results === 'string') {
        // Raw string
        commitLayout(action, selectedNodes, [{ content: results }], sourceMeta, taskId);
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Action cancelled');
      return;
    }
    console.error("Error processing action:", error);
  } finally {
    clearTask(taskId);
    releaseDirections(taskId);
  }
}

// ─────────────────────────────────────────────────────────────
// 自定义图表配置（Code Action 自定义 nodes/edges）
// ─────────────────────────────────────────────────────────────

function applyCustomGraphConfig(sourceNodes: IdeaNode[], config: any, sourceMeta: any) {
  const store = useStore.getState();

  const sourceGroup = computeNodeGroup(sourceNodes);
  const rawNodes = config.nodes || [];
  const tempIds = rawNodes.map((_: any, i: number) => `custom-pos-${i}`);

  // 为没有 position 的节点计算默认位置（默认 fan-out down）
  const defaultPositions = computeNewNodePositions(
    'down',
    sourceGroup.bbox,
    sourceGroup.center,
    tempIds
  );

  const customNodes = rawNodes.map((n: any, i: number) => {
    const id = n.id || uuidv4();
    const pos = n.position || defaultPositions.get(tempIds[i]) || { x: 0, y: 0 };
    
    return {
      id,
      type: n.type || 'ideaNode',
      ...n,
      position: pos,
      data: {
        content: n.content || n.data?.content || '',
        ...n.data,
        ...sourceMeta,
        status: n.data?.status || n.status || 'idle',
      },
    };
  });

  const customEdges = config.edges || [];

  store.setNodes([
    ...store.nodes.map((node: IdeaNode) => 
      sourceNodes.find(s => s.id === node.id)
        ? { ...node, data: { ...node.data, status: 'idle' }, selected: false }
        : node
    ),
    ...customNodes
  ]);

  store.setEdges([
    ...store.edges,
    ...customEdges
  ]);
}
