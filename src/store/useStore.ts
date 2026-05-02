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
import { canConnectAtomToDialog } from '@/lib/connectionRules';

/**
 * 根据 edges 动态同步所有 dialog 卡片的 sourceCardIds。
 * 连线存在 = 引用存在；连线删除 = 引用解除。
 */
function syncDialogItems(nodes: CardNode[], edges: Edge[]): CardNode[] {
  return nodes.map((node) => {
    if (node.data.cardType !== 'dialog') return node;

    const connectedAtomIds = edges
      .filter(
        (e) =>
          e.target === node.id &&
          e.targetHandle === 'top-target' &&
          e.sourceHandle === 'bottom-source'
      )
      .map((e) => e.source);

    return {
      ...node,
      data: {
        ...node.data,
        sourceCardIds: connectedAtomIds,
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

  /** 当前打开的对话弹窗 */
  activeDialogId: string | null;
  openDialog: (id: string | null) => void;

  /** 当前打开的图像生成弹窗 */
  activeImageGenAtomIds: string[] | null;
  openImageGen: (atomNodeIds: string[]) => void;
  closeImageGen: () => void;
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

        const dialogNode: CardNode = {
          id: dialogId,
          type: 'cardNode',
          position,
          data: {
            cardType: 'dialog',
            sourceCardIds: atomNodeIds,
            messages: [],
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

          set({
          nodes: newNodes,
          pendingDialogCreation: null,
          hasUserCreatedNode: true,
          activeDialogId: dialogId,
        });
        get().setEdges(newEdges);
      },

      cancelDialogCreation: () => {
        set({ pendingDialogCreation: null });
      },

      activeDialogId: null,
      openDialog: (id: string | null) => {
        set({ activeDialogId: id });
      },

      activeImageGenAtomIds: null,
      openImageGen: (atomNodeIds: string[]) => {
        set({ activeImageGenAtomIds: atomNodeIds });
      },
      closeImageGen: () => {
        set({ activeImageGenAtomIds: null });
      },
    }),
    {
      name: 'mindflow-storage',
      version: 1,
      migrate: (persistedState: any, version) => {
        // 系统未上线，不做向后兼容迁移。版本不匹配时 Zustand 会自动重置。
        try {
          const state = persistedState as any;

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
                if (typeof model.chat !== 'boolean') model.chat = true;
                if (typeof model.vision !== 'boolean') model.vision = false;
                if (typeof model.imageGeneration !== 'boolean') model.imageGeneration = false;
                if (typeof model.imageEditing !== 'boolean') model.imageEditing = false;
                if (typeof model.documentParsing !== 'boolean') model.documentParsing = false;
                if (typeof model.contextWindow !== 'number') model.contextWindow = 128000;
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
        activeImageGenAtomIds: state.activeImageGenAtomIds,
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
