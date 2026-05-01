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
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    throw new Error('导出数据序列化失败，可能包含循环引用或不可序列化对象');
  }
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

  const meta = d.exportMeta;
  if (!meta || typeof meta !== 'object') return false;
  const metaObj = meta as Record<string, unknown>;
  if (metaObj.app !== 'IdeaFlow') return false;
  if (typeof metaObj.version !== 'number') return false;
  if (typeof metaObj.exportedAt !== 'string') return false;

  if (d.providers !== undefined && !Array.isArray(d.providers)) return false;
  if (d.actions !== undefined && !Array.isArray(d.actions)) return false;

  return true;
}

export function validateProvider(data: unknown): data is AIProviderConfig {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  if (typeof d.id !== 'string' || d.id.trim() === '') return false;
  if (typeof d.name !== 'string' || d.name.trim() === '') return false;
  if (typeof d.key !== 'string' || d.key.trim() === '') return false;
  if (typeof d.apiKey !== 'string') return false;
  if (!Array.isArray(d.models)) return false;

  return true;
}

export function validateAction(data: unknown): data is ActionConfig {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;

  if (typeof d.id !== 'string' || d.id.trim() === '') return false;
  if (typeof d.name !== 'string' || d.name.trim() === '') return false;
  if (!d.trigger || typeof d.trigger !== 'object') return false;
  if (!d.processor || typeof d.processor !== 'object') return false;
  if (!d.output || typeof d.output !== 'object') return false;

  const output = d.output as Record<string, unknown>;
  const validConnectionTypes = ['source_to_new', 'new_to_source', 'none'];
  if (typeof output.connectionType !== 'string' || !validConnectionTypes.includes(output.connectionType)) {
    return false;
  }

  return true;
}

export function filterValidProviders(items: unknown[]): AIProviderConfig[] {
  return items.filter(validateProvider) as AIProviderConfig[];
}

export function filterValidActions(items: unknown[]): ActionConfig[] {
  return items.filter(validateAction) as ActionConfig[];
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
