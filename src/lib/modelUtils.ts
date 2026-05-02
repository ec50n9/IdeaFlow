import { AIProviderConfig, AIModelConfig } from '@/types';

export interface ParsedModelRef {
  providerKey: string;
  modelName: string;
}

/**
 * 解析 modelRef 字符串为 providerKey + modelName
 */
export function parseModelRef(modelRef: string): ParsedModelRef | null {
  const parts = modelRef.split('/');
  if (parts.length !== 2) return null;
  const [providerKey, modelName] = parts;
  if (!providerKey || !modelName) return null;
  return { providerKey, modelName };
}

/**
 * 根据 modelRef 查找对应的 provider 和 model 配置
 */
export function findModelByRef(
  modelRef: string,
  providers: AIProviderConfig[]
): { provider: AIProviderConfig; model: AIModelConfig } | null {
  const parsed = parseModelRef(modelRef);
  if (!parsed) return null;

  const provider = providers.find((p) => p.key === parsed.providerKey);
  if (!provider) return null;

  const model = provider.models.find((m) => m.model === parsed.modelName);
  if (!model) return null;

  return { provider, model };
}

// ─────────────────────────────────────────────────────────────
// 模型能力标签映射（SSOT）
// ─────────────────────────────────────────────────────────────

export interface CapabilityMeta {
  key: string;
  label: string;
  shortLabel: string;
}

export const MODEL_CAPABILITIES: CapabilityMeta[] = [
  { key: 'chat', label: '文本对话', shortLabel: '对话' },
  { key: 'vision', label: '视觉理解', shortLabel: '视觉' },
  { key: 'imageGeneration', label: '图像生成', shortLabel: '生图' },
  { key: 'imageEditing', label: '图像编辑', shortLabel: '修图' },
  { key: 'documentParsing', label: '文档解析', shortLabel: '文档' },
];

export const CAPABILITY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  MODEL_CAPABILITIES.map((c) => [c.key, c.label])
);

export const CAPABILITY_SHORT_LABEL_MAP: Record<string, string> = Object.fromEntries(
  MODEL_CAPABILITIES.map((c) => [c.key, c.shortLabel])
);

/**
 * 检查模型是否支持指定能力
 */
export function modelSupportsCapability(model: AIModelConfig, capKey: string): boolean {
  return (model as unknown as Record<string, boolean>)[capKey] === true;
}
