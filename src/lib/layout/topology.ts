import { Direction, LayoutPolicy } from './types';

/**
 * 根据连接类型和节点数量关系推断拓扑策略。
 *
 * 规则：
 * - |new| === 1          → converge（汇聚）
 * - |source| === 1       → fan-out（扇出）
 * - 其他                  → layer（中间层）
 *
 * 方向启发式：
 * - source_to_new（源产生新内容，如展开、翻译）→ 向下
 * - new_to_source（新内容引用/总结源内容）    → 向上
 */
export function inferTopology(
  connectionType: 'source_to_new' | 'new_to_source' | 'none',
  sourceCount: number,
  newCount: number
): LayoutPolicy {
  if (connectionType === 'none') {
    return { type: 'fan-out', direction: 'down' };
  }

  let type: LayoutPolicy['type'];
  if (newCount === 1 && sourceCount >= 1) {
    type = 'converge';
  } else if (sourceCount === 1 && newCount > 1) {
    type = 'fan-out';
  } else {
    type = 'layer';
  }

  // 方向默认策略：展开向下，总结向上
  const direction: Direction =
    connectionType === 'source_to_new' ? 'down' : 'up';

  return { type, direction };
}
