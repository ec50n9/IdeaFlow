import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  useReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useStore } from '@/store/useStore';
import { CardNodeComponent } from './CardNode';
import { v4 as uuidv4 } from 'uuid';
import { isInputElement } from '@/lib/utils';
import { saveImage } from '@/lib/imageDB';
import { CreateMenu } from './CreateMenu';

const nodeTypes = {
  cardNode: CardNodeComponent,
};

function SelectedNodeStats() {
  const nodes = useStore((state) => state.nodes);
  const selected = nodes.filter((n) => n.selected);

  if (selected.length === 0) return null;

  const atomNodes = selected.filter((n) => n.data.cardType === 'atom');
  const dialogNodes = selected.filter((n) => n.data.cardType === 'dialog');

  const textCount = atomNodes.filter((n) => n.data.atomType === 'text').length;
  const imageCount = atomNodes.filter((n) => n.data.atomType === 'image').length;
  const fileCount = atomNodes.filter((n) => n.data.atomType === 'file').length;

  const parts: string[] = [];
  if (textCount) parts.push(`${textCount} 文本`);
  if (imageCount) parts.push(`${imageCount} 图片`);
  if (fileCount) parts.push(`${fileCount} 文件`);
  if (dialogNodes.length) parts.push(`${dialogNodes.length} 对话`);

  return (
    <p className="text-[11px] text-muted-foreground font-mono">
      已选 {selected.length} 个节点: {parts.join(' + ')}
    </p>
  );
}

