import { CardNode, AIProviderConfig, AIModelConfig, CallMode, DialogMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { getAdapter, type OnChunk, TEXT_INSTRUCTION } from '@/lib/adapters';
import { extractAndStoreImages } from '@/lib/imageUtils';

const taskRegistry = new Map<string, {
  abortController: AbortController;
  nodeId: string;
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
// 组装 Prompt（从 Dialog 卡片）
// ─────────────────────────────────────────────────────────────

function buildPromptForDialog(dialogId: string, userContent: string): { prompt: string; images: string[] } {
  const store = useStore.getState();
  const dialog = store.nodes.find((n) => n.id === dialogId && n.data.cardType === 'dialog');
  if (!dialog) {
    throw new Error('未找到对话卡片');
  }

  const items = dialog.data.items || [];
  const messages = dialog.data.messages || [];

  const parts: string[] = [];
  const images: string[] = [];

  // 1. 编排的上下文项（enabled 的）
  for (const item of items) {
    if (item.enabled === false) continue;

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

  // 2. 历史对话（排除占位和未完成的 assistant 消息）
  const historyMessages = messages.filter(
    (m) => m.content.trim().length > 0 && !(m.role === 'assistant' && m.content === '生成中...')
  );
  if (historyMessages.length > 0) {
    parts.push('--- 历史对话 ---');
    for (const msg of historyMessages) {
      const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      parts.push(`${roleLabel}: ${msg.content}`);
    }
  }

  // 3. 当前用户消息
  parts.push('--- 当前 ---');
  parts.push(`User: ${userContent}`);

  return {
    prompt: parts.join('\n\n'),
    images,
  };
}

// ─────────────────────────────────────────────────────────────
// 发送对话消息（核心：直接更新 dialog.messages）
// ─────────────────────────────────────────────────────────────

export async function sendDialogMessage(
  dialogId: string,
  userContent: string,
  modelRef: string,
  outputType: 'text' | 'image' = 'text'
) {
  const taskId = uuidv4();
  const abortController = new AbortController();
  const store = useStore.getState();

  const dialog = store.nodes.find((n) => n.id === dialogId && n.data.cardType === 'dialog');
  if (!dialog) {
    throw new Error('未找到对话卡片');
  }

  // 1. 添加用户消息
  const userMessage: DialogMessage = {
    id: uuidv4(),
    role: 'user',
    content: userContent,
    createdAt: Date.now(),
  };
  store.addDialogMessage(dialogId, userMessage);

  // 2. 构建 prompt
  const { prompt, images } = buildPromptForDialog(dialogId, userContent);

  // 3. 创建 assistant 占位消息
  const assistantMessageId = uuidv4();
  const assistantMessage: DialogMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: outputType === 'image' ? '生成中...' : '',
    createdAt: Date.now(),
  };
  store.addDialogMessage(dialogId, assistantMessage);

  // 4. 设置 processing 状态
  store.updateNodeData(dialogId, { status: 'processing', modelRef, outputType });

  taskRegistry.set(taskId, {
    abortController,
    nodeId: dialogId,
  });

  const mode = inferMode(resolveModel(modelRef).modelConfig, outputType);

  const onChunk = (chunk: string, accumulated: string) => {
    store.updateDialogMessage(dialogId, assistantMessageId, accumulated);
  };

  try {
    let results: any = await callAI(prompt, modelRef, {
      signal: abortController.signal,
      onChunk: outputType === 'text' ? onChunk : undefined,
      images: images.length > 0 ? images : undefined,
      mode,
    });

    // 处理结果中的图片
    if (results) {
      results = await processResultImages(results);
    }

    // 更新最终结果
    let finalContent = '';
    if (Array.isArray(results) && results.length > 0) {
      finalContent = results[0].content || '';
    } else if (typeof results === 'string') {
      finalContent = results;
    }

    store.updateDialogMessage(dialogId, assistantMessageId, finalContent);
    store.updateNodeData(dialogId, { status: 'idle' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log('Dialog message cancelled');
      store.updateNodeData(dialogId, { status: 'idle' });
      return;
    }
    console.error('Error sending dialog message:', error);
    const msg = error instanceof Error ? error.message : String(error);
    store.updateDialogMessage(dialogId, assistantMessageId, `请求失败: ${msg}`);
    store.updateNodeData(dialogId, { status: 'error' });
  } finally {
    clearTask(taskId);
  }
}

// ─────────────────────────────────────────────────────────────
// 提取对话内容为原子卡片
// ─────────────────────────────────────────────────────────────

export function extractContentAsAtom(
  dialogId: string,
  content: string,
  atomType: 'text' | 'image' = 'text'
): CardNode {
  const store = useStore.getState();
  const dialog = store.nodes.find((n) => n.id === dialogId && n.data.cardType === 'dialog');
  if (!dialog) {
    throw new Error('未找到对话卡片');
  }

  // 统计该 dialog 已提取的卡片数，用于定位
  const extractedCount = store.edges.filter(
    (e) => e.source === dialogId && store.nodes.some((n) => n.id === e.target && n.data.cardType === 'atom')
  ).length;

  const atomNode: CardNode = {
    id: uuidv4(),
    type: 'cardNode',
    position: {
      x: dialog.position.x + 280,
      y: dialog.position.y + extractedCount * 30,
    },
    data: {
      cardType: 'atom',
      atomType,
      content,
      status: 'idle',
      sourceType: 'ai',
      isLocked: false,
    },
  };

  store.addNode(atomNode);

  const newEdges = [...store.edges];

  // 1. dialog → 新 atom（虚线，表示对话产出）
  newEdges.push({
    id: `e-${dialogId}-${atomNode.id}`,
    source: dialogId,
    sourceHandle: 'bottom-source',
    target: atomNode.id,
    targetHandle: 'top-target',
    style: { strokeDasharray: '5,5', opacity: 0.5 },
  });

  // 2. 对话中包含的源原子卡片 → 新 atom（点线，表示血缘/溯源关系）
  const sourceCardIds = dialog.data.sourceCardIds || [];
  const enabledSourceIds = new Set(
    (dialog.data.items || [])
      .filter((item) => item.enabled !== false)
      .map((item) => item.sourceCardId)
  );

  for (const sourceId of sourceCardIds) {
    if (!enabledSourceIds.has(sourceId)) continue;
    const edgeId = `e-source-${sourceId}-${atomNode.id}`;
    // 避免重复边
    if (newEdges.some((e) => e.id === edgeId)) continue;

    newEdges.push({
      id: edgeId,
      source: sourceId,
      sourceHandle: 'bottom-source',
      target: atomNode.id,
      targetHandle: 'top-target',
      style: { strokeDasharray: '2,4', opacity: 0.35 },
    });
  }

  store.setEdges(newEdges);

  return atomNode;
}
