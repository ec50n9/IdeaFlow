import { AIProviderConfig, ActionConfig } from '@/types';

export interface ExportPayload {
  exportMeta: {
    app: 'IdeaFlow';
    version: 1;
    exportedAt: string;
  };
  providers?: AIProviderConfig[];
  actions?: ActionConfig[];
}

export interface ImportOptions {
  mergeStrategy: 'merge' | 'replace';
  importProviders: boolean;
  importActions: boolean;
}

export function buildExportPayload(
  providers: AIProviderConfig[],
  actions: ActionConfig[]
): ExportPayload {
  const payload: ExportPayload = {
    exportMeta: {
      app: 'IdeaFlow',
      version: 1,
      exportedAt: new Date().toISOString(),
    },
  };
  if (providers.length > 0) payload.providers = providers;
  if (actions.length > 0) payload.actions = actions;
  return payload;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readJsonFile<T>(file: File): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        resolve(parsed);
      } catch {
        reject(new Error('文件解析失败，请确认是有效的 JSON 文件'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export function validateExportPayload(data: unknown): data is ExportPayload {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (!d.exportMeta || typeof (d.exportMeta as Record<string, unknown>).app !== 'string') return false;
  if (d.providers !== undefined && !Array.isArray(d.providers)) return false;
  if (d.actions !== undefined && !Array.isArray(d.actions)) return false;
  return true;
}

export function mergeProviders(
  existing: AIProviderConfig[],
  incoming: AIProviderConfig[],
  strategy: 'merge' | 'replace'
): AIProviderConfig[] {
  if (strategy === 'replace') return [...incoming];
  const map = new Map(existing.map((p) => [p.id, p]));
  for (const p of incoming) {
    map.set(p.id, p);
  }
  return Array.from(map.values());
}

export function mergeActions(
  existing: ActionConfig[],
  incoming: ActionConfig[],
  strategy: 'merge' | 'replace'
): ActionConfig[] {
  if (strategy === 'replace') return [...incoming];
  const map = new Map(existing.map((a) => [a.id, a]));
  for (const a of incoming) {
    map.set(a.id, a);
  }
  return Array.from(map.values());
}
