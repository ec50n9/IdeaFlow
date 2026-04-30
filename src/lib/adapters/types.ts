export interface AdapterParams {
  model: string;
  prompt: string;
  apiKey: string;
  endpoint?: string;
  signal?: AbortSignal;
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
