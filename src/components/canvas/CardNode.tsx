import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CardNodeData, CardNode } from '@/types';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils';
import {
  Edit3,
  User,
  X,
  Trash2,
  Lock,
  FileText,
  Image as ImageIcon,
  File,
  Settings2,
  Zap,
  Play,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cancelTask, reexecute } from '@/lib/engine';
import { resolveImageUrl } from '@/lib/imageUtils';
import { ContextBuilderDialog } from '@/components/execution/ContextBuilderDialog';

// ─────────────────────────────────────────────────────────────
// Markdown 图片组件
// ─────────────────────────────────────────────────────────────

function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    let cancelled = false;
    if (src && src.startsWith('idb://')) {
      resolveImageUrl(src).then((url) => {
        if (!cancelled) setResolvedSrc(url || '');
      });
    } else {
      setResolvedSrc(src);
    }
    return () => { cancelled = true; };
  }, [src]);

  if (!resolvedSrc) {
    return <span className="text-muted-foreground italic text-xs">[图片加载失败]</span>;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt || ''}
      className="rounded-md max-h-[300px] w-full object-contain"
      loading="lazy"
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Atom 类型图标
// ─────────────────────────────────────────────────────────────

function AtomTypeIcon({ atomType, className }: { atomType?: string; className?: string }) {
  switch (atomType) {
    case 'image':
      return <ImageIcon className={className} />;
    case 'file':
      return <File className={className} />;
    default:
      return <FileText className={className} />;
  }
}

// ─────────────────────────────────────────────────────────────
// 相等性判断
// ─────────────────────────────────────────────────────────────

function areEqual(prev: NodeProps<CardNode>, next: NodeProps<CardNode>) {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.data.cardType !== next.data.cardType) return false;
  if (prev.data.content !== next.data.content) return false;
  if (prev.data.status !== next.data.status) return false;
  if (prev.data.isLocked !== next.data.isLocked) return false;
  if (prev.data.isEditing !== next.data.isEditing) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────

