import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import {
  buildExportPayload,
  downloadJson,
  readJsonFile,
  validateExportPayload,
  filterValidProviders,
  mergeProviders,
  ExportPayload,
} from '@/lib/configExport';
import { Download, Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react';

export function ExportImportTab() {
  const { providers, setProviders } = useStore();

  // ---- Export selection state ----
  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(
    () => new Set(providers.map((p) => p.id))
  );

  useEffect(() => {
    setSelectedProviderIds((prev) => {
      const next = new Set(prev);
      providers.forEach((p) => next.add(p.id));
      return next;
    });
  }, [providers]);

  const allProvidersSelected = providers.length > 0 && providers.every((p) => selectedProviderIds.has(p.id));
  const someProvidersSelected = providers.some((p) => selectedProviderIds.has(p.id)) && !allProvidersSelected;

  const toggleAllProviders = () => {
    if (allProvidersSelected) {
      setSelectedProviderIds(new Set());
    } else {
      setSelectedProviderIds(new Set(providers.map((p) => p.id)));
    }
  };

  const toggleProvider = (id: string) => {
    setSelectedProviderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    try {
      const exportedProviders = providers.filter((p) => selectedProviderIds.has(p.id));
      if (exportedProviders.length === 0) return;
      const payload = buildExportPayload(exportedProviders);
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(`ideaflow-config-${date}.json`, payload);
    } catch (err) {
      alert(err instanceof Error ? err.message : '导出失败');
    }
  };

  const hasExportSelection = selectedProviderIds.size > 0;

  // ---- Import state ----
  const [importPayload, setImportPayload] = useState<ExportPayload | null>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [previewSelectedProviderIds, setPreviewSelectedProviderIds] = useState<Set<string>>(new Set());
  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);
    setImportPayload(null);
    setImportPreviewOpen(false);
    setPreviewSelectedProviderIds(new Set());

    try {
      const data = await readJsonFile<unknown>(file);

      // 兼容旧格式：直接包含 providers 数组但没有 exportMeta
      if (
        typeof data === 'object' &&
        data !== null &&
        !('exportMeta' in data) &&
        Array.isArray((data as Record<string, unknown>).providers)
      ) {
        const oldProviders = (data as Record<string, unknown>).providers as unknown[];
        const validProviders = filterValidProviders(oldProviders);

        if (validProviders.length === 0) {
          setImportError('配置文件中未包含有效的可导入数据');
          return;
        }

        const payload: ExportPayload = {
          exportMeta: { app: 'IdeaFlow', version: 1, exportedAt: new Date().toISOString() },
          providers: validProviders,
        };

        setImportPayload(payload);
        setPreviewSelectedProviderIds(new Set(validProviders.map((p) => p.id)));
        setImportPreviewOpen(true);
        return;
      }

      if (!validateExportPayload(data)) {
        setImportError('无效的配置文件格式');
        return;
      }

      const validProviders = data.providers ? filterValidProviders(data.providers) : [];

      if (validProviders.length === 0) {
        setImportError('配置文件中未包含有效的可导入数据');
        return;
      }

      const payload: ExportPayload = {
        exportMeta: data.exportMeta,
        ...(validProviders.length > 0 ? { providers: validProviders } : {}),
      };

      setImportPayload(payload);
      setPreviewSelectedProviderIds(new Set(validProviders.map((p) => p.id)));
      setImportPreviewOpen(true);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '文件读取失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClosePreview = () => {
    setImportPreviewOpen(false);
    setImportPayload(null);
    setPreviewSelectedProviderIds(new Set());
  };

  const handleImportConfirm = () => {
    if (!importPayload) return;
    setImportError(null);
    setImportSuccess(false);

    try {
      const providersToImport = importPayload.providers?.filter((p) =>
        previewSelectedProviderIds.has(p.id)
      ) ?? [];

      if (providersToImport.length > 0) {
        const merged = mergeProviders(providers, providersToImport, importStrategy);
        setProviders(merged);
      }

      setImportSuccess(true);
      setImportPreviewOpen(false);
      setImportPayload(null);
      setPreviewSelectedProviderIds(new Set());
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
    }
  };

  // ---- Import preview derived state ----
  const previewProviders = importPayload?.providers ?? [];

  const allPreviewProvidersSelected =
    previewProviders.length > 0 && previewProviders.every((p) => previewSelectedProviderIds.has(p.id));
  const somePreviewProvidersSelected =
    previewProviders.some((p) => previewSelectedProviderIds.has(p.id)) && !allPreviewProvidersSelected;

  const hasPreviewSelection = previewSelectedProviderIds.size > 0;

  const toggleAllPreviewProviders = () => {
    if (allPreviewProvidersSelected) {
      setPreviewSelectedProviderIds(new Set());
    } else {
      setPreviewSelectedProviderIds(new Set(previewProviders.map((p) => p.id)));
    }
  };

  const togglePreviewProvider = (id: string) => {
    setPreviewSelectedProviderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">配置导出与导入</h2>
        <p className="text-muted-foreground text-base mt-1">将您的模型配置导出为 JSON 文件，或从文件中恢复配置。</p>
      </div>

      {/* Export Section */}
      <div className="border rounded-2xl p-6 bg-card text-card-foreground shadow-sm flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">导出配置</h3>
            <p className="text-sm text-muted-foreground">选择要导出的配置项，生成 JSON 文件下载到本地。</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Providers */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="export-providers-all"
                  checked={allProvidersSelected}
                  indeterminate={someProvidersSelected}
                  onCheckedChange={toggleAllProviders}
                />
                <Label htmlFor="export-providers-all" className="cursor-pointer font-medium">
                  模型配置（供应商与模型）
                  <span className="text-muted-foreground text-xs ml-2">{providers.length} 个供应商</span>
                </Label>
              </div>
            </div>
            {providers.length > 0 && (
              <div className="ml-7 flex flex-col gap-2 border-l pl-4">
                {providers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`export-provider-${p.id}`}
                      checked={selectedProviderIds.has(p.id)}
                      onCheckedChange={() => toggleProvider(p.id)}
                    />
                    <Label htmlFor={`export-provider-${p.id}`} className="cursor-pointer text-sm">
                      {p.name}
                      <span className="text-muted-foreground text-xs ml-2">{p.models.length} 个模型</span>
                    </Label>
                  </div>
                ))}
              </div>
            )}
            {providers.length === 0 && (
              <p className="ml-7 text-sm text-muted-foreground">暂无供应商配置</p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleExport}
            disabled={!hasExportSelection}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            导出为 JSON
          </Button>
        </div>
      </div>

      {/* Import Section */}
      <div className="border rounded-2xl p-6 bg-card text-card-foreground shadow-sm flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">导入配置</h3>
            <p className="text-sm text-muted-foreground">从之前导出的 JSON 文件中恢复配置。</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileSelect}
        />

        <Button
          variant="outline"
          className="gap-2 w-full sm:w-auto self-start"
          onClick={() => fileInputRef.current?.click()}
        >
          <FileJson className="w-4 h-4" />
          选择配置文件
        </Button>

        {importError && (
          <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {importError}
          </div>
        )}

        {importSuccess && (
          <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 p-3 rounded-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            配置导入成功
          </div>
        )}
      </div>

      {/* Import Preview Dialog */}
      <Dialog open={importPreviewOpen} onOpenChange={(open) => {
        if (!open) handleClosePreview();
      }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="shrink-0 px-6 py-4 border-b">
            <DialogTitle>导入预览</DialogTitle>
            <DialogDescription>
              检测到配置文件（导出时间: {importPayload ? new Date(importPayload.exportMeta.exportedAt).toLocaleString('zh-CN') : ''}）
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-4">
            <div className="flex flex-col gap-6">
              {/* Preview Providers */}
            {previewProviders.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="preview-providers-all"
                    checked={allPreviewProvidersSelected}
                    indeterminate={somePreviewProvidersSelected}
                    onCheckedChange={toggleAllPreviewProviders}
                  />
                  <Label htmlFor="preview-providers-all" className="cursor-pointer font-medium">
                    模型配置
                    <span className="text-muted-foreground text-xs ml-2">{previewProviders.length} 个供应商</span>
                  </Label>
                </div>
                <div className="ml-7 flex flex-col gap-2 border-l pl-4">
                  {previewProviders.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`preview-provider-${p.id}`}
                        checked={previewSelectedProviderIds.has(p.id)}
                        onCheckedChange={() => togglePreviewProvider(p.id)}
                      />
                      <Label htmlFor={`preview-provider-${p.id}`} className="cursor-pointer text-sm">
                        {p.name}
                        <span className="text-muted-foreground text-xs ml-2">{p.models.length} 个模型</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

              {/* Strategy */}
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">导入策略</p>
                <RadioGroup
                  value={importStrategy}
                  onValueChange={(v) => setImportStrategy(v as 'merge' | 'replace')}
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="merge" id="strategy-merge" />
                    <Label htmlFor="strategy-merge" className="cursor-pointer text-sm">
                      合并（同名/同 ID 配置将被覆盖，其余保留）
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="replace" id="strategy-replace" />
                    <Label htmlFor="strategy-replace" className="cursor-pointer text-sm">
                      覆盖（完全替换当前配置）
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>

          <div className="flex-none shrink-0 px-6 py-4 border-t bg-background flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={handleClosePreview}>
              取消
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={!hasPreviewSelection}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              确认导入
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
