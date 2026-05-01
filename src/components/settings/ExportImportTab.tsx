import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Download, Upload, FileJson, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  buildExportPayload,
  downloadJson,
  readJsonFile,
  validateExportPayload,
  mergeProviders,
  mergeActions,
  ExportPayload,
} from '@/lib/configExport';
import { cn } from '@/lib/utils';

export function ExportImportTab() {
  const { providers, actions, setProviders, setActions } = useStore();

  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(
    () => new Set(providers.map((p) => p.id))
  );
  const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(
    () => new Set(actions.map((a) => a.id))
  );

  useEffect(() => {
    setSelectedProviderIds((prev) => {
      const next = new Set(prev);
      providers.forEach((p) => next.add(p.id));
      return next;
    });
  }, [providers]);

  useEffect(() => {
    setSelectedActionIds((prev) => {
      const next = new Set(prev);
      actions.forEach((a) => next.add(a.id));
      return next;
    });
  }, [actions]);

  const allProvidersSelected = providers.length > 0 && providers.every((p) => selectedProviderIds.has(p.id));
  const someProvidersSelected = providers.some((p) => selectedProviderIds.has(p.id)) && !allProvidersSelected;
  const allActionsSelected = actions.length > 0 && actions.every((a) => selectedActionIds.has(a.id));
  const someActionsSelected = actions.some((a) => selectedActionIds.has(a.id)) && !allActionsSelected;

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

  const toggleAllActions = () => {
    if (allActionsSelected) {
      setSelectedActionIds(new Set());
    } else {
      setSelectedActionIds(new Set(actions.map((a) => a.id)));
    }
  };

  const toggleAction = (id: string) => {
    setSelectedActionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const exportedProviders = providers.filter((p) => selectedProviderIds.has(p.id));
    const exportedActions = actions.filter((a) => selectedActionIds.has(a.id));
    if (exportedProviders.length === 0 && exportedActions.length === 0) return;
    const payload = buildExportPayload(exportedProviders, exportedActions);
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`ideaflow-config-${date}.json`, payload);
  };

  const hasExportSelection = selectedProviderIds.size > 0 || selectedActionIds.size > 0;

  const [importPayload, setImportPayload] = useState<ExportPayload | null>(null);
  const [importProviders, setImportProviders] = useState(true);
  const [importActions, setImportActions] = useState(true);
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

    try {
      const data = await readJsonFile<unknown>(file);
      if (!validateExportPayload(data)) {
        setImportError('无效的配置文件格式');
        return;
      }
      if (!data.providers && !data.actions) {
        setImportError('配置文件中未包含任何可导入的数据');
        return;
      }
      setImportPayload(data);
      setImportProviders(!!data.providers);
      setImportActions(!!data.actions);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '文件读取失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImport = () => {
    if (!importPayload) return;
    setImportError(null);
    setImportSuccess(false);

    try {
      if (importProviders && importPayload.providers) {
        const merged = mergeProviders(providers, importPayload.providers, importStrategy);
        setProviders(merged);
      }
      if (importActions && importPayload.actions) {
        const merged = mergeActions(actions, importPayload.actions, importStrategy);
        setActions(merged);
      }
      setImportSuccess(true);
      setImportPayload(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">配置导出与导入</h2>
        <p className="text-muted-foreground text-base mt-1">将您的模型配置和动作配置导出为 JSON 文件，或从文件中恢复配置。</p>
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
                  data-indeterminate={someProvidersSelected || undefined}
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

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="export-actions-all"
                  checked={allActionsSelected}
                  data-indeterminate={someActionsSelected || undefined}
                  onCheckedChange={toggleAllActions}
                />
                <Label htmlFor="export-actions-all" className="cursor-pointer font-medium">
                  动作配置
                  <span className="text-muted-foreground text-xs ml-2">{actions.length} 个动作</span>
                </Label>
              </div>
            </div>
            {actions.length > 0 && (
              <div className="ml-7 flex flex-col gap-2 border-l pl-4">
                {actions.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`export-action-${a.id}`}
                      checked={selectedActionIds.has(a.id)}
                      onCheckedChange={() => toggleAction(a.id)}
                    />
                    <Label htmlFor={`export-action-${a.id}`} className="cursor-pointer text-sm">
                      {a.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
            {actions.length === 0 && (
              <p className="ml-7 text-sm text-muted-foreground">暂无动作配置</p>
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

        {!importPayload && (
          <Button
            variant="outline"
            className="gap-2 w-full sm:w-auto self-start"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileJson className="w-4 h-4" />
            选择配置文件
          </Button>
        )}

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

        {importPayload && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileJson className="w-4 h-4" />
              <span>
                检测到配置文件（导出时间: {new Date(importPayload.exportMeta.exportedAt).toLocaleString('zh-CN')}）
              </span>
            </div>

            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium">选择要导入的内容</p>
              {importPayload.providers && (
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="import-providers"
                    checked={importProviders}
                    onCheckedChange={(v) => setImportProviders(v === true)}
                  />
                  <Label htmlFor="import-providers" className="cursor-pointer">
                    模型配置
                    <span className="text-muted-foreground text-xs ml-2">{importPayload.providers.length} 个供应商</span>
                  </Label>
                </div>
              )}
              {importPayload.actions && (
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="import-actions"
                    checked={importActions}
                    onCheckedChange={(v) => setImportActions(v === true)}
                  />
                  <Label htmlFor="import-actions" className="cursor-pointer">
                    动作配置
                    <span className="text-muted-foreground text-xs ml-2">{importPayload.actions.length} 个动作</span>
                  </Label>
                </div>
              )}
            </div>

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

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setImportPayload(null)}>
                取消
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importProviders && !importActions}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                确认导入
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
