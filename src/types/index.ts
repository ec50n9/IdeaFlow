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

export type ModelProtocol = 'openai' | 'anthropic' | 'gemini' | 'generic';

export type CallMode = 'chat' | 'generateImage' | 'editImage';

export interface AIModelConfig {
  id: string;
  protocol: ModelProtocol;
  model: string; // 模型名称（同一供应商内唯一），也是 API model identifier
  supportsText: boolean;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
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
