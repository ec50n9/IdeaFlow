import { CardNode, AIProviderConfig, AIModelConfig, DialogMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { generateText, streamText } from 'ai';
import { extractAndStoreImages, resolveImageUrl } from '@/lib/fileUtils';
import { createLanguageModel } from '@/lib/aiProviders';

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
// 消息类型与转换
// ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export type OnChunk = (chunk: string, accumulated: string) => void;

function toModelMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === 'system') {
      if (typeof m.content === 'string') {
        return { role: 'system' as const, content: m.content };
      }
      return {
        role: 'system' as const,
        content: m.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      };
    }
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: m.content.map((part) => {
        if (part.type === 'text') return { type: 'text' as const, text: part.text };
        return { type: 'image' as const, image: part.image_url.url };
      }),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 组装 Messages（从 Dialog 卡片）
// ─────────────────────────────────────────────────────────────

async function buildMessagesForDialog(
  dialogId: string,
  userContent: string
): Promise<{ messages: ChatMessage[]; hasImages: boolean }> {
  const store = useStore.getState();
  const dialog = store.nodes.find((n) => n.id === dialogId && n.data.cardType === 'dialog');
  if (!dialog) {
    throw new Error('未找到对话卡片');
  }

  const sourceCardIds = dialog.data.sourceCardIds || [];
  const historyMessages = dialog.data.messages || [];

  const resultMessages: ChatMessage[] = [];
  let hasImages = false;

  // 1. 连入的原子卡片内容统一作为 user 消息
  for (const cardId of sourceCardIds) {
    const card = store.nodes.find((n) => n.id === cardId && n.data.cardType === 'atom');
    if (!card) continue;

    let content = card.data.content || '';
    if (card.data.atomType === 'image') {
      if (content.startsWith('idb://')) {
        const resolved = await resolveImageUrl(content);
        content = resolved || content;
      }
      hasImages = true;
      resultMessages.push({
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: content } }],
      });
    } else {
      resultMessages.push({
        role: 'user',
        content,
      });
    }
  }

  // 2. 历史对话（排除占位和未完成的 assistant 消息）
  const filteredHistory = historyMessages.filter(
    (m) => m.content.trim().length > 0 && m.role !== 'assistant'
  );
  for (const msg of filteredHistory) {
    resultMessages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // 3. 当前用户消息
  resultMessages.push({
    role: 'user',
    content: userContent,
  });

  return { messages: resultMessages, hasImages };
}

// ─────────────────────────────────────────────────────────────
// 核心 AI 调用（仅 chat 模式）
// ─────────────────────────────────────────────────────────────

export interface CallChatOptions {
  signal?: AbortSignal;
  onChunk?: OnChunk;
  messages?: ChatMessage[];
}

export async function callChat(
  modelRef: string,
  options?: CallChatOptions
): Promise<string> {
  const { providerConfig, modelConfig } = resolveModel(modelRef);

  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (!modelConfig.chat) {
    throw new Error(`模型 "${modelConfig.model}" 不支持文本对话功能`);
  }

  const model = createLanguageModel(providerConfig, modelConfig);

  const chatMessages: ChatMessage[] = [];
  if (options?.messages) {
    chatMessages.push(...options.messages.map((m) => ({
      ...m,
      content: typeof m.content === 'string'
        ? m.content
        : m.content.map((c) => ({ ...c })),
    })));
  }

  const modelMessages = toModelMessages(chatMessages);
  const systemMsg = modelMessages.find((m) => m.role === 'system');
  const chatOnlyMessages = modelMessages.filter((m) => m.role !== 'system');

  if (options?.onChunk) {
    const streamResult = streamText({
      model,
      system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
      messages: chatOnlyMessages as any,
      abortSignal: options?.signal,
    });

    let accumulated = '';
    for await (const chunk of streamResult.textStream) {
      accumulated += chunk;
      options.onChunk(chunk, accumulated);
    }

    return accumulated;
  } else {
    const textResult = await generateText({
      model,
      system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
      messages: chatOnlyMessages as any,
      abortSignal: options?.signal,
    });

    return textResult.text;
  }
}

// ─────────────────────────────────────────────────────────────
// 发送对话消息（核心）
// ─────────────────────────────────────────────────────────────

export async function sendDialogMessage(
  dialogId: string,
  userContent: string,
  modelRef: string
) {
  const taskId = uuidv4();
  const abortController = new AbortController();
  const store = useStore.getState();

  const dialog = store.nodes.find((n) => n.id === dialogId && n.data.cardType === 'dialog');
  if (!dialog) {
    throw new Error('未找到对话卡片');
  }

  // 1. 构建 messages（此时 dialog 中还没有当前用户消息，避免重复）
  const { messages, hasImages } = await buildMessagesForDialog(dialogId, userContent);

  // 校验 vision 能力（当输入包含图片时）
  const { modelConfig } = resolveModel(modelRef);
  if (hasImages && !modelConfig.vision) {
    throw new Error(`模型 "${modelConfig.model}" 不支持视觉理解，无法处理图片输入。请选择支持「视觉理解」能力的模型，或移除图片类型的原子卡片。`);
  }

  // 2. 添加用户消息到 dialog UI
  const userMessage: DialogMessage = {
    id: uuidv4(),
    role: 'user',
    content: userContent,
    createdAt: Date.now(),
  };
  store.addDialogMessage(dialogId, userMessage);

  // 3. 创建 assistant 占位消息
  const assistantMessageId = uuidv4();
  const assistantMessage: DialogMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  };
  store.addDialogMessage(dialogId, assistantMessage);

  // 4. 设置 processing 状态
  store.updateNodeData(dialogId, { status: 'processing', modelRef });

  taskRegistry.set(taskId, {
    abortController,
    nodeId: dialogId,
  });

  const onChunk = (chunk: string, accumulated: string) => {
    store.updateDialogMessage(dialogId, assistantMessageId, accumulated);
  };

  try {
    let result = await callChat(modelRef, {
      signal: abortController.signal,
      onChunk,
      messages,
    });

    // 处理结果中的图片（AI 生成的图片存入 IndexedDB）
    result = await extractAndStoreImages(result);

    store.updateDialogMessage(dialogId, assistantMessageId, result);
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
  for (const sourceId of sourceCardIds) {
    const edgeId = `e-source-${sourceId}-${atomNode.id}`;
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
