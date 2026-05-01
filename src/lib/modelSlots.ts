import { useStore } from '@/store/useStore';
import { ModelSlot, ModelCapability, ActionConfig, AIModelConfig, AIProviderConfig } from '@/types';

export interface UnresolvedSlot {
  slot: ModelSlot;
  candidates: { provider: AIProviderConfig; model: AIModelConfig }[];
}

export function resolveSlot(slot?: ModelSlot): { slot: ModelSlot; providerConfig: AIProviderConfig; modelConfig: AIModelConfig } {
  if (!slot) {
    throw new Error('此动作未配置模型插槽，请在动作配置中添加插槽。');
  }

  if (!slot.boundModelId) {
    throw new Error(`模型插槽 "${slot.identifier}" 未绑定具体模型，请先绑定模型。`);
  }

  const parts = slot.boundModelId.split('/');
  if (parts.length !== 2) {
    throw new Error(`插槽绑定的模型引用格式错误: "${slot.boundModelId}"，应为 "<供应商标识>/<模型名称>"`);
  }

  const [providerKey, modelName] = parts;
  const store = useStore.getState();

  const provider = store.providers.find((p) => p.key === providerKey);
  if (!provider) {
    throw new Error(`未找到供应商标识 "${providerKey}"，请在模型配置中心检查配置。`);
  }

  const model = provider.models.find((m) => m.model === modelName);
  if (!model) {
    throw new Error(`未找到模型 "${modelName}"（供应商: ${providerKey}），请在模型配置中心检查配置。`);
  }

  // 验证模型是否支持插槽声明的能力
  const capabilitySupported =
    (slot.capability === 'chat' && model.supportsText) ||
    (slot.capability === 'generateImage' && model.supportsTextToImage) ||
    (slot.capability === 'editImage' && model.supportsImageToImage);

  if (!capabilitySupported) {
    throw new Error(
      `插槽 "${slot.identifier}" 声明的能力为 "${capabilityLabel(slot.capability)}"，但绑定的模型 "${modelName}" 不支持该能力。`
    );
  }

  return { slot, providerConfig: provider, modelConfig: model };
}

export function getModelsByCapability(capability: ModelCapability): { provider: AIProviderConfig; model: AIModelConfig }[] {
  const store = useStore.getState();
  const results: { provider: AIProviderConfig; model: AIModelConfig }[] = [];

  for (const provider of store.providers) {
    for (const model of provider.models) {
      const supported =
        (capability === 'chat' && model.supportsText) ||
        (capability === 'generateImage' && model.supportsTextToImage) ||
        (capability === 'editImage' && model.supportsImageToImage);
      if (supported) {
        results.push({ provider, model });
      }
    }
  }

  return results;
}

export function getActionRequiredSlots(action: ActionConfig): ModelSlot[] {
  return action.processor.slots || [];
}

export function getUnresolvedSlots(action: ActionConfig): UnresolvedSlot[] {
  const requiredSlots = getActionRequiredSlots(action);
  const unresolved: UnresolvedSlot[] = [];

  for (const slot of requiredSlots) {
    if (!slot.boundModelId) {
      const candidates = getModelsByCapability(slot.capability);
      unresolved.push({ slot, candidates });
    }
  }

  return unresolved;
}

export function getSlotRef(action: ActionConfig): ModelSlot | undefined {
  const slots = action.processor.slots || [];
  if (action.processor.type === 'llm') {
    return slots[0];
  }
  if (action.processor.slotRef) {
    return slots.find((s) => s.identifier === action.processor.slotRef);
  }
  if (slots.length > 0) return slots[0];
  return undefined;
}

export function capabilityLabel(capability: ModelCapability): string {
  switch (capability) {
    case 'chat':
      return '文生文';
    case 'generateImage':
      return '文生图';
    case 'editImage':
      return '图生图';
    default:
      return capability;
  }
}
