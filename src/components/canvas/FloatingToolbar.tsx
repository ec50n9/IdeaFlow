import { memo, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { NodeToolbar, Position } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageSquare, Combine, Image as ImageIcon } from 'lucide-react';
import { CardNode } from '@/types';

export const FloatingToolbar = memo(() => {
  const nodes = useStore((state) => state.nodes);
  const openDialogCreation = useStore((state) => state.openDialogCreation);
  const openImageGen = useStore((state) => state.openImageGen);

  const selectedNodes = nodes.filter((n) => n.selected) as CardNode[];
  const selectedAtomNodes = selectedNodes.filter((n) => n.data.cardType === 'atom');
  const selectedDialogNodes = selectedNodes.filter((n) => n.data.cardType === 'dialog');

  // ── 创建对话 ──
  const handleCreateDialog = useCallback(() => {
    if (selectedAtomNodes.length === 0) return;

    const atomNodeIds = selectedAtomNodes.map((n) => n.id);

    // 计算 dialog 卡片位置（在源卡片群的右侧）
    const maxX = Math.max(...selectedAtomNodes.map((n) => n.position.x + 250));
    const avgY = selectedAtomNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedAtomNodes.length;

    openDialogCreation(atomNodeIds, { x: maxX + 100, y: avgY });
  }, [selectedAtomNodes, openDialogCreation]);

  // ── 创建图像 ──
  const handleCreateImage = useCallback(() => {
    if (selectedAtomNodes.length === 0) return;

    const atomNodeIds = selectedAtomNodes.map((n) => n.id);
    openImageGen(atomNodeIds);
  }, [selectedAtomNodes, openImageGen]);

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
          {/* 选中 atom 卡片时：创建对话 / 创建图像 */}
          {selectedAtomNodes.length > 0 && selectedDialogNodes.length === 0 && (
            <>
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
              <Button
                size="sm"
                className={cn(
                  "rounded-full flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md transition-all border text-xs px-3 py-1 h-auto bg-purple-500 text-white hover:bg-purple-600"
                )}
                onClick={handleCreateImage}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                创建图像
              </Button>
            </>
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
