import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionConfig, IdeaNode, ActionTrigger } from '@/types';
import { ActionProcessorForm } from '@/components/ActionProcessorForm';
import { SlotResolveDialog } from '@/components/SlotResolveDialog';
import { v4 as uuidv4 } from 'uuid';
import { PRESET_ACTION_COLORS, ACTION_DOT_CLASS, cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { TriggerConfigForm } from '@/components/TriggerConfigForm';

interface OneOffActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedNodes: IdeaNode[];
  initialAction?: ActionConfig;
  readOnly?: boolean;
}

export function OneOffActionDialog({ open, onOpenChange, selectedNodes, initialAction, readOnly }: OneOffActionDialogProps) {
  const { addAction } = useStore();
  const [mode, setMode] = useState<'execute' | 'convert'>('execute');

  const [processor, setProcessor] = useState<ActionConfig['processor']>({
    type: 'llm',
    payload: '提示词模板使用 {{selected_content}}',
  });
  const [output, setOutput] = useState<ActionConfig['output']>({
    connectionType: 'source_to_new',
  });

  // 转换为 Action 时的额外字段
  const [name, setName] = useState('次抛动作');
  const [color, setColor] = useState('slate');
  const [trigger, setTrigger] = useState<ActionTrigger>({ mode: 'simple', minNodes: 1, maxNodes: null });

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionConfig | null>(null);

  // 每次打开时重置 mode，有初始值时预填充
  useEffect(() => {
    if (open) {
      setMode('execute');
      if (initialAction) {
        setProcessor(initialAction.processor);
        setOutput(initialAction.output);
        setName(initialAction.name || '次抛动作');
        setColor(initialAction.color || 'slate');
        setTrigger(initialAction.trigger);
      } else {
        setProcessor({
          type: 'llm',
          payload: '提示词模板使用 {{selected_content}}',
        });
        setOutput({ connectionType: 'source_to_new' });
        setName('次抛动作');
        setTrigger({ mode: 'simple', minNodes: selectedNodes.length || 1, maxNodes: null });
        // 颜色默认分配一个未使用的
        const usedColors = new Set(useStore.getState().actions.map(a => a.color).filter(Boolean));
        const defaultColor = PRESET_ACTION_COLORS.find(c => !usedColors.has(c.name))?.name || 'purple';
        setColor(defaultColor);
      }
    }
  }, [open, selectedNodes.length, initialAction?.id]);

  const handleExecute = async () => {
    const tempAction: ActionConfig = {
      id: 'one-off',
      name: '次抛',
      color: 'slate',
      trigger,
      processor,
      output,
    };

    setPendingAction(tempAction);
    setSlotDialogOpen(true);
  };

  const handleSaveAsAction = () => {
    const newAction: ActionConfig = {
      id: uuidv4(),
      name,
      color,
      trigger,
      processor,
      output,
    };
    addAction(newAction);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] gap-0 w-[90vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="shrink-0 px-6 py-4 border-b">
            <DialogTitle>{readOnly ? '查看次抛' : mode === 'execute' ? '次抛调用' : '保存为动作'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-4">
            <div className="flex flex-col gap-5 overflow-x-hidden">
              <ActionProcessorForm
              processor={processor}
              output={output}
              trigger={trigger}
              onChange={(p, o) => { if (!readOnly) { setProcessor(p); setOutput(o); } }}
              disabled={readOnly}
            />

            {mode === 'convert' && (
              <>
                <div className="flex flex-col gap-2">
                  <Label>动作名称</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} />
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
                          <div className={cn("w-4 h-4 rounded-full", ACTION_DOT_CLASS[color] || ACTION_DOT_CLASS['purple'])} />
                          <span>
                            {PRESET_ACTION_COLORS.find(c => c.name === color)?.label
                              || PRESET_ACTION_COLORS[0].label}
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
                            onClick={() => setColor(c.name)}
                            className={cn(
                              "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all",
                              color === c.name
                                ? "border-primary ring-1 ring-primary/20 bg-primary/5"
                                : "border-transparent hover:border-muted hover:bg-muted/50"
                            )}
                          >
                            <div className={cn("w-7 h-7 rounded-full", ACTION_DOT_CLASS[c.name])} />
                            <span className="text-xs">{c.label}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <TriggerConfigForm
                  trigger={trigger}
                  onChange={setTrigger}
                />
              </>
            )}

            </div>
          </div>

          <div className="flex-none shrink-0 px-6 py-4 border-t bg-background flex justify-end gap-2">
            {readOnly ? (
              <Button variant="outline" onClick={() => setMode('convert')}>
                保存为动作...
              </Button>
            ) : mode === 'execute' ? (
              <>
                <Button variant="outline" onClick={() => setMode('convert')}>
                  保存为动作...
                </Button>
                <Button onClick={handleExecute}>执行</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setMode('execute')}>
                  返回
                </Button>
                <Button onClick={handleSaveAsAction}>确认保存</Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <SlotResolveDialog
        open={slotDialogOpen}
        onOpenChange={setSlotDialogOpen}
        action={pendingAction}
        selectedNodes={selectedNodes}
        onExecuted={() => onOpenChange(false)}
      />
    </>
  );
}
