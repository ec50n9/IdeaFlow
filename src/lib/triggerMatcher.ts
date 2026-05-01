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
// 3. 约束解析（匹配 + 映射，统一内部实现）
// ─────────────────────────────────────────────────────────────

function resolveConstraints(
  nodes: IdeaNode[],
  constraints: TriggerConstraint[]
): { valid: boolean; map: Map<string, IdeaNode[]> } | null {
  const available = [...nodes];
  const map = new Map<string, IdeaNode[]>();

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

    if (matched.length < constraint.min) return null;
    if (constraint.max !== null && matched.length > constraint.max) return null;

    map.set(constraint.id, matched);

    // 非 any 约束消耗非 mixed 节点；mixed 节点始终保留在可用池（可被多约束共享）
    if (constraint.mediaType !== 'any') {
      const mixedOnly = matched.filter((n) => n.data.mediaType === 'mixed');
      available.length = 0;
      available.push(...remaining, ...mixedOnly);
    }
  }

  return { valid: true, map };
}

// ─────────────────────────────────────────────────────────────
// 4. Trigger 匹配校验
// ─────────────────────────────────────────────────────────────

export function matchTrigger(nodes: IdeaNode[], trigger: ActionTrigger): boolean {
  if (trigger.mode === 'simple') {
    if (nodes.length < trigger.minNodes) return false;
    if (trigger.maxNodes !== null && nodes.length > trigger.maxNodes) return false;
    return true;
  }

  // 约束组模式
  const result = resolveConstraints(nodes, trigger.constraints);
  return result !== null;
}

// ─────────────────────────────────────────────────────────────
// 5. 构建约束 → 节点映射（用于执行时占位符替换）
// ─────────────────────────────────────────────────────────────

export function buildConstraintMap(
  nodes: IdeaNode[],
  constraints: TriggerConstraint[]
): Map<string, IdeaNode[]> {
  const result = resolveConstraints(nodes, constraints);
  if (!result) return new Map();
  return result.map;
}

// ─────────────────────────────────────────────────────────────
// 6. 格式化 trigger 为可读描述
// ─────────────────────────────────────────────────────────────

export function formatTriggerDescription(trigger: ActionTrigger): string {
  if (trigger.mode === 'simple') {
    const { minNodes, maxNodes } = trigger;
    if (maxNodes === null) return `≥${minNodes} 个节点`;
    if (minNodes === maxNodes) return `${minNodes} 个节点`;
    return `${minNodes}~${maxNodes} 个节点`;
  }

  const parts = trigger.constraints.map((c) => {
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
