import { IdeaNode, ActionConfig, AIProviderConfig, AIModelConfig, ModelProtocol, CallMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { Node, Edge } from '@xyflow/react';
import { buildLayout, releaseDirections, computeNodeGroup, computeNewNodePositions } from '@/lib/layout';
import { getAdapter, type OnChunk, TEXT_INSTRUCTION } from '@/lib/adapters';

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

// ─────────────────────────────────────────────────────────────
// 模型解析
// ─────────────────────────────────────────────────────────────

function resolveModel(modelRef?: string): { providerConfig: AIProviderConfig; modelConfig: AIModelConfig } {
  if (!modelRef) {
    throw new Error('此动作未配置 AI 模型，请在动作配置中心选择模型。');
  }

  const parts = modelRef.split('/');
  if (parts.length !== 2) {
    throw new Error(`模型引用格式错误: "${modelRef}"，应为 "<供应商标识>/<模型名称>"`);
  }

  const [providerKey, modelName] = parts;
  const store = useStore.getState();

  const provider = store.providers.find((p) => p.key === providerKey);
  if (!provider) {
    throw new Error(`未找到供应商标识 "${providerKey}"，请在模型配置中心检查配置。`);
  }

  const model = provider.models.find((m) => m.model === modelName);
  if (!model) {
    throw new Error(`未找到模型 "${modelName}"（供应商: ${providerKey}），请在模型配置中心检查配置。`);
  }

  return { providerConfig: provider, modelConfig: model };
}

// ─────────────────────────────────────────────────────────────
// 图片提取
// ─────────────────────────────────────────────────────────────

function extractImagesFromNodes(nodes: IdeaNode[]): string[] {
  const images: string[] = [];
  for (const node of nodes) {
    const content = node.data.content;
    // Markdown 图片: ![alt](url)
    const mdMatches = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/g);
    if (mdMatches) {
      images.push(...mdMatches.map((m) => m.match(/\((https?:\/\/[^)]+)\)/)![1]));
    }
    // Base64 data URL（支持含换行符的 base64）
    const b64Matches = content.match(/data:image\/[^;]+;base64,[\sA-Za-z0-9+/=]+/g);
    if (b64Matches) images.push(...b64Matches);
  }
  return images;
}

// ─────────────────────────────────────────────────────────────
// 调用模式推断
// ─────────────────────────────────────────────────────────────

function inferMode(modelConfig: AIModelConfig, hasImages: boolean): CallMode {
  if (hasImages && modelConfig.supportsImageToImage) return 'editImage';
  if (modelConfig.supportsTextToImage) return 'generateImage';
  return 'chat';
}

function validateCapability(modelConfig: AIModelConfig, mode: CallMode): void {
  switch (mode) {
    case 'chat':
      if (!modelConfig.supportsText) {
        throw new Error(`模型 "${modelConfig.model}" 不支持文生文功能`);
      }
      break;
    case 'generateImage':
      if (!modelConfig.supportsTextToImage) {
        throw new Error(`模型 "${modelConfig.model}" 不支持文生图功能`);
      }
      break;
    case 'editImage':
      if (!modelConfig.supportsImageToImage) {
        throw new Error(`模型 "${modelConfig.model}" 不支持图生图功能`);
      }
      break;
  }
}

// ─────────────────────────────────────────────────────────────
// 核心 AI 调用
// ─────────────────────────────────────────────────────────────

export interface CallAIOptions {
  signal?: AbortSignal;
  onChunk?: OnChunk;
  images?: string[];
  mode?: CallMode;
}

export async function callAI(
  prompt: string,
  modelId?: string,
  options?: CallAIOptions
): Promise<any> {
  const { providerConfig, modelConfig } = resolveModel(modelId);

  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const adapter = getAdapter(modelConfig.protocol);
  const hasImages = options?.images && options.images.length > 0;
  const mode = options?.mode || inferMode(modelConfig, hasImages);

  validateCapability(modelConfig, mode);

  const params = {
    model: modelConfig.model,
    prompt,
    apiKey: providerConfig.apiKey,
    endpoint: providerConfig.endpoint,
    signal: options?.signal,
  };

  let result: { content: Array<{ content: string }>; payload?: any };

  switch (mode) {
    case 'chat': {
      const chatParams = { ...params, prompt: params.prompt + TEXT_INSTRUCTION };
      if (options?.onChunk && adapter.supportsStreaming) {
        result = await adapter.chatStream(chatParams, options.onChunk);
      } else {
        result = await adapter.chat(chatParams);
      }
      break;
    }
    case 'generateImage': {
      result = await adapter.generateImage(params);
      break;
    }
    case 'editImage': {
      result = await adapter.editImage({ ...params, images: options!.images! });
      break;
    }
  }

  // 兼容旧接口：返回 content 数组（图片结果也保持数组格式）
  return result.content;
}

