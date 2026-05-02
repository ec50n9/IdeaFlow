import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AIProviderConfig, AIModelConfig } from '@/types';

/**
 * 根据 Provider 配置创建 ai-sdk LanguageModel
 */
export function createLanguageModel(provider: AIProviderConfig, modelConfig: AIModelConfig) {
  switch (modelConfig.protocol) {
    case 'openai':
    case 'openai-responses': {
      const openai = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.endpoint,
      });
      return openai(modelConfig.model);
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
      return generic(modelConfig.model);
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
