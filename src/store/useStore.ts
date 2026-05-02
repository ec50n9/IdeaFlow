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
import { CardNode, CardNodeData, AIProviderConfig, DialogMessage } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface AppState {
  nodes: CardNode[];
  edges: Edge[];
  providers: AIProviderConfig[];

  onNodesChange: OnNodesChange<CardNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: CardNode) => void;
  updateNodeData: (id: string, data: Partial<CardNodeData>) => void;
  deleteNode: (id: string) => void;
  setNodes: (nodes: CardNode[]) => void;
  setEdges: (edges: Edge[]) => void;

  addDialogMessage: (dialogId: string, message: DialogMessage) => void;
  updateDialogMessage: (dialogId: string, messageId: string, content: string) => void;

  addProvider: (provider: AIProviderConfig) => void;
  updateProvider: (id: string, provider: Partial<AIProviderConfig>) => void;
  deleteProvider: (id: string) => void;
  setProviders: (providers: AIProviderConfig[]) => void;

  hasUserCreatedNode: boolean;
  setHasUserCreatedNode: (v: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      nodes: [
        {
          id: 'initial-node',
          type: 'cardNode',
          position: { x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 100 },
          data: {
            cardType: 'atom',
            atomType: 'text',
            content: '双击进行编辑。\n\n或者双击背景添加新卡片。',
            status: 'idle',
            sourceType: 'manual',
          },
        }
      ],
      edges: [],
      providers: [],

      onNodesChange: (changes: NodeChange<CardNode>[]) => {
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

      addNode: (node: CardNode) => {
        set({
          nodes: [...get().nodes, node],
        });
      },

      updateNodeData: (id: string, data: Partial<CardNodeData>) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === id) {
              return {
                ...node,
                data: { ...node.data, ...data },
              } as CardNode;
            }
            return node;
          }) as CardNode[],
        });
      },

      deleteNode: (id: string) => {
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        });
      },

      setNodes: (nodes: CardNode[]) => set({ nodes }),
      setEdges: (edges: Edge[]) => set({ edges }),

      addDialogMessage: (dialogId: string, message: DialogMessage) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === dialogId && node.data.cardType === 'dialog') {
              const messages = [...(node.data.messages || []), message];
              return {
                ...node,
                data: { ...node.data, messages },
              } as CardNode;
            }
            return node;
          }) as CardNode[],
        });
      },

      updateDialogMessage: (dialogId: string, messageId: string, content: string) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === dialogId && node.data.cardType === 'dialog') {
              const messages = (node.data.messages || []).map((m) =>
                m.id === messageId ? { ...m, content } : m
              );
              return {
                ...node,
                data: { ...node.data, messages },
              } as CardNode;
            }
            return node;
          }) as CardNode[],
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

      setProviders: (providers: AIProviderConfig[]) => {
        set({ providers });
      },

      hasUserCreatedNode: false,
      setHasUserCreatedNode: (v: boolean) => set({ hasUserCreatedNode: v }),
    }),
    {
      name: 'mindflow-storage',
      version: 4,
      migrate: (persistedState: any, version) => {
        try {
          const state = persistedState as any;

          // v1 -> v2 的 migrate
          if (version < 2) {
            if (Array.isArray(state.actions)) {
              state.actions = state.actions
                .filter((action: any) => action && typeof action.id === 'string')
                .map((action: any) => ({
                  ...action,
                  trigger: action.trigger && action.trigger.mode
                    ? action.trigger
                    : action.trigger && action.trigger.constraints && action.trigger.constraints.length > 0
                      ? { mode: 'constraint', constraints: action.trigger.constraints }
                      : { mode: 'simple', minNodes: action.trigger?.minNodes ?? 1, maxNodes: action.trigger?.maxNodes ?? null },
                }));
            }
          }

          // v2 -> v3: 移除 Action 概念，重构卡片概念
          if (version < 3) {
            const oldNodes = Array.isArray(state.nodes) ? state.nodes : [];
            const oldEdges = Array.isArray(state.edges) ? state.edges : [];

            const actionNodeIds = new Set<string>();
            const newNodes: CardNode[] = [];

            for (const node of oldNodes) {
              if (!node || typeof node.id !== 'string' || !node.data || typeof node.data !== 'object') {
                continue;
              }

              if (node.type === 'actionNode') {
                actionNodeIds.add(node.id);
                continue;
              }

              if (node.type === 'ideaNode') {
                const oldData = node.data;
                let atomType: 'text' | 'image' | 'file' = 'text';
                const mediaType = oldData.mediaType;
                if (mediaType === 'image') atomType = 'image';
                else if (mediaType === 'file') atomType = 'file';

                const newData: CardNodeData = {
                  cardType: 'atom',
                  atomType,
                  content: typeof oldData.content === 'string' ? oldData.content : '',
                  status: oldData.status || 'idle',
                  sourceType: oldData.sourceType || 'manual',
                  isEditing: oldData.isEditing,
                };

                if (oldData.sourceType === 'ai') {
                  newData.sourceType = 'ai';
                }

                newNodes.push({
                  id: node.id,
                  type: 'cardNode',
                  position: node.position || { x: 0, y: 0 },
                  data: newData,
                  selected: node.selected,
                } as CardNode);
              } else {
                newNodes.push({
                  id: node.id,
                  type: 'cardNode',
                  position: node.position || { x: 0, y: 0 },
                  data: {
                    cardType: 'atom',
                    atomType: 'text',
                    content: '',
                    status: 'idle',
                    sourceType: 'manual',
                  },
                } as CardNode);
              }
            }

            const newEdges = oldEdges.filter((edge: any) => {
              if (!edge || typeof edge.id !== 'string') return false;
              if (actionNodeIds.has(edge.source)) return false;
              if (actionNodeIds.has(edge.target)) return false;
              return true;
            });

            state.nodes = newNodes;
            state.edges = newEdges;
            delete state.actions;
          }

          // v3 -> v4: context + execution → dialog
          if (version < 4) {
            const oldNodes = Array.isArray(state.nodes) ? state.nodes : [];
            const oldEdges = Array.isArray(state.edges) ? state.edges : [];

            const executionNodeIds = new Set<string>();
            const newNodes: CardNode[] = [];

            for (const node of oldNodes) {
              if (!node || typeof node.id !== 'string' || !node.data || typeof node.data !== 'object') {
                continue;
              }

              if (node.data.cardType === 'execution') {
                // execution 卡片删除
                executionNodeIds.add(node.id);
                continue;
              }

              if (node.data.cardType === 'context') {
                // context → dialog
                const oldData = node.data;
                newNodes.push({
                  id: node.id,
                  type: 'cardNode',
                  position: node.position || { x: 0, y: 0 },
                  data: {
                    cardType: 'dialog',
                    sourceCardIds: oldData.sourceCardIds || [],
                    items: (oldData.items || []).map((item: any) => ({
                      ...item,
                      enabled: true,
                    })),
                    messages: [],
                    modelRef: oldData.modelRef,
                    outputType: oldData.outputType || 'text',
                    status: 'idle',
                  },
                  selected: node.selected,
                } as CardNode);
              } else {
                // atom 和其他保留
                newNodes.push(node as CardNode);
              }
            }

            // 过滤边：删除与 execution 相关的边
            const newEdges = oldEdges.filter((edge: any) => {
              if (!edge || typeof edge.id !== 'string') return false;
              if (executionNodeIds.has(edge.source)) return false;
              if (executionNodeIds.has(edge.target)) return false;
              return true;
            });

            state.nodes = newNodes;
            state.edges = newEdges;
          }

          // 通用数据净化
          if (Array.isArray(state.nodes)) {
            state.nodes = state.nodes.filter(
              (node: any) =>
                node &&
                typeof node.id === 'string' &&
                node.data &&
                typeof node.data === 'object' &&
                node.data.cardType
            );
          }
          if (Array.isArray(state.edges)) {
            state.edges = state.edges.filter(
              (edge: any) =>
                edge &&
                typeof edge.id === 'string' &&
                typeof edge.source === 'string' &&
                typeof edge.target === 'string'
            );
          }
          if (Array.isArray(state.providers)) {
            state.providers = state.providers.filter(
              (prov: any) =>
                prov &&
                typeof prov.id === 'string' &&
                typeof prov.name === 'string' &&
                typeof prov.key === 'string' &&
                Array.isArray(prov.models)
            );
            for (const prov of state.providers) {
              for (const model of prov.models || []) {
                if (typeof model.supportsVision !== 'boolean') {
                  model.supportsVision = false;
                }
                if (typeof model.supportsDocument !== 'boolean') {
                  model.supportsDocument = false;
                }
                if (typeof model.contextWindow !== 'number') {
                  model.contextWindow = 128000;
                }
              }
            }
          }

          return persistedState;
        } catch (e) {
          console.error('Persisted state migration failed, resetting to defaults', e);
          return {};
        }
      },
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name) ?? null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch (e) {
            console.warn('Persist failed: localStorage quota exceeded', e);
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // ignore
          }
        },
      } as StateStorage)),
      partialize: (state) => ({
        nodes: state.nodes.map((node) => {
          const base = {
            ...node,
            data: { ...node.data },
          };
          if (node.data.cardType === 'atom') {
            return {
              ...base,
              data: {
                ...node.data,
                content: (typeof node.data.content === 'string' ? node.data.content : '').replace(
                  /data:image\/[^;]+;base64,[\sA-Za-z0-9+/=]+/g,
                  '[图片]'
                ),
              },
            };
          }
          return base;
        }),
        edges: state.edges,
        providers: state.providers,
        hasUserCreatedNode: state.hasUserCreatedNode,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('Storage rehydration failed, clearing corrupted data', error);
            const flagKey = 'mindflow-recovery-attempted';
            try {
              if (sessionStorage.getItem(flagKey)) {
                console.error('Auto-recovery already attempted once, stopping to prevent infinite loop');
                return;
              }
              sessionStorage.setItem(flagKey, '1');
              localStorage.removeItem('mindflow-storage');
              window.location.reload();
            } catch {
              // ignore
            }
          }
        };
      },
    }
  )
);

window.__clearMindflowStorage = () => {
  try {
    localStorage.removeItem('mindflow-storage');
    console.log('mindflow-storage cleared');
  } catch {
    console.error('Failed to clear mindflow-storage');
  }
};

declare global {
  interface Window {
    __clearMindflowStorage?: () => void;
  }
}
