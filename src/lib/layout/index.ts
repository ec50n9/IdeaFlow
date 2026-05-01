import { v4 as uuidv4 } from 'uuid';
import { Edge } from '@xyflow/react';
import { IdeaNode, ActionNode } from '@/types';
import { BuildLayoutParams, BuildLayoutResult, Direction } from './types';
import { inferTopology } from './topology';
import {
  computeNodeGroup,
  computeNewNodePositions,
  ACTION_NODE_WIDTH,
  ACTION_NODE_HEIGHT,
  GAP_BETWEEN_NODES,
} from './positioning';
export { computeNodeGroup, computeNewNodePositions };

// ─────────────────────────────────────────────────────────────
// 并发方向互斥
// ─────────────────────────────────────────────────────────────

/** taskId -> nodeId -> 预留的方向 */
const pendingAllocations = new Map<string, Map<string, Direction>>();

const DIRECTION_PRIORITY: Direction[] = ['down', 'right', 'left', 'up'];

/** 将 sourceHandle ID 映射为布局方向 */
function handleToDirection(handle?: string | null): Direction | null {
  if (!handle) return null;
  if (handle.startsWith('bottom')) return 'down';
  if (handle.startsWith('top')) return 'up';
  if (handle.startsWith('right')) return 'right';
  if (handle.startsWith('left')) return 'left';
  return null;
}

/**
 * 为指定任务在指定节点上预留布局方向。
 *
 * 占用来源包括：
 * 1. 其他并发任务（pendingAllocations）
 * 2. 画布上已存在的边（existingEdges）中这些节点作为 source 使用的方向
 *
 * 若首选方向已被占用，自动降级到下一个可用方向。
 */
export function reserveDirections(
  taskId: string,
  nodeIds: string[],
  preferredDirection: Direction,
  existingEdges?: Edge[]
): Direction {
  const used = new Set<Direction>();

  // 1. 其他并发任务的预留
  for (const [otherTaskId, allocations] of pendingAllocations) {
    if (otherTaskId === taskId) continue;
    for (const nodeId of nodeIds) {
      if (allocations.has(nodeId)) {
        used.add(allocations.get(nodeId)!);
      }
    }
  }

  // 2. 已有边中这些节点作为 source 占用的方向
  if (existingEdges) {
    for (const nodeId of nodeIds) {
      for (const edge of existingEdges) {
        if (edge.source === nodeId && edge.sourceHandle) {
          const dir = handleToDirection(edge.sourceHandle);
          if (dir) used.add(dir);
        }
      }
    }
  }

  // 首选方向可用则直接用
  if (!used.has(preferredDirection)) {
    pendingAllocations.set(
      taskId,
      new Map(nodeIds.map((id) => [id, preferredDirection]))
    );
    return preferredDirection;
  }

  // 按优先级找第一个空闲方向
  for (const dir of DIRECTION_PRIORITY) {
    if (!used.has(dir)) {
      pendingAllocations.set(taskId, new Map(nodeIds.map((id) => [id, dir])));
      return dir;
    }
  }

  // 全部占用，回退到首选方向（允许重叠，至少保证功能可用）
  pendingAllocations.set(
    taskId,
    new Map(nodeIds.map((id) => [id, preferredDirection]))
  );
  return preferredDirection;
}

/**
 * 释放任务预留的全部方向。
 */
export function releaseDirections(taskId: string): void {
  pendingAllocations.delete(taskId);
}

// ─────────────────────────────────────────────────────────────
// 布局构建入口
// ─────────────────────────────────────────────────────────────

/**
 * 统一布局构建流水线：
 * 1. 拓扑推断（fan-out / converge / layer）
 * 2. 并发安全的方向预留
 * 3. 源节点群几何计算
 * 4. 新节点位置计算
 * 5. Handle 统一分配
 * 6. 构建边
 */
