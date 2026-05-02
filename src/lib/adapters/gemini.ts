import { GoogleGenAI, Type } from '@google/genai';
import type { AdapterParams, AdapterResult, OnChunk, ModelAdapter, ChatMessage } from './types';
import { isTextPart } from './types';

function normalizeJsonText(text: string): any {
  text = text.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
  return JSON.parse(text);
}

export class GeminiAdapter implements ModelAdapter {
  supportsStreaming = true;

  private createClient(apiKey: string) {
    return new GoogleGenAI({ apiKey });
  }

  private buildTextConfig() {
    return {
      responseMimeType: 'application/json' as const,
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            content: { type: Type.STRING },
          },
          required: ['content'],
        },
      },
    };
  }

  private messagesToString(messages?: ChatMessage[]): string {
    if (!messages) return '';
    return messages
      .map((m) => {
        const role = m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : 'User';
        const text =
          typeof m.content === 'string'
            ? m.content
            : m.content
                .filter(isTextPart)
                .map((c) => c.text)
                .join('\n');
        return `[${role}]\n${text}`;
      })
      .join('\n\n');
  }

  async chat(params: AdapterParams): Promise<AdapterResult> {
    const googleAi = this.createClient(params.apiKey);
    const contents = params.messages ? this.messagesToString(params.messages) : (params.prompt || '');
    const config = this.buildTextConfig();

    const response = await googleAi.models.generateContent({
      model: params.model,
      contents,
      config,
    });

    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let text = response.text || '[]';
    return { content: normalizeJsonText(text), payload: response };
  }

  async chatStream(params: AdapterParams, onChunk: OnChunk): Promise<AdapterResult> {
    const googleAi = this.createClient(params.apiKey);
    const contents = params.messages ? this.messagesToString(params.messages) : (params.prompt || '');
    const config = this.buildTextConfig();

    const stream = await googleAi.models.generateContentStream({
      model: params.model,
      contents,
      config,
    });

    let accumulated = '';
    for await (const chunk of stream) {
      if (params.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      const text = chunk.text || '';
      if (text) {
        accumulated += text;
        onChunk(text, accumulated);
      }
    }

    return { content: normalizeJsonText(accumulated), payload: accumulated };
  }

  async generateImage(params: AdapterParams): Promise<AdapterResult> {
    const googleAi = this.createClient(params.apiKey);

    const response = await googleAi.models.generateContent({
      model: params.model,
      contents: params.prompt || '',
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p): p is typeof p & { inlineData: { data: string; mimeType?: string } } => {
      const candidate = p as Record<string, unknown>;
      return !!candidate.inlineData;
    });

    if (imagePart?.inlineData?.data) {
      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const base64 = imagePart.inlineData.data;
      const dataUrl = `data:${mimeType};base64,${base64.replace(/\s/g, '')}`;
      return {
        content: [{ content: `![Generated Image](${dataUrl})` }],
        payload: response,
      };
    }

    // Fallback: if no image, return text response
    const text = response.text || '图片生成失败';
    return {
      content: [{ content: text }],
      payload: response,
    };
  }

  async editImage(params: AdapterParams & { images: string[] }): Promise<AdapterResult> {
    const googleAi = this.createClient(params.apiKey);

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
        // Fetch remote image and convert to base64
        const imgResponse = await fetch(img);
        const blob = await imgResponse.blob();
        mimeType = blob.type || 'image/jpeg';
        base64 = await blobToBase64(blob);
      }

      parts.push({
        inlineData: {
          mimeType,
          data: base64,
        },
      });
    }

    const response = await googleAi.models.generateContent({
      model: params.model,
      contents: [{ parts }],
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    if (params.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const resultParts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = resultParts.find((p): p is typeof p & { inlineData: { data: string; mimeType?: string } } => {
      const candidate = p as Record<string, unknown>;
      return !!candidate.inlineData;
    });

    if (imagePart?.inlineData?.data) {
      const mimeType = imagePart.inlineData.mimeType || 'image/png';
      const base64 = imagePart.inlineData.data;
      const dataUrl = `data:${mimeType};base64,${base64.replace(/\s/g, '')}`;
      return {
        content: [{ content: `![Edited Image](${dataUrl})` }],
        payload: response,
      };
    }

    const text = response.text || '图片编辑失败';
    return {
      content: [{ content: text }],
      payload: response,
    };
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
