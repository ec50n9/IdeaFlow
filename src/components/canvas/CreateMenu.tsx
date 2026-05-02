import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, MessageSquare } from 'lucide-react';

interface CreateMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAtom: () => void;
  onCreateDialog: () => void;
}

export function CreateMenu({ open, onOpenChange, onCreateAtom, onCreateDialog }: CreateMenuProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[320px] gap-0 w-[90vw] overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle>创建</DialogTitle>
        </DialogHeader>
        <div className="p-4 space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 px-4"
            onClick={() => {
              onCreateAtom();
              onOpenChange(false);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium">文本卡片</div>
              <div className="text-[11px] text-muted-foreground">创建一个可编辑的文本原子卡片</div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 px-4"
            onClick={() => {
              onCreateDialog();
              onOpenChange(false);
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-300" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium">对话卡片</div>
              <div className="text-[11px] text-muted-foreground">创建 AI 对话工作区（需先选择模型）</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
