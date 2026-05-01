import { AppNode, IdeaNode, ActionConfig, AIProviderConfig, AIModelConfig, ModelProtocol, CallMode, ModelSlot } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { Node, Edge } from '@xyflow/react';
import { buildLayout, releaseDirections, computeNodeGroup, computeNewNodePositions } from '@/lib/layout';
import { getAdapter, type OnChunk, TEXT_INSTRUCTION } from '@/lib/adapters';
import { extractAndStoreImages, extractImageUrls } from '@/lib/imageUtils';
import { resolveSlot, getSlotRef, getModelsByCapability, capabilityLabel, getUnresolvedSlots, type UnresolvedSlot } from '@/lib/modelSlots';

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
            runningActions: ((node.data as any).runningActions || []).filter((ra: any) => ra.taskId !== taskId),
          },
        } as AppNode;
      }
      return node;
    }) as AppNode[]
  );

  taskRegistry.delete(taskId);
}

// ─────────────────────────────────────────────────────────────
// 模型解析（底层）
// ─────────────────────────────────────────────────────────────

function resolveModel(modelRef?: string): { providerConfig: AIProviderConfig; modelConfig: AIModelConfig } {
  if (!modelRef) {
    throw new Error('模型引用为空。');
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

async function extractImagesFromNodes(nodes: IdeaNode[]): Promise<string[]> {
  const images: string[] = [];
  for (const node of nodes) {
    const nodeImages = await extractImageUrls(node.data.content);
    images.push(...nodeImages);
  }
  return images;
}

async function processResultImages(results: any): Promise<any> {
  if (Array.isArray(results)) {
    for (const item of results) {
      if (item && typeof item.content === 'string') {
        item.content = await extractAndStoreImages(item.content);
      }
    }
  } else if (typeof results === 'string') {
    results = await extractAndStoreImages(results);
  } else if (results && typeof results === 'object') {
    if (results.content && typeof results.content === 'string') {
      results.content = await extractAndStoreImages(results.content);
    }
    if (results.nodes && Array.isArray(results.nodes)) {
      for (const node of results.nodes) {
        const content = node.content || node.data?.content;
        if (typeof content === 'string') {
          const processed = await extractAndStoreImages(content);
          if (node.content) node.content = processed;
          if (node.data) node.data.content = processed;
        }
      }
    }
  }
  return results;
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
  slot?: ModelSlot,
  options?: CallAIOptions
): Promise<any> {
  const { providerConfig, modelConfig } = resolveSlot(slot);

  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const adapter = getAdapter(modelConfig.protocol);
  const hasImages = options?.images && options.images.length > 0;
  const mode = options?.mode || inferMode(modelConfig, hasImages);

  validateCapability(modelConfig, mode);

  if (modelConfig.protocol === 'openai-responses' && (mode === 'generateImage' || mode === 'editImage')) {
    if (!modelConfig.imageModel) {
      throw new Error(`模型 "${modelConfig.model}" 使用 Responses API 协议进行图片生成/编辑时，必须配置图像模型（如 gpt-image-2）。请在模型配置中心补全该模型的「图像模型」字段。`);
    }
  }

  const params = {
    model: modelConfig.model,
    prompt,
    apiKey: providerConfig.apiKey,
    endpoint: providerConfig.endpoint,
    signal: options?.signal,
    imageModel: modelConfig.imageModel,
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
  slots: ModelSlot[],
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
          const slot = slots.find((s) => s.identifier === data.slotRef);
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
                          runningActions: ((node.data as any).runningActions || []).map((ra: any) =>
                            ra.taskId === options.taskId
                              ? { ...ra, responseLength: accumulated.length }
                              : ra
                          ),
                        },
                      } as AppNode;
                    }
                    return node;
                  }) as AppNode[]
                );
              }
            : undefined;
          const result = await callAI(data.prompt, slot, { signal: options?.signal, onChunk, mode: data.mode });
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
  taskId?: string,
  existingActionNodeId?: string
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
    actionConfig: action,
    existingActionNodeId,
  });

  store.setNodes([
    ...store.nodes.map((node) => {
      const updated = updatedSourceNodes.find((u) => u.id === node.id);
      return updated || node;
    }),
    ...newNodes,
  ] as AppNode[]);
  store.setEdges([...store.edges, ...newEdges]);
}

