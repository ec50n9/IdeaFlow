import type { AdapterParams, AdapterResult, OnChunk, ModelAdapter } from './types';

export class GenericAdapter implements ModelAdapter {
  supportsStreaming = false;

  async chat(params: AdapterParams): Promise<AdapterResult> {
    const endpoint = params.endpoint || 'https://api.openai.com/v1/chat/completions';
    const body = params.messages
      ? { model: params.model, messages: params.messages }
      : { model: params.model, prompt: params.prompt };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
    }

    const data = await response.json();
    return {
      content: [{ content: 'Video/Other Generated' }],
      payload: data,
    };
  }

  async chatStream(_params: AdapterParams, _onChunk: OnChunk): Promise<AdapterResult> {
    throw new Error('Generic 协议不支持流式输出');
  }

  async generateImage(params: AdapterParams): Promise<AdapterResult> {
    return this.chat(params);
  }

  async editImage(params: AdapterParams & { images: string[] }): Promise<AdapterResult> {
    return this.chat({ ...params, prompt: `${params.prompt}\n\nImages: ${params.images.join(', ')}` });
  }
}
