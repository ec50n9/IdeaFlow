import { IdeaNode, ActionTrigger, ProcessorInput, ProcessorInputType } from '@/types';
import { extractImageUrls } from './imageUtils';
import { buildConstraintMap } from './triggerMatcher';

// ─────────────────────────────────────────────────────────────
// 1. 分辨率上下文（预构建，避免重复提取图片）
// ─────────────────────────────────────────────────────────────

interface ResolutionContext {
  selectedNodes: IdeaNode[];
  nodeImages: Map<string, string[]>; // node.id -> images
  constraintMap?: Map<string, IdeaNode[]>;
}

async function buildContext(
  selectedNodes: IdeaNode[],
  trigger?: ActionTrigger
): Promise<ResolutionContext> {
  const nodeImages = new Map<string, string[]>();
  for (const node of selectedNodes) {
    nodeImages.set(node.id, await extractImageUrls(node.data.content));
  }

  const constraintMap =
    trigger?.mode === 'constraint' && trigger.constraints.length > 0
      ? buildConstraintMap(selectedNodes, trigger.constraints)
      : undefined;

  return { selectedNodes, nodeImages, constraintMap };
}

// ─────────────────────────────────────────────────────────────
// 2. 单个源表达式解析
// ─────────────────────────────────────────────────────────────

function resolveTextSource(source: string, ctx: ResolutionContext): string {
  // {{selected_content}}
  if (source === '{{selected_content}}') {
    return ctx.selectedNodes.map((n) => n.data.content).join('\n\n---\n\n');
  }

  // {{node_N}}
  const nodeMatch = source.match(/^\{\{node_(\d+)\}\}$/);
  if (nodeMatch) {
    const idx = parseInt(nodeMatch[1], 10);
    return ctx.selectedNodes[idx]?.data.content ?? '';
  }

  // {{constraint.ID}}
  // 正则中 [^\[\].]+ 排除 [ ] . 字符，防止匹配嵌套或属性访问语法
  const constraintMatch = source.match(/^\{\{constraint\.([^\[\].]+)\}\}$/);
  if (constraintMatch && ctx.constraintMap) {
    const id = constraintMatch[1];
    const nodes = ctx.constraintMap.get(id) || [];
    return nodes.map((n) => n.data.content).join('\n\n---\n\n');
  }

    // 不含占位符语法的视为静态文本；否则视为未知占位符，抛出异常
  if (!/\{\{.*?\}\}/.test(source)) {
    return source;
  }
  throw new Error(
    `无法解析文本源表达式: "${source}"。支持的语法包括 {{selected_content}}、{{node_N}}、{{constraint.ID}}`
  );
}

function resolveImagesSource(source: string, ctx: ResolutionContext): string[] {
  // {{selected_nodes.images}}
  if (source === '{{selected_nodes.images}}') {
    const images: string[] = [];
    for (const node of ctx.selectedNodes) {
      images.push(...(ctx.nodeImages.get(node.id) || []));
    }
    return images;
  }

  // {{node_N.images}}
  const nodeImgMatch = source.match(/^\{\{node_(\d+)\.images\}\}$/);
  if (nodeImgMatch) {
    const idx = parseInt(nodeImgMatch[1], 10);
    const node = ctx.selectedNodes[idx];
    return node ? (ctx.nodeImages.get(node.id) || []) : [];
  }

  // {{constraint.ID.images}}
  const constraintImgMatch = source.match(/^\{\{constraint\.([^\[\].]+)\.images\}\}$/);
  if (constraintImgMatch && ctx.constraintMap) {
    const id = constraintImgMatch[1];
    const nodes = ctx.constraintMap.get(id) || [];
    const images: string[] = [];
    for (const node of nodes) {
      images.push(...(ctx.nodeImages.get(node.id) || []));
    }
    return images;
  }

  // 兜底：空数组
  return [];
}

// ─────────────────────────────────────────────────────────────
// 3. 批量解析 ProcessorInput
// ─────────────────────────────────────────────────────────────

export interface ResolvedInputs {
  [id: string]: string | string[];
}

export async function resolveProcessorInputs(
  inputs: ProcessorInput[],
  selectedNodes: IdeaNode[],
  trigger?: ActionTrigger
): Promise<ResolvedInputs> {
  const ctx = await buildContext(selectedNodes, trigger);
  const result: ResolvedInputs = {};

  for (const input of inputs) {
    if (input.type === 'text') {
      result[input.id] = resolveTextSource(input.source, ctx);
    } else if (input.type === 'images') {
      result[input.id] = resolveImagesSource(input.source, ctx);
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 4. 便捷：自动推断 editImage 所需的默认 images source
// ─────────────────────────────────────────────────────────────

const DEFAULT_IMAGES_SOURCE = '{{selected_nodes.images}}';

export function getDefaultImagesSource(trigger?: ActionTrigger): string {
  if (trigger?.mode === 'constraint' && trigger.constraints.length > 0) {
    // 查找第一个 image / mixed / any 约束作为默认图片源
    const imgConstraint = trigger.constraints.find(
      (c) => c.mediaType === 'image' || c.mediaType === 'mixed' || c.mediaType === 'any'
    );
    if (imgConstraint) {
      return `{{constraint.${imgConstraint.id}.images}}`;
    }
  }
  return DEFAULT_IMAGES_SOURCE;
}
