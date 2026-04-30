import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import { IdeaNode, ActionConfig, AIModelConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  nodes: IdeaNode[];
  edges: Edge[];
  actions: ActionConfig[];
  models: AIModelConfig[];
  
  onNodesChange: OnNodesChange<IdeaNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  
  addNode: (node: IdeaNode) => void;
  updateNodeData: (id: string, data: Partial<IdeaNode['data']>) => void;
  setNodes: (nodes: IdeaNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  
  addAction: (action: ActionConfig) => void;
  updateAction: (id: string, action: Partial<ActionConfig>) => void;
  deleteAction: (id: string) => void;

  addModel: (model: AIModelConfig) => void;
  updateModel: (id: string, model: Partial<AIModelConfig>) => void;
  deleteModel: (id: string) => void;
}

const defaultActions: ActionConfig[] = [
  {
    id: 'expand-idea',
    name: '多维展开',
    trigger: { minNodes: 1, maxNodes: 1 },
    processor: {
      type: 'llm',
      payload: '请基于以下内容，多维度展开想象，并拆分成3个独立的子观点。待处理内容：\n\n{{selected_content}}'
    },
    output: { connectionType: 'source_to_new' }
  },
  {
    id: 'translate-en',
    name: '翻译为英文',
    trigger: { minNodes: 1, maxNodes: 1 },
    processor: {
      type: 'llm',
      payload: '将以下内容翻译为纯正的英文：\n\n{{selected_content}}'
    },
    output: { connectionType: 'source_to_new' }
  },
  {
    id: 'summarize',
    name: '总结归纳',
    trigger: { minNodes: 2, maxNodes: null },
    processor: {
      type: 'llm',
      payload: '请将以下多个观点总结融合为一个核心观点：\n\n{{selected_content}}'
    },
    output: { connectionType: 'new_to_source' }
  }
];

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      nodes: [
        {
          id: 'initial-node',
          type: 'ideaNode',
          position: { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 100 },
          data: { content: '双击进行编辑。\n\n或者双击背景添加新想法。', status: 'idle' },
        }
      ],
      edges: [],
      actions: defaultActions,
      models: [],

      onNodesChange: (changes: NodeChange<IdeaNode>[]) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes),
        });
      },

      onEdgesChange: (changes: EdgeChange[]) => {
        set({
          edges: applyEdgeChanges(changes, get().edges),
        });
      },

      onConnect: (connection: Connection) => {
        set({
          edges: addEdge(connection, get().edges),
        });
      },

      addNode: (node: IdeaNode) => {
        set({
          nodes: [...get().nodes, node],
        });
      },

      updateNodeData: (id: string, data: Partial<IdeaNode['data']>) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === id) {
              return {
                ...node,
                data: { ...node.data, ...data },
              };
            }
            return node;
          }),
        });
      },
      
      setNodes: (nodes: IdeaNode[]) => set({ nodes }),
      setEdges: (edges: Edge[]) => set({ edges }),

      addAction: (action: ActionConfig) => {
        set({
          actions: [...get().actions, action],
        });
      },

      updateAction: (id: string, actionData: Partial<ActionConfig>) => {
        set({
          actions: get().actions.map((act) => 
            act.id === id ? { ...act, ...actionData } : act
          )
        });
      },

      deleteAction: (id: string) => {
        set({
          actions: get().actions.filter((act) => act.id !== id),
        });
      },

      addModel: (model: AIModelConfig) => {
        set({
          models: [...get().models, model],
        });
      },

      updateModel: (id: string, modelData: Partial<AIModelConfig>) => {
        set({
          models: get().models.map((mod) => 
            mod.id === id ? { ...mod, ...modelData } : mod
          )
        });
      },

      deleteModel: (id: string) => {
        set({
          models: get().models.filter((mod) => mod.id !== id),
        });
      }
    }),
    {
      name: 'mindflow-storage',
      partialize: (state) => ({ actions: state.actions, nodes: state.nodes, edges: state.edges, models: state.models }),
    }
  )
);
