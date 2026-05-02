import { memo, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { NodeToolbar, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ModelSelector } from '@/components/execution/ModelSelector';
import { Settings2, Zap, Play, Combine } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { CardNode, ContextItem } from '@/types';
import { executeContext } from '@/lib/engine';

export const FloatingToolbar = memo(() => {
  const { nodes, edges, addNode, setEdges, updateNodeData } = useStore();

  const selectedNodes = nodes.filter((n) => n.selected) as CardNode[];
  const selectedAtomNodes = selectedNodes.filter((n) => n.data.cardType === 'atom');
  const selectedContextNodes = selectedNodes.filter((n) => n.data.cardType === 'context');
  const selectedExecutionNodes = selectedNodes.filter((n) => n.data.cardType === 'execution');

  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [pendingContextId, setPendingContextId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // ── 聚合上下文 ──
  const handleAggregate = useCallback(() => {
    if (selectedAtomNodes.length === 0) return;

    const sourceCardIds = selectedAtomNodes.map((n) => n.id);

    // 计算 context 卡片位置（在源卡片群的右侧）
    const minX = Math.min(...selectedAtomNodes.map((n) => n.position.x));
    const maxX = Math.max(...selectedAtomNodes.map((n) => n.position.x + 250));
    const avgY = selectedAtomNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedAtomNodes.length;

    const contextId = uuidv4();
    const items: ContextItem[] = sourceCardIds.map((cid, index) => ({
      id: uuidv4(),
      sourceCardId: cid,
      role: 'user',
    }));

    // 如果只有一个卡片，不设置 system；如果有多个，第一个设为 system（默认）
    if (items.length > 1) {
      items[0].role = 'system';
    }

    const contextNode: CardNode = {
      id: contextId,
      type: 'cardNode',
      position: {
        x: maxX + 100,
        y: avgY,
      },
      data: {
        cardType: 'context',
        sourceCardIds,
        items,
      },
    };

    addNode(contextNode);

    // 建立边
    const newEdges = sourceCardIds.map((cid) => ({
      id: `e-${cid}-${contextId}`,
      source: cid,
      target: contextId,
    }));

    setEdges([...edges, ...newEdges]);

    // 锁定源卡片
    for (const cid of sourceCardIds) {
      updateNodeData(cid, { isLocked: true });
    }
  }, [selectedAtomNodes, edges, addNode, setEdges, updateNodeData]);

  // ── 执行上下文 ──
  const handleExecute = useCallback(() => {
    if (selectedContextNodes.length !== 1) return;
    setPendingContextId(selectedContextNodes[0].id);
    setModelSelectorOpen(true);
  }, [selectedContextNodes]);

  // ── 确认执行 ──
  const handleModelSelected = useCallback(async (modelRef: string, outputType: 'text' | 'image' | 'audio') => {
    if (!pendingContextId) return;
    setModelSelectorOpen(false);
    setIsExecuting(true);
    try {
      await executeContext(pendingContextId, modelRef, outputType);
    } catch (e) {
      console.error('执行失败:', e);
    } finally {
      setIsExecuting(false);
      setPendingContextId(null);
    }
  }, [pendingContextId]);

  // ── 重新执行（等同于在关联上下文上再次执行）──
  const handleReexecute = useCallback(() => {
    if (selectedExecutionNodes.length !== 1) return;
    const contextCardId = selectedExecutionNodes[0].data.contextCardId;
    if (!contextCardId) return;
    setPendingContextId(contextCardId);
    setModelSelectorOpen(true);
  }, [selectedExecutionNodes]);

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
          {/* 选中 atom 卡片时：聚合上下文 */}
          {selectedAtomNodes.length > 0 && selectedContextNodes.length === 0 && selectedExecutionNodes.length === 0 && (
            <Button
              size="sm"
              className={cn(
                "rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all border text-xs px-3 py-1 h-auto bg-primary text-primary-foreground"
              )}
              onClick={handleAggregate}
            >
              <Combine className="w-3.5 h-3.5" />
              聚合上下文
              <span className="opacity-80 text-[10px]">({selectedAtomNodes.length})</span>
            </Button>
          )}

          {/* 选中 context 卡片时：执行 */}
          {selectedContextNodes.length === 1 && selectedAtomNodes.length === 0 && selectedExecutionNodes.length === 0 && (
            <Button
              size="sm"
              className={cn(
                "rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all border text-xs px-3 py-1 h-auto bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              onClick={handleExecute}
              disabled={isExecuting}
            >
              <Zap className="w-3.5 h-3.5" />
              {isExecuting ? '执行中...' : '执行'}
            </Button>
          )}

          {/* 选中 execution 卡片时：重新执行 */}
          {selectedExecutionNodes.length === 1 && selectedAtomNodes.length === 0 && selectedContextNodes.length === 0 && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all text-xs px-3 py-1 h-auto"
              onClick={handleReexecute}
              disabled={isExecuting}
            >
              <Play className="w-3.5 h-3.5" />
              {isExecuting ? '执行中...' : '重新执行'}
            </Button>
          )}
        </div>
      </NodeToolbar>

      {pendingContextId && (
        <ModelSelector
          open={modelSelectorOpen}
          onOpenChange={setModelSelectorOpen}
          contextCardId={pendingContextId}
          onSelect={handleModelSelected}
        />
      )}
    </>
  );
});

FloatingToolbar.displayName = 'FloatingToolbar';
