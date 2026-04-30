import { Node, Edge } from '@xyflow/react';

export interface RunningAction {
  taskId: string;
  actionId: string;
  actionName: string;
  actionColor?: string;
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

export interface AIModelConfig {
  id: string;
  name: string;
  type: 'text' | 'image' | 'video'; // Capability 
  model: string; // The model identifier string e.g. "gpt-4o"
}

export interface AIProviderConfig {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'custom';
  endpoint?: string; // Optional for known providers, required for custom
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
    maxNodes: number | null; // null means infinite
  };
  processor: {
    type: 'llm' | 'code';
    payload: string; // Prompt template for llm, JS function for code
    modelId?: string; // Recommended model for this action
  };
  output: {
    connectionType: 'source_to_new' | 'new_to_source' | 'none';
  };
}