export function buildLayout(params: BuildLayoutParams): BuildLayoutResult {
  const {
    actionConnectionType,
    sourceNodes,
    results,
    sourceMeta,
    taskId,
  } = params;

  // 1. 推断拓扑策略
  const basePolicy = inferTopology(
    actionConnectionType,
    sourceNodes.length,
    results.length
  );

  // 2. 并发安全的方向预留（同时考虑已有边）
  const direction = taskId
    ? reserveDirections(
        taskId,
        sourceNodes.map((n) => n.id),
        basePolicy.direction,
        params.existingEdges
      )
    : basePolicy.direction;

  const policy = { ...basePolicy, direction };

  // 3. 计算源节点群
  const sourceGroup = computeNodeGroup(sourceNodes);

  // 4. 准备新节点骨架
  const newNodes: IdeaNode[] = results.map((res) => {
    const id = res.id || uuidv4();
    return {
      id,
      type: res.type || 'ideaNode',
      ...res,
      position: res.position || { x: 0, y: 0 },
      data: {
        content: res.content || res.data?.content || '',
        ...res.data,
        ...sourceMeta,
        status: 'idle' as const,
      },
    };
  });

  // 5. 计算新节点绝对位置
  const newNodeIds = newNodes.map((n) => n.id);
  const positions = computeNewNodePositions(
    policy.direction,
    sourceGroup.bbox,
    sourceGroup.center,
    newNodeIds
  );

  for (const node of newNodes) {
    const pos = positions.get(node.id);
    if (pos) {
      node.position = pos;
    }
  }

  // 6. 构建或复用 Action 中间节点
  let actionNode: ActionNode;

  if (params.existingActionNodeId) {
    const existing = params.existingNodes.find(
      (n) => n.id === params.existingActionNodeId && n.type === 'actionNode'
    ) as ActionNode | undefined;
    if (existing) {
      actionNode = existing;
      actionNode.data = { ...actionNode.data, status: 'processing' as const };
    } else {
      actionNode = {
        id: params.existingActionNodeId,
        type: 'actionNode',
        position: { x: 0, y: 0 },
        data: {
          actionId: params.actionConfig.id,
          actionName: params.actionConfig.name,
          actionColor: params.actionConfig.color,
          actionSnapshot: params.actionConfig,
          sourceSlot: sourceMeta.sourceSlot,
          sourceProvider: sourceMeta.sourceProvider,
          sourceModel: sourceMeta.sourceModel,
          status: 'processing' as const,
        },
      };
    }
  } else {
    actionNode = {
      id: uuidv4(),
      type: 'actionNode',
      position: { x: 0, y: 0 },
      data: {
        actionId: params.actionConfig.id,
        actionName: params.actionConfig.name,
        actionColor: params.actionConfig.color,
        actionSnapshot: params.actionConfig,
        sourceSlot: sourceMeta.sourceSlot,
        sourceProvider: sourceMeta.sourceProvider,
        sourceModel: sourceMeta.sourceModel,
        status: 'idle' as const,
      },
    };
  }

  switch (direction) {
    case 'down':
      actionNode.position = {
        x: sourceGroup.center.x - ACTION_NODE_WIDTH / 2,
        y: sourceGroup.bbox.maxY + GAP_BETWEEN_NODES,
      };
      break;
    case 'up':
      actionNode.position = {
        x: sourceGroup.center.x - ACTION_NODE_WIDTH / 2,
        y: sourceGroup.bbox.minY - GAP_BETWEEN_NODES - ACTION_NODE_HEIGHT,
      };
      break;
    case 'right':
      actionNode.position = {
        x: sourceGroup.bbox.maxX + GAP_BETWEEN_NODES,
        y: sourceGroup.center.y - ACTION_NODE_HEIGHT / 2,
      };
      break;
    case 'left':
      actionNode.position = {
        x: sourceGroup.bbox.minX - GAP_BETWEEN_NODES - ACTION_NODE_WIDTH,
        y: sourceGroup.center.y - ACTION_NODE_HEIGHT / 2,
      };
      break;
  }

  // 7. Handle 映射（基于几何方向）
  const HANDLE_MAP: Record<Direction, { source: string; target: string }> = {
    down:  { source: 'bottom-source', target: 'top-target' },
    up:    { source: 'top-source',    target: 'bottom-target' },
    right: { source: 'right-source',  target: 'left-target' },
    left:  { source: 'left-source',   target: 'right-target' },
  };
  const handle = HANDLE_MAP[direction];

  // 8. 构建边（source → action → result）
  const newEdges: Edge[] = [];

  // source → action（仅在新建 action 节点时添加）
  if (!params.existingActionNodeId) {
    for (const src of sourceNodes) {
      newEdges.push({
        id: `e-${src.id}-${actionNode.id}`,
        source: src.id,
        target: actionNode.id,
        sourceHandle: handle.source,
        targetHandle: handle.target,
        animated: true,
      });
    }
  }

  // action → result
  for (const node of newNodes) {
    newEdges.push({
      id: `e-${actionNode.id}-${node.id}`,
      source: actionNode.id,
      target: node.id,
      sourceHandle: handle.source,
      targetHandle: handle.target,
      animated: true,
    });
  }

  // 9. 源节点状态清理
  const updatedSourceNodes = sourceNodes.map((src) => ({
    ...src,
    data: { ...src.data, status: 'idle' as const },
    selected: false,
  }));

  return { newNodes: [actionNode, ...newNodes], newEdges, updatedSourceNodes };
}
