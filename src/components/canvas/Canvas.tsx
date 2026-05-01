import { useCallback, useRef } from 'react';
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

const nodeTypes = {
  ideaNode: IdeaNodeComponent,
  actionNode: ActionNodeComponent,
};

export const Canvas = () => {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const onNodesChange = useStore((state) => state.onNodesChange);
  const onEdgesChange = useStore((state) => state.onEdgesChange);
  const onConnect = useStore((state) => state.onConnect);
  const addNode = useStore((state) => state.addNode);
  const hasUserCreatedNode = useStore((state) => state.hasUserCreatedNode);
  const setHasUserCreatedNode = useStore((state) => state.setHasUserCreatedNode);
  
  const { screenToFlowPosition } = useReactFlow();
  const lastClickTime = useRef<number>(0);

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
    [screenToFlowPosition, addNode]
  );

  return (
    <div className="w-full h-full relative" onDoubleClick={(e) => {
      // React Flow swallows double click sometimes depending on setup, but pane click handles it now
    }}>
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
        className="bg-muted/10"
      >
        <Background gap={24} size={2} color="currentColor" className="text-muted-foreground/20" />
        <Controls className="fill-foreground" />
        <MiniMap zoomable pannable nodeClassName="bg-primary/20" className="border-border bg-background" />
        
        <Panel position="top-left" className="bg-background/80 backdrop-blur-md px-4 py-3 rounded-xl shadow-sm border m-4 flex flex-col gap-0.5 z-50 pointer-events-none">
          <h1 className="font-semibold tracking-tight text-lg">思维流引擎</h1>
          {!hasUserCreatedNode && (
            <p className="text-sm text-muted-foreground">双击画布添加想法</p>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
};
