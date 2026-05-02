import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Send,
  Plus,
  User,
  BotMessageSquare,
  Loader2,
  AlertCircle,
  Bot,
  Image as ImageIcon,
  FileText,
  File,
} from 'lucide-react';
import { CardNode, DialogMessage } from '@/types';
import { sendDialogMessage, extractContentAsAtom } from '@/lib/chatEngine';
import { resolveImageUrl } from '@/lib/fileUtils';
import { ModelCapabilityTags } from '@/components/shared/ModelCapabilityTags';
import Markdown from 'react-markdown';

// ─────────────────────────────────────────────────────────────
// Markdown 图片组件（支持点击提取）
// ─────────────────────────────────────────────────────────────

function ChatImage({ src, alt, onExtract }: { src?: string; alt?: string; onExtract?: (url: string) => void }) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [showOverlay, setShowOverlay] = useState(false);

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
    <div
      className="relative inline-block group"
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
    >
      <img
        src={resolvedSrc}
        alt={alt || ''}
        className="rounded-md max-h-[300px] w-full object-contain cursor-pointer"
        loading="lazy"
        onClick={() => onExtract?.(resolvedSrc)}
      />
      {showOverlay && onExtract && (
        <div className="absolute inset-0 bg-black/40 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExtract(resolvedSrc);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-background text-foreground text-xs rounded-full shadow-lg hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            提取为图片卡片
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 类型图标
// ─────────────────────────────────────────────────────────────

function AtomTypeIcon({ atomType, className }: { atomType?: string; className?: string }) {
  switch (atomType) {
    case 'image': return <ImageIcon className={className} />;
    case 'file': return <File className={className} />;
    default: return <FileText className={className} />;
  }
}

// ─────────────────────────────────────────────────────────────
// 划选浮动工具条
// ─────────────────────────────────────────────────────────────

function SelectionToolbar({
  rect,
  onExtract,
  onClose,
}: {
  rect: DOMRect;
  onExtract: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleClickOutside = () => onClose();
    setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div
      className="fixed z-[100] bg-background border shadow-lg rounded-lg px-2 py-1.5 flex items-center gap-1"
      style={{
        left: rect.left + rect.width / 2,
        top: rect.top - 40,
        transform: 'translateX(-50%)',
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExtract();
        }}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-muted transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        提取为文本卡片
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────

interface DialogChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogCardId: string;
}

export function DialogChat({ open, onOpenChange, dialogCardId }: DialogChatProps) {
  const nodes = useStore((state) => state.nodes);
  const providers = useStore((state) => state.providers);

  const dialogCard = nodes.find((n) => n.id === dialogCardId && n.data.cardType === 'dialog');

  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dialogCard?.data.messages]);

  // 监听文本划选
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length < 2) {
        setSelection(null);
        return;
      }
      // 确保选区在消息列表内
      const range = sel.getRangeAt(0);
      const container = messagesRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelection({ text, rect });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const sourceCards = useMemo(() => {
    const sourceCardIds = dialogCard?.data.sourceCardIds || [];
    const map = new Map<string, CardNode>();
    for (const id of sourceCardIds) {
      const card = nodes.find((n) => n.id === id && n.data.cardType === 'atom');
      if (card) map.set(id, card);
    }
    return map;
  }, [dialogCard?.data.sourceCardIds, nodes]);

  // 发送消息
  const handleSend = useCallback(async () => {
    const modelRef = dialogCard?.data.modelRef;
    if (!inputValue.trim() || !modelRef || !dialogCard) return;

    setSendError(null);
    setIsSending(true);
    try {
      await sendDialogMessage(dialogCardId, inputValue.trim(), modelRef);
      setInputValue('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发送失败，请重试';
      setSendError(msg);
    } finally {
      setIsSending(false);
    }
  }, [inputValue, dialogCard, dialogCardId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  // 提取整消息
  const handleExtractMessage = (content: string) => {
    try {
      extractContentAsAtom(dialogCardId, content, 'text');
    } catch (e) {
      console.error('提取失败:', e);
    }
  };

  // 提取选中文本
  const handleExtractSelection = () => {
    if (!selection) return;
    try {
      extractContentAsAtom(dialogCardId, selection.text, 'text');
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    } catch (e) {
      console.error('提取失败:', e);
    }
  };

  // 提取图片
  const handleExtractImage = (imageUrl: string) => {
    try {
      extractContentAsAtom(dialogCardId, imageUrl, 'image');
    } catch (e) {
      console.error('提取失败:', e);
    }
  };

  if (!dialogCard) return null;

  const messages = dialogCard.data.messages || [];
  const status = dialogCard.data.status || 'idle';
  const sourceCardIds = dialogCard.data.sourceCardIds || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] gap-0 w-[95vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 py-4 border-b flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <BotMessageSquare className="w-5 h-5 text-primary" />
            对话
            {status === 'processing' && (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            {status === 'error' && (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <div className="text-xs border rounded-lg px-2 py-1 bg-muted/50 text-muted-foreground truncate max-w-[200px]">
              {dialogCard.data.modelRef || '未选择模型'}
            </div>
            <ModelCapabilityTags modelRef={dialogCard.data.modelRef} providers={providers} />
          </div>
        </DialogHeader>

        {/* 消息列表 */}
        <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 relative">
          {/* 原子卡片虚拟消息 */}
          {sourceCardIds.map((cardId) => {
            const card = sourceCards.get(cardId);
            if (!card) return null;
            const isImage = card.data.atomType === 'image';
            const isFile = card.data.atomType === 'file';

            return (
              <div key={`atom-${cardId}`} className="flex gap-3 justify-end opacity-70">
                <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100 rounded-br-md border border-blue-100 dark:border-blue-800">
                  <div className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-300 mb-1.5">
                    <AtomTypeIcon atomType={card.data.atomType} className="w-3 h-3" />
                    <span>来自卡片</span>
                  </div>
                  {isImage && card.data.content ? (
                    <ChatImage
                      src={card.data.content}
                      alt="图片"
                      onExtract={handleExtractImage}
                    />
                  ) : isFile ? (
                    <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
                      <File className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs whitespace-pre-wrap">{card.data.content}</span>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap text-sm">{card.data.content}</span>
                  )}
                </div>
                <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                </div>
              </div>
            );
          })}

          {/* 空状态 */}
          {messages.length === 0 && sourceCardIds.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Bot className="w-10 h-10 opacity-30" />
              <p className="text-sm">开始对话</p>
              <p className="text-xs">选择模型后在下方输入框发送消息</p>
            </div>
          )}

          {/* 对话消息 */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isAssistant = msg.role === 'assistant';

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  isUser ? "justify-end" : "justify-start"
                )}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <BotMessageSquare className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  )}
                >
                  {isAssistant && msg.content === '' ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">思考中...</span>
                    </div>
                  ) : (
                    <div className={cn("prose prose-sm max-w-none", isUser && "dark:prose-invert")}>
                      {isAssistant ? (
                        <Markdown>
                          {msg.content}
                        </Markdown>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  )}

                  {/* 提取按钮（仅 assistant 消息） */}
                  {isAssistant && msg.content && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex gap-1.5">
                      <button
                        onClick={() => handleExtractMessage(msg.content)}
                        className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/80 hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="w-3 h-3" />
                        提取为卡片
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />

          {/* 划选浮动工具条 */}
          {selection && (
            <SelectionToolbar
              rect={selection.rect}
              onExtract={handleExtractSelection}
              onClose={() => setSelection(null)}
            />
          )}
        </div>

        {/* 输入区 */}
        <div className="shrink-0 border-t bg-background px-4 py-3">
          {sendError && (
            <div className="mb-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {sendError}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={dialogCard.data.modelRef ? '输入消息...' : '请先选择模型'}
              disabled={!dialogCard.data.modelRef || isSending}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl border bg-muted/50 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!inputValue.trim() || !dialogCard.data.modelRef || isSending}
              className="shrink-0 h-auto rounded-xl"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          {!dialogCard.data.modelRef && (
            <p className="text-[10px] text-muted-foreground mt-1.5">该对话卡片未绑定模型，无法发送消息</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
