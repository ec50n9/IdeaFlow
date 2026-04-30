import { GoogleGenAI, Type } from "@google/genai";
import { IdeaNode, ActionConfig, AIProviderConfig, AIModelConfig } from '@/types';
import dagre from 'dagre';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { Node, Edge } from '@xyflow/react';

const taskRegistry = new Map<string, {
  abortController: AbortController;
  worker?: Worker;
  nodeIds: string[];
}>();

// Tracks source-handle allocations that have been decided but not yet written to the store.
// Used to prevent concurrent actions from picking the same free direction.
const pendingAllocations = new Map<string, Map<string, string>>(); // taskId -> nodeId -> sourceHandle

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
          applyLayout(action, selectedNodes, results, sourceMeta, taskId);
        }
      } else if (typeof results === 'object') {
        if (results.nodes || results.edges) {
          // Custom graph override mapping explicitly provided nodes and edges
          applyCustomGraphConfig(selectedNodes, results, sourceMeta);
        } else if (results.content) {
          // Single object acting as a node payload
          applyLayout(action, selectedNodes, [results], sourceMeta, taskId);
        } else {
          // Fallback, treat it as empty or missing expected fields
          applyLayout(action, selectedNodes, [results], sourceMeta, taskId);
        }
      } else if (typeof results === 'string') {
        // Raw string
        applyLayout(action, selectedNodes, [{ content: results }], sourceMeta, taskId);
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
    pendingAllocations.delete(taskId);
  }
}

