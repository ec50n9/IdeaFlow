import { memo, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { NodeToolbar, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageSquare, Combine } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { CardNode, ContextItem } from '@/types';

export const FloatingToolbar = memo(() => {
  const { nodes, edges, addNode, setEdges, updateNodeData } = useStore();

  const selectedNodes = nodes.filter((n) => n.selected) as CardNode[];
  const selectedAtomNodes = selectedNodes.filter((n) => n.data.cardType === 'atom');
  const selectedDialogNodes = selectedNodes.filter((n) => n.data.cardType === 'dialog');

  // ── 创建对话 ──
  const handleCreateDialog = useCallback(() => {
    if (selectedAtomNodes.length === 0) return;

    const sourceCardIds = selectedAtomNodes.map((n) => n.id);

    // 计算 dialog 卡片位置（在源卡片群的右侧）
    const minX = Math.min(...selectedAtomNodes.map((n) => n.position.x));
    const maxX = Math.max(...selectedAtomNodes.map((n) => n.position.x + 250));
    const avgY = selectedAtomNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedAtomNodes.length;

    const dialogId = uuidv4();
    const items: ContextItem[] = sourceCardIds.map((cid) => ({
      id: uuidv4(),
      sourceCardId: cid,
      role: 'user',
      enabled: true,
    }));

    // 如果只有一个卡片，不设置 system；如果有多个，第一个设为 system（默认）
    if (items.length > 1) {
      items[0].role = 'system';
    }

    const dialogNode: CardNode = {
      id: dialogId,
      type: 'cardNode',
      position: {
        x: maxX + 100,
        y: avgY,
      },
      data: {
        cardType: 'dialog',
        sourceCardIds,
        items,
        messages: [],
        outputType: 'text',
        status: 'idle',
      },
    };

    addNode(dialogNode);

    // 建立边：原子卡片下方连出 → 对话卡片上方连入
    const newEdges = sourceCardIds.map((cid) => ({
      id: `e-${cid}-${dialogId}`,
      source: cid,
      sourceHandle: 'bottom-source',
      target: dialogId,
      targetHandle: 'top-target',
    }));

    setEdges([...edges, ...newEdges]);

    // 锁定源卡片
    for (const cid of sourceCardIds) {
      updateNodeData(cid, { isLocked: true });
    }

  }, [selectedAtomNodes, edges, addNode, setEdges, updateNodeData]);

  const selectedNodeIds = selectedNodes.map((n) => n.id);

  if (selectedNodes.length === 0) {
    return null;
  }

  return (
    <>
      <NodeToolbar
        nodeId={selectedNodeIds}
        position={Position.Top}
        isVisible={true}
        offset={15}
      >
        <div className="flex items-center justify-center p-1.5 bg-background/95 backdrop-blur-md border border-border shadow-md rounded-xl gap-1.5">
          {/* 选中 atom 卡片时：创建对话 */}
          {selectedAtomNodes.length > 0 && selectedDialogNodes.length === 0 && (
            <Button
              size="sm"
              className={cn(
                "rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all border text-xs px-3 py-1 h-auto bg-primary text-primary-foreground"
              )}
              onClick={handleCreateDialog}

            >
              <Combine className="w-3.5 h-3.5" />
              创建对话
              <span className="opacity-80 text-[10px]">({selectedAtomNodes.length})</span>
            </Button>
          )}

          {/* 选中 dialog 卡片时：提示双击打开 */}
          {selectedDialogNodes.length === 1 && selectedAtomNodes.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1">
              <MessageSquare className="w-3.5 h-3.5" />
              双击打开对话
            </div>
          )}
        </div>
      </NodeToolbar>
    </>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';
