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
import { CardNode, CardNodeData, AIProviderConfig, DialogMessage, ContextItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { canConnectAtomToDialog } from '@/lib/connectionRules';

/**
 * 根据 edges 动态同步所有 dialog 卡片的 sourceCardIds 和 items。
 * 连线存在 = 引用存在；连线删除 = 引用解除。
 * 保留现有 item 的 role / enabled 等用户自定义设置。
 */
function syncDialogItems(nodes: CardNode[], edges: Edge[]): CardNode[] {
  return nodes.map((node) => {
    if (node.data.cardType !== 'dialog') return node;

    // 找到所有连入该 dialog 的原子卡片（bottom-source → top-target）
    const connectedAtomIds = edges
      .filter(
        (e) =>
          e.target === node.id &&
          e.targetHandle === 'top-target' &&
          e.sourceHandle === 'bottom-source'
      )
      .map((e) => e.source);

    const existingItems = node.data.items || [];

    // 保留仍然连线的 item（保留用户的 role / enabled / 排序设置）
    const preservedItems = existingItems.filter((item) =>
      connectedAtomIds.includes(item.sourceCardId)
    );

    // 为新增的连线创建默认 item
    const preservedIds = new Set(preservedItems.map((i) => i.sourceCardId));
    const newItems: ContextItem[] = connectedAtomIds
      .filter((id) => !preservedIds.has(id))
      .map((sourceCardId) => ({
        id: uuidv4(),
        sourceCardId,
        role: 'user' as const,
        enabled: true,
      }));

    const items = [...preservedItems, ...newItems];

    return {
      ...node,
      data: {
        ...node.data,
        sourceCardIds: connectedAtomIds,
        items,
      },
    } as CardNode;
  });
}

interface PendingDialogCreation {
  position: { x: number; y: number };
  atomNodeIds: string[];
}

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

  /** 待创建的对话卡片（模型选择中） */
  pendingDialogCreation: PendingDialogCreation | null;
  openDialogCreation: (atomNodeIds: string[], position: { x: number; y: number }) => void;
  confirmDialogCreation: (modelRef: string) => void;
  cancelDialogCreation: () => void;
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
        const newEdges = applyEdgeChanges(changes, get().edges);
        get().setEdges(newEdges);
      },

      onConnect: (connection: Connection) => {
        const { nodes, edges, providers } = get();
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const targetNode = nodes.find((n) => n.id === connection.target);

        // ── 原子卡片 → 对话卡片 的接入连接 ──
        const isAtomToDialog =
          sourceNode?.data.cardType === 'atom' &&
          targetNode?.data.cardType === 'dialog' &&
          connection.sourceHandle === 'bottom-source' &&
          connection.targetHandle === 'top-target';

        if (isAtomToDialog) {
          const atomType = sourceNode.data.atomType!;
          const modelRef = targetNode.data.modelRef;

          const check = canConnectAtomToDialog(atomType, modelRef || '', providers);
          if (!check.allowed) {
            console.warn(`[连接拒绝] ${check.reason}`);
            return; // 拒绝连接，不创建 edge
          }

          // 创建 edge，由 setEdges 自动同步 dialog 的 items
          get().setEdges(addEdge(connection, edges));
          return;
        }

        // ── 其他连接：直接放行 ──
        get().setEdges(addEdge(connection, edges));
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
        const newNodes = get().nodes.filter((n) => n.id !== id);
        const newEdges = get().edges.filter((e) => e.source !== id && e.target !== id);
        set({ nodes: newNodes });
        get().setEdges(newEdges);
      },

      setNodes: (nodes: CardNode[]) => set({ nodes }),
      setEdges: (edges: Edge[]) => {
        set((state) => ({
          edges,
          nodes: syncDialogItems(state.nodes, edges),
        }));
      },

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

      pendingDialogCreation: null,

      openDialogCreation: (atomNodeIds: string[], position: { x: number; y: number }) => {
        set({ pendingDialogCreation: { atomNodeIds, position } });
      },

      confirmDialogCreation: (modelRef: string) => {
        const { pendingDialogCreation, nodes, edges } = get();
        if (!pendingDialogCreation) return;

        const { atomNodeIds, position } = pendingDialogCreation;
        const dialogId = uuidv4();

        const items: ContextItem[] = atomNodeIds.map((sourceCardId) => ({
          id: uuidv4(),
          sourceCardId,
          role: 'user' as const,
          enabled: true,
        }));

        // 如果有多于一个卡片，第一个设为 system（保持原有行为）
        if (items.length > 1) {
          items[0].role = 'system';
        }

        const dialogNode: CardNode = {
          id: dialogId,
          type: 'cardNode',
          position,
          data: {
            cardType: 'dialog',
            sourceCardIds: atomNodeIds,
            items,
            messages: [],
            outputType: 'text',
            modelRef,
            status: 'idle',
          },
        };

        // 创建节点
        const newNodes = [...nodes, dialogNode];

        // 创建连线
        const edgesToAdd: Edge[] = atomNodeIds.map((cid) => ({
          id: `e-${cid}-${dialogId}`,
          source: cid,
          sourceHandle: 'bottom-source',
          target: dialogId,
          targetHandle: 'top-target',
        }));
        const newEdges: Edge[] = atomNodeIds.length > 0 ? [...edges, ...edgesToAdd] : edges;

        // 锁定源卡片
        const lockedNodes = newNodes.map((node) => {
          if (atomNodeIds.includes(node.id)) {
            return { ...node, data: { ...node.data, isLocked: true } } as CardNode;
          }
          return node;
        });

        set({
          nodes: lockedNodes,
          pendingDialogCreation: null,
          hasUserCreatedNode: true,
        });
        get().setEdges(newEdges);
      },

      cancelDialogCreation: () => {
        set({ pendingDialogCreation: null });
      },
    }),
    {
      name: 'mindflow-storage',
      version: 5,
      migrate: (persistedState: any, version) => {
        try {
          const state = persistedState as any;

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

          // v4 -> v5: dialog 模型选择语义硬化（无数据结构变更）
          if (version < 5) {
            // 无需迁移，字段已兼容
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
            const content = typeof node.data.content === 'string' ? node.data.content : '';
            // 保留 idb:// 引用（IndexedDB 中的图片），只剥离内联 base64
            const stripped = content.replace(
              /data:image\/[^;]+;base64,[\sA-Za-z0-9+/=]+/g,
              '[图片]'
            );
            return {
              ...base,
              data: {
                ...node.data,
                content: stripped,
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
