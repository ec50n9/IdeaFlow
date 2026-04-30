import { GoogleGenAI, Type } from "@google/genai";
import { IdeaNode, ActionConfig, AIProviderConfig, AIModelConfig } from '@/types';
import dagre from 'dagre';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { Node, Edge } from '@xyflow/react';

async function callAI(prompt: string, modelId?: string) {
  const store = useStore.getState();
  
  let providerConfig: AIProviderConfig | null = null;
  let modelConfig: AIModelConfig | null = null;

  if (modelId) {
    for (const p of store.providers || []) {
      const m = p.models.find(mod => mod.id === modelId);
      if (m) {
        providerConfig = p;
        modelConfig = m;
        break;
      }
    }
  }

  const type = modelConfig?.type || 'text';

  const textInstruction = '\n\n请务必只输出严格的 JSON 数组格式，例如 [{"content": "生成的内容1"}, {"content": "生成的内容2"}]。请根据任务要求决定输出的数组元素个数，如果任务没有明确要求拆分节点，则务必将所有内容整合到一个对象的 content 中，即数组中只有一个对象。不要输出任何额外的标记或解释文字。';

  if (!providerConfig || !modelConfig || (providerConfig.provider === 'gemini' && (!providerConfig.apiKey && process.env.GEMINI_API_KEY))) {
    const apiKey = providerConfig?.apiKey || process.env.GEMINI_API_KEY || "";
    const modelName = modelConfig?.model || "gemini-2.5-flash";
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
      body: JSON.stringify(body)
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
      })
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

export async function executeWorkerCode(code: string, nodes: IdeaNode[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new ActionWorker();
    const messageId = Math.random().toString(36).substring(7);

    worker.onmessage = async (e) => {
      const data = e.data;
      if (data.type === 'CALL_AI') {
        try {
          const result = await callAI(data.prompt, data.modelId);
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
  const store = useStore.getState();
  
  // Set processing status on selected nodes
  store.setNodes(
    store.nodes.map(node => 
      selectedNodes.find(s => s.id === node.id) 
        ? { ...node, data: { ...node.data, status: 'processing' } } 
        : node
    )
  );

  const revertLoading = () => {
    store.setNodes(
      store.nodes.map(node => 
        selectedNodes.find(s => s.id === node.id) 
          ? { ...node, data: { ...node.data, status: 'idle' } } 
          : node
      )
    );
  };

  try {
    const combinedContent = selectedNodes.map(n => n.data.content).join('\n\n---\n\n');
    let results: any = null;

    if (action.processor.type === 'llm') {
      let basePrompt = action.processor.payload.replace(/\{\{selected_content\}\}/g, combinedContent);
      selectedNodes.forEach((node, index) => {
        basePrompt = basePrompt.replace(new RegExp(`\\{\\{node_${index}\\}\\}`, 'g'), node.data.content);
      });

      try {
        results = await callAI(basePrompt, action.processor.modelId);
      } catch (e) {
        console.error("Failed to parse JSON response", e);
        results = [{ content: "Error parsing LLM response." }];
      }

    } else if (action.processor.type === 'code') {
      try {
        results = await executeWorkerCode(action.processor.payload, selectedNodes);
      } catch (e) {
        console.error("Failed to execute code logic", e);
        results = [{ content: "Error executing custom code: " + (e instanceof Error ? e.message : String(e)) }];
      }
    }

    // Process the results based on structure
    if (results) {
      if (Array.isArray(results)) {
        if (results.length > 0) {
          applyLayout(action, selectedNodes, results, store);
        } else {
          revertLoading();
        }
      } else if (typeof results === 'object') {
        if (results.nodes || results.edges) {
          // Custom graph override mapping explicitly provided nodes and edges
          applyCustomGraphConfig(selectedNodes, results, store);
        } else if (results.content) {
          // Single object acting as a node payload
          applyLayout(action, selectedNodes, [results], store);
        } else {
          // Fallback, treat it as empty or missing expected fields
          applyLayout(action, selectedNodes, [results], store);
        }
      } else if (typeof results === 'string') {
        // Raw string
        applyLayout(action, selectedNodes, [{ content: results }], store);
      } else {
        revertLoading();
      }
    } else {
      revertLoading();
    }
  } catch (error) {
    console.error("Error processing action:", error);
    store.setNodes(
      store.nodes.map(node => 
        selectedNodes.find(s => s.id === node.id) 
          ? { ...node, data: { ...node.data, status: 'error' } } 
          : node
      )
    );
  }
}

function applyCustomGraphConfig(sourceNodes: IdeaNode[], config: any, store: any) {
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

// Function to calculate layout for new nodes using dagre
function applyLayout(action: ActionConfig, sourceNodes: IdeaNode[], results: any[], store: any) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 50 });
  g.setDefaultEdgeLabel(() => ({}));

  // We only layout the newly created nodes relative to a fake "root" representing the selected nodes bounding box
  const rootId = 'root-group';
  const nodeWidth = 250;
  const nodeHeight = 100;

  g.setNode(rootId, { width: nodeWidth, height: nodeHeight });

  const newNodesMap: Record<string, IdeaNode> = {};
  const newEdgesMap: Edge[] = [];

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
      data: { content: res.content || res.data?.content || '', ...res.data, status: 'idle' },
    };

    // Connections
    if (action.output.connectionType === 'source_to_new') {
      sourceNodes.forEach(src => {
        newEdgesMap.push({
          id: `e-${src.id}-${id}`,
          source: src.id,
          target: id,
          animated: true,
        });
      });
    } else if (action.output.connectionType === 'new_to_source') {
      sourceNodes.forEach(src => {
        newEdgesMap.push({
          id: `e-${id}-${src.id}`,
          source: id,
          target: src.id,
          animated: true,
        });
      });
    }
  });

  dagre.layout(g);

  // Now, calculate the bounding box bottom center of the source nodes
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  sourceNodes.forEach((n) => {
    if (n.position.x < minX) minX = n.position.x;
    const right = n.position.x + (n.measured?.width || nodeWidth);
    if (right > maxX) maxX = right;
    const bottom = n.position.y + (n.measured?.height || nodeHeight);
    if (bottom > maxY) maxY = bottom;
  });

  const sourceCenterX = minX + (maxX - minX) / 2;
  const sourceBottomY = maxY;

  // The root node in dagre has some position. We need to offset the children
  const rootPos = g.node(rootId);

  const finalNewNodes = Object.values(newNodesMap).map((n: any) => {
    const dagreNode = g.node(n.id);
    const originalRes = results.find(r => r.id === n.id || (!r.id && n.content === r.content));
    const hasCustomPosition = originalRes && originalRes.position;

    return {
      ...n,
      position: hasCustomPosition
        ? n.position
        : {
            x: sourceCenterX + (dagreNode.x - rootPos.x) - nodeWidth / 2,
            y: sourceBottomY + (dagreNode.y - rootPos.y) + 50, // 50px gap below the lowest source node
          }
    };
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
