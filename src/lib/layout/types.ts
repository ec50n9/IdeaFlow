import { Edge } from '@xyflow/react';
import { IdeaNode, ActionConfig, AppNode } from '@/types';

/** 空间方向 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 拓扑类型 */
export type LayoutPolicy =
  | { type: 'fan-out'; direction: Direction }   // 1->N 或 few->many
  | { type: 'converge'; direction: Direction }  // N->1
  | { type: 'layer'; direction: Direction };    // N->M

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

/** Handle ID 对 */
export interface HandlePair {
  sourceHandle: string;
  targetHandle: string;
}

/** 布局计算入参 */
export interface BuildLayoutParams {
  actionConnectionType: 'source_to_new' | 'new_to_source' | 'none';
  sourceNodes: IdeaNode[];
  results: any[];
  sourceMeta: Record<string, any>;
  existingNodes: AppNode[];
  existingEdges: Edge[];
  taskId?: string;
  actionConfig: ActionConfig;
  existingActionNodeId?: string;
}

/** 布局计算结果 */
export interface BuildLayoutResult {
  newNodes: AppNode[];
  newEdges: Edge[];
  updatedSourceNodes: IdeaNode[];
}
