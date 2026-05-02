import { AtomType, AIProviderConfig } from '@/types';
import { parseModelRef, CAPABILITY_LABEL_MAP } from '@/lib/modelUtils';

export interface ConnectionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 根据原子卡片类型，返回所需的模型能力标识
 */
export function getRequiredCapabilitiesForAtom(atomType: AtomType): string[] {
  switch (atomType) {
    case 'text':
      return ['supportsText'];
    case 'image':
      return ['supportsVision', 'supportsImageToImage', 'supportsTextToImage'];
    case 'file':
      return ['supportsDocument'];
    default:
      return [];
  }
}

/**
 * 判断原子卡片是否可以接入到指定模型的对话卡片
 */
export function canConnectAtomToDialog(
  atomType: AtomType,
  modelRef: string,
  providers: AIProviderConfig[]
): ConnectionCheckResult {
  if (!modelRef) {
    return { allowed: false, reason: '对话卡片未选择模型' };
  }

  const parsed = parseModelRef(modelRef);
  if (!parsed) {
    return { allowed: false, reason: '模型引用格式错误' };
  }

  const provider = providers.find((p) => p.key === parsed.providerKey);
  if (!provider) {
    return { allowed: false, reason: '未找到模型提供方' };
  }

  const model = provider.models.find((m) => m.model === parsed.modelName);
  if (!model) {
    return { allowed: false, reason: '未找到模型配置' };
  }

  const requiredCapabilities = getRequiredCapabilitiesForAtom(atomType);

  // 如果该原子类型没有特殊能力要求，默认允许
  if (requiredCapabilities.length === 0) {
    return { allowed: true };
  }

  // 检查是否满足任一所需能力（对于图片，只要支持 vision / imageToImage / textToImage 之一即可）
  const hasCapability = requiredCapabilities.some((cap) => {
    switch (cap) {
      case 'supportsText':
        return model.supportsText;
      case 'supportsVision':
        return model.supportsVision;
      case 'supportsImageToImage':
        return model.supportsImageToImage;
      case 'supportsTextToImage':
        return model.supportsTextToImage;
      case 'supportsDocument':
        return model.supportsDocument;
      default:
        return false;
    }
  });

  if (!hasCapability) {
    const labels = requiredCapabilities.map((c) => CAPABILITY_LABEL_MAP[c] || c).join(' / ');
    return { allowed: false, reason: `该模型不支持${labels}` };
  }

  return { allowed: true };
}

/**
 * 根据原子卡片类型列表，获取所需的模型能力描述（用于 UI 提示）
 */
export function getAtomTypesRequirementDescription(atomTypes: AtomType[]): string {
  if (atomTypes.length === 0) return '';

  const parts: string[] = [];
  if (atomTypes.includes('text')) parts.push('文本处理');
  if (atomTypes.includes('image')) parts.push('视觉/图像能力');
  if (atomTypes.includes('file')) parts.push('文档解析');

  return parts.join('、');
}
