import { useState, useEffect } from 'react';
import { ActionConfig } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ActionProcessorForm } from '@/components/ActionProcessorForm';
import { PRESET_ACTION_COLORS, ACTION_DOT_CLASS, cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface ActionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ActionConfig | null;
  onSave: (action: ActionConfig) => void;
  isNew?: boolean;
}

export function ActionEditDialog({ open, onOpenChange, action, onSave, isNew }: ActionEditDialogProps) {
  const [editingAction, setEditingAction] = useState<ActionConfig | null>(null);

  useEffect(() => {
    if (open && action) {
      setEditingAction({ ...action });
    }
  }, [open, action?.id]);

  const handleSave = () => {
    if (editingAction) {
      onSave(editingAction);
      onOpenChange(false);
    }
  };

  if (!editingAction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-6 w-[90vw] overflow-x-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? '新建动作' : '编辑动作'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-4 overflow-x-hidden">
          <div className="flex flex-col gap-2">
            <Label>动作名称</Label>
            <Input
              value={editingAction.name}
              onChange={(e) => setEditingAction({ ...editingAction, name: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>标签颜色</Label>
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="flex items-center gap-2.5 w-fit px-3 py-2 rounded-lg border border-input bg-background hover:bg-muted/50 transition-colors text-sm cursor-pointer"
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full',
                        ACTION_DOT_CLASS[editingAction.color || 'purple']
                      )}
                    />
                    <span>
                      {PRESET_ACTION_COLORS.find((c) => c.name === editingAction.color)?.label ||
                        PRESET_ACTION_COLORS[0].label}
                    </span>
                  </button>
                }
              />
              <PopoverContent className="w-72">
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_ACTION_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setEditingAction({ ...editingAction, color: c.name })}
                      className={cn(
                        'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all',
                        editingAction.color === c.name
                          ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                          : 'border-transparent hover:border-muted hover:bg-muted/50'
                      )}
                    >
                      <div className={cn('w-7 h-7 rounded-full', ACTION_DOT_CLASS[c.name])} />
                      <span className="text-xs">{c.label}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>最少选中节点数</Label>
              <Input
                type="number"
                min={1}
                value={editingAction.trigger.minNodes}
                onChange={(e) =>
                  setEditingAction({
                    ...editingAction,
                    trigger: {
                      ...editingAction.trigger,
                      minNodes: parseInt(e.target.value) || 1,
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>最多选中节点数</Label>
              <Input
                type="number"
                placeholder="无限定"
                value={editingAction.trigger.maxNodes === null ? '' : editingAction.trigger.maxNodes}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditingAction({
                    ...editingAction,
                    trigger: {
                      ...editingAction.trigger,
                      maxNodes: val === '' ? null : parseInt(val),
                    },
                  });
                }}
              />
            </div>
          </div>

          <ActionProcessorForm
            processor={editingAction.processor}
            output={editingAction.output}
            onChange={(processor, output) =>
              setEditingAction({ ...editingAction, processor, output })
            }
          />

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
