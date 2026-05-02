import { CardNode, AIProviderConfig, AIModelConfig, ContextItem } from '@/types';

export interface ModelFilterResult {
  provider: AIProviderConfig;
  model: AIModelConfig;
  disabled?: boolean;
  reason?: string;
}

/**
 * 根据上下文内容分析，过滤出可用模型
 */
export function getAvailableModels(
  items: ContextItem[],
  allNodes: CardNode[],
  allProviders: AIProviderConfig[]
): ModelFilterResult[] {
  const { hasImage, hasDocument, estimatedTokens } = analyzeContext(items, allNodes);

  const results: ModelFilterResult[] = [];

  for (const provider of allProviders) {
    for (const model of provider.models) {
      let disabled = false;
      let reason = '';

      // 规则 A：包含图片但模型不支持 vision 且不支持图生图
      if (hasImage && !model.supportsVision && !model.supportsImageToImage) {
        disabled = true;
        reason = '不支持视觉输入';
      }

      // 规则 B：包含文件但模型不支持 document
      if (hasDocument && !model.supportsDocument) {
        disabled = true;
        reason = '不支持文档解析';
      }

      // 规则 C：上下文超过窗口限制
      if (estimatedTokens > model.contextWindow) {
        disabled = true;
        reason = '上下文过长';
      }

      results.push({ provider, model, disabled, reason });
    }
  }

  return results;
}

/**
 * 分析上下文内容，返回特征信息
 */
export function analyzeContext(items: ContextItem[], allNodes: CardNode[]) {
  const atomCardIds = new Set(items.map((i) => i.sourceCardId));
  let hasImage = false;
  let hasDocument = false;
  let estimatedTokens = 0;

  for (const cardId of atomCardIds) {
    const card = allNodes.find((n) => n.id === cardId);
    if (!card || card.data.cardType !== 'atom') continue;
    // 检查 item 是否被禁用
    const item = items.find((i) => i.sourceCardId === cardId);
    if (item && item.enabled === false) continue;

    if (card.data.atomType === 'image') hasImage = true;
    if (card.data.atomType === 'file') hasDocument = true;

    // 简单估算 tokens：内容长度作为近似
    const content = card.data.content || '';
    estimatedTokens += Math.ceil(content.length * 0.5);
  }

  return { hasImage, hasDocument, estimatedTokens };
}
