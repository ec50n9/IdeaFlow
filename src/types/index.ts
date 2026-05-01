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
  sourceSlot?: string;
  sourceColor?: string;
  isEdited?: boolean;
  actionId?: string;
  actionSnapshot?: ActionConfig;
}

export type IdeaNode = Node<IdeaNodeData>;

export interface ActionNodeData extends Record<string, unknown> {
  actionId: string;
  actionName: string;
  actionColor?: string;
  actionSnapshot: ActionConfig;
  sourceSlot?: string;
  sourceProvider?: string;
  sourceModel?: string;
  status?: 'idle' | 'processing' | 'error';
}

export type ActionNode = Node<ActionNodeData, 'actionNode'>;

export type AppNode = IdeaNode | ActionNode;

export type ModelProtocol = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'generic';

export type CallMode = 'chat' | 'generateImage' | 'editImage';

export type ModelCapability = 'chat' | 'generateImage' | 'editImage';

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

/** 模型插槽 —— 每个 Action 中动态配置的「函数入参」，声明能力需求 */
export interface ModelSlot {
  /** action 内唯一的插槽标识，代码中通过此字段引用模型 */
  identifier: string;
  capability: ModelCapability;
  boundModelId?: string;   // 可选：默认绑定的模型 "<providerKey>/<modelName>"
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
    /** 此 action 声明的模型插槽列表（函数入参） */
    slots?: ModelSlot[];
    /** LLM 模式下默认使用的插槽 identifier（指向 slots 中的某一项） */
    slotRef?: string;
    mode?: CallMode;
  };
  output: {
    connectionType: 'source_to_new' | 'new_to_source' | 'none';
  };
}
