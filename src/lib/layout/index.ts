import { Edge } from '@xyflow/react';
import { CardNode } from '@/types';
import { Direction } from './types';
import { computeNodeGroup, computeNewNodePositions } from './positioning';
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

  // 全部占用，回退到首选方向
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
// 布局辅助：计算不重叠的节点位置
// ─────────────────────────────────────────────────────────────

/**
 * 为给定源节点群，计算新节点的合适位置（避免重叠）。
 * 主要用于 context 卡片和 execution 结果卡片的自动布局。
 */
export function computeLayoutPosition(
  sourceNodes: CardNode[],
  preferredDirection: Direction = 'right',
  existingNodes: CardNode[] = [],
  existingEdges: Edge[] = []
): { x: number; y: number } {
  const sourceGroup = computeNodeGroup(sourceNodes);

  // 简单实现：在源节点群的指定方向偏移固定距离
  const offset = 250;

  switch (preferredDirection) {
    case 'right':
      return {
        x: sourceGroup.bbox.maxX + offset,
        y: sourceGroup.center.y - 50,
      };
    case 'left':
      return {
        x: sourceGroup.bbox.minX - offset - 250,
        y: sourceGroup.center.y - 50,
      };
    case 'down':
      return {
        x: sourceGroup.center.x - 125,
        y: sourceGroup.bbox.maxY + offset,
      };
    case 'up':
      return {
        x: sourceGroup.center.x - 125,
        y: sourceGroup.bbox.minY - offset - 100,
      };
  }
}
