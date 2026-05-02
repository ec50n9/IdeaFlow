import { CardNode, AIProviderConfig, AIModelConfig, CallMode } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { getAdapter, type OnChunk, TEXT_INSTRUCTION } from '@/lib/adapters';
import { extractAndStoreImages } from '@/lib/imageUtils';

const taskRegistry = new Map<string, {
  abortController: AbortController;
  nodeIds: string[];
}>();

export function cancelTask(taskId: string) {
  const task = taskRegistry.get(taskId);
  if (task) {
    task.abortController.abort();
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
            status: 'idle' as const,
          },
        } as CardNode;
      }
      return node;
    }) as CardNode[]
  );

  taskRegistry.delete(taskId);
}

// ─────────────────────────────────────────────────────────────
// 模型解析（底层）
// ─────────────────────────────────────────────────────────────

export function resolveModel(modelRef: string): { providerConfig: AIProviderConfig; modelConfig: AIModelConfig } {
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
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
// 调用模式推断
// ─────────────────────────────────────────────────────────────

function inferMode(modelConfig: AIModelConfig, outputType: string): CallMode {
  if (outputType === 'image') {
    if (modelConfig.supportsTextToImage) return 'generateImage';
    if (modelConfig.supportsImageToImage) return 'editImage';
  }
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
  modelRef: string,
  options?: CallAIOptions
): Promise<any> {
  const { providerConfig, modelConfig } = resolveModel(modelRef);

  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const adapter = getAdapter(modelConfig.protocol);
  const hasImages = !!(options?.images && options.images.length > 0);
  const mode = options?.mode || inferMode(modelConfig, 'text');

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

  return result.content;
}

// ─────────────────────────────────────────────────────────────
// 组装 Prompt（共享逻辑）
// ─────────────────────────────────────────────────────────────

function buildPrompt(contextCardId: string): { prompt: string; images: string[]; sourceCardIds: string[] } {
  const store = useStore.getState();
  const contextCard = store.nodes.find((n) => n.id === contextCardId && n.data.cardType === 'context');
  if (!contextCard) {
    throw new Error('未找到上下文卡片');
  }

  const items = contextCard.data.items || [];
  const sourceCardIds = contextCard.data.sourceCardIds || [];

  const parts: string[] = [];
  const images: string[] = [];

  for (const item of items) {
    const card = store.nodes.find((n) => n.id === item.sourceCardId && n.data.cardType === 'atom');
    if (!card) continue;

    const content = card.data.content || '';
    if (card.data.atomType === 'image') {
      images.push(content);
      parts.push(`[图片: ${item.role}]`);
    } else {
      parts.push(`[${item.role}]\n${content}`);
    }
  }

  return {
    prompt: parts.join('\n\n---\n\n'),
    images,
    sourceCardIds,
  };
}

// ─────────────────────────────────────────────────────────────
// 执行核心：调用 AI 并更新结果卡片（共享逻辑）
// ─────────────────────────────────────────────────────────────

async function runExecutionCore(
  contextCardId: string,
  modelRef: string,
  outputType: 'text' | 'image' | 'audio',
  resultCardId: string,
  abortController: AbortController
) {
  const store = useStore.getState();

  const { prompt, images, sourceCardIds } = buildPrompt(contextCardId);

  const mode = inferMode(resolveModel(modelRef).modelConfig, outputType);

  const onChunk = (chunk: string, accumulated: string) => {
    store.updateNodeData(resultCardId, { content: accumulated });
  };

  let results: any = null;

  try {
    results = await callAI(prompt, modelRef, {
      signal: abortController.signal,
      onChunk,
      images: images.length > 0 ? images : undefined,
      mode,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    console.error('Failed to execute AI call', e);
    const msg = e instanceof Error ? e.message : String(e);
    results = [{ content: `请求失败: ${msg}` }];
  }

  // 处理结果中的图片
  if (results) {
    results = await processResultImages(results);
  }

  // 更新结果卡片
  if (Array.isArray(results) && results.length > 0) {
    const content = results[0].content || '';
    store.updateNodeData(resultCardId, {
      content,
      status: 'idle',
      atomType: outputType === 'image' && content.startsWith('data:image') ? 'image' : 'text',
    });
  } else if (typeof results === 'string') {
    store.updateNodeData(resultCardId, {
      content: results,
      status: 'idle',
    });
  }

  // 锁定所有源卡片
  for (const cardId of sourceCardIds) {
    const card = store.nodes.find((n) => n.id === cardId && n.data.cardType === 'atom');
    if (card && !card.data.isLocked) {
      store.updateNodeData(cardId, { isLocked: true });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 上下文执行（创建新 execution + result）
// ─────────────────────────────────────────────────────────────

export async function executeContext(
  contextCardId: string,
  modelRef: string,
  outputType: 'text' | 'image' | 'audio'
) {
  const taskId = uuidv4();
  const abortController = new AbortController();
  const store = useStore.getState();

  const contextCard = store.nodes.find((n) => n.id === contextCardId && n.data.cardType === 'context');
  if (!contextCard) {
    throw new Error('未找到上下文卡片');
  }

  // 创建 execution 卡片
  const executionId = uuidv4();
  const executionNode: CardNode = {
    id: executionId,
    type: 'cardNode',
    position: {
      x: contextCard.position.x + 200,
      y: contextCard.position.y,
    },
    data: {
      cardType: 'execution',
      contextCardId,
      modelRef,
      outputType,
      status: 'processing',
    },
  };

  // 创建 loading 结果卡片
  const resultId = uuidv4();
  const resultNode: CardNode = {
    id: resultId,
    type: 'cardNode',
    position: {
      x: contextCard.position.x + 400,
      y: contextCard.position.y,
    },
    data: {
      cardType: 'atom',
      atomType: outputType === 'image' ? 'image' : 'text',
      content: outputType === 'image' ? '生成中...' : '',
      status: 'processing',
      sourceType: 'ai',
    },
  };

  // 添加节点和边
  store.setNodes([...store.nodes, executionNode, resultNode]);
  store.setEdges([
    ...store.edges,
    {
      id: `e-${contextCardId}-${executionId}`,
      source: contextCardId,
      target: executionId,
    },
    {
      id: `e-${executionId}-${resultId}`,
      source: executionId,
      target: resultId,
    },
  ]);

  // 更新 execution 卡片关联的结果卡片
  store.updateNodeData(executionId, { resultCardId: resultId });

  taskRegistry.set(taskId, {
    abortController,
    nodeIds: [executionId, resultId],
  });

  try {
    await runExecutionCore(contextCardId, modelRef, outputType, resultId, abortController);

    // 更新 execution 状态
    store.updateNodeData(executionId, { status: 'success' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Execution cancelled');
      return;
    }
    console.error('Error executing context:', error);
    store.updateNodeData(resultId, {
      content: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
    });
    store.updateNodeData(executionId, { status: 'error' });
  } finally {
    clearTask(taskId);
  }
}

// ─────────────────────────────────────────────────────────────
// 重新执行（复用现有 execution + result）
// ─────────────────────────────────────────────────────────────

export async function reexecute(executionCardId: string) {
  const taskId = uuidv4();
  const abortController = new AbortController();
  const store = useStore.getState();

  const executionCard = store.nodes.find((n) => n.id === executionCardId && n.data.cardType === 'execution');
  if (!executionCard) {
    throw new Error('未找到执行卡片');
  }

  const { contextCardId, modelRef, outputType, resultCardId } = executionCard.data;
  if (!contextCardId || !modelRef || !outputType) {
    throw new Error('执行卡片配置不完整');
  }

  if (!resultCardId) {
    throw new Error('执行卡片未关联结果卡片');
  }

  // 重置结果卡片为 loading 状态
  store.updateNodeData(resultCardId, {
    content: outputType === 'image' ? '生成中...' : '',
    status: 'processing',
  });

  store.updateNodeData(executionCardId, { status: 'processing' });

  taskRegistry.set(taskId, {
    abortController,
    nodeIds: [executionCardId, resultCardId],
  });

  try {
    await runExecutionCore(contextCardId, modelRef, outputType, resultCardId, abortController);

    // 更新 execution 状态
    store.updateNodeData(executionCardId, { status: 'success' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Reexecution cancelled');
      return;
    }
    console.error('Error reexecuting:', error);
    store.updateNodeData(resultCardId, {
      content: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
    });
    store.updateNodeData(executionCardId, { status: 'error' });
  } finally {
    clearTask(taskId);
  }
}
