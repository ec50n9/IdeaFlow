import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ActionConfig, CallMode } from '@/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import Editor from '@monaco-editor/react';

export function getCapabilityLabels(model: { supportsText: boolean; supportsTextToImage: boolean; supportsImageToImage: boolean }): string[] {
  const labels: string[] = [];
  if (model.supportsText) labels.push('文生文');
  if (model.supportsTextToImage) labels.push('文生图');
  if (model.supportsImageToImage) labels.push('图生图');
  return labels;
}

const MODE_OPTIONS: { value: CallMode; label: string }[] = [
  { value: 'chat', label: '文生文' },
  { value: 'generateImage', label: '文生图' },
  { value: 'editImage', label: '图生图' },
];

function getSupportedModes(model: { supportsText: boolean; supportsTextToImage: boolean; supportsImageToImage: boolean }): CallMode[] {
  const modes: CallMode[] = [];
  if (model.supportsText) modes.push('chat');
  if (model.supportsTextToImage) modes.push('generateImage');
  if (model.supportsImageToImage) modes.push('editImage');
  return modes;
}

interface ActionProcessorFormProps {
  processor: ActionConfig['processor'];
  output: ActionConfig['output'];
  onChange: (processor: ActionConfig['processor'], output: ActionConfig['output']) => void;
  onShowHelp?: () => void;
  disabled?: boolean;
}

export function ActionProcessorForm({ processor, output, onChange, onShowHelp, disabled }: ActionProcessorFormProps) {
  const { providers } = useStore();

  const handleModelChange = (modelId: string) => {
    if (disabled) return;
    let newProcessor = { ...processor, modelId: modelId || undefined };
    if (modelId && processor.mode) {
      const parts = modelId.split('/');
      if (parts.length === 2) {
        const [pKey, mName] = parts;
        const p = providers?.find(prov => prov.key === pKey);
        const m = p?.models.find(mod => mod.model === mName);
        if (m) {
          const supported = getSupportedModes(m);
          if (!supported.includes(processor.mode!)) {
            newProcessor = { ...newProcessor, mode: supported[0] };
          }
        }
      }
    }
    onChange(newProcessor, output);
  };

  const updateProcessor = (partial: Partial<ActionConfig['processor']>) => {
    if (disabled) return;
    onChange({ ...processor, ...partial }, output);
  };

  const updateOutput = (partial: Partial<ActionConfig['output']>) => {
    if (disabled) return;
    onChange(processor, { ...output, ...partial });
  };

  return (
    <div className="flex flex-col gap-5 overflow-x-hidden">
      <div className="flex flex-col gap-2 w-full max-w-full">
        <Label>处理器类型</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={processor.type}
          onChange={e => {
            const newType = e.target.value as 'llm' | 'code';
            updateProcessor({
              type: newType,
              payload: newType === 'llm'
                ? '提示词模板使用 {{selected_content}}'
                : '// 可用变量: nodes, ai\n// `nodes` 是选中的 IdeaNode 对象数组\n// `ai` 是一个异步函数: await ai("提示词文本", "模型ID", "调用方式")\n// 调用方式可选: "chat" | "generateImage" | "editImage"\n\n// 示例:\n// const text = nodes.map(n => n.data.content).join("\\n");\n// const results = await ai(`总结这些内容: \\n${text}`, "openai/gpt-4o");\n// return results;\n\nreturn await ai(`分析这些想法: \\n${nodes.map(n => n.data.content).join("\\n")}`);',
            });
          }}
        >
          <option value="llm">大语言模型 (LLM Prompt)</option>
          <option value="code">JavaScript (Web Worker 执行)</option>
        </select>
      </div>

      {processor.type === 'llm' && (
        <div className="flex flex-col gap-4 w-full max-w-full">
          <div className="flex flex-col gap-2">
            <Label>AI 模型</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={processor.modelId || ''}
              onChange={e => handleModelChange(e.target.value)}
            >
              <option value="">未配置模型</option>
              {providers.map(p => (
                <optgroup key={p.id} label={`${p.name} (${p.key})`}>
                  {p.models.map(m => (
                    <option key={m.id} value={`${p.key}/${m.model}`}>
                      {m.model} [{getCapabilityLabels(m).join(', ')}]
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {processor.modelId && (() => {
            const parts = processor.modelId.split('/');
            if (parts.length !== 2) return null;
            const [pKey, mName] = parts;
            const p = providers?.find(prov => prov.key === pKey);
            const m = p?.models.find(mod => mod.model === mName);
            if (!m) return null;
            const supported = getSupportedModes(m);
            if (supported.length <= 1) return null;
            return (
              <div className="flex flex-col gap-2">
                <Label>调用方式</Label>
                <RadioGroup
                  value={processor.mode || supported[0]}
                  onValueChange={(value) => updateProcessor({ mode: value as CallMode })}
                  className="grid grid-cols-3 gap-2"
                >
                  {MODE_OPTIONS.map((opt) => {
                    const isSupported = supported.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-all ${
                          isSupported
                            ? 'border-input bg-background hover:bg-muted/50 has-[[data-checked]]:border-primary has-[[data-checked]]:bg-primary/5 has-[[data-checked]]:ring-1 has-[[data-checked]]:ring-primary/20'
                            : 'border-transparent opacity-50 cursor-not-allowed bg-muted/30'
                        }`}
                      >
                        <RadioGroupItem
                          value={opt.value}
                          disabled={!isSupported}
                          className="shrink-0"
                        />
                        <span className={isSupported ? 'text-foreground' : 'text-muted-foreground'}>
                          {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            );
          })()}
        </div>
      )}

      <div className="flex flex-col gap-2 w-full max-w-full">
        <Label className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between w-full">
          <span className="flex items-center gap-1.5">
            {processor.type === 'llm' ? 'LLM 提示词模板' : '代码逻辑 (JS)'}
            {processor.type === 'code' && onShowHelp && (
              <Button variant="ghost" size="icon" className="w-5 h-5 rounded-full" onClick={onShowHelp}>
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </span>
          <span className="text-muted-foreground text-xs font-normal">
            {processor.type === 'llm' ? '可用变量: {{selected_content}}, {{node_0}}, 等' : '可用变量: nodes, ai'}
          </span>
        </Label>
        <div className="w-full max-w-full overflow-hidden border rounded-md h-[300px]">
          <Editor
            height="100%"
            language={processor.type === 'llm' ? 'markdown' : 'javascript'}
            theme="vs-light"
            value={processor.payload}
            options={{
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              fontSize: 14,
            }}
            onChange={value => updateProcessor({ payload: value || '' })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-full">
        <Label>连线方式</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={output.connectionType}
          onChange={e => updateOutput({ connectionType: e.target.value as any })}
        >
          <option value="source_to_new">源节点 -&gt; 新节点</option>
          <option value="new_to_source">新节点 -&gt; 源节点</option>
          <option value="none">无连线</option>
        </select>
      </div>
    </div>
  );
}