export const Canvas = () => {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);
  const addNode = useStore((state) => state.addNode);
  const deleteNode = useStore((state) => state.deleteNode);
  const setEdges = useStore((state) => state.setEdges);
  const hasUserCreatedNode = useStore((state) => state.hasUserCreatedNode);
  const setHasUserCreatedNode = useStore((state) => state.setHasUserCreatedNode);

  const { screenToFlowPosition } = useReactFlow();

  // ── 边高亮：选中节点时，相连的边高亮显示 ──
  const selectedNodeIds = useMemo(
    () => new Set(nodes.filter((n) => n.selected).map((n) => n.id)),
    [nodes]
  );

  const hasSelection = selectedNodeIds.size > 0;

  const highlightedEdges = useMemo(() => {
    return edges.map((edge) => {
      const isConnected =
        selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target);

      if (!hasSelection) {
        // 没有选中任何节点时，恢复默认样式
        return { ...edge, style: { ...edge.style, opacity: 1 }, animated: false };
      }

      if (isConnected) {
        // 与选中节点相连的边：高亮（加粗 + 恢复透明度）
        return {
          ...edge,
          style: {
            ...edge.style,
            strokeWidth: 3,
            opacity: 1,
          },
          animated: true,
        };
      }

      // 未相连的边：变暗
      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: 0.12,
        },
        animated: false,
      };
    });
  }, [edges, selectedNodeIds, hasSelection]);
  const lastClickTime = useRef<number>(0);
  const lastTouchTime = useRef<number>(0);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const pendingPosition = useRef<{ x: number; y: number } | null>(null);

  // ── 双击空白处弹出创建菜单 ──
  const handlePaneClick = useCallback(
    (event: React.MouseEvent<Element>) => {
      const now = Date.now();
      const timeDiff = now - lastClickTime.current;

      if (timeDiff < 300) {
        event.preventDefault();
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        pendingPosition.current = position;
        setCreateMenuOpen(true);
      }
      lastClickTime.current = now;
    },
    [screenToFlowPosition]
  );

  const handleCreateAtom = useCallback(() => {
    if (!pendingPosition.current) return;
    addNode({
      id: uuidv4(),
      type: 'cardNode',
      position: pendingPosition.current,
      data: {
        cardType: 'atom',
        atomType: 'text',
        content: '',
        status: 'idle',
        sourceType: 'manual',
        isEditing: true,
      },
    });
    setHasUserCreatedNode(true);
  }, [addNode, setHasUserCreatedNode]);

  const openDialogCreation = useStore((state) => state.openDialogCreation);

  const handleCreateDialog = useCallback(() => {
    if (!pendingPosition.current) return;

    // 收集当前选中的原子卡片
    const selectedAtomIds = nodes
      .filter((n) => n.selected && n.data.cardType === 'atom')
      .map((n) => n.id);

    openDialogCreation(selectedAtomIds, pendingPosition.current);
    setHasUserCreatedNode(true);
  }, [nodes, openDialogCreation, setHasUserCreatedNode]);

  const handlePaneTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) return;

      const touch = event.changedTouches[0];
      const now = Date.now();
      const timeDiff = now - lastTouchTime.current;

      if (timeDiff < 300 && lastTouchPos.current) {
        const dist = Math.hypot(
          touch.clientX - lastTouchPos.current.x,
          touch.clientY - lastTouchPos.current.y
        );
        if (dist < 20) {
          event.preventDefault();
          const position = screenToFlowPosition({
            x: touch.clientX,
            y: touch.clientY,
          });
          pendingPosition.current = position;
          setCreateMenuOpen(true);
        }
      }

      lastTouchTime.current = now;
      lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    },
    [screenToFlowPosition]
  );

  // ── 拖拽文件到画布 ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const position = screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });

    files.forEach((file, index) => {
      const offsetX = index * 20;
      const offsetY = index * 20;

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataUrl = ev.target?.result as string;
          const id = await saveImage(dataUrl);
          addNode({
            id: uuidv4(),
            type: 'cardNode',
            position: { x: position.x + offsetX, y: position.y + offsetY },
            data: {
              cardType: 'atom',
              atomType: 'image',
              content: `idb://${id}`,
              status: 'idle',
              sourceType: 'manual',
            },
          });
          setHasUserCreatedNode(true);
        };
        reader.readAsDataURL(file);
      } else {
        const isText = file.type.startsWith('text/') ||
          file.name.endsWith('.md') ||
          file.name.endsWith('.json') ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.csv');

        if (isText && file.size < 1024 * 1024) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const text = ev.target?.result as string;
            addNode({
              id: uuidv4(),
              type: 'cardNode',
              position: { x: position.x + offsetX, y: position.y + offsetY },
              data: {
                cardType: 'atom',
                atomType: 'file',
                content: `[文件: ${file.name}]\n\n${text.slice(0, 50000)}${text.length > 50000 ? '\n\n...（内容已截断）' : ''}`,
                status: 'idle',
                sourceType: 'manual',
              },
            });
            setHasUserCreatedNode(true);
          };
          reader.readAsText(file);
        } else {
          addNode({
            id: uuidv4(),
            type: 'cardNode',
            position: { x: position.x + offsetX, y: position.y + offsetY },
            data: {
              cardType: 'atom',
              atomType: 'file',
              content: `[文件: ${file.name}]\n类型: ${file.type || '未知'}\n大小: ${(file.size / 1024).toFixed(1)} KB`,
              status: 'idle',
              sourceType: 'manual',
            },
          });
          setHasUserCreatedNode(true);
        }
      }
    });
  }, [screenToFlowPosition, addNode, setHasUserCreatedNode]);

  // Global keyboard delete support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isInputElement(e.target as HTMLElement)) return;

      const selected = nodes.filter((n) => n.selected);
      if (selected.length > 0) {
        e.preventDefault();
        selected.forEach((n) => deleteNode(n.id));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, deleteNode]);

  return (
    <div
      className="w-full h-full relative"
      onTouchEnd={handlePaneTouchEnd}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={highlightedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        onPaneClick={handlePaneClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        zoomOnDoubleClick={false}
        className="bg-muted/10"
      >
        <Background gap={24} size={2} color="currentColor" className="text-muted-foreground/20" />
        <Controls className="fill-foreground" />
        <MiniMap zoomable pannable nodeClassName="bg-primary/20" className="hidden md:block border-border bg-background" />
        
        <Panel position="top-left" className="bg-background/80 backdrop-blur-md px-4 py-3 rounded-xl shadow-sm border m-4 flex flex-col gap-1 z-50 pointer-events-none">
          <h1 className="font-semibold tracking-tight text-lg">思维流引擎</h1>
          {!hasUserCreatedNode && (
            <p className="text-sm text-muted-foreground">双击画布创建卡片，或拖拽文件到此处</p>
          )}
          <SelectedNodeStats />
        </Panel>
      </ReactFlow>

      {/* 拖拽文件视觉反馈 */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-4 border-primary border-dashed m-4 rounded-2xl flex items-center justify-center pointer-events-none animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-3 text-primary">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 12.75l-3-3m0 0l3-3m-3 3h7.5" />
            </svg>
            <span className="text-lg font-medium">松开以添加文件到画布</span>
          </div>
        </div>
      )}

      {/* 创建菜单 */}
      <CreateMenu
        open={createMenuOpen}
        onOpenChange={setCreateMenuOpen}
        onCreateAtom={handleCreateAtom}
        onCreateDialog={handleCreateDialog}
      />


    </div>
  );
};
