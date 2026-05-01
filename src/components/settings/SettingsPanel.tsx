import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Bot, Settings, FileJson } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModelConfigTab } from './ModelConfigTab';
import { ActionConfigTab } from './ActionConfigTab';
import { ExportImportTab } from './ExportImportTab';

type SettingsTab = 'models' | 'actions' | 'export-import';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: SettingsTab;
}

const NAV_ITEMS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'actions', label: '动作配置', icon: Settings },
  { id: 'models', label: '模型配置', icon: Bot },
  { id: 'export-import', label: '导出/导入', icon: FileJson },
];

export function SettingsPanel({ open, onOpenChange, defaultTab = 'actions' }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  // ESC 键关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  const renderNavButton = (item: typeof NAV_ITEMS[number], isActive: boolean, variant: 'sidebar' | 'mobile') => (
    <button
      key={item.id}
      onClick={() => setActiveTab(item.id)}
      className={cn(
        'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors shrink-0',
        variant === 'sidebar'
          ? 'px-3 py-2.5 text-left w-full'
          : 'px-3 py-2 whitespace-nowrap',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <item.icon className="w-4 h-4 shrink-0" />
      {item.label}
    </button>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'models':
        return <ModelConfigTab />;
      case 'actions':
        return <ActionConfigTab />;
      case 'export-import':
        return <ExportImportTab />;
      default:
        return null;
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-lg flex flex-col md:flex-row animate-in fade-in duration-200">
      {/* Mobile Header + Tabs */}
      <div className="md:hidden flex-none bg-background/80 backdrop-blur-md border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight">设置</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <nav className="flex gap-1 px-3 pb-2 overflow-x-auto">
          {NAV_ITEMS.map((item) => renderNavButton(item, activeTab === item.id, 'mobile'))}
        </nav>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-none border-r bg-background/80 backdrop-blur-md flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold tracking-tight">设置</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => renderNavButton(item, activeTab === item.id, 'sidebar'))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-10">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
