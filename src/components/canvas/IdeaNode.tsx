import { memo, useState, useRef, useEffect, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { IdeaNodeData, IdeaNode } from '@/types';
import Markdown from 'react-markdown';
import { cn, getActionColorClasses } from '@/lib/utils';
import { Edit3, User, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cancelTask } from '@/lib/engine';
import { resolveImageUrl } from '@/lib/imageUtils';

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

function areEqual(prev: NodeProps<IdeaNode>, next: NodeProps<IdeaNode>) {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.data.content !== next.data.content) return false;
  if (prev.data.sourceType !== next.data.sourceType) return false;
  if (prev.data.isEdited !== next.data.isEdited) return false;
  if (prev.data.status !== next.data.status) return false;

  const prevRA = prev.data.runningActions || [];
  const nextRA = next.data.runningActions || [];
  if (prevRA.length !== nextRA.length) return false;
  for (let i = 0; i < prevRA.length; i++) {
    if (prevRA[i].taskId !== nextRA[i].taskId) return false;
    if (prevRA[i].actionName !== nextRA[i].actionName) return false;
    if (prevRA[i].actionColor !== nextRA[i].actionColor) return false;
    // 忽略 responseLength 变化，避免流式输出时频繁重渲染
  }
  return true;
}

export const IdeaNodeComponent = memo(({ id, data, selected }: NodeProps<IdeaNode>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(data.content);
  const [editSize, setEditSize] = useState<{ width: number; height: number } | null>(null);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const renderedMarkdown = useMemo(() => (
    <Markdown urlTransform={(value) => value} components={{ img: MarkdownImage as any }}>{data.content}</Markdown>
  ), [data.content]);

  useEffect(() => {
    setContent(data.content);
  }, [data.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      // 进入编辑时立即自适应高度，避免高度跳变
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (nodeRef.current) {
      setEditSize({
        width: nodeRef.current.offsetWidth,
        height: nodeRef.current.offsetHeight,
      });
    }
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    setEditSize(null);
    if (content !== data.content) {
      const updates: Partial<IdeaNodeData> = { content };
      if (data.sourceType === 'ai') {
        updates.isEdited = true;
      }
      updateNodeData(id, updates);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setContent(data.content); // Reset on escape
      setIsEditing(false);
      setEditSize(null);
    }
  };

  // Adjust textarea height intelligently
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

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
      <Handle
        type="target"
        position={Position.Top}
        id="top-target"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top-source"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom-target"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-source"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="w-3 h-3 border-2 bg-background border-primary"
      />

      {/* Meta tags */}
      <div className="absolute -top-3 left-3 flex gap-1 z-10 select-none">
        {data.sourceType === 'manual' && (
          <div className="flex items-center gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm border border-blue-200 dark:border-blue-800">
            <User className="w-3 h-3" />
            <span>手动输入</span>
          </div>
        )}

        {data.isEdited && (
          <div className="flex items-center gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm border border-amber-200 dark:border-amber-800" title="该内容已被手动修改">
            <Edit3 className="w-3 h-3 relative -top-px" />
            <span>已编辑</span>
          </div>
        )}
      </div>

      <div className="mt-2">
        {isEditing ? (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent outline-none resize-none overflow-hidden m-0 p-0 text-sm font-sans leading-relaxed"
          placeholder="在这里输入你的想法..."
          rows={Math.max(3, content.split('\n').length)}
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words pointer-events-none text-sm leading-relaxed">
          {data.content ? renderedMarkdown : (
            <span className="text-muted-foreground italic">空节点</span>
          )}
        </div>
      )}
      </div>

      {/* Running actions */}
      {(data.runningActions || []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(data.runningActions || []).map((ra) => (
            <div
              key={ra.taskId}
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm border animate-pulse",
                getActionColorClasses(ra.actionColor)
              )}
            >
              <span>{ra.actionName}</span>
              {ra.responseLength !== undefined && (
                <span className="opacity-70 ml-0.5 border-l pl-1 border-current tabular-nums">
                  {ra.responseLength} 字
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cancelTask(ra.taskId);
                }}
                className="inline-flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5 -mr-0.5 cursor-pointer"
                title="取消任务"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

    </div>
  );
});

IdeaNodeComponent.displayName = 'IdeaNodeComponent';
