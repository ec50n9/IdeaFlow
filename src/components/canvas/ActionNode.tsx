import { memo, useState, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ActionNode, IdeaNode } from '@/types';
import { useStore } from '@/store/useStore';
import { getActionColorClasses, cn } from '@/lib/utils';
import { Sparkles, Play, Copy, Pencil } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { processAction } from '@/lib/engine';
import { ActionEditDialog } from '@/components/ActionEditDialog';
import { OneOffActionDialog } from '@/components/OneOffActionDialog';

export const ActionNodeComponent = memo(({ id, data, selected }: NodeProps<ActionNode>) => {
  const providers = useStore((state) => state.providers);

  const [rerunPopoverOpen, setRerunPopoverOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  const snapshot = data.actionSnapshot;
  const slotRef = snapshot.processor.slotRef || snapshot.processor.slots?.[0]?.identifier;
  const currentSlot = snapshot.processor.slots?.find((s) => s.identifier === slotRef);

  const sourceNodes = useMemo(() => {
    const store = useStore.getState();
    const sourceNodeIds = store.edges
      .filter((e) => e.target === id)
      .map((e) => e.source);
    return store.nodes.filter((n) => sourceNodeIds.includes(n.id)) as IdeaNode[];
  }, [id]);

  const handleModelSelect = useCallback(
    (modelRef: string) => {
      if (sourceNodes.length === 0) {
        setRerunPopoverOpen(false);
        return;
      }

      const updatedSlots = (snapshot.processor.slots || []).map((s) =>
        s.identifier === slotRef ? { ...s, boundModelId: modelRef } : s
      );
      const updatedAction = {
        ...snapshot,
        processor: {
          ...snapshot.processor,
          slots: updatedSlots,
        },
      };

      processAction(updatedAction, sourceNodes);
      setRerunPopoverOpen(false);
    },
    [id, snapshot, slotRef, sourceNodes]
  );

  const handleEditSave = useCallback(
    (updatedAction: typeof snapshot) => {
      const store = useStore.getState();
      const existing = store.actions.find((a) => a.id === updatedAction.id);
      if (existing) {
        store.updateAction(updatedAction.id, updatedAction);
      }
      store.updateNodeData(id, {
        actionSnapshot: updatedAction,
        actionName: updatedAction.name,
        actionColor: updatedAction.color,
      });
      setEditDialogOpen(false);
    },
    [id]
  );

  const candidates = useMemo(() => {
    if (!currentSlot) return [];
    const results: { providerName: string; modelName: string; modelRef: string }[] = [];
    for (const provider of providers) {
      for (const model of provider.models) {
        const supported =
          (currentSlot.capability === 'chat' && model.supportsText) ||
          (currentSlot.capability === 'generateImage' && model.supportsTextToImage) ||
          (currentSlot.capability === 'editImage' && model.supportsImageToImage);
        if (supported) {
          results.push({
            providerName: provider.name,
            modelName: model.model,
            modelRef: `${provider.key}/${model.model}`,
          });
        }
      }
    }
    return results;
  }, [currentSlot, providers]);

  return (
    <div
      className={cn(
        'w-[168px] bg-card border rounded-xl shadow-sm p-2 text-center transition-all',
        selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="w-2.5 h-2.5 border-2 bg-background border-primary"
      />

      {/* Action name badge */}
      <div
        className={cn(
          'flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border',
          getActionColorClasses(data.actionColor)
        )}
      >
        <Sparkles className="w-3 h-3 shrink-0" />
        <span className="truncate">{data.actionName}</span>
      </div>

      {/* Model info */}
      <div className="mt-1 text-[10px] text-muted-foreground truncate">
        {data.sourceProvider && data.sourceModel
          ? `${data.sourceProvider} · ${data.sourceModel}`
          : currentSlot?.boundModelId || '未绑定模型'}
      </div>

      {/* Selected toolbar */}
      {selected && (
        <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/95 backdrop-blur-md border border-border shadow-md rounded-xl p-1 z-50 whitespace-nowrap">
          <Popover open={rerunPopoverOpen} onOpenChange={setRerunPopoverOpen}>
            <PopoverTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2 rounded-lg"
                >
                  <Play className="w-3 h-3 mr-0.5" />
                  重新运行
                </Button>
              }
            />
            <PopoverContent className="w-56 p-0 overflow-hidden" align="center">
              <div className="text-[11px] text-muted-foreground px-3 py-2 border-b bg-muted/30">
                选择模型重新运行
              </div>
              <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto p-1">
                {candidates.map((c) => (
                  <button
                    key={c.modelRef}
                    type="button"
                    onClick={() => handleModelSelect(c.modelRef)}
                    className={cn(
                      'text-left text-xs px-2 py-1.5 rounded-md transition-colors',
                      currentSlot?.boundModelId === c.modelRef
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                  >
                    {c.providerName} / {c.modelName}
                  </button>
                ))}
                {candidates.length === 0 && (
                  <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                    无可用模型
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 rounded-lg"
            onClick={() => setEditDialogOpen(true)}
          >
            <Pencil className="w-3 h-3 mr-0.5" />
            编辑
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 rounded-lg"
            onClick={() => setCloneDialogOpen(true)}
          >
            <Copy className="w-3 h-3 mr-0.5" />
            克隆
          </Button>
        </div>
      )}

      {/* Processing indicator */}
      {data.status === 'processing' && (
        <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-primary animate-pulse border-2 border-background" />
      )}

      <ActionEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        action={snapshot}
        onSave={handleEditSave}
      />

      <OneOffActionDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        selectedNodes={sourceNodes}
        initialAction={snapshot}
      />
    </div>
  );
});

ActionNodeComponent.displayName = 'ActionNodeComponent';
