import { Node, Edge } from '@xyflow/react';

export type CardType = 'atom' | 'dialog';

export type AtomType = 'text' | 'image' | 'file';

export interface ContextItem {
  id: string;
  sourceCardId: string;
  role: 'system' | 'user' | 'assistant';
  /** 是否启用（参与本次对话） */
  enabled?: boolean;
}

export interface DialogMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface CardNodeData extends Record<string, unknown> {
  cardType: CardType;

  // ===== atom 卡片专属 =====
  /** 原子类型：文本 / 图片 / 文件 */
  atomType?: AtomType;
  /** 内容：文本内容 / 图片URL / 文件引用 */
  content?: string;
  /** 来源：manual=用户创建, ai=模型生成 */
  sourceType?: 'manual' | 'ai';

  // ===== dialog 卡片专属 =====
  /** 连入的原子卡片 ID */
  sourceCardIds?: string[];
  /** 编排后的上下文项 */
  items?: ContextItem[];
  /** 对话历史消息 */
  messages?: DialogMessage[];
  /** 当前使用的模型引用: "providerKey/modelName" */
  modelRef?: string;
  /** 当前输出类型 */
  outputType?: 'text' | 'image';

  // ===== 通用状态 =====
  status?: 'idle' | 'processing' | 'error' | 'success';

  // ===== UI 状态 =====
  isEditing?: boolean;
}

export type CardNode = Node<CardNodeData, 'cardNode'>;

export type ModelProtocol = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'generic';

export type CallMode = 'chat' | 'generateImage' | 'editImage';

export interface AIModelConfig {
  id: string;
  protocol: ModelProtocol;
  model: string;
  supportsText: boolean;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  /** 仅 openai-responses 协议下用于图像生成/编辑的模型（如 gpt-image-2） */
  imageModel?: string;
  /** 支持看图说话（图生文） */
  supportsVision: boolean;
  /** 支持解析文件/文档 */
  supportsDocument: boolean;
  /** 上下文窗口大小（token） */
  contextWindow: number;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  key: string;
  endpoint?: string;
  apiKey: string;
  models: AIModelConfig[];
}
