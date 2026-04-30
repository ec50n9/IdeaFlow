import type { AdapterParams, AdapterResult, OnChunk, ModelAdapter } from './types';
import { OpenAIImagesAdapter } from './openai';

export class OpenAIResponsesAdapter implements ModelAdapter {
  supportsStreaming = true;
  private baseAdapter = new OpenAIImagesAdapter();

  private resolveResponsesEndpoint(endpoint?: string): string {
    if (endpoint?.endsWith('/responses')) return endpoint;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/responses`;
    return 'https://api.openai.com/v1/responses';
  }

  private getHeaders(apiKey: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
  }

  chat(params: AdapterParams): Promise<AdapterResult> {
    return this.baseAdapter.chat(params);
  }

  chatStream(params: AdapterParams, onChunk: OnChunk): Promise<AdapterResult> {
    return this.baseAdapter.chatStream(params, onChunk);
  }

  async generateImage(params: AdapterParams): Promise<AdapterResult> {
    const endpoint = this.resolveResponsesEndpoint(params.endpoint);
    const body = {
      model: params.model,
      input: params.prompt,
      tools: [{ type: 'image_generation', model: 'gpt-image-2' }],
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(params.apiKey),
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
    }

    const data = await response.json();
    const imageCalls = data.output?.filter((o: any) => o.type === 'image_generation_call') || [];
    const firstCall = imageCalls[0];
    const url = firstCall?.result?.image_url || '';
    const b64 = firstCall?.result?.b64_json || '';
    const imageUrl = url || (b64 ? `data:image/png;base64,${b64.replace(/\s/g, '')}` : '');

    return {
      content: [{ content: imageUrl ? `![Generated Image](${imageUrl})` : '图片生成失败' }],
      payload: data,
    };
  }

  async editImage(params: AdapterParams & { images: string[] }): Promise<AdapterResult> {
    const endpoint = this.resolveResponsesEndpoint(params.endpoint);
    const content: any[] = [{ type: 'input_text', text: params.prompt }];

    for (const img of params.images) {
      content.push({ type: 'input_image', image_url: img });
    }

    const body = {
      model: params.model,
      input: [{ role: 'user', content }],
      tools: [{ type: 'image_generation', model: 'gpt-image-2', action: 'edit' }],
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: this.getHeaders(params.apiKey),
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
    }

    const data = await response.json();
    const imageCalls = data.output?.filter((o: any) => o.type === 'image_generation_call') || [];
    const firstCall = imageCalls[0];
    const url = firstCall?.result?.image_url || '';
    const b64 = firstCall?.result?.b64_json || '';
    const imageUrl = url || (b64 ? `data:image/png;base64,${b64.replace(/\s/g, '')}` : '');

    return {
      content: [{ content: imageUrl ? `![Edited Image](${imageUrl})` : '图片编辑失败' }],
      payload: data,
    };
  }
}
