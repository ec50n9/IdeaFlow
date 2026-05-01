import { IdeaNode, ActionTrigger, TriggerConstraint, NodeMediaType } from '@/types';

// ─────────────────────────────────────────────────────────────
// 1. 节点媒体类型自动推导
// ─────────────────────────────────────────────────────────────

export function deriveMediaType(content: string): NodeMediaType {
  // 移除 markdown 图片语法后的纯文本
  const textPart = content.replace(/!\[.*?\]\(.*?\)/g, '').trim();
  const hasText = textPart.length > 0;
  // 检测图片：markdown 图片语法 或 base64 data URL
  const hasImage = /!\[.*?\]\(.*?\)/.test(content) || /data:image\/[^;]+;base64,/.test(content);

  if (hasText && hasImage) return 'mixed';
  if (hasImage) return 'image';
  return 'text';
}

// ─────────────────────────────────────────────────────────────
// 2. 媒体类型匹配
// ─────────────────────────────────────────────────────────────

function matchesMediaType(nodeMediaType: NodeMediaType | undefined, constraintType: TriggerConstraint['mediaType']): boolean {
  if (constraintType === 'any') return true;
  if (!nodeMediaType) return constraintType === 'text'; // 默认视为文本
  if (nodeMediaType === constraintType) return true;
  // mixed 节点可以匹配 text 或 image 约束
  if (nodeMediaType === 'mixed') return constraintType === 'text' || constraintType === 'image';
  return false;
}

// ─────────────────────────────────────────────────────────────
// 3. Trigger 匹配校验
// ─────────────────────────────────────────────────────────────

export function matchTrigger(nodes: IdeaNode[], trigger: ActionTrigger): boolean {
  const { minNodes, maxNodes, constraints } = trigger;

  // 模式 A：简化模式
  if (!constraints || constraints.length === 0) {
    if (nodes.length < minNodes) return false;
    if (maxNodes !== null && nodes.length > maxNodes) return false;
    return true;
  }

  // 模式 B：约束组模式
  // 先检查总数是否落在理论范围内
  const totalMin = constraints.reduce((sum, c) => sum + c.min, 0);
  const totalMax = constraints.reduce((sum, c) => sum + (c.max ?? Infinity), 0);
  if (nodes.length < totalMin) return false;
  if (totalMax !== Infinity && nodes.length > totalMax) return false;

  // 逐个约束检查
  const available = [...nodes];

  for (const constraint of constraints) {
    // 从可用节点中找出匹配此约束的节点
    const matched: IdeaNode[] = [];
    const remaining: IdeaNode[] = [];

    for (const node of available) {
      if (matchesMediaType(node.data.mediaType, constraint.mediaType)) {
        matched.push(node);
      } else {
        remaining.push(node);
      }
    }

    if (matched.length < constraint.min) return false;
    if (constraint.max !== null && matched.length > constraint.max) return false;

    // 非 any 约束消耗非 mixed 节点；mixed 节点始终保留在可用池（可被多约束共享）
    if (constraint.mediaType !== 'any') {
      const consumed = matched.filter((n) => n.data.mediaType !== 'mixed');
      const mixedOnly = matched.filter((n) => n.data.mediaType === 'mixed');
      // 移除被消耗的节点，保留 mixed 和未匹配的
      available.length = 0;
      available.push(...remaining, ...mixedOnly);
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// 4. 构建约束 → 节点映射（用于执行时占位符替换）
// ─────────────────────────────────────────────────────────────

export function buildConstraintMap(
  nodes: IdeaNode[],
  constraints: TriggerConstraint[]
): Map<string, IdeaNode[]> {
  const map = new Map<string, IdeaNode[]>();
  const available = [...nodes];

  for (const constraint of constraints) {
    const matched: IdeaNode[] = [];
    const remaining: IdeaNode[] = [];

    for (const node of available) {
      if (matchesMediaType(node.data.mediaType, constraint.mediaType)) {
        matched.push(node);
      } else {
        remaining.push(node);
      }
    }

    map.set(constraint.id, matched);

    if (constraint.mediaType !== 'any') {
      const consumed = matched.filter((n) => n.data.mediaType !== 'mixed');
      const mixedOnly = matched.filter((n) => n.data.mediaType === 'mixed');
      available.length = 0;
      available.push(...remaining, ...mixedOnly);
    }
  }

  return map;
}

// ─────────────────────────────────────────────────────────────
// 5. 格式化 trigger 为可读描述
// ─────────────────────────────────────────────────────────────

export function formatTriggerDescription(trigger: ActionTrigger): string {
  const { minNodes, maxNodes, constraints } = trigger;

  if (!constraints || constraints.length === 0) {
    if (maxNodes === null) return `≥${minNodes} 个节点`;
    if (minNodes === maxNodes) return `${minNodes} 个节点`;
    return `${minNodes}~${maxNodes} 个节点`;
  }

  const parts = constraints.map((c) => {
    const mediaLabels: Record<string, string> = {
      text: '文本',
      image: '图片',
      mixed: '混合',
      any: '任意',
    };
    const label = mediaLabels[c.mediaType] || c.mediaType;
    if (c.min === c.max) return `${c.min} 个${label}`;
    if (c.max === null) return `≥${c.min} 个${label}`;
    return `${c.min}~${c.max} 个${label}`;
  });

  return parts.join(' + ');
}
