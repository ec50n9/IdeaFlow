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
import { v4 as uuidv4 } from 'uuid';

const nodeTypes = {
  ideaNode: IdeaNodeComponent,
};

export const Canvas = () => {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
  } = useStore();
  
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
        
        <Panel position="top-left" className="bg-background/80 backdrop-blur-md p-4 rounded-xl shadow-sm border m-4 flex flex-col gap-1 z-50 pointer-events-none">
          <h1 className="font-semibold tracking-tight text-lg">思维流引擎</h1>
          <p className="text-sm text-muted-foreground">双击画布添加想法</p>
          <p className="text-xs text-muted-foreground/70 mt-1">按住 Shift + 拖拽 进行多选</p>
        </Panel>
      </ReactFlow>
    </div>
  );
};
