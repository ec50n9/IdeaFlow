import { Node, Edge } from '@xyflow/react';

export interface RunningAction {
  taskId: string;
  actionId: string;
  actionName: string;
  actionColor?: string;
  responseLength?: number;
}

export interface IdeaNodeData extends Record<string, unknown> {
  content: string;
  status: 'idle' | 'processing' | 'error';
  runningActions?: RunningAction[];
  metadata?: Record<string, any>;
  isEditing?: boolean;
  sourceType?: 'manual' | 'ai';
  sourceAction?: string;
  sourceProvider?: string;
  sourceModel?: string;
  sourceColor?: string;
  isEdited?: boolean;
}

export type IdeaNode = Node<IdeaNodeData>;

export type ModelProtocol = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'generic';

export type CallMode = 'chat' | 'generateImage' | 'editImage';

export interface AIModelConfig {
  id: string;
  protocol: ModelProtocol;
  model: string; // 模型名称（同一供应商内唯一），也是 API model identifier
  supportsText: boolean;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  /** 仅 openai-responses 协议下用于图像生成/编辑的模型（如 gpt-image-2） */
  imageModel?: string;
}

export interface AIProviderConfig {
  id: string;
  name: string; // 显示名称
  key: string;  // 供应商标识（唯一），如 "openai"
  endpoint?: string;
  apiKey: string;
  models: AIModelConfig[];
}

export interface ActionConfig {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  trigger: {
    minNodes: number;
    maxNodes: number | null;
  };
  processor: {
    type: 'llm' | 'code';
    payload: string;
    modelId?: string; // 格式: "<供应商标识>/<模型名称>"
    mode?: CallMode; // 仅 llm 模式下有效，明确指定调用方式
  };
  output: {
    connectionType: 'source_to_new' | 'new_to_source' | 'none';
  };
}