// Execute an Action
export async function processAction(action: ActionConfig, selectedNodes: IdeaNode[], existingActionNodeId?: string) {
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
            runningActions: [...((node.data as any).runningActions || []), runningAction],
          },
        } as AppNode;
      }
      return node;
    }) as AppNode[]
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
              runningActions: ((node.data as any).runningActions || []).map((ra: any) =>
                ra.taskId === tid ? { ...ra, responseLength: accumulated.length } : ra
              ),
            },
          } as AppNode;
        }
        return node;
      }) as AppNode[]
    );
  };

  try {
    const combinedContent = selectedNodes.map((n) => n.data.content).join('\n\n---\n\n');
    let results: any = null;
    let providerName = '';
    let modelName = '';
    let slotName = '';

    if (action.processor.type === 'llm') {
      const slot = getSlotRef(action);
      if (!slot) {
        throw new Error('此 LLM 动作未配置模型插槽，请在动作配置中添加插槽。');
      }

      const resolved = resolveSlot(slot);
      providerName = resolved.providerConfig.name;
      modelName = resolved.modelConfig.model;
      slotName = slot.identifier;

      let basePrompt = action.processor.payload.replace(/\{\{selected_content\}\}/g, combinedContent);
      selectedNodes.forEach((node, index) => {
        basePrompt = basePrompt.replace(new RegExp(`\\\{\{node_${index}\}\}`, 'g'), node.data.content);
      });

      const images = await extractImagesFromNodes(selectedNodes);

      let mode: CallMode | undefined = action.processor.mode;
      if (!mode) {
        mode = inferMode(resolved.modelConfig, images.length > 0);
      }

      try {
        results = await callAI(basePrompt, slot, {
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
        results = await executeWorkerCode(action.processor.payload, selectedNodes, action.processor.slots || [], {
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

    // 将 results 中的 base64 图片存入 IndexedDB，替换为引用
    if (results) {
      results = await processResultImages(results);
    }

    // Process the results based on structure
    if (results) {
      const sourceMeta = {
        sourceType: action.processor.type === 'llm' || action.processor.type === 'code' ? 'ai' : 'manual',
        sourceAction: action.name,
        sourceProvider: providerName,
        sourceModel: modelName,
        sourceSlot: slotName,
        sourceColor: action.color,
        actionId: action.id,
        actionSnapshot: action,
      };

      if (Array.isArray(results)) {
        if (results.length > 0) {
          commitLayout(action, selectedNodes, results, sourceMeta, taskId, existingActionNodeId);
        }
      } else if (typeof results === 'object') {
        if (results.nodes || results.edges) {
          // Custom graph override mapping explicitly provided nodes and edges
          applyCustomGraphConfig(selectedNodes, results, sourceMeta);
        } else if (results.content) {
          // Single object acting as a node payload
          commitLayout(action, selectedNodes, [results], sourceMeta, taskId, existingActionNodeId);
        } else {
          // Fallback, treat it as empty or missing expected fields
          commitLayout(action, selectedNodes, [results], sourceMeta, taskId, existingActionNodeId);
        }
      } else if (typeof results === 'string') {
        // Raw string
        commitLayout(action, selectedNodes, [{ content: results }], sourceMeta, taskId, existingActionNodeId);
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
// 次抛模式（One-Off Action）
// ─────────────────────────────────────────────────────────────

export async function processOneOff(
  processor: ActionConfig['processor'],
  output: ActionConfig['output'],
  selectedNodes: IdeaNode[]
) {
  const tempAction: ActionConfig = {
    id: 'one-off',
    name: '次抛',
    color: 'slate',
    trigger: { minNodes: 1, maxNodes: null },
    processor,
    output,
  };
  await processAction(tempAction, selectedNodes);
}

// ─────────────────────────────────────────────────────────────
// 重新运行 Action（从已有 Action 节点触发）
// ─────────────────────────────────────────────────────────────

export async function reprocessAction(actionNodeId: string) {
  const store = useStore.getState();
  const actionNode = store.nodes.find(
    (n) => n.id === actionNodeId && n.type === 'actionNode'
  );
  if (!actionNode) return;

  // 收集源节点
  const sourceNodeIds = store.edges
    .filter((e) => e.target === actionNodeId)
    .map((e) => e.source);
  const sourceNodes = store.nodes.filter(
    (n) => sourceNodeIds.includes(n.id)
  ) as IdeaNode[];

  if (sourceNodes.length === 0) return;

  // 清除旧的输出边和结果节点
  const outputEdgeIds = new Set(
    store.edges.filter((e) => e.source === actionNodeId).map((e) => e.id)
  );
  const outputNodeIds = new Set(
    store.edges
      .filter((e) => e.source === actionNodeId)
      .map((e) => e.target)
  );

  store.setNodes(store.nodes.filter((n) => !outputNodeIds.has(n.id)) as AppNode[]);
  store.setEdges(store.edges.filter((e) => !outputEdgeIds.has(e.id)));

  const action = (actionNode.data as any).actionSnapshot;
  await processAction(action, sourceNodes, actionNodeId);
}

// ─────────────────────────────────────────────────────────────
// 拷贝 Action 配置（保存为新的 ActionConfig）
// ─────────────────────────────────────────────────────────────

export function copyActionConfig(actionNodeId: string) {
  const store = useStore.getState();
  const actionNode = store.nodes.find(
    (n) => n.id === actionNodeId && n.type === 'actionNode'
  );
  if (!actionNode) return;

  const snapshot = (actionNode.data as any).actionSnapshot;
  const newAction: ActionConfig = {
    ...snapshot,
    id: uuidv4(),
    name: `${snapshot.name} 副本`,
  };
  store.addAction(newAction);
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
    ...store.nodes.map((node) =>
      sourceNodes.find((s) => s.id === node.id)
        ? { ...node, data: { ...node.data, status: 'idle' }, selected: false }
        : node
    ) as AppNode[],
    ...customNodes as AppNode[],
  ]);

  store.setEdges([...store.edges, ...customEdges]);
}
