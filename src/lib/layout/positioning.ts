import { Point, BBox, NodeGroup } from './types';

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 100;
export const GAP_BETWEEN_GROUPS = 120; // 新旧节点群之间的间距
export const GAP_BETWEEN_NODES = 50;   // 新节点之间的间距
export const ACTION_NODE_WIDTH = 168;
export const ACTION_NODE_HEIGHT = 64;

/**
 * 计算一组节点的包围盒和质心。
 * position 为节点左上角坐标。
 */
export function computeNodeGroup(nodes: { id: string; position: Point; measured?: { width?: number; height?: number } }[]): NodeGroup {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    const w = n.measured?.width ?? NODE_WIDTH;
    const h = n.measured?.height ?? NODE_HEIGHT;

    if (n.position.x < minX) minX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.x + w > maxX) maxX = n.position.x + w;
    if (n.position.y + h > maxY) maxY = n.position.y + h;
  }

  if (minX === Infinity) {
    minX = maxX = minY = maxY = 0;
  }

  return {
    nodeIds: nodes.map((n) => n.id),
    center: {
      x: minX + (maxX - minX) / 2,
      y: minY + (maxY - minY) / 2,
    },
    bbox: { minX, minY, maxX, maxY },
  };
}

/**
 * 计算源节点群的包围盒。
 */
export function computeSourceBBox(nodes: { position: Point; measured?: { width?: number; height?: number } }[]): BBox {
  return computeNodeGroup(nodes.map((n, i) => ({ id: String(i), ...n }))).bbox;
}

/**
 * 根据拓扑策略计算新节点的绝对位置。
 *
 * - fan-out / layer：新节点在源节点群的指定方向一侧，按行/列排列
 * - converge：单个新节点放在源节点群质心的指定方向
 */
export function computeNewNodePositions(
  direction: 'up' | 'down' | 'left' | 'right',
  sourceBBox: BBox,
  sourceCenter: Point,
  newNodeIds: string[]
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const n = newNodeIds.length;

  if (n === 0) return positions;

  if (direction === 'down' || direction === 'up') {
    // 水平排列
    const totalWidth = n * NODE_WIDTH + (n - 1) * GAP_BETWEEN_NODES;
    const startX = sourceCenter.x - totalWidth / 2;
    const baseY =
      direction === 'down'
        ? sourceBBox.maxY + GAP_BETWEEN_GROUPS + ACTION_NODE_HEIGHT + GAP_BETWEEN_NODES
        : sourceBBox.minY - GAP_BETWEEN_GROUPS - ACTION_NODE_HEIGHT - GAP_BETWEEN_NODES - NODE_HEIGHT;

    for (let i = 0; i < n; i++) {
      positions.set(newNodeIds[i], {
        x: startX + i * (NODE_WIDTH + GAP_BETWEEN_NODES),
        y: baseY,
      });
    }
  } else {
    // 垂直排列（left / right）
    const totalHeight = n * NODE_HEIGHT + (n - 1) * GAP_BETWEEN_NODES;
    const startY = sourceCenter.y - totalHeight / 2;
    const baseX =
      direction === 'right'
        ? sourceBBox.maxX + GAP_BETWEEN_GROUPS + ACTION_NODE_WIDTH + GAP_BETWEEN_NODES
        : sourceBBox.minX - GAP_BETWEEN_GROUPS - ACTION_NODE_WIDTH - GAP_BETWEEN_NODES - NODE_WIDTH;

    for (let i = 0; i < n; i++) {
      positions.set(newNodeIds[i], {
        x: baseX,
        y: startY + i * (NODE_HEIGHT + GAP_BETWEEN_NODES),
      });
    }
  }

  return positions;
}
