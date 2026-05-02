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

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'models' | 'export-import'>('models');

  const handleOpenSettings = (tab: 'models' | 'export-import') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

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
    </div>
  );
}
