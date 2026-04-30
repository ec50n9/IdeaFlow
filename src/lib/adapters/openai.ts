import type { AdapterParams, AdapterResult, OnChunk, ModelAdapter } from './types';

async function parseSSEResponse(
  response: Response,
  onChunk: OnChunk,
  extractChunk: (parsed: any) => string,
  signal?: AbortSignal
): Promise<string> {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const text = extractChunk(parsed);
              if (text) {
                accumulated += text;
                onChunk(text, accumulated);
              }
            } catch {
              // ignore malformed JSON in stream
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

function normalizeJsonText(text: string): any {
  text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(text);
}

export class OpenAIAdapter implements ModelAdapter {
  supportsStreaming = true;

  private resolveChatEndpoint(endpoint?: string): string {
    if (endpoint?.endsWith('/chat/completions')) return endpoint;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/chat/completions`;
    return 'https://api.openai.com/v1/chat/completions';
  }

  private resolveImageEndpoint(endpoint?: string): string {
    if (endpoint?.endsWith('/images/generations')) return endpoint;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/images/generations`;
    return 'https://api.openai.com/v1/images/generations';
  }

  private resolveImageEditEndpoint(endpoint?: string): string {
    if (endpoint?.endsWith('/images/edits')) return endpoint;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/images/edits`;
    return 'https://api.openai.com/v1/images/edits';
  }

  private getHeaders(apiKey: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
  }

  async chat(params: AdapterParams): Promise<AdapterResult> {
    const endpoint = this.resolveChatEndpoint(params.endpoint);
    const body = {
      model: params.model,
      messages: [
        { role: 'user', content: params.prompt }
      ]
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
    let text = data.choices?.[0]?.message?.content || '[]';
    return { content: normalizeJsonText(text), payload: data };
  }

  async chatStream(params: AdapterParams, onChunk: OnChunk): Promise<AdapterResult> {
    const endpoint = this.resolveChatEndpoint(params.endpoint);
    const body = {
      model: params.model,
      messages: [
        { role: 'user', content: params.prompt }
      ],
      stream: true,
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

    const accumulated = await parseSSEResponse(
      response,
      onChunk,
      (parsed) => parsed.choices?.[0]?.delta?.content || '',
      params.signal
    );

    let text = accumulated || '[]';
    return { content: normalizeJsonText(text), payload: accumulated };
  }

  async generateImage(params: AdapterParams): Promise<AdapterResult> {
    const endpoint = this.resolveImageEndpoint(params.endpoint);
    const body = {
      model: params.model,
      prompt: params.prompt,
      n: 1,
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
    const url = data.data?.[0]?.url || '';
    const b64 = data.data?.[0]?.b64_json || '';
    const imageUrl = url || (b64 ? `data:image/png;base64,${b64.replace(/\s/g, '')}` : '');

    return {
      content: [{ content: imageUrl ? `![Generated Image](${imageUrl})` : '图片生成失败' }],
      payload: data,
    };
  }

  async editImage(params: AdapterParams & { images: string[] }): Promise<AdapterResult> {
    const endpoint = this.resolveImageEditEndpoint(params.endpoint);
    const formData = new FormData();
    formData.append('model', params.model);
    formData.append('prompt', params.prompt);

    for (let i = 0; i < params.images.length; i++) {
      const img = params.images[i];
      if (img.startsWith('data:')) {
        const blob = await dataUrlToBlob(img);
        formData.append('image[]', blob, `image-${i}.png`);
      } else if (img.startsWith('http')) {
        // For remote URLs, we cannot directly append to FormData.
        // The API expects file uploads. We'll try fetching the image.
        const imgResponse = await fetch(img);
        const blob = await imgResponse.blob();
        formData.append('image[]', blob, `image-${i}.png`);
      } else {
        formData.append('image[]', img);
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.apiKey}`,
        // Do NOT set Content-Type, fetch will set it with boundary for FormData
      },
      body: formData,
      signal: params.signal,
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
    }

    const data = await response.json();
    const url = data.data?.[0]?.url || '';
    const b64 = data.data?.[0]?.b64_json || '';
    const imageUrl = url || (b64 ? `data:image/png;base64,${b64.replace(/\s/g, '')}` : '');

    return {
      content: [{ content: imageUrl ? `![Edited Image](${imageUrl})` : '图片编辑失败' }],
      payload: data,
    };
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
