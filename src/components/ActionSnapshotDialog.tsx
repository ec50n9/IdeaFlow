import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionConfig, ActionTrigger } from '@/types';
import { ActionProcessorForm } from '@/components/ActionProcessorForm';
import { v4 as uuidv4 } from 'uuid';
import { PRESET_ACTION_COLORS, ACTION_DOT_CLASS, cn, getActionColorClasses } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { AlertCircle } from 'lucide-react';
import { TriggerConfigForm } from '@/components/TriggerConfigForm';

interface ActionSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionId?: string;
  actionSnapshot?: ActionConfig;
  sourceAction?: string;
  sourceColor?: string;
}

export function ActionSnapshotDialog({
  open,
  onOpenChange,
  actionId,
  actionSnapshot,
  sourceAction,
  sourceColor,
}: ActionSnapshotDialogProps) {
  const { actions, addAction } = useStore();
  const [mode, setMode] = useState<'view' | 'convert'>('view');

  // 转换模式下的编辑字段
  const [name, setName] = useState('');
  const [color, setColor] = useState('purple');
  const [trigger, setTrigger] = useState<ActionTrigger>({ mode: 'simple', minNodes: 1, maxNodes: null });

  // 可编辑的处理器配置（转换模式下允许修改）
  const [editableProcessor, setEditableProcessor] = useState<ActionConfig['processor']>({
    type: 'llm',
    payload: '',
  });
  const [editableOutput, setEditableOutput] = useState<ActionConfig['output']>({
    connectionType: 'source_to_new',
  });

  const foundAction = actions.find((a) => a.id === actionId);
  const displayAction = foundAction || actionSnapshot;

  // 每次打开时重置状态
  useEffect(() => {
    if (open) {
      setMode('view');
      if (displayAction) {
        setName(displayAction.name);
        setColor(displayAction.color || 'purple');
        setTrigger(displayAction.trigger);
        setEditableProcessor(displayAction.processor);
        setEditableOutput(displayAction.output);
      }
    }
  }, [open, displayAction?.id]);

  const handleSaveAsAction = () => {
    const newAction: ActionConfig = {
      id: uuidv4(),
      name,
      color,
      trigger,
      processor: editableProcessor,
      output: editableOutput,
    };
    addAction(newAction);
    onOpenChange(false);
  };

  const canConvert = !foundAction && !!actionSnapshot;
  const hasNothing = !foundAction && !actionSnapshot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-0 w-[90vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle>
            {hasNothing
              ? '动作信息'
              : foundAction
                ? displayAction?.name || '动作详情'
                : mode === 'view'
                  ? `${displayAction?.name || '次抛'} 快照`
                  : '转换为动作'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-4">
          <div className="flex flex-col gap-5 overflow-x-hidden">
            {hasNothing ? (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <AlertCircle className="w-10 h-10 opacity-40" />
              <p className="text-sm">该节点由旧版本生成，未保存动作快照。</p>
              {sourceAction && (
                <div
                  className={cn(
                    'flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm border',
                    getActionColorClasses(sourceColor)
                  )}
                >
                  历史标记：{sourceAction}
                </div>
              )}
            </div>
          ) : (
            <>
              <ActionProcessorForm
                processor={displayAction!.processor}
                output={displayAction!.output}
                onChange={(p, o) => {
                  setEditableProcessor(p);
                  setEditableOutput(o);
                }}
                disabled={mode === 'view'}
              />

              {mode === 'convert' && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>动作名称</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
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
                                ACTION_DOT_CLASS[color] || ACTION_DOT_CLASS['purple']
                              )}
                            />
                            <span>
                              {PRESET_ACTION_COLORS.find((c) => c.name === color)?.label ||
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
                              onClick={() => setColor(c.name)}
                              className={cn(
                                'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all',
                                color === c.name
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

                  <TriggerConfigForm trigger={trigger} onChange={setTrigger} />
                </>
              )}
            </>
          )}

          </div>
        </div>

        <div className="flex-none shrink-0 px-6 py-4 border-t bg-background flex justify-end gap-2">
          {hasNothing ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          ) : mode === 'view' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              {canConvert && (
                <Button onClick={() => setMode('convert')}>转换为动作...</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setMode('view')}>
                返回
              </Button>
              <Button onClick={handleSaveAsAction}>确认保存</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