function applyCustomGraphConfig(sourceNodes: IdeaNode[], config: any, sourceMeta: any) {
  const store = useStore.getState();

  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  sourceNodes.forEach((n) => {
    if (n.position.x < minX) minX = n.position.x;
    const right = n.position.x + (n.measured?.width || 250);
    if (right > maxX) maxX = right;
    const bottom = n.position.y + (n.measured?.height || 100);
    if (bottom > maxY) maxY = bottom;
  });

  const sourceCenterX = minX === Infinity ? 0 : minX + (maxX - minX) / 2;
  const sourceBottomY = maxY === -Infinity ? 0 : maxY + 50;

  const customNodes = (config.nodes || []).map((n: any, i: number) => {
    let pos = n.position;
    if (!pos) {
      pos = { x: sourceCenterX + (i * 270) - ((config.nodes.length * 270)/2), y: sourceBottomY };
    }
    
    return {
      id: n.id || uuidv4(),
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

const DIRECTION_PRIORITY = [
  { sourceHandle: 'bottom-source', targetHandle: 'top-target' },
  { sourceHandle: 'top-source', targetHandle: 'bottom-target' },
  { sourceHandle: 'left-source', targetHandle: 'right-target' },
  { sourceHandle: 'right-source', targetHandle: 'left-target' },
];

function getFreeHandlePair(nodeId: string, existingEdges: Edge[], newEdges: Edge[], excludeTaskId?: string): { sourceHandle: string; targetHandle: string } {
  const allOutgoing = [
    ...existingEdges.filter(e => e.source === nodeId),
    ...newEdges.filter(e => e.source === nodeId),
  ];
  const used = new Set(allOutgoing.map(e => e.sourceHandle || 'bottom-source'));

  // Also consider directions allocated by other concurrently-running tasks
  for (const [otherTaskId, allocations] of pendingAllocations) {
    if (excludeTaskId && otherTaskId === excludeTaskId) continue;
    if (allocations.has(nodeId)) {
      used.add(allocations.get(nodeId)!);
    }
  }

  for (const dir of DIRECTION_PRIORITY) {
    if (!used.has(dir.sourceHandle)) {
      return dir;
    }
  }

  return DIRECTION_PRIORITY[0];
}

function inferRankdir(action: ActionConfig, newEdgesMap: Edge[], sourceNodes: IdeaNode[]): 'TB' | 'BT' | 'LR' | 'RL' {
  const edge = newEdgesMap[0];
  if (!edge?.sourceHandle) return 'TB';
  const handle = edge.sourceHandle;
  if (action.output.connectionType === 'source_to_new') {
    switch (handle) {
      case 'top-source': return 'BT';
      case 'bottom-source': return 'TB';
      case 'left-source': return 'RL';
      case 'right-source': return 'LR';
    }
  } else if (action.output.connectionType === 'new_to_source') {
    switch (handle) {
      case 'top-source': return 'BT';
      case 'bottom-source': return 'TB';
      case 'left-source': return 'RL';
      case 'right-source': return 'LR';
    }
  }
  return 'TB';
}

// Function to calculate layout for new nodes using dagre
function applyLayout(action: ActionConfig, sourceNodes: IdeaNode[], results: any[], sourceMeta: any, taskId?: string) {
  const store = useStore.getState();
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // We only layout the newly created nodes relative to a fake "root" representing the selected nodes bounding box
  const rootId = 'root-group';
  const nodeWidth = 250;
  const nodeHeight = 100;

  g.setNode(rootId, { width: nodeWidth, height: nodeHeight });

  const newNodesMap: Record<string, IdeaNode> = {};
  const newEdgesMap: Edge[] = [];
  const storeEdges = store.edges;
  const sourceHandleMap = new Map<string, { sourceHandle: string; targetHandle: string }>();
  if (action.output.connectionType === 'source_to_new') {
    sourceNodes.forEach(src => {
      sourceHandleMap.set(src.id, getFreeHandlePair(src.id, storeEdges, newEdgesMap, taskId));
    });
    if (taskId) {
      pendingAllocations.set(
        taskId,
        new Map(
          Array.from(sourceHandleMap.entries()).map(([nodeId, pair]) => [nodeId, pair.sourceHandle])
        )
      );
    }
  }

  results.forEach((res, i) => {
    const id = res.id || uuidv4();
    g.setNode(id, { width: nodeWidth, height: nodeHeight });
    
    // Connect root to child in dagre memory
    g.setEdge(rootId, id);

    newNodesMap[id] = {
      id,
      type: res.type || 'ideaNode',
      ...res,
      position: res.position || { x: 0, y: 0 },
      data: { content: res.content || res.data?.content || '', ...res.data, ...sourceMeta, status: 'idle' },
    };

    // Connections
    if (action.output.connectionType === 'source_to_new') {
      sourceNodes.forEach(src => {
        const { sourceHandle, targetHandle } = sourceHandleMap.get(src.id)!;
        newEdgesMap.push({
          id: `e-${src.id}-${id}`,
          source: src.id,
          target: id,
          sourceHandle,
          targetHandle,
          animated: true,
        });
      });
    } else if (action.output.connectionType === 'new_to_source') {
      sourceNodes.forEach(src => {
        const { sourceHandle, targetHandle } = getFreeHandlePair(id, storeEdges, newEdgesMap, taskId);
        newEdgesMap.push({
          id: `e-${id}-${src.id}`,
          source: id,
          target: src.id,
          sourceHandle,
          targetHandle,
          animated: true,
        });
      });
    }
  });

  const rankdir = inferRankdir(action, newEdgesMap, sourceNodes);
  g.setGraph({ rankdir, ranksep: 100, nodesep: 50 });
  dagre.layout(g);

  // Now, calculate the bounding box of the source nodes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  sourceNodes.forEach((n) => {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    const right = n.position.x + (n.measured?.width || nodeWidth);
    if (right > maxX) maxX = right;
    const bottom = n.position.y + (n.measured?.height || nodeHeight);
    if (bottom > maxY) maxY = bottom;
  });

  const sourceCenterX = minX === Infinity ? 0 : minX + (maxX - minX) / 2;
  const sourceCenterY = minY === Infinity ? 0 : minY + (maxY - minY) / 2;
  const sourceTopY = minY === Infinity ? 0 : minY;
  const sourceBottomY = maxY === -Infinity ? 0 : maxY;
  const sourceLeftX = minX === Infinity ? 0 : minX;
  const sourceRightX = maxX === -Infinity ? 0 : maxX;

  // The root node in dagre has some position. We need to offset the children
  const rootPos = g.node(rootId);

  const finalNewNodes = Object.values(newNodesMap).map((n: any) => {
    const dagreNode = g.node(n.id);
    const originalRes = results.find(r => r.id === n.id || (!r.id && n.content === r.content));
    const hasCustomPosition = originalRes && originalRes.position;

    const dx = dagreNode.x - rootPos.x;
    const dy = dagreNode.y - rootPos.y;

    let pos: { x: number; y: number };
    if (hasCustomPosition) {
      pos = n.position;
    } else {
      switch (rankdir) {
        case 'BT':
          pos = {
            x: sourceCenterX + dx - nodeWidth / 2,
            y: sourceTopY + dy - 50,
          };
          break;
        case 'LR':
          pos = {
            x: sourceRightX + dx + 50,
            y: sourceCenterY + dy - nodeHeight / 2,
          };
          break;
        case 'RL':
          pos = {
            x: sourceLeftX + dx - 50,
            y: sourceCenterY + dy - nodeHeight / 2,
          };
          break;
        case 'TB':
        default:
          pos = {
            x: sourceCenterX + dx - nodeWidth / 2,
            y: sourceBottomY + dy + 50,
          };
          break;
      }
    }

    return { ...n, position: pos };
  });


  // Revert selected nodes status to idle and append new nodes
  store.setNodes([
    ...store.nodes.map((node: IdeaNode) => 
      sourceNodes.find(s => s.id === node.id)
        ? { ...node, data: { ...node.data, status: 'idle' }, selected: false }
        : node
    ),
    ...finalNewNodes
  ]);

  store.setEdges([
    ...store.edges,
    ...newEdgesMap
  ]);
}
