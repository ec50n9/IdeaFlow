import { Node, Edge } from '@xyflow/react';

export type CardType = 'atom' | 'context' | 'execution';

export type AtomType = 'text' | 'image' | 'file';

export interface ContextItem {
  id: string;
  sourceCardId: string;
  role: 'system' | 'user' | 'assistant';
}

export interface CardNodeData extends Record<string, unknown> {
  cardType: CardType;

  // ===== atom 卡片专属 =====
  /** 原子类型：文本 / 图片 / 文件 */
  atomType?: AtomType;
  /** 内容：文本内容 / 图片URL / 文件引用 */
  content?: string;
  /** 被聚合到上下文后锁定，修改时自动克隆 */
  isLocked?: boolean;
  /** 来源：manual=用户创建, ai=模型生成 */
  sourceType?: 'manual' | 'ai';

  // ===== context 卡片专属 =====
  /** 聚合了哪些 atom 卡片 */
  sourceCardIds?: string[];
  /** 排序后的上下文项 */
  items?: ContextItem[];

  // ===== execution 卡片专属 =====
  /** 基于哪个 context 执行 */
  contextCardId?: string;
  /** 模型引用: "providerKey/modelName" */
  modelRef?: string;
  /** 输出类型 */
  outputType?: 'text' | 'image' | 'audio';
  /** 关联的结果卡片 ID */
  resultCardId?: string;
  /** 执行状态 */
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
