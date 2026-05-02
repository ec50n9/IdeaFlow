export const TEXT_INSTRUCTION = '\n\n请务必只输出严格的 JSON 数组格式，例如 [{"content": "生成的内容1"}, {"content": "生成的内容2"}]。请根据任务要求决定输出的数组元素个数，如果任务没有明确要求拆分节点，则务必将所有内容整合到一个对象的 content 中，即数组中只有一个对象。不要输出任何额外的标记或解释文字。';

export type TextContentPart = { type: 'text'; text: string };
export type ImageUrlContentPart = { type: 'image_url'; image_url: { url: string } };
export type ContentPart = TextContentPart | ImageUrlContentPart;

export function isTextPart(part: ContentPart): part is TextContentPart {
  return part.type === 'text';
}

export function isImageUrlPart(part: ContentPart): part is ImageUrlContentPart {
  return part.type === 'image_url';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface AdapterParams {
  model: string;
  prompt?: string;
  messages?: ChatMessage[];
  apiKey: string;
  endpoint?: string;
  signal?: AbortSignal;
  /** 仅 openai-responses 协议下用于图像生成/编辑的模型 */
  imageModel?: string;
}

export interface AdapterResult {
  content: Array<{ content: string }>;
  payload?: any;
}

export type OnChunk = (chunk: string, accumulated: string) => void;

export interface ModelAdapter {
  chat(params: AdapterParams): Promise<AdapterResult>;
  chatStream(params: AdapterParams, onChunk: OnChunk): Promise<AdapterResult>;
  generateImage(params: AdapterParams): Promise<AdapterResult>;
  editImage(params: AdapterParams & { images: string[] }): Promise<AdapterResult>;
  supportsStreaming: boolean;
}
