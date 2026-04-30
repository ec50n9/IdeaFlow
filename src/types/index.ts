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

export interface AIModelConfig {
  id: string;
  name: string;
  protocol: ModelProtocol;
  model: string;
  supportsText: boolean;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
}

export interface AIProviderConfig {
  id: string;
  name: string;
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
    modelId?: string;
  };
  output: {
    connectionType: 'source_to_new' | 'new_to_source' | 'none';
  };
}
