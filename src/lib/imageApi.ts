// ─────────────────────────────────────────────────────────────
// Image Generation / Editing 自定义 API（ai-sdk 未覆盖的部分）
// ─────────────────────────────────────────────────────────────

export interface AdapterResult {
  content: Array<{ content: string }>;
  payload?: unknown;
}

// ─── Gemini Image Generation ───

export async function geminiGenerateImage(params: {
  apiKey: string;
  endpoint?: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<AdapterResult> {
  const baseUrl = params.endpoint || 'https://generativelanguage.googleapis.com/v1beta';
  const response = await fetch(`${baseUrl}/models/${params.model}:generateContent?key=${params.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: params.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
  }

  const data = await response.json();
  const parts: Array<Record<string, unknown>> = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => !!p.inlineData) as
    | { inlineData?: { data: string; mimeType?: string } }
    | undefined;

  if (imagePart?.inlineData?.data) {
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const base64 = imagePart.inlineData.data;
    const dataUrl = `data:${mimeType};base64,${base64.replace(/\s/g, '')}`;
    return { content: [{ content: `![Generated Image](${dataUrl})` }], payload: data };
  }

  const text =
    (parts.find((p) => typeof p.text === 'string') as { text?: string } | undefined)?.text ||
    '图片生成失败';
  return { content: [{ content: text }], payload: data };
}

// ─── Gemini Image Editing ───

export async function geminiEditImage(params: {
  apiKey: string;
  endpoint?: string;
  model: string;
  prompt: string;
  images: string[];
  signal?: AbortSignal;
}): Promise<AdapterResult> {
  const baseUrl = params.endpoint || 'https://generativelanguage.googleapis.com/v1beta';

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: params.prompt || '' }];

  for (const img of params.images) {
    let base64 = img;
    let mimeType = 'image/jpeg';

    if (img.startsWith('data:')) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64 = match[2];
      }
    } else if (img.startsWith('http')) {
      const imgResponse = await fetch(img);
      const blob = await imgResponse.blob();
      mimeType = blob.type || 'image/jpeg';
      base64 = await blobToBase64(blob);
    }

    parts.push({ inlineData: { mimeType, data: base64 } });
  }

  const response = await fetch(`${baseUrl}/models/${params.model}:generateContent?key=${params.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.statusText} ${await response.text()}`);
  }

  const data = await response.json();
  const resultParts: Array<Record<string, unknown>> = data.candidates?.[0]?.content?.parts || [];
  const imagePart = resultParts.find((p) => !!p.inlineData) as
    | { inlineData?: { data: string; mimeType?: string } }
    | undefined;

  if (imagePart?.inlineData?.data) {
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    const base64 = imagePart.inlineData.data;
    const dataUrl = `data:${mimeType};base64,${base64.replace(/\s/g, '')}`;
    return { content: [{ content: `![Edited Image](${dataUrl})` }], payload: data };
  }

  const text =
    (resultParts.find((p) => typeof p.text === 'string') as { text?: string } | undefined)?.text ||
    '图片编辑失败';
  return { content: [{ content: text }], payload: data };
}

// ─── OpenAI Image Editing ───

export async function openaiEditImage(params: {
  apiKey: string;
  endpoint?: string;
  model: string;
  prompt: string;
  images: string[];
  signal?: AbortSignal;
}): Promise<AdapterResult> {
  const endpoint = params.endpoint || 'https://api.openai.com/v1/images/edits';
  const formData = new FormData();
  formData.append('model', params.model);
  formData.append('prompt', params.prompt || '');

  for (let i = 0; i < params.images.length; i++) {
    const img = params.images[i];
    if (img.startsWith('data:')) {
      const blob = await dataUrlToBlob(img);
      formData.append('image[]', blob, `image-${i}.png`);
    } else if (img.startsWith('http')) {
      const imgResponse = await fetch(img);
      const blob = await imgResponse.blob();
      formData.append('image[]', blob, `image-${i}.png`);
    } else {
      formData.append('image[]', img);
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${params.apiKey}` },
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

// ─── OpenAI-Responses Image Generation / Editing ───

interface SSEEvent {
  event: string;
  data: unknown;
}

async function readResponsesStream(response: Response): Promise<SSEEvent[]> {
  if (!response.body) return [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SSEEvent[] = [];
  let currentEvent = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (let line of lines) {
        line = line.replace(/\r$/, '');
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
  } finally {
    reader.releaseLock();
  }

  return events;
}

function extractImageFromEvents(events: SSEEvent[]): { url: string; b64: string } {
  const doneEvent = events.find((e) => {
    if (e.event !== 'response.output_item.done') return false;
    const data = e.data as Record<string, unknown> | undefined;
    const item = data?.item as Record<string, unknown> | undefined;
    return item?.type === 'image_generation_call';
  });

  const rawResult = (doneEvent?.data as Record<string, unknown> | undefined)?.item;
  const itemResult = (rawResult as Record<string, unknown> | undefined)?.result;
  let result: Record<string, string> = {};
  if (typeof itemResult === 'string') {
    result = { b64_json: itemResult };
  } else if (itemResult && typeof itemResult === 'object') {
    result = itemResult as Record<string, string>;
  }

  const url = result.image_url || '';
  const b64 = result.b64_json || '';

  if (!url && !b64) {
    const completedEvent = events.find(
      (e) => e.event === 'response.image_generation_call.completed'
    );
    const data = completedEvent?.data as Record<string, unknown> | undefined;
    const item = (data?.item as Record<string, unknown> | undefined) || data;
    if (item?.result) {
      const fallbackResult =
        typeof item.result === 'string'
          ? { b64_json: item.result }
          : (item.result as Record<string, string>);
      return {
        url: fallbackResult.image_url || '',
        b64: fallbackResult.b64_json || '',
      };
    }
  }

  return { url, b64 };
}

export async function responsesGenerateImage(params: {
  apiKey: string;
  endpoint?: string;
  model: string;
  prompt: string;
  imageModel?: string;
  signal?: AbortSignal;
}): Promise<AdapterResult> {
  const endpoint = params.endpoint || 'https://api.openai.com/v1/responses';
  const body = {
    model: params.model,
    input: [{ role: 'user', content: params.prompt }],
    tools: [{ type: 'image_generation', model: params.imageModel }],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
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

export async function responsesEditImage(params: {
  apiKey: string;
  endpoint?: string;
  model: string;
  prompt: string;
  images: string[];
  imageModel?: string;
  signal?: AbortSignal;
}): Promise<AdapterResult> {
  const endpoint = params.endpoint || 'https://api.openai.com/v1/responses';
  const content: Array<Record<string, string>> = [{ type: 'input_text', text: params.prompt || '' }];

  for (const img of params.images) {
    content.push({ type: 'input_image', image_url: img });
  }

  const body = {
    model: params.model,
    input: [{ role: 'user', content }],
    tools: [{ type: 'image_generation', model: params.imageModel, action: 'edit' }],
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
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

// ─── Utilities ───

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
