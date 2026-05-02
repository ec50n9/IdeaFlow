/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '@/components/canvas/Canvas';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { FloatingToolbar } from '@/components/canvas/FloatingToolbar';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { DialogModelSelect } from '@/components/canvas/DialogModelSelect';
import { useStore } from '@/store/useStore';

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'models' | 'export-import'>('models');

  const pendingDialogCreation = useStore((state) => state.pendingDialogCreation);
  const confirmDialogCreation = useStore((state) => state.confirmDialogCreation);
  const cancelDialogCreation = useStore((state) => state.cancelDialogCreation);
  const nodes = useStore((state) => state.nodes);

  const handleOpenSettings = (tab: 'models' | 'export-import') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const selectedAtomNodes = pendingDialogCreation
    ? nodes.filter((n) => pendingDialogCreation.atomNodeIds.includes(n.id))
    : [];

  return (
    <div className="w-screen h-screen overflow-hidden flex bg-background text-foreground">
      <ReactFlowProvider>
        <Canvas />
        <FloatingToolbar />
      </ReactFlowProvider>
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-50 bg-background/80 backdrop-blur-md shadow-sm"
        onClick={() => handleOpenSettings('models')}
      >
        <Settings className="w-5 h-5 text-muted-foreground" />
      </Button>
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} defaultTab={settingsTab} />

      {/* 全局模型选择对话框（创建对话卡片） */}
      <DialogModelSelect
        open={!!pendingDialogCreation}
        onOpenChange={(open) => {
          if (!open) cancelDialogCreation();
        }}
        selectedAtomNodes={selectedAtomNodes}
        onConfirm={confirmDialogCreation}
      />
    </div>
  );
}
