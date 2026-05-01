import { memo, useMemo, useState, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { NodeToolbar, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn, getActionColorClasses } from '@/lib/utils';
import { processAction } from '@/lib/engine';
import { OneOffActionDialog } from '@/components/OneOffActionDialog';
import { SlotResolveDialog } from '@/components/SlotResolveDialog';
import { getUnresolvedSlots } from '@/lib/modelSlots';
import { ActionConfig } from '@/types';
import { ChevronDown } from 'lucide-react';

export const FloatingToolbar = memo(() => {
  const { actions, nodes } = useStore();

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedCount = selectedNodes.length;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionConfig | null>(null);

  const openMenu = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setOverflowOpen(true);
  };

  const closeMenu = () => {
    hoverTimeoutRef.current = setTimeout(() => setOverflowOpen(false), 150);
  };

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

  const handleExecuteAction = (action: ActionConfig) => {
    const unresolved = getUnresolvedSlots(action);
    if (unresolved.length > 0) {
      setPendingAction(action);
      setSlotDialogOpen(true);
      return;
    }
    processAction(action, selectedNodes);
  };

  return (
    <NodeToolbar
      nodeId={selectedNodeIds}
      position={Position.Top}
      isVisible={true}
      offset={15}
    >
      <div className="flex items-center justify-center p-1.5 bg-background/95 backdrop-blur-md border border-border shadow-md rounded-xl gap-1.5">
        {availableActions.slice(0, 3).map((action) => (
          <Button
            key={action.id}
            size="sm"
            className={cn(
              "rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all border text-xs px-3 py-1 h-auto",
              getActionColorClasses(action.color)
            )}
            onClick={() => handleExecuteAction(action)}
          >
            {action.name}
          </Button>
        ))}

        {availableActions.length > 3 && (
          <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
            <PopoverTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full flex items-center gap-1 font-medium shadow-sm hover:shadow-md transition-all text-xs px-3 py-1 h-auto"
                  onMouseEnter={openMenu}
                  onMouseLeave={closeMenu}
                >
                  更多 <ChevronDown className="w-3 h-3" />
                </Button>
              }
            />
            <PopoverContent
              className="w-auto min-w-[160px] p-1.5 gap-1"
              align="start"
              side="bottom"
              sideOffset={8}
              onMouseEnter={openMenu}
              onMouseLeave={closeMenu}
            >
              {availableActions.slice(3).map((action) => (
                <Button
                  key={action.id}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "w-full justify-start rounded-lg text-xs h-auto py-1.5 px-2.5",
                    getActionColorClasses(action.color)
                  )}
                  onClick={() => {
                    handleExecuteAction(action);
                    setOverflowOpen(false);
                  }}
                >
                  {action.name}
                </Button>
              ))}
            </PopoverContent>
          </Popover>
        )}

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
      <SlotResolveDialog
        open={slotDialogOpen}
        onOpenChange={setSlotDialogOpen}
        action={pendingAction}
        selectedNodes={selectedNodes}
      />
    </NodeToolbar>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';
