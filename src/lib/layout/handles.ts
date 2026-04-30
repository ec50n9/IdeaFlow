import { Direction, HandlePair } from './types';

/**
 * 方向到 Handle ID 的映射。
 *
 * 约定：
 * - down  表示新节点在源节点群的下方，连线从上往下
 * - up    表示新节点在源节点群的上方，连线从下往上
 * - right 表示新节点在源节点群的右侧，连线从左往右
 * - left  表示新节点在源节点群的左侧，连线从右往左
 */
const HANDLE_MAP: Record<Direction, HandlePair> = {
  down:  { sourceHandle: 'bottom-source', targetHandle: 'top-target' },
  up:    { sourceHandle: 'top-source',    targetHandle: 'bottom-target' },
  right: { sourceHandle: 'right-source',  targetHandle: 'left-target' },
  left:  { sourceHandle: 'left-source',   targetHandle: 'right-target' },
};

/**
 * 根据布局策略和连接类型获取统一的 Handle 对。
 *
 * 核心原则：让连线尽量直。
 * - source_to_new：边从源指向新，handle 方向 = 布局方向
 * - new_to_source：边从新指向源，handle 方向 = 布局方向的反方向
 */
export function getHandlePair(
  direction: Direction,
  connectionType: 'source_to_new' | 'new_to_source' | 'none'
): HandlePair {
  if (connectionType === 'none') {
    return HANDLE_MAP['down'];
  }

  if (connectionType === 'source_to_new') {
    // 边从源指向新，方向与新节点相对位置一致
    return HANDLE_MAP[direction];
  }

  // connectionType === 'new_to_source'
  // 边从新指向源，方向与布局方向相反
  const reverse: Record<Direction, Direction> = {
    down: 'up',
    up: 'down',
    right: 'left',
    left: 'right',
  };
  return HANDLE_MAP[reverse[direction]];
}
