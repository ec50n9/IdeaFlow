import { memo, useState, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { AppNode, ActionNode, IdeaNode } from '@/types';
import { useStore } from '@/store/useStore';
import { getActionColorClasses, cn } from '@/lib/utils';
import { Sparkles, Play, Copy, Pencil, Eye, Trash2 } from 'lucide-react';
import { matchTrigger } from '@/lib/triggerMatcher';
import { Button } from '@/components/ui/button';
import { ActionEditDialog } from '@/components/ActionEditDialog';
import { OneOffActionDialog } from '@/components/OneOffActionDialog';
import { SlotResolveDialog } from '@/components/SlotResolveDialog';

export const ActionNodeComponent = memo(({ id, data, selected }: NodeProps<ActionNode>) => {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);

  const snapshot = data.actionSnapshot;
  const isOneOff = snapshot.id === 'one-off';
  const currentSlot = snapshot.processor.slots?.[0];

  const sourceNodes = useMemo(() => {
    const store = useStore.getState();
    const sourceNodeIds = store.edges
      .filter((e) => e.target === id)
      .map((e) => e.source);
    return store.nodes.filter((n): n is IdeaNode => sourceNodeIds.includes(n.id) && n.type === 'ideaNode');
  }, [id]);

  const handleEditSave = useCallback(
    (updatedAction: typeof snapshot) => {
      const store = useStore.getState();
      const existing = store.actions.find((a) => a.id === updatedAction.id);
      if (existing) {
        store.updateAction(updatedAction.id, updatedAction);
      }
      store.syncActionNodes(updatedAction.id, updatedAction);
      setEditDialogOpen(false);
    },
    [id]
  );

  const handleRerun = useCallback(() => {
    if (!matchTrigger(sourceNodes, snapshot.trigger)) {
      alert('当前源节点不满足此动作的激活条件，无法重新运行');
      return;
    }
    setSlotDialogOpen(true);
  }, [sourceNodes, snapshot.trigger]);

  const handleDelete = useCallback(() => {
    useStore.getState().deleteNode(id);
  }, [id]);

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
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 rounded-lg"
            onClick={handleRerun}
          >
            <Play className="w-3 h-3 mr-0.5" />
            重新运行
          </Button>

          {isOneOff ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 rounded-lg"
              onClick={() => setViewDialogOpen(true)}
            >
              <Eye className="w-3 h-3 mr-0.5" />
              查看
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] px-2 rounded-lg"
              onClick={() => setEditDialogOpen(true)}
            >
              <Pencil className="w-3 h-3 mr-0.5" />
              编辑
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 rounded-lg"
            onClick={() => setCloneDialogOpen(true)}
          >
            <Copy className="w-3 h-3 mr-0.5" />
            克隆
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            onClick={handleDelete}
          >
            <Trash2 className="w-3 h-3 mr-0.5" />
            删除
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
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        selectedNodes={sourceNodes}
        initialAction={snapshot}
        readOnly
      />

      <OneOffActionDialog
        open={cloneDialogOpen}
        onOpenChange={setCloneDialogOpen}
        selectedNodes={sourceNodes}
        initialAction={snapshot}
      />

      <SlotResolveDialog
        open={slotDialogOpen}
        onOpenChange={setSlotDialogOpen}
        action={snapshot}
        selectedNodes={sourceNodes}
      />
    </div>
  );
});

ActionNodeComponent.displayName = 'ActionNodeComponent';
