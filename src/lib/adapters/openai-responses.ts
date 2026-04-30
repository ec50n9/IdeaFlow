import type { AdapterParams, AdapterResult, OnChunk, ModelAdapter } from './types';
import { OpenAIImagesAdapter } from './openai';

interface SSEEvent {
  event: string;
  data: any;
}

async function readResponsesStream(response: Response): Promise<SSEEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SSEEvent[] = [];
  let currentEvent = '';
  let currentData = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (let line of lines) {
      line = line.replace(/\r$/, ''); // 处理 CRLF
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      } else if (line === '') {
        if (currentData && currentData !== '[DONE]') {
          try {
            events.push({ event: currentEvent, data: JSON.parse(currentData) });
          } catch {
            // ignore malformed JSON
          }
        }
        currentEvent = '';
        currentData = '';
      }
    }
  }

  // 处理 buffer 中剩余的内容
  if (buffer.trim()) {
    const lines = buffer.split('\n');
    for (let line of lines) {
      line = line.replace(/\r$/, '');
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      }
    }
    if (currentData && currentData !== '[DONE]') {
      try {
        events.push({ event: currentEvent, data: JSON.parse(currentData) });
      } catch {
        // ignore
      }
    }
  }

  return events;
}

function extractImageFromEvents(events: SSEEvent[]): { url: string; b64: string } {
  // 优先从 response.output_item.done 中提取最终图片
  const doneEvent = events.find(
    (e) =>
      e.event === 'response.output_item.done' &&
      e.data?.item?.type === 'image_generation_call'
  );

  const rawResult = doneEvent?.data?.item?.result;
  let result: any = {};
  if (typeof rawResult === 'string') {
    // result 直接是 base64 字符串
    result = { b64_json: rawResult };
  } else if (rawResult && typeof rawResult === 'object') {
    result = rawResult;
  }

  const url = result.image_url || '';
  const b64 = result.b64_json || '';

  // 备选：从 response.image_generation_call.completed 中提取
  if (!url && !b64) {
    const completedEvent = events.find(
      (e) => e.event === 'response.image_generation_call.completed'
    );
    const item = completedEvent?.data?.item || completedEvent?.data;
    if (item?.result) {
      const fallbackResult = typeof item.result === 'string'
        ? { b64_json: item.result }
        : item.result;
      return {
        url: fallbackResult.image_url || '',
        b64: fallbackResult.b64_json || '',
      };
    }
  }

  return { url, b64 };
}

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
      input: [{ role: 'user', content: params.prompt }],
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

    const events = await readResponsesStream(response);
    const { url, b64 } = extractImageFromEvents(events);
    const imageUrl = url || (b64 ? `data:image/png;base64,${b64.replace(/\s/g, '')}` : '');

    return {
      content: [{ content: imageUrl ? `![Generated Image](${imageUrl})` : '图片生成失败' }],
      payload: events,
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

    const events = await readResponsesStream(response);
    const { url, b64 } = extractImageFromEvents(events);
    const imageUrl = url || (b64 ? `data:image/png;base64,${b64.replace(/\s/g, '')}` : '');

    return {
      content: [{ content: imageUrl ? `![Edited Image](${imageUrl})` : '图片编辑失败' }],
      payload: events,
    };
  }
}