export const CardNodeComponent = memo(({ id, data, selected }: NodeProps<CardNode>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(data.content || '');
  const [editSize, setEditSize] = useState<{ width: number; height: number } | null>(null);
  const [contextDialogOpen, setContextDialogOpen] = useState(false);
  const [isReexecuting, setIsReexecuting] = useState(false);

  const updateNodeData = useStore((state) => state.updateNodeData);
  const deleteNode = useStore((state) => state.deleteNode);
  const addNode = useStore((state) => state.addNode);
  const nodes = useStore((state) => state.nodes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const renderedMarkdown = useMemo(() => (
    <Markdown urlTransform={(value) => value} components={{ img: MarkdownImage as any }}>
      {data.content || ''}
    </Markdown>
  ), [data.content]);

  useEffect(() => {
    setEditContent(data.content || '');
  }, [data.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing]);

  // ── 双击/编辑逻辑 ──

  const handleDoubleClick = useCallback(() => {
    if (data.cardType === 'atom') {
      if (data.isLocked) {
        // 自动克隆
        const cloneId = uuidv4();
        const clone: CardNode = {
          id: cloneId,
          type: 'cardNode',
          position: {
            x: (id as any).position?.x ?? 0 + 20,
            y: (id as any).position?.y ?? 0 + 20,
          },
          data: {
            cardType: 'atom',
            atomType: data.atomType,
            content: data.content,
            status: 'idle',
            sourceType: 'manual',
            isLocked: false,
          },
        };
        // 获取当前节点位置
        const currentNode = nodes.find((n) => n.id === id);
        if (currentNode) {
          clone.position = {
            x: currentNode.position.x + 30,
            y: currentNode.position.y + 30,
          };
        }
        addNode(clone);
        // 在新克隆上进入编辑模式
        setTimeout(() => {
          const cloneEl = document.querySelector(`[data-id="${cloneId}"]`);
          if (cloneEl) {
            (cloneEl as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          }
        }, 50);
        return;
      }

      if (data.atomType === 'text') {
        if (nodeRef.current) {
          setEditSize({
            width: nodeRef.current.offsetWidth,
            height: nodeRef.current.offsetHeight,
          });
        }
        setIsEditing(true);
      }
    } else if (data.cardType === 'context') {
      setContextDialogOpen(true);
    }
  }, [data, id, nodes, addNode]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    setEditSize(null);
    if (editContent !== data.content) {
      updateNodeData(id, { content: editContent });
    }
  }, [editContent, data.content, id, updateNodeData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setEditContent(data.content || '');
      setIsEditing(false);
      setEditSize(null);
    }
  }, [data.content]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }, []);

  // ── 重新执行 ──

  const handleReexecute = useCallback(async () => {
    if (data.cardType !== 'execution') return;
    setIsReexecuting(true);
    try {
      await reexecute(id);
    } catch (e) {
      console.error('重新执行失败:', e);
    } finally {
      setIsReexecuting(false);
    }
  }, [data.cardType, id]);

  // ── 渲染 atom 卡片 ──

  const renderAtomCard = () => {
    const isText = data.atomType === 'text';
    const isImage = data.atomType === 'image';
    const isFile = data.atomType === 'file';

    return (
      <div
        ref={nodeRef}
        className={cn(
          "min-w-[250px] min-h-[100px] max-w-[400px] bg-card text-card-foreground p-4 rounded-xl border-2 shadow-sm transition-all duration-200",
          selected ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border'
        )}
        style={isEditing && editSize ? { width: editSize.width, minHeight: editSize.height } : undefined}
        onDoubleClick={handleDoubleClick}
      >
        {/* 原子类型标签 */}
        <div className="absolute -top-3 left-3 flex gap-1 z-10 select-none">
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm border",
            isImage ? 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-800' :
            isFile ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800' :
            'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800'
          )}>
            <AtomTypeIcon atomType={data.atomType} className="w-3 h-3" />
            <span>
              {isImage ? '图片' : isFile ? '文件' : '文本'}
              {data.sourceType === 'manual' && ' · 手动'}
              {data.sourceType === 'ai' && ' · AI'}
            </span>
          </div>

          {data.isLocked && (
            <div
              className="flex items-center gap-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-700"
              title="该卡片已参与执行，修改将自动克隆"
            >
              <Lock className="w-3 h-3" />
              <span>已锁定</span>
            </div>
          )}
        </div>

        {/* 删除按钮 */}
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="absolute -top-3 -right-3 z-10 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm border-2 border-background hover:bg-red-600 active:scale-95 transition-transform"
            title="删除卡片"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}

        {/* 内容区 */}
        <div className="mt-3">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={handleInput}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent outline-none resize-none overflow-hidden m-0 p-0 text-sm font-sans leading-relaxed"
              placeholder="在这里输入内容..."
              rows={Math.max(3, editContent.split('\n').length)}
            />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none break-words pointer-events-none text-sm leading-relaxed">
              {isText && (data.content ? renderedMarkdown : (
                <span className="text-muted-foreground italic">空卡片</span>
              ))}
              {isImage && (data.content ? (
                <img
                  src={data.content.startsWith('idb://') ? undefined : data.content}
                  alt="图片"
                  className="rounded-md max-h-[300px] w-full object-contain"
                />
              ) : (
                <span className="text-muted-foreground italic">[图片]</span>
              ))}
              {isFile && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                  <File className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate">
                    {data.content || '未命名文件'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 处理中指示器 */}
        {data.status === 'processing' && (
          <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-primary animate-pulse border-2 border-background" />
        )}
      </div>
    );
  };

  // ── 渲染 context 卡片 ──

  const renderContextCard = () => {
    const itemCount = data.sourceCardIds?.length || 0;

    return (
      <div
        className={cn(
          "w-[200px] bg-card border rounded-xl shadow-sm p-3 text-center transition-all cursor-pointer",
          selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border'
        )}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
          <Settings2 className="w-4 h-4 text-primary" />
          <span>上下文</span>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          聚合了 {itemCount} 个卡片
        </div>
        <div className="mt-2 flex justify-center gap-1">
          {data.sourceCardIds?.slice(0, 5).map((cid) => (
            <div
              key={cid}
              className="w-2 h-2 rounded-full bg-primary/40"
              title={cid}
            />
          ))}
          {(data.sourceCardIds?.length || 0) > 5 && (
            <span className="text-[10px] text-muted-foreground">+{(data.sourceCardIds?.length || 0) - 5}</span>
          )}
        </div>

        {/* 删除按钮 */}
        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className="absolute -top-3 -right-3 z-10 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-sm border-2 border-background hover:bg-red-600 active:scale-95 transition-transform"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  // ── 渲染 execution 卡片 ──

  const renderExecutionCard = () => {
    const status = data.status || 'idle';
    const statusConfig = {
      idle: { icon: Zap, color: 'text-slate-500', bg: 'bg-slate-100 border-slate-200' },
      processing: { icon: Loader2, color: 'text-primary', bg: 'bg-primary/10 border-primary/30' },
      error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200' },
      success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200' },
    }[status];
    const StatusIcon = statusConfig.icon;

    return (
      <div
        className={cn(
          "w-[180px] border rounded-xl shadow-sm p-2.5 text-center transition-all",
          selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border',
          statusConfig.bg
        )}
      >
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium">
          <StatusIcon className={cn("w-3.5 h-3.5", statusConfig.color, status === 'processing' && 'animate-spin')} />
          <span className={statusConfig.color}>执行</span>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground truncate">
          {data.modelRef || '未选择模型'}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          输出: {data.outputType === 'image' ? '图像' : data.outputType === 'audio' ? '音频' : '文本'}
        </div>

        {/* 选中时的操作按钮 */}
        {selected && (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background/95 backdrop-blur-md border border-border shadow-md rounded-xl p-1 z-50 whitespace-nowrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleReexecute();
              }}
              disabled={isReexecuting}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              {isReexecuting ? '执行中...' : '重新执行'}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(id);
              }}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              删除
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── 主渲染 ──

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} id="top-target" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="source" position={Position.Top} id="top-source" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="target" position={Position.Left} id="left-target" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="source" position={Position.Left} id="left-source" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="target" position={Position.Right} id="right-target" className="w-2.5 h-2.5 border-2 bg-background border-primary" />
      <Handle type="source" position={Position.Right} id="right-source" className="w-2.5 h-2.5 border-2 bg-background border-primary" />

      {data.cardType === 'atom' && renderAtomCard()}
      {data.cardType === 'context' && renderContextCard()}
      {data.cardType === 'execution' && renderExecutionCard()}

      {data.cardType === 'context' && (
        <ContextBuilderDialog
          open={contextDialogOpen}
          onOpenChange={setContextDialogOpen}
          contextCardId={id}
        />
      )}
    </div>
  );
}, areEqual);

CardNodeComponent.displayName = 'CardNodeComponent';
