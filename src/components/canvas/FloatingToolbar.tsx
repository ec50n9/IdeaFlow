import { memo, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { NodeToolbar, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import { processAction } from '@/lib/engine';

export const FloatingToolbar = memo(() => {
  const { actions, nodes } = useStore();

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedCount = selectedNodes.length;

  const availableActions = useMemo(() => {
    return actions.filter((action) => {
      const min = action.trigger.minNodes;
      const max = action.trigger.maxNodes;
      if (selectedCount < min) return false;
      if (max !== null && selectedCount > max) return false;
      return true;
    });
  }, [actions, selectedCount]);

  if (selectedCount === 0 || availableActions.length === 0) {
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
            variant="secondary"
            size="sm"
            className="rounded-lg flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all"
            onClick={() => processAction(action, selectedNodes)}
          >
            <Play className="w-3.5 h-3.5 text-primary" />
            {action.name}
          </Button>
        ))}
      </div>
    </NodeToolbar>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';

