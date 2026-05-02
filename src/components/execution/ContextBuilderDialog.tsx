import { useMemo, useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  FileText,
  Image as ImageIcon,
  File,
  User,
  Cpu,
  BotMessageSquare,
} from 'lucide-react';
import { ContextItem } from '@/types';

interface ContextBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextCardId: string;
}

const ROLE_OPTIONS: { value: 'system' | 'user' | 'assistant'; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'system', label: 'System', icon: Cpu, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'user', label: 'User', icon: User, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  { value: 'assistant', label: 'Assistant', icon: BotMessageSquare, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
];

function AtomTypeIcon({ atomType, className }: { atomType?: string; className?: string }) {
  switch (atomType) {
    case 'image': return <ImageIcon className={className} />;
    case 'file': return <File className={className} />;
    default: return <FileText className={className} />;
  }
}

export function ContextBuilderDialog({ open, onOpenChange, contextCardId }: ContextBuilderDialogProps) {
  const nodes = useStore((state) => state.nodes);
  const updateNodeData = useStore((state) => state.updateNodeData);

  const contextCard = nodes.find((n) => n.id === contextCardId && n.data.cardType === 'context');

  const [items, setItems] = useState<ContextItem[]>([]);

  useEffect(() => {
    if (open && contextCard) {
      setItems(contextCard.data.items || []);
    }
  }, [open, contextCard]);

  const sourceCards = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const card = nodes.find((n) => n.id === item.sourceCardId && n.data.cardType === 'atom');
      if (card) map.set(item.sourceCardId, card);
    }
    return map;
  }, [items, nodes]);

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newItems = [...items];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setItems(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index >= items.length - 1) return;
    const newItems = [...items];
    [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    setItems(newItems);
  };

  const handleRemove = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleRoleChange = (index: number, role: 'system' | 'user' | 'assistant') => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], role };
    setItems(newItems);
  };

  const handleSave = () => {
    updateNodeData(contextCardId, { items });
    onOpenChange(false);
  };

  if (!contextCard) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-0 w-[90vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle>编辑上下文</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
          {items.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p>暂无聚合的卡片</p>
            </div>
          )}

          {items.map((item, index) => {
            const card = sourceCards.get(item.sourceCardId);
            const roleConfig = ROLE_OPTIONS.find((r) => r.value === item.role) || ROLE_OPTIONS[1];
            const RoleIcon = roleConfig.icon;

            return (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 border rounded-xl bg-card transition-all"
              >
                {/* 排序按钮 */}
                <div className="flex flex-col gap-0.5 pt-1">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index === items.length - 1}
                    className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AtomTypeIcon atomType={card?.data.atomType} className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {card?.data.atomType === 'image' ? '图片' : card?.data.atomType === 'file' ? '文件' : '文本'}
                    </span>
                  </div>
                  <div className="text-sm truncate text-foreground">
                    {card?.data.content || '[空内容]'}
                  </div>
                </div>

                {/* Role 选择 */}
                <div className="flex flex-col gap-1">
                  {ROLE_OPTIONS.map((role) => {
                    const Icon = role.icon;
                    return (
                      <button
                        key={role.value}
                        onClick={() => handleRoleChange(index, role.value)}
                        className={cn(
                          'flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all',
                          item.role === role.value
                            ? role.color
                            : 'border-transparent text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {role.label}
                      </button>
                    );
                  })}
                </div>

                {/* 删除 */}
                <button
                  onClick={() => handleRemove(index)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex-none shrink-0 px-6 py-4 border-t bg-background flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
