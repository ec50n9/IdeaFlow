import { useState, useEffect } from 'react';
import { ActionConfig } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Copy, Check, X } from 'lucide-react';
import { ActionProcessorForm } from '@/components/ActionProcessorForm';
import { PRESET_ACTION_COLORS, ACTION_DOT_CLASS, cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TriggerConfigForm } from '@/components/TriggerConfigForm';

function CopyConfigButton({ config }: { config: ActionConfig }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      setError(null);
      const json = JSON.stringify(config, null, 2);
      // 优先使用现代 Clipboard API，失败则回退到传统方法
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(json);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = json;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!success) throw new Error('execCommand copy failed');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('复制失败:', e);
      setError('复制失败');
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleCopy}>
      {error ? <X className="w-4 h-4 text-destructive" /> : copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      <span>{error ? error : copied ? '已复制' : '复制配置'}</span>
    </Button>
  );
}

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
      <DialogContent className="sm:max-w-[600px] gap-0 w-[90vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle>{isNew ? '新建动作' : '编辑动作'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-4">
          <div className="flex flex-col gap-5 overflow-x-hidden">
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

          <TriggerConfigForm
            trigger={editingAction.trigger}
            onChange={(trigger) => setEditingAction({ ...editingAction, trigger })}
          />

          <ActionProcessorForm
            processor={editingAction.processor}
            output={editingAction.output}
            trigger={editingAction.trigger}
            onChange={(processor, output) =>
              setEditingAction({ ...editingAction, processor, output })
            }
          />

          </div>
        </div>

        <div className="flex-none shrink-0 px-6 py-4 border-t bg-background flex justify-end gap-2">
          <CopyConfigButton config={editingAction} />
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
