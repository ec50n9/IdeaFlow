/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from '@/components/canvas/Canvas';
import { ActionConfigPanel } from '@/components/ActionConfigPanel';
import { AIModelConfigPanel } from '@/components/AIModelConfigPanel';
import { FloatingToolbar } from '@/components/canvas/FloatingToolbar';

export default function App() {
  return (
    <div className="w-screen h-screen overflow-hidden flex bg-background text-foreground">
      <ReactFlowProvider>
        <Canvas />
        <FloatingToolbar />
      </ReactFlowProvider>
      <ActionConfigPanel />
      <AIModelConfigPanel />
    </div>
  );
}
