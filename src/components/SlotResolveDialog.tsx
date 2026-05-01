import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActionConfig, IdeaNode } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { getUnresolvedSlots, capabilityLabel } from '@/lib/modelSlots';
import { processAction } from '@/lib/engine';

const NONE_VALUE = '__none__';
import { cn } from '@/lib/utils';

interface SlotResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ActionConfig | null;
  selectedNodes: IdeaNode[];
}

export function SlotResolveDialog({ open, onOpenChange, action, selectedNodes }: SlotResolveDialogProps) {
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);

  const unresolved = action ? getUnresolvedSlots(action) : [];

  // Reset bindings when dialog opens
  useEffect(() => {
    if (open && unresolved.length > 0) {
      const initial: Record<string, string> = {};
      for (const u of unresolved) {
        if (u.candidates.length === 1) {
          initial[u.slot.identifier] = `${u.candidates[0].provider.key}/${u.candidates[0].model.model}`;
        }
      }
      setBindings(initial);
      setExecuting(false);
    }
  }, [open, action?.id]);

  const handleConfirm = async () => {
    if (!action) return;

    // Validate all unresolved slots have a binding
    for (const u of unresolved) {
      if (!bindings[u.slot.identifier]) {
        return;
      }
    }

    // Apply bindings to action slots (create a resolved copy)
    const resolvedSlots = (action.processor.slots || []).map((slot) => {
      const binding = bindings[slot.identifier];
      if (binding) {
        return { ...slot, boundModelId: binding };
      }
      return slot;
    });

    const resolvedAction: ActionConfig = {
      ...action,
      processor: {
        ...action.processor,
        slots: resolvedSlots,
      },
    };

    setExecuting(true);
    onOpenChange(false);
    await processAction(resolvedAction, selectedNodes);
  };

  const allBound = unresolved.every((u) => !!bindings[u.slot.identifier]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !executing) onOpenChange(false); }}>
      <DialogContent className="sm:max-w-[500px] gap-6 w-[90vw] overflow-x-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>选择执行模型</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-4">
          {unresolved.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <AlertCircle className="w-10 h-10 opacity-40" />
              <p className="text-sm">所有插槽均已绑定模型，可以直接执行。</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                动作「{action?.name}」需要以下模型插槽，但部分插槽尚未绑定具体模型。请为每个插槽选择一个支持其能力的模型：
              </p>

              <div className="flex flex-col gap-4">
                {unresolved.map(({ slot, candidates }) => (
                  <div key={slot.identifier} className="flex flex-col gap-2 p-4 border rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{slot.identifier}</span>
                        <span className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          slot.capability === 'chat' && 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                          slot.capability === 'generateImage' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
                          slot.capability === 'editImage' && 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
                        )}>
                          {capabilityLabel(slot.capability)}
                        </span>
                      </div>
                    </div>

                    {candidates.length > 0 ? (
                      <Select
                        value={bindings[slot.identifier] || NONE_VALUE}
                        onValueChange={(value) => setBindings({ ...bindings, [slot.identifier]: value === NONE_VALUE ? '' : value })}
                      >
                        <SelectTrigger className="w-full">
                          {(() => {
                            const selected = bindings[slot.identifier];
                            if (!selected) return '请选择模型...';
                            const found = candidates.find((c) => `${c.provider.key}/${c.model.model}` === selected);
                            return found ? `${found.provider.name} / ${found.model.model}` : selected;
                          })()}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>请选择模型...</SelectItem>
                          {candidates.map(({ provider, model }) => (
                            <SelectItem key={`${provider.key}/${model.model}`} value={`${provider.key}/${model.model}`}>
                              {provider.name} / {model.model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-sm text-destructive flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        没有支持「{capabilityLabel(slot.capability)}」能力的已配置模型
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
              取消
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!allBound || executing || unresolved.length === 0}
            >
              {executing ? '执行中...' : '确认并执行'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
