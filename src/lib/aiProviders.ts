import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AIProviderConfig, AIModelConfig } from '@/types';

/**
 * 根据 Provider 配置创建 ai-sdk LanguageModel
 *
 * ⚠️ ai-sdk v3 中 createOpenAI 的默认 languageModel 已切换为 Responses API（/responses）。
 * 标准 Chat 必须显式使用 provider.chat(modelId) 来走 /chat/completions。
 */
export function createLanguageModel(provider: AIProviderConfig, modelConfig: AIModelConfig) {
  switch (modelConfig.protocol) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.endpoint,
      });
      return openai.chat(modelConfig.model);
    }
    case 'openai-responses': {
      const openai = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.endpoint,
      });
      return openai.responses(modelConfig.model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: provider.apiKey,
        baseURL: provider.endpoint,
      });
      return anthropic(modelConfig.model);
    }
    case 'gemini': {
      const google = createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL: provider.endpoint,
      });
      return google(modelConfig.model);
    }
    case 'generic': {
      const generic = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.endpoint,
      });
      return generic.chat(modelConfig.model);
    }
    default:
      throw new Error(`不支持的协议类型: ${modelConfig.protocol}`);
  }
}

/**
 * 根据 Provider 配置创建 ai-sdk ImageModel（仅 OpenAI 支持）
 */
export function createImageModel(provider: AIProviderConfig, modelConfig: AIModelConfig) {
  if (modelConfig.protocol === 'openai' || modelConfig.protocol === 'openai-responses') {
    const openai = createOpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.endpoint,
    });
    return openai.image(modelConfig.imageModel || modelConfig.model);
  }
  return null;
}
