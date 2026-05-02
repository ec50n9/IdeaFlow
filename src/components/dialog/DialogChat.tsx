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
  ArrowUp,
  ArrowDown,
  Trash2,
  FileText,
  Image as ImageIcon,
  File,
  User,
  Cpu,
  BotMessageSquare,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Plus,
  ChevronDown,
  Bot,
} from 'lucide-react';
import { ContextItem, DialogMessage, CardNode } from '@/types';
import { sendDialogMessage, extractContentAsAtom } from '@/lib/engine';
import { ModelCapabilityTags } from '@/components/shared/ModelCapabilityTags';
import Markdown from 'react-markdown';

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
// 角色配置
// ─────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: 'system' | 'user' | 'assistant'; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'system', label: 'System', icon: Cpu, color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800' },
  { value: 'user', label: 'User', icon: User, color: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800' },
  { value: 'assistant', label: 'Assistant', icon: BotMessageSquare, color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800' },
];

interface DialogChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogCardId: string;
}

export function DialogChat({ open, onOpenChange, dialogCardId }: DialogChatProps) {
  const nodes = useStore((state) => state.nodes);
  const edges = useStore((state) => state.edges);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addNode = useStore((state) => state.addNode);
  const setEdges = useStore((state) => state.setEdges);
  const providers = useStore((state) => state.providers);

  const dialogCard = nodes.find((n) => n.id === dialogCardId && n.data.cardType === 'dialog');

  const [items, setItems] = useState<ContextItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showOrchestrator, setShowOrchestrator] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && dialogCard) {
      setItems(dialogCard.data.items || []);
    }
  }, [open, dialogCard]);

  // 自动滚动到底部
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dialogCard?.data.messages]);

  // 获取源卡片
  const sourceCards = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const card = nodes.find((n) => n.id === item.sourceCardId && n.data.cardType === 'atom');
      if (card) map.set(item.sourceCardId, card);
    }
    return map;
  }, [items, nodes]);

  // 编排操作
  const handleSaveItems = (itemsToSave: ContextItem[]) => {
    updateNodeData(dialogCardId, { items: itemsToSave });
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
    handleSaveItems(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setItems(newItems);
    handleSaveItems(newItems);
  };

  const handleToggleEnabled = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], enabled: newItems[index].enabled !== false ? false : true };
    setItems(newItems);
    handleSaveItems(newItems);
  };

  const handleRoleChange = (index: number, role: 'system' | 'user' | 'assistant') => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], role };
    setItems(newItems);
    handleSaveItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    const itemToRemove = items[index];
    if (!itemToRemove) return;

    // 本地即时更新
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);

    // 删除对应的 edge，由 syncDialogItems 自动同步 dialog 的 items
    const newEdges = edges.filter(
      (e) =>
        !(
          e.source === itemToRemove.sourceCardId &&
          e.target === dialogCardId &&
          e.sourceHandle === 'bottom-source' &&
          e.targetHandle === 'top-target'
        )
    );
    setEdges(newEdges);
  };

  // 发送消息
  const handleSend = useCallback(async () => {
    const modelRef = dialogCard?.data.modelRef;
    if (!inputValue.trim() || !modelRef || !dialogCard) return;

    // 先保存 items（确保上下文最新）
    handleSaveItems(items);

    setSendError(null);
    setIsSending(true);
    try {
      await sendDialogMessage(dialogCardId, inputValue.trim(), modelRef, dialogCard.data.outputType || 'text');
      setInputValue('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发送失败，请重试';
      setSendError(msg);
    } finally {
      setIsSending(false);
    }
  }, [inputValue, dialogCard, dialogCardId, items]);

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

  // 提取为卡片
  const handleExtract = (content: string) => {
    try {
      extractContentAsAtom(dialogCardId, content, 'text');
    } catch (e) {
      console.error('提取失败:', e);
    }
  };

  // 文本划选提取
  const handleTextSelection = (messageId: string) => {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 0) {
      // 划选提取通过悬浮按钮处理，这里不直接处理
    }
  };

  // 添加外部原子卡片到对话
  const handleAddAtom = () => {
    // 简化版：弹出一个选择器让用户选择画布上的 atom 卡片
    // 这里先做一个简单版本：提示用户手动连线
  };

  if (!dialogCard) return null;

  const messages = dialogCard.data.messages || [];
  const status = dialogCard.data.status || 'idle';

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
            {/* 模型展示（已锁定不可更改） */}
            <div className="text-xs border rounded-lg px-2 py-1 bg-muted/50 text-muted-foreground truncate max-w-[200px]">
              {dialogCard.data.modelRef || '未选择模型'}
            </div>
            {/* 模型能力标签 */}
            <ModelCapabilityTags modelRef={dialogCard.data.modelRef} providers={providers} />
          </div>
        </DialogHeader>

        {/* 编排区 */}
        {showOrchestrator && items.length > 0 && (
          <div className="shrink-0 border-b bg-muted/30">
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">上下文编排 ({items.length})</span>
              <button
                onClick={() => setShowOrchestrator(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                收起
              </button>
            </div>
            <div className="px-4 pb-3 space-y-1.5 max-h-[180px] overflow-y-auto">
              {items.map((item, index) => {
                const card = sourceCards.get(item.sourceCardId);
                const roleConfig = ROLE_OPTIONS.find((r) => r.value === item.role) || ROLE_OPTIONS[1];
                const RoleIcon = roleConfig.icon;
                const isEnabled = item.enabled !== false;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border bg-card transition-all",
                      !isEnabled && "opacity-40"
                    )}
                  >
                    {/* 可见性 */}
                    <button
                      onClick={() => handleToggleEnabled(index)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title={isEnabled ? '禁用' : '启用'}
                    >
                      {isEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    {/* 排序 */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => handleMoveUp(index)} disabled={index === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleMoveDown(index)} disabled={index === items.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    {/* 内容摘要 */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <AtomTypeIcon atomType={card?.data.atomType} className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">
                        {card?.data.content?.slice(0, 60) || '[空内容]'}
                      </span>
                    </div>

                    {/* Role */}
                    <div className="flex gap-1">
                      {ROLE_OPTIONS.map((role) => {
                        const Icon = role.icon;
                        return (
                          <button
                            key={role.value}
                            onClick={() => handleRoleChange(index, role.value)}
                            className={cn(
                              'flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border transition-all',
                              item.role === role.value
                                ? role.color
                                : 'border-transparent text-muted-foreground hover:bg-muted'
                            )}
                          >
                            <Icon className="w-2.5 h-2.5" />
                            {role.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 删除 */}
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!showOrchestrator && items.length > 0 && (
          <button
            onClick={() => setShowOrchestrator(true)}
            className="shrink-0 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground border-b bg-muted/30 flex items-center gap-1"
          >
            <ChevronDown className="w-3 h-3" />
            展开上下文编排 ({items.length})
          </button>
        )}

        {/* 消息列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Bot className="w-10 h-10 opacity-30" />
              <p className="text-sm">开始对话</p>
              <p className="text-xs">选择模型后在下方输入框发送消息</p>
            </div>
          )}

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
                        <div onMouseUp={() => handleTextSelection(msg.id)}>
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                  )}

                  {/* 提取按钮（仅 assistant 消息） */}
                  {isAssistant && msg.content && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex gap-1.5">
                      <button
                        onClick={() => handleExtract(msg.content)}
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
