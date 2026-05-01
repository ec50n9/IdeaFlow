import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
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
import { AppNode, ActionConfig, AIModelConfig, AIProviderConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  nodes: AppNode[];
  edges: Edge[];
  actions: ActionConfig[];
  providers: AIProviderConfig[];

  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: AppNode) => void;
  updateNodeData: (id: string, data: Partial<AppNode['data']>) => void;
  setNodes: (nodes: AppNode[]) => void;
  setEdges: (edges: Edge[]) => void;

  addAction: (action: ActionConfig) => void;
  updateAction: (id: string, action: Partial<ActionConfig>) => void;
  deleteAction: (id: string) => void;

  addProvider: (provider: AIProviderConfig) => void;
  updateProvider: (id: string, provider: Partial<AIProviderConfig>) => void;
  deleteProvider: (id: string) => void;

  hasUserCreatedNode: boolean;
  setHasUserCreatedNode: (v: boolean) => void;
}

function createDefaultSlot(): { identifier: string; capability: 'chat' } {
  return { identifier: '默认插槽', capability: 'chat' };
}

const defaultActions: ActionConfig[] = [
  {
    id: 'expand-idea',
    name: '多维展开',
    color: 'purple',
    trigger: { minNodes: 1, maxNodes: 1 },
    processor: {
      type: 'llm',
      payload: '请基于以下内容，多维度展开想象，并拆分成3个独立的子观点。待处理内容：\n\n{{selected_content}}',
      slots: [createDefaultSlot()],
      slotRef: '默认插槽',
    },
    output: { connectionType: 'source_to_new' }
  },
  {
    id: 'translate-en',
    name: '翻译为英文',
    color: 'blue',
    trigger: { minNodes: 1, maxNodes: 1 },
    processor: {
      type: 'llm',
      payload: '将以下内容翻译为纯正的英文：\n\n{{selected_content}}',
      slots: [createDefaultSlot()],
      slotRef: '默认插槽',
    },
    output: { connectionType: 'source_to_new' }
  },
  {
    id: 'summarize',
    name: '总结归纳',
    color: 'emerald',
    trigger: { minNodes: 2, maxNodes: null },
    processor: {
      type: 'llm',
      payload: '请将以下多个观点总结融合为一个核心观点：\n\n{{selected_content}}',
      slots: [createDefaultSlot()],
      slotRef: '默认插槽',
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
      providers: [],

      onNodesChange: (changes: NodeChange<AppNode>[]) => {
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

      addNode: (node: AppNode) => {
        set({
          nodes: [...get().nodes, node],
        });
      },

      updateNodeData: (id: string, data: Partial<AppNode['data']>) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === id) {
              return {
                ...node,
                data: { ...node.data, ...data },
              } as AppNode;
            }
            return node;
          }) as AppNode[],
        });
      },

      setNodes: (nodes: AppNode[]) => set({ nodes }),
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

      addProvider: (provider: AIProviderConfig) => {
        set({
          providers: [...get().providers, provider],
        });
      },

      updateProvider: (id: string, providerData: Partial<AIProviderConfig>) => {
        set({
          providers: get().providers.map((prov) =>
            prov.id === id ? { ...prov, ...providerData } : prov
          )
        });
      },

      deleteProvider: (id: string) => {
        set({
          providers: get().providers.filter((prov) => prov.id !== id),
        });
      },

      hasUserCreatedNode: false,
      setHasUserCreatedNode: (v: boolean) => set({ hasUserCreatedNode: v }),
    }),
    {
      name: 'mindflow-storage',
      storage: createJSONStorage(() => ({
        getItem: (name) => localStorage.getItem(name) ?? null,
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch (e) {
            console.warn('Persist failed: localStorage quota exceeded', e);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      } as StateStorage)),
      partialize: (state) => ({
        actions: state.actions,
        nodes: state.nodes.map((node) => ({
          ...node,
          data: {
            ...node.data as any,
            runningActions: [],
            content: ((node.data as any).content || '').replace(
              /data:image\/[^;]+;base64,[\sA-Za-z0-9+/=]+/g,
              '[图片]'
            ),
          },
        })) as AppNode[],
        edges: state.edges,
        providers: state.providers,
        hasUserCreatedNode: state.hasUserCreatedNode,
      }),
    }
  )
);
