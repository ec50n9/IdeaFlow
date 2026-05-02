import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';
import { getAvailableModelsFromAtomTypes } from '@/lib/modelsFilter';
import { getAtomTypesRequirementDescription } from '@/lib/connectionRules';
import { MODEL_CAPABILITIES, modelSupportsCapability } from '@/lib/modelUtils';
import { CardNode, AtomType } from '@/types';
import { Bot, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogModelSelectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 预选中的原子卡片节点（创建对话卡片时） */
  selectedAtomNodes: CardNode[];
  /** 用户确认选择后回调 */
  onConfirm: (modelRef: string) => void;
}

export function DialogModelSelect({
  open,
  onOpenChange,
  selectedAtomNodes,
  onConfirm,
}: DialogModelSelectProps) {
  const providers = useStore((state) => state.providers);
  const [selectedModelRef, setSelectedModelRef] = useState<string>('');

  const atomTypes = useMemo<AtomType[]>(() => {
    const types = selectedAtomNodes
      .filter((n) => n.data.cardType === 'atom' && n.data.atomType)
      .map((n) => n.data.atomType!);
    // 去重
    return Array.from(new Set(types));
  }, [selectedAtomNodes]);

  const requirementDesc = useMemo(
    () => getAtomTypesRequirementDescription(atomTypes),
    [atomTypes]
  );

  const availableModels = useMemo(() => {
    return getAvailableModelsFromAtomTypes(atomTypes, providers);
  }, [atomTypes, providers]);

  const enabledModels = useMemo(
    () => availableModels.filter((m) => !m.disabled),
    [availableModels]
  );

  const handleConfirm = () => {
    if (!selectedModelRef) return;
    onConfirm(selectedModelRef);
    setSelectedModelRef('');
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedModelRef('');
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[520px] gap-0 w-[95vw] overflow-hidden max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            选择对话模型
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {/* 需求提示 */}
          {atomTypes.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">已选中 {selectedAtomNodes.length} 个原子卡片</p>
                <p>需要模型支持：{requirementDesc || '文本对话'}</p>
                <p className="mt-1">已根据卡片类型过滤可用模型，不可用的模型已标灰。</p>
              </div>
            </div>
          )}

          {providers.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              尚未配置任何 AI 提供方，请先前往设置添加模型。
            </div>
          )}

          {providers.length > 0 && enabledModels.length === 0 && (
            <div className="text-center text-sm text-red-500 py-8">
              当前没有可用的模型支持已选中的卡片类型。
            </div>
          )}

          {/* 模型列表 */}
          <div className="space-y-3">
            {availableModels.map(({ provider, model, disabled, reason }) => {
              const modelRef = `${provider.key}/${model.model}`;
              const isSelected = selectedModelRef === modelRef;

              return (
                <button
                  key={modelRef}
                  onClick={() => {
                    if (!disabled) setSelectedModelRef(modelRef);
                  }}
                  disabled={disabled}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                    disabled
                      ? 'opacity-40 cursor-not-allowed bg-muted/30'
                      : 'cursor-pointer hover:bg-muted/50',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border'
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30'
                    )}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {provider.name} / {model.model}
                      </span>
                      {disabled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300">
                          {reason}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      {MODEL_CAPABILITIES.map((cap) =>
                        modelSupportsCapability(model, cap.key) ? (
                          <span key={cap.key}>{cap.shortLabel}</span>
                        ) : null
                      )}
                      <span>上下文 {model.contextWindow.toLocaleString()}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="shrink-0 border-t px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedModelRef}>
            确认创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
