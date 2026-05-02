import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getAvailableModels } from '@/lib/modelsFilter';
import { AlertCircle, MessageSquare, Image as ImageIcon, Music, Bot } from 'lucide-react';

type OutputTab = 'text' | 'image' | 'audio';

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextCardId: string;
  onSelect: (modelRef: string, outputType: OutputTab) => void;
}

const TABS: { id: OutputTab; label: string; icon: React.ElementType }[] = [
  { id: 'text', label: '生成文本', icon: MessageSquare },
  { id: 'image', label: '生成图像', icon: ImageIcon },
  { id: 'audio', label: '生成音频', icon: Music },
];

export function ModelSelector({ open, onOpenChange, contextCardId, onSelect }: ModelSelectorProps) {
  const nodes = useStore((state) => state.nodes);
  const providers = useStore((state) => state.providers);

  const [activeTab, setActiveTab] = useState<OutputTab>('text');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const contextCard = nodes.find((n) => n.id === contextCardId && n.data.cardType === 'context');
  const items = contextCard?.data.items || [];

  const filteredModels = useMemo(() => {
    return getAvailableModels(items, nodes, providers);
  }, [items, nodes, providers]);

  // 按 Tab 进一步过滤输出能力
  const tabModels = useMemo(() => {
    return filteredModels.map(({ provider, model, disabled, reason }) => {
      let tabDisabled = disabled;
      let tabReason = reason;

      if (!tabDisabled) {
        switch (activeTab) {
          case 'text':
            if (!model.supportsText) {
              tabDisabled = true;
              tabReason = '不支持文本生成';
            }
            break;
          case 'image':
            if (!model.supportsTextToImage && !model.supportsImageToImage) {
              tabDisabled = true;
              tabReason = '不支持图像生成';
            }
            break;
          case 'audio':
            tabDisabled = true;
            tabReason = '暂不支持音频生成';
            break;
        }
      }

      return {
        provider,
        model,
        modelRef: `${provider.key}/${model.model}`,
        disabled: tabDisabled,
        reason: tabReason,
      };
    });
  }, [filteredModels, activeTab]);

  const handleConfirm = () => {
    if (selectedModel) {
      onSelect(selectedModel, activeTab);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-0 w-[90vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle>选择模型</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Tab 栏 */}
          <div className="flex border-b">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedModel(null);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors flex-1 justify-center',
                    activeTab === tab.id
                      ? 'text-primary border-b-2 border-primary bg-primary/5'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 模型列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {providers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <Bot className="w-10 h-10 opacity-30" />
                <p>尚未配置任何模型供应商</p>
                <p className="text-xs">请先在设置中配置模型</p>
              </div>
            )}

            {tabModels.map(({ provider, model, modelRef, disabled, reason }) => (
              <button
                key={modelRef}
                onClick={() => !disabled && setSelectedModel(modelRef)}
                disabled={disabled}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                  selectedModel === modelRef
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : disabled
                      ? 'border-border bg-muted/30 opacity-60 cursor-not-allowed'
                      : 'border-border bg-card hover:border-primary/50 hover:shadow-sm'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  disabled ? 'bg-muted' : 'bg-primary/10'
                )}>
                  <Bot className={cn('w-4 h-4', disabled ? 'text-muted-foreground' : 'text-primary')} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{model.model}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {disabled && reason && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
                        <AlertCircle className="w-3 h-3" />
                        {reason}
                      </span>
                    )}
                    {!disabled && (
                      <span className="text-[10px] text-emerald-600">
                        可用
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {model.contextWindow >= 1000000
                        ? `${(model.contextWindow / 1000000).toFixed(1)}M`
                        : `${Math.round(model.contextWindow / 1000)}k`} context
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-none shrink-0 px-6 py-4 border-t bg-background flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedModel}>
            确认执行
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
