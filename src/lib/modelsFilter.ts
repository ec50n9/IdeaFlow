import { CardNode, AIProviderConfig, AIModelConfig, AtomType } from '@/types';

export interface ModelFilterResult {
  provider: AIProviderConfig;
  model: AIModelConfig;
  disabled?: boolean;
  reason?: string;
}

interface FilterContext {
  hasImage: boolean;
  hasDocument: boolean;
  estimatedTokens: number;
}

/**
 * 核心过滤逻辑（SSOT）
 */
function evaluateModelAgainstContext(
  model: AIModelConfig,
  context: FilterContext
): { disabled: boolean; reason: string } {
  let disabled = false;
  let reason = '';

  // 规则 A：包含图片但模型不支持 vision
  if (context.hasImage && !model.vision) {
    disabled = true;
    reason = '不支持视觉理解';
  }

  // 规则 B：包含文件但模型不支持文档解析
  if (context.hasDocument && !model.documentParsing) {
    disabled = true;
    reason = '不支持文档解析';
  }

  // 规则 C：上下文超过窗口限制
  if (context.estimatedTokens > model.contextWindow) {
    disabled = true;
    reason = '上下文过长';
  }

  return { disabled, reason };
}

function buildResults(
  providers: AIProviderConfig[],
  context: FilterContext
): ModelFilterResult[] {
  const results: ModelFilterResult[] = [];

  for (const provider of providers) {
    for (const model of provider.models) {
      const { disabled, reason } = evaluateModelAgainstContext(model, context);
      results.push({ provider, model, disabled: disabled || undefined, reason: reason || undefined });
    }
  }

  return results;
}

/**
 * 根据源卡片 ID 列表分析上下文，过滤出可用模型
 */
export function getAvailableModels(
  sourceCardIds: string[],
  allNodes: CardNode[],
  allProviders: AIProviderConfig[]
): ModelFilterResult[] {
  const { hasImage, hasDocument, estimatedTokens } = analyzeContext(sourceCardIds, allNodes);
  return buildResults(allProviders, { hasImage, hasDocument, estimatedTokens });
}

/**
 * 根据原子卡片类型列表直接分析，过滤出可用模型（用于创建对话卡片时）
 */
export function getAvailableModelsFromAtomTypes(
  atomTypes: AtomType[],
  allProviders: AIProviderConfig[]
): ModelFilterResult[] {
  const hasImage = atomTypes.includes('image');
  const hasDocument = atomTypes.includes('file');
  // 创建时不做 token 估算（无内容）
  const estimatedTokens = 0;

  return buildResults(allProviders, { hasImage, hasDocument, estimatedTokens });
}

/**
 * 分析源卡片内容，返回特征信息
 */
export function analyzeContext(sourceCardIds: string[], allNodes: CardNode[]) {
  let hasImage = false;
  let hasDocument = false;
  let estimatedTokens = 0;

  for (const cardId of sourceCardIds) {
    const card = allNodes.find((n) => n.id === cardId);
    if (!card || card.data.cardType !== 'atom') continue;

    if (card.data.atomType === 'image') hasImage = true;
    if (card.data.atomType === 'file') hasDocument = true;

    // 简单估算 tokens：内容长度作为近似
    const content = card.data.content || '';
    estimatedTokens += Math.ceil(content.length * 0.5);
  }

  return { hasImage, hasDocument, estimatedTokens };
}
