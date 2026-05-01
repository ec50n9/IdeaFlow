import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionConfig, IdeaNode } from '@/types';
import { ActionProcessorForm } from '@/components/ActionProcessorForm';
import { SlotResolveDialog } from '@/components/SlotResolveDialog';
import { v4 as uuidv4 } from 'uuid';
import { PRESET_ACTION_COLORS, ACTION_DOT_CLASS, cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const [minNodes, setMinNodes] = useState(1);
  const [maxNodes, setMaxNodes] = useState<number | null>(null);

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
        setMinNodes(initialAction.trigger?.minNodes ?? (selectedNodes.length || 1));
        setMaxNodes(initialAction.trigger?.maxNodes ?? null);
      } else {
        setProcessor({
          type: 'llm',
          payload: '提示词模板使用 {{selected_content}}',
        });
        setOutput({ connectionType: 'source_to_new' });
        setName('次抛动作');
        setMinNodes(selectedNodes.length || 1);
        setMaxNodes(null);
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
      trigger: { minNodes: 1, maxNodes: null },
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
      trigger: { minNodes, maxNodes },
      processor,
      output,
    };
    addAction(newAction);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] gap-6 w-[90vw] overflow-x-hidden max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{readOnly ? '查看次抛' : mode === 'execute' ? '次抛调用' : '保存为动作'}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 py-4 overflow-x-hidden">
            <ActionProcessorForm
              processor={processor}
              output={output}
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>最少选中节点数</Label>
                    <Input
                      type="number"
                      min={1}
                      value={minNodes}
                      onChange={e => setMinNodes(parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>最多选中节点数</Label>
                    <Input
                      type="number"
                      placeholder="无限定"
                      value={maxNodes === null ? '' : maxNodes}
                      onChange={e => {
                        const val = e.target.value;
                        setMaxNodes(val === '' ? null : parseInt(val));
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 mt-4">
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
          </div>
        </DialogContent>
      </Dialog>
      <SlotResolveDialog
        open={slotDialogOpen}
        onOpenChange={setSlotDialogOpen}
        action={pendingAction}
        selectedNodes={selectedNodes}
      />
    </>
  );
}
