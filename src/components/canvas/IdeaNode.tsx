import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { IdeaNodeData, IdeaNode } from '@/types';
import Markdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';

export const IdeaNodeComponent = memo(({ id, data, selected }: NodeProps<IdeaNode>) => {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(data.content);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(data.content);
  }, [data.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (content !== data.content) {
      updateNodeData(id, { content });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setContent(data.content); // Reset on escape
      setIsEditing(false);
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
      className={cn(
        "min-w-[250px] min-h-[100px] max-w-[400px] bg-card text-card-foreground p-4 rounded-xl border-2 shadow-sm transition-all duration-200",
        selected ? 'border-primary shadow-md ring-2 ring-primary/20' : 'border-border',
        data.status === 'processing' && 'animate-pulse ring-2 ring-purple-500/50 border-purple-500',
        data.status === 'error' && 'border-destructive'
      )}
      onDoubleClick={handleDoubleClick}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 border-2 bg-background border-primary"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 bg-background border-primary"
      />

      {data.status === 'processing' && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-70">
          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent outline-none resize-none overflow-hidden m-0 p-0 text-sm font-sans"
          placeholder="在这里输入你的想法..."
          rows={Math.max(3, content.split('\n').length)}
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none break-words pointer-events-none text-sm leading-relaxed">
          {data.content ? (
            <Markdown>{data.content}</Markdown>
          ) : (
            <span className="text-muted-foreground italic">空节点</span>
          )}
        </div>
      )}
    </div>
  );
});

IdeaNodeComponent.displayName = 'IdeaNodeComponent';
