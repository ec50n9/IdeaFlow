import { useCallback, useRef, useEffect } from 'react';
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
import { IdeaNodeComponent } from './IdeaNode';
import { ActionNodeComponent } from './ActionNode';
import { v4 as uuidv4 } from 'uuid';
import { isInputElement } from '@/lib/utils';

const nodeTypes = {
  ideaNode: IdeaNodeComponent,
  actionNode: ActionNodeComponent,
};

function SelectedNodeStats() {
  const nodes = useStore((state) => state.nodes);
  const selected = nodes.filter((n) => n.selected);

  if (selected.length === 0) return null;

  const ideaNodes = selected.filter((n) => n.type === 'ideaNode');
  const actionNodes = selected.filter((n) => n.type === 'actionNode');

  const textCount = ideaNodes.filter((n) => n.data.mediaType === 'text').length;
  const imageCount = ideaNodes.filter((n) => n.data.mediaType === 'image').length;
  const mixedCount = ideaNodes.filter((n) => n.data.mediaType === 'mixed').length;

  const parts: string[] = [];
  if (textCount) parts.push(`${textCount} 文本`);
  if (imageCount) parts.push(`${imageCount} 图片`);
  if (mixedCount) parts.push(`${mixedCount} 混合`);
  if (actionNodes.length) parts.push(`${actionNodes.length} 动作`);

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
  const hasUserCreatedNode = useStore((state) => state.hasUserCreatedNode);
  const setHasUserCreatedNode = useStore((state) => state.setHasUserCreatedNode);

  const { screenToFlowPosition } = useReactFlow();
  const lastClickTime = useRef<number>(0);
  const lastTouchTime = useRef<number>(0);
  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);

  const handlePaneClick = useCallback(
    (event: React.MouseEvent<Element>) => {
      const now = Date.now();
      const timeDiff = now - lastClickTime.current;

      // If time between clicks is less than 300ms, consider it a double click
      if (timeDiff < 300) {
        event.preventDefault();
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });

        addNode({
          id: uuidv4(),
          type: 'ideaNode',
          position,
          data: {
            content: '',
            status: 'idle',
            isEditing: true, // Start in edit mode
            sourceType: 'manual'
          },
        });
        setHasUserCreatedNode(true);
      }
      lastClickTime.current = now;
    },
    [screenToFlowPosition, addNode, setHasUserCreatedNode]
  );

  const handlePaneTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      // Ignore touches on nodes/edges to avoid creating nodes when tapping a node
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

          addNode({
            id: uuidv4(),
            type: 'ideaNode',
            position,
            data: {
              content: '',
              status: 'idle',
              isEditing: true,
              sourceType: 'manual'
            },
          });
          setHasUserCreatedNode(true);
        }
      }

      lastTouchTime.current = now;
      lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    },
    [screenToFlowPosition, addNode, setHasUserCreatedNode]
  );

  // Global keyboard delete support (desktop)
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
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
            <p className="text-sm text-muted-foreground">双击画布添加想法</p>
          )}
          <SelectedNodeStats />
        </Panel>
      </ReactFlow>
    </div>
  );
};
