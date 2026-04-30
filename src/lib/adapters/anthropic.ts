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

export class AnthropicAdapter implements ModelAdapter {
  supportsStreaming = true;

  private getEndpoint(): string {
    return 'https://api.anthropic.com/v1/messages';
  }

  private getHeaders(apiKey: string): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerously-allow-browser': 'true',
    };
  }

  private buildBody(model: string, prompt: string, stream: boolean = false): object {
    return {
      model,
      max_tokens: 4096,
      messages: [
        { role: 'user', content: prompt }
      ],
      stream,
    };
  }

  async chat(params: AdapterParams): Promise<AdapterResult> {
    const endpoint = this.getEndpoint();
    const body = this.buildBody(params.model, params.prompt);

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
    let text = data.content?.[0]?.text || '[]';
    return { content: normalizeJsonText(text), payload: data };
  }

  async chatStream(params: AdapterParams, onChunk: OnChunk): Promise<AdapterResult> {
    const endpoint = this.getEndpoint();
    const body = this.buildBody(params.model, params.prompt, true);

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
      (parsed) => parsed.delta?.text || '',
      params.signal
    );

    let text = accumulated || '[]';
    return { content: normalizeJsonText(text), payload: accumulated };
  }

  async generateImage(_params: AdapterParams): Promise<AdapterResult> {
    throw new Error('Anthropic 协议当前不支持文生图功能');
  }

  async editImage(_params: AdapterParams & { images: string[] }): Promise<AdapterResult> {
    throw new Error('Anthropic 协议当前不支持图生图功能');
  }
}