// Ensure the worker is imported with ?worker suffix for Vite
import ActionWorker from './actionWorker?worker';

export async function executeWorkerCode(
  code: string,
  nodes: IdeaNode[],
  options?: { signal?: AbortSignal; onWorker?: (worker: Worker) => void; taskId?: string }
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
          const onChunk = options?.taskId
            ? (_chunk: string, accumulated: string) => {
                const store = useStore.getState();
                const task = taskRegistry.get(options.taskId!);
                if (!task) return;
                store.setNodes(
                  store.nodes.map((node) => {
                    if (task.nodeIds.includes(node.id)) {
                      return {
                        ...node,
                        data: {
                          ...node.data,
                          runningActions: (node.data.runningActions || []).map((ra) =>
                            ra.taskId === options.taskId
                              ? { ...ra, responseLength: accumulated.length }
                              : ra
                          ),
                        },
                      };
                    }
                    return node;
                  })
                );
              }
            : undefined;
          const result = await callAI(data.prompt, data.modelId, { signal: options?.signal, onChunk, mode: data.mode });
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
  const runningAction = { taskId, actionId: action.id, actionName: action.name, actionColor: action.color };

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

  const createOnChunk = (tid: string) => (_chunk: string, accumulated: string) => {
    const store = useStore.getState();
    store.setNodes(
      store.nodes.map((node) => {
        if (selectedNodes.find((s) => s.id === node.id)) {
          return {
            ...node,
            data: {
              ...node.data,
              runningActions: (node.data.runningActions || []).map((ra) =>
                ra.taskId === tid ? { ...ra, responseLength: accumulated.length } : ra
              ),
            },
          };
        }
        return node;
      })
    );
  };

  try {
    const combinedContent = selectedNodes.map((n) => n.data.content).join('\n\n---\n\n');
    let results: any = null;
    let providerName = '';
    let modelName = '';

    if (action.processor.type === 'llm') {
      const freshStore = useStore.getState();
      if (action.processor.modelId) {
        const parts = action.processor.modelId.split('/');
        if (parts.length === 2) {
          const [pKey, mName] = parts;
          const p = freshStore.providers.find((prov) => prov.key === pKey);
          if (p) {
            providerName = p.name;
            modelName = mName;
          }
        }
      }

      let basePrompt = action.processor.payload.replace(/\{\{selected_content\}\}/g, combinedContent);
      selectedNodes.forEach((node, index) => {
        basePrompt = basePrompt.replace(new RegExp(`\\\{\{node_${index}\}\}`, 'g'), node.data.content);
      });

      const images = extractImagesFromNodes(selectedNodes);

      let mode: CallMode | undefined = action.processor.mode;
      if (!mode && action.processor.modelId) {
        try {
          const { modelConfig } = resolveModel(action.processor.modelId);
          mode = inferMode(modelConfig, images.length > 0);
        } catch {
          // 模型解析失败时留给 callAI 自行抛出错误
        }
      }

      try {
        results = await callAI(basePrompt, action.processor.modelId, {
          signal: abortController.signal,
          onChunk: createOnChunk(taskId),
          images: images.length > 0 ? images : undefined,
          mode,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        console.error('Failed to execute AI call', e);
        const msg = e instanceof Error ? e.message : String(e);
        results = [{ content: `请求失败: ${msg}` }];
      }
    } else if (action.processor.type === 'code') {
      try {
        results = await executeWorkerCode(action.processor.payload, selectedNodes, {
          signal: abortController.signal,
          taskId,
          onWorker: (w) => {
            const task = taskRegistry.get(taskId);
            if (task) task.worker = w;
          },
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        console.error('Failed to execute code logic', e);
        results = [{ content: 'Error executing custom code: ' + (e instanceof Error ? e.message : String(e)) }];
      }
    }

    // Process the results based on structure
    if (results) {
      const sourceMeta = {
        sourceType: action.processor.type === 'llm' || action.processor.type === 'code' ? 'ai' : 'manual',
        sourceAction: action.name,
        sourceProvider: providerName,
        sourceModel: modelName,
        sourceColor: action.color,
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
    console.error('Error processing action:', error);
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
      sourceNodes.find((s) => s.id === node.id)
        ? { ...node, data: { ...node.data, status: 'idle' }, selected: false }
        : node
    ),
    ...customNodes,
  ]);

  store.setEdges([...store.edges, ...customEdges]);
}
