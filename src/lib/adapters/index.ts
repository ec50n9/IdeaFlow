import type { ModelProtocol } from '@/types';
import type { ModelAdapter } from './types';
import { OpenAIAdapter } from './openai';
import { GeminiAdapter } from './gemini';
import { AnthropicAdapter } from './anthropic';
import { GenericAdapter } from './generic';

const adapterMap: Record<ModelProtocol, () => ModelAdapter> = {
  openai: () => new OpenAIAdapter(),
  gemini: () => new GeminiAdapter(),
  anthropic: () => new AnthropicAdapter(),
  generic: () => new GenericAdapter(),
};

export function getAdapter(protocol: ModelProtocol): ModelAdapter {
  const factory = adapterMap[protocol];
  if (!factory) {
    throw new Error(`不支持的协议类型: ${protocol}`);
  }
  return factory();
}

export type { AdapterParams, AdapterResult, OnChunk, ModelAdapter } from './types';
