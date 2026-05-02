import { Edge } from '@xyflow/react';
import { CardNode } from '@/types';

/** 空间方向 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 2D 点 */
export interface Point {
  x: number;
  y: number;
}

/** 包围盒 */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 节点群的统计信息 */
export interface NodeGroup {
  nodeIds: string[];
  center: Point;
  bbox: BBox;
}
