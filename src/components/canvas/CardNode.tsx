import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CardNodeData, CardNode } from '@/types';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils';
import {
  Edit3,
  Trash2,
  FileText,
  Image as ImageIcon,
  File,
  MessageSquare,
  Loader2,
  AlertCircle,
  CheckCircle2,
  BotMessageSquare,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { resolveImageUrl } from '@/lib/fileUtils';

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
// 原子类型图标
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
  if (prev.data.isEditing !== next.data.isEditing) return false;
  // dialog 专用比较
  if (prev.data.messages?.length !== next.data.messages?.length) return false;
  if (prev.data.sourceCardIds?.length !== next.data.sourceCardIds?.length) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────

export const CardNodeComponent = memo(({ id, data, selected }: NodeProps<CardNode>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(data.content || '');
  const [editSize, setEditSize] = useState<{ width: number; height: number } | null>(null);

  const updateNodeData = useStore((state) => state.updateNodeData);
  const deleteNode = useStore((state) => state.deleteNode);
  const openDialog = useStore((state) => state.openDialog);
  const nodeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      if (data.atomType === 'text') {
        if (nodeRef.current) {
          setEditSize({
            width: nodeRef.current.offsetWidth,
            height: nodeRef.current.offsetHeight,
          });
        }
        setIsEditing(true);
      }
    } else if (data.cardType === 'dialog') {
      openDialog(id);
    }
  }, [data, id, openDialog]);

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
                <MarkdownImage
                  src={data.content}
                  alt="图片"
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

  // ── 渲染 dialog 卡片 ──

  const renderDialogCard = () => {
    const itemCount = data.sourceCardIds?.length || 0;
    const messageCount = data.messages?.length || 0;
    const lastMessage = data.messages?.[data.messages.length - 1];
    const status = data.status || 'idle';

    const statusConfig = {
      idle: { icon: MessageSquare, color: 'text-slate-500', bg: 'bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700' },
      processing: { icon: Loader2, color: 'text-primary', bg: 'bg-primary/10 border-primary/30' },
      error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800' },
      success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-800' },
    }[status];
    const StatusIcon = statusConfig.icon;

    return (
      <div
        className={cn(
          "w-[220px] border rounded-xl shadow-sm p-3 text-center transition-all cursor-pointer",
          selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : 'border-border',
          statusConfig.bg
        )}
        onDoubleClick={handleDoubleClick}
      >
        <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
          <StatusIcon className={cn("w-4 h-4", statusConfig.color, status === 'processing' && 'animate-spin')} />
          <span className={statusConfig.color}>对话</span>
        </div>

        <div className="mt-1.5 text-[11px] text-muted-foreground space-y-0.5">
          <div>连入 {itemCount} 个卡片 · {Math.floor(messageCount / 2)} 轮对话</div>
          {data.modelRef && (
            <div className="truncate">{data.modelRef}</div>
          )}
        </div>

        {/* 最后一条消息预览 */}
        {lastMessage && (
          <div className="mt-2 text-[10px] text-muted-foreground truncate px-1 py-1 bg-background/50 rounded">
            {lastMessage.role === 'user' ? '🧑' : '🤖'} {lastMessage.content.slice(0, 40)}
            {lastMessage.content.length > 40 ? '...' : ''}
          </div>
        )}

        {/* 连接指示器 */}
        <div className="mt-2 flex justify-center gap-1">
          {data.sourceCardIds?.slice(0, 5).map((cid) => (
            <div key={cid} className="w-2 h-2 rounded-full bg-primary/40" title={cid} />
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
      {data.cardType === 'dialog' && renderDialogCard()}
    </div>
  );
}, areEqual);

CardNodeComponent.displayName = 'CardNodeComponent';
