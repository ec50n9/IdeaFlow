import { AIProviderConfig, AIModelConfig } from '@/types';
import { useStore } from '@/store/useStore';
import { generateImage } from 'ai';
import { createImageModel } from '@/lib/aiProviders';
import {
  geminiGenerateImage,
  geminiEditImage,
  openaiEditImage,
  responsesGenerateImage,
  responsesEditImage,
} from '@/lib/imageApi';

const taskRegistry = new Map<string, {
  abortController: AbortController;
}>();

export function cancelImageGenTask(taskId: string) {
  const task = taskRegistry.get(taskId);
  if (task) {
    task.abortController.abort();
  }
  clearTask(taskId);
}

function clearTask(taskId: string) {
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
// 图像生成 / 编辑
// ─────────────────────────────────────────────────────────────

export async function sendImageGenRequest(
  modelRef: string,
  prompt: string,
  referenceImages?: string[]
): Promise<string> {
  const { providerConfig, modelConfig } = resolveModel(modelRef);
  const abortController = new AbortController();
  const taskId = crypto.randomUUID();

  taskRegistry.set(taskId, { abortController });

  try {
    const hasReferenceImages = referenceImages && referenceImages.length > 0;

    if (hasReferenceImages) {
      // ── 图像编辑 ──
      if (!modelConfig.imageEditing) {
        throw new Error(`模型 "${modelConfig.model}" 不支持图像编辑功能。`);
      }

      if (modelConfig.protocol === 'openai-responses' && !modelConfig.imageModel) {
        throw new Error(`模型 "${modelConfig.model}" 使用 Responses API 协议进行图片编辑时，必须配置图像模型（如 gpt-image-2）。`);
      }

      switch (modelConfig.protocol) {
        case 'openai': {
          return await openaiEditImage({
            apiKey: providerConfig.apiKey,
            endpoint: providerConfig.endpoint,
            model: modelConfig.model,
            prompt,
            images: referenceImages,
            signal: abortController.signal,
          });
        }
        case 'openai-responses': {
          return await responsesEditImage({
            apiKey: providerConfig.apiKey,
            endpoint: providerConfig.endpoint,
            model: modelConfig.model,
            prompt,
            images: referenceImages,
            imageModel: modelConfig.imageModel,
            signal: abortController.signal,
          });
        }
        case 'gemini': {
          return await geminiEditImage({
            apiKey: providerConfig.apiKey,
            endpoint: providerConfig.endpoint,
            model: modelConfig.model,
            prompt,
            images: referenceImages,
            signal: abortController.signal,
          });
        }
        default: {
          throw new Error(`协议 "${modelConfig.protocol}" 不支持图像编辑功能`);
        }
      }
    } else {
      // ── 图像生成 ──
      if (!modelConfig.imageGeneration) {
        throw new Error(`模型 "${modelConfig.model}" 不支持图像生成功能。`);
      }

      if (modelConfig.protocol === 'openai-responses' && !modelConfig.imageModel) {
        throw new Error(`模型 "${modelConfig.model}" 使用 Responses API 协议进行图片生成时，必须配置图像模型（如 gpt-image-2）。`);
      }

      switch (modelConfig.protocol) {
        case 'openai': {
          const imageModel = createImageModel(providerConfig, modelConfig);
          if (!imageModel) {
            throw new Error('OpenAI Image Model 创建失败');
          }
          const { image } = await generateImage({
            model: imageModel,
            prompt,
            abortSignal: abortController.signal,
          });
          const dataUrl = `data:image/png;base64,${image.base64}`;
          return `![Generated Image](${dataUrl})`;
        }
        case 'openai-responses': {
          return await responsesGenerateImage({
            apiKey: providerConfig.apiKey,
            endpoint: providerConfig.endpoint,
            model: modelConfig.model,
            prompt,
            imageModel: modelConfig.imageModel,
            signal: abortController.signal,
          });
        }
        case 'gemini': {
          return await geminiGenerateImage({
            apiKey: providerConfig.apiKey,
            endpoint: providerConfig.endpoint,
            model: modelConfig.model,
            prompt,
            signal: abortController.signal,
          });
        }
        default: {
          throw new Error(`协议 "${modelConfig.protocol}" 不支持图像生成功能`);
        }
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('已取消');
    }
    throw error;
  } finally {
    clearTask(taskId);
  }
}
