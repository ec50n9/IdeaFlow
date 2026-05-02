import { CardNode, AIProviderConfig, AIModelConfig, CallMode, DialogMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import { generateText, streamText, generateImage } from 'ai';
import { extractAndStoreImages, resolveImageUrl } from '@/lib/imageUtils';
import { ASSISTANT_LOADING_PLACEHOLDER } from '@/lib/constants';
import { createLanguageModel, createImageModel } from '@/lib/aiProviders';
import {
  geminiGenerateImage,
  geminiEditImage,
  openaiEditImage,
  responsesGenerateImage,
  responsesEditImage,
} from '@/lib/imageApi';

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
// 核心 AI 调用
// ─────────────────────────────────────────────────────────────

export interface CallAIOptions {
  signal?: AbortSignal;
  onChunk?: OnChunk;
  images?: string[];
  mode?: CallMode;
  messages?: ChatMessage[];
}

export async function callAI(
  prompt: string,
  modelRef: string,
  options?: CallAIOptions
): Promise<string> {
  const { providerConfig, modelConfig } = resolveModel(modelRef);

  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const mode = options?.mode || inferMode(modelConfig, 'text');
  validateCapability(modelConfig, mode);

  if (modelConfig.protocol === 'openai-responses' && (mode === 'generateImage' || mode === 'editImage')) {
    if (!modelConfig.imageModel) {
      throw new Error(`模型 "${modelConfig.model}" 使用 Responses API 协议进行图片生成/编辑时，必须配置图像模型（如 gpt-image-2）。请在模型配置中心补全该模型的「图像模型」字段。`);
    }
  }

  switch (mode) {
    case 'chat': {
      const model = createLanguageModel(providerConfig, modelConfig);

      // 准备消息
      const chatMessages: ChatMessage[] = [];
      if (options?.messages) {
        chatMessages.push(...options.messages.map((m) => ({
          ...m,
          content: typeof m.content === 'string'
            ? m.content
            : m.content.map((c) => ({ ...c })),
        })));
      } else if (prompt) {
        chatMessages.push({ role: 'user', content: prompt });
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

    case 'generateImage': {
      if (modelConfig.protocol === 'openai') {
        const imageModel = createImageModel(providerConfig, modelConfig);
        if (!imageModel) {
          throw new Error('OpenAI Image Model 创建失败');
        }
        const { image } = await generateImage({
          model: imageModel,
          prompt,
          abortSignal: options?.signal,
        });
        const dataUrl = `data:image/png;base64,${image.base64}`;
        return `![Generated Image](${dataUrl})`;
      } else if (modelConfig.protocol === 'openai-responses') {
        return await responsesGenerateImage({
          apiKey: providerConfig.apiKey,
          endpoint: providerConfig.endpoint,
          model: modelConfig.model,
          prompt,
          imageModel: modelConfig.imageModel,
          signal: options?.signal,
        });
      } else if (modelConfig.protocol === 'gemini') {
        return await geminiGenerateImage({
          apiKey: providerConfig.apiKey,
          endpoint: providerConfig.endpoint,
          model: modelConfig.model,
          prompt,
          signal: options?.signal,
        });
      } else {
        throw new Error(`协议 "${modelConfig.protocol}" 不支持文生图功能`);
      }
    }

    case 'editImage': {
      const images = options!.images!;
      if (modelConfig.protocol === 'openai') {
        return await openaiEditImage({
          apiKey: providerConfig.apiKey,
          endpoint: providerConfig.endpoint,
          model: modelConfig.model,
          prompt,
          images,
          signal: options?.signal,
        });
      } else if (modelConfig.protocol === 'openai-responses') {
        return await responsesEditImage({
          apiKey: providerConfig.apiKey,
          endpoint: providerConfig.endpoint,
          model: modelConfig.model,
          prompt,
          images,
          imageModel: modelConfig.imageModel,
          signal: options?.signal,
        });
      } else if (modelConfig.protocol === 'gemini') {
        return await geminiEditImage({
          apiKey: providerConfig.apiKey,
          endpoint: providerConfig.endpoint,
          model: modelConfig.model,
          prompt,
          images,
          signal: options?.signal,
        });
      } else {
        throw new Error(`协议 "${modelConfig.protocol}" 不支持图生图功能`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 组装 Messages（从 Dialog 卡片）
// ─────────────────────────────────────────────────────────────

async function buildMessagesForDialog(
  dialogId: string,
  userContent: string
): Promise<{ messages: ChatMessage[]; images: string[]; prompt: string }> {
  const store = useStore.getState();
  const dialog = store.nodes.find((n) => n.id === dialogId && n.data.cardType === 'dialog');
  if (!dialog) {
    throw new Error('未找到对话卡片');
  }

  const items = dialog.data.items || [];
  const messages = dialog.data.messages || [];
  const images: string[] = [];

  const resultMessages: ChatMessage[] = [];

  // 1. 编排的上下文项（enabled 的）
  for (const item of items) {
    if (item.enabled === false) continue;

    const card = store.nodes.find((n) => n.id === item.sourceCardId && n.data.cardType === 'atom');
    if (!card) continue;

    let content = card.data.content || '';
    if (card.data.atomType === 'image') {
      // 将 idb:// 引用解析为 data URL，供 AI SDK 使用
      if (content.startsWith('idb://')) {
        const resolved = await resolveImageUrl(content);
        content = resolved || content;
      }
      images.push(content);
      resultMessages.push({
        role: item.role,
        content: [{ type: 'image_url', image_url: { url: content } }],
      });
    } else {
      resultMessages.push({
        role: item.role,
        content,
      });
    }
  }

  // 2. 历史对话（排除占位和未完成的 assistant 消息）
  const historyMessages = messages.filter(
    (m) => m.content.trim().length > 0 && !(m.role === 'assistant' && m.content === ASSISTANT_LOADING_PLACEHOLDER)
  );
  for (const msg of historyMessages) {
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

  // 4. 图片生成用的简化 prompt（不包含历史对话，只包含原子卡片文本 + 当前输入）
  const promptParts: string[] = [];
  for (const item of items) {
    if (item.enabled === false) continue;
    const card = store.nodes.find((n) => n.id === item.sourceCardId && n.data.cardType === 'atom');
    if (!card || card.data.atomType === 'image') continue;
    promptParts.push(card.data.content || '');
  }
  promptParts.push(userContent);
  const prompt = promptParts.join('\n\n');

  return { messages: resultMessages, images, prompt };
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

  // 2. 构建 messages / prompt
  const { messages, images, prompt } = await buildMessagesForDialog(dialogId, userContent);

  // 3. 创建 assistant 占位消息
  const assistantMessageId = uuidv4();
  const assistantMessage: DialogMessage = {
    id: assistantMessageId,
    role: 'assistant',
    content: outputType === 'image' ? ASSISTANT_LOADING_PLACEHOLDER : '',
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
    let result = await callAI(prompt, modelRef, {
      signal: abortController.signal,
      onChunk: outputType === 'text' ? onChunk : undefined,
      images: images.length > 0 ? images : undefined,
      mode,
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
