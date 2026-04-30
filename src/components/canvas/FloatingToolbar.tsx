import { memo, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { NodeToolbar, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { cn, getActionColorClasses } from '@/lib/utils';
import { processAction } from '@/lib/engine';
import { OneOffActionDialog } from '@/components/OneOffActionDialog';

export const FloatingToolbar = memo(() => {
  const { actions, nodes } = useStore();

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedCount = selectedNodes.length;

  const [dialogOpen, setDialogOpen] = useState(false);

  const availableActions = useMemo(() => {
    return actions.filter((action) => {
      const min = action.trigger.minNodes;
      const max = action.trigger.maxNodes;
      if (selectedCount < min) return false;
      if (max !== null && selectedCount > max) return false;
      return true;
    });
  }, [actions, selectedCount]);

  if (selectedCount === 0) {
    return null;
  }

  const selectedNodeIds = selectedNodes.map((n) => n.id);

  return (
    <NodeToolbar 
      nodeId={selectedNodeIds} 
      position={Position.Top} 
      isVisible={true}
      offset={15}
    >
      <div className="flex items-center justify-center p-1.5 bg-background/95 backdrop-blur-md border border-border shadow-md rounded-xl gap-1.5">
        {availableActions.map((action) => (
          <Button
            key={action.id}
            size="sm"
            className={cn(
              "rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all border text-xs px-3 py-1 h-auto",
              getActionColorClasses(action.color)
            )}
            onClick={() => processAction(action, selectedNodes)}
          >
            {action.name}
          </Button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        <Button
          size="sm"
          variant="outline"
          className="rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all text-xs px-3 py-1 h-auto"
          onClick={() => setDialogOpen(true)}
        >
          次抛
        </Button>
      </div>
      <OneOffActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        selectedNodes={selectedNodes}
      />
    </NodeToolbar>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';

