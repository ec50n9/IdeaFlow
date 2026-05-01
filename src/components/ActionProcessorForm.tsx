import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { HelpCircle, Plus, Trash2, Copy, Check } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { ActionConfig, CallMode, ModelSlot, ModelCapability } from '@/types';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import Editor from '@monaco-editor/react';
import { capabilityLabel, getModelsByCapability } from '@/lib/modelSlots';
import { useState } from 'react';

const MODE_OPTIONS: { value: CallMode; label: string }[] = [
  { value: 'chat', label: '文生文' },
  { value: 'generateImage', label: '文生图' },
  { value: 'editImage', label: '图生图' },
];

const CAPABILITY_OPTIONS: { value: ModelCapability; label: string }[] = [
  { value: 'chat', label: '文生文' },
  { value: 'generateImage', label: '文生图' },
  { value: 'editImage', label: '图生图' },
];

function getSlotModes(slot: { capability: ModelCapability }): CallMode[] {
  const modes: CallMode[] = [];
  if (slot.capability === 'chat') modes.push('chat');
  if (slot.capability === 'generateImage') modes.push('generateImage');
  if (slot.capability === 'editImage') modes.push('editImage');
  return modes;
}

/** 空值占位符，用于 Select 组件支持"未选择"状态 */
const NONE_VALUE = '__none__';

function getCapabilityLabel(capability: ModelCapability): string {
  return CAPABILITY_OPTIONS.find((o) => o.value === capability)?.label || capability;
}

function getModelLabel(modelRef?: string): string {
  if (!modelRef || modelRef === NONE_VALUE) return '执行时选择模型';
  const parts = modelRef.split('/');
  if (parts.length !== 2) return modelRef;
  const [pKey, mName] = parts;
  const store = useStore.getState();
  const provider = store.providers.find((p) => p.key === pKey);
  const model = provider?.models.find((m) => m.model === mName);
  if (!provider || !model) return modelRef;
  return `${provider.name} / ${model.model}`;
}

interface CopyButtonProps {
  text: string;
}

function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      title="复制标识"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
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

  useEffect(() => {
    if (!disabled && processor.type === 'llm' && (!processor.slots || processor.slots.length === 0)) {
      const defaultSlot: ModelSlot = { identifier: '默认插槽', capability: 'chat' };
      onChange(
        { ...processor, slots: [defaultSlot], slotRef: defaultSlot.identifier },
        output
      );
    }
  }, [processor.type, disabled]);

  const slots = processor.slots || [];

  const updateProcessor = (partial: Partial<ActionConfig['processor']>) => {
    if (disabled) return;
    onChange({ ...processor, ...partial }, output);
  };

  const updateOutput = (partial: Partial<ActionConfig['output']>) => {
    if (disabled) return;
    onChange(processor, { ...output, ...partial });
  };

  const handleUpdateSlot = (identifier: string, updates: Partial<ModelSlot>) => {
    const newSlots = slots.map((s) => (s.identifier === identifier ? { ...s, ...updates } : s));
    updateProcessor({ slots: newSlots });
  };

  const handleDeleteSlot = (identifier: string) => {
    const newSlots = slots.filter((s) => s.identifier !== identifier);
    updateProcessor({ slots: newSlots });
  };

  const handleTypeChange = (newType: 'llm' | 'code') => {
    if (disabled) return;
    if (newType === 'llm') {
      const existingSlots = processor.slots || [];
      const llmSlot: ModelSlot = existingSlots.length > 0
        ? { identifier: '默认插槽', capability: existingSlots[0].capability, boundModelId: existingSlots[0].boundModelId }
        : { identifier: '默认插槽', capability: 'chat' };
      onChange(
        {
          type: 'llm',
          payload: '提示词模板使用 {{selected_content}}',
          slots: [llmSlot],
          slotRef: llmSlot.identifier,
        },
        output
      );
    } else {
      onChange(
        {
          type: 'code',
          payload:
            '// 可用变量: nodes, ai\n' +
            '// `nodes` 是选中的 IdeaNode 对象数组\n' +
            '// `ai` 是一个异步函数: await ai("提示词文本", "插槽标识", "调用方式")\n' +
            '// 调用方式可选: "chat" | "generateImage" | "editImage"\n' +
            '// 在下方「模型插槽」区域为此 action 配置需要使用的插槽\n\n' +
            'return await ai(`分析这些想法: \\n${nodes.map(n => n.data.content).join("\\n")}`);',
          slots: processor.slots && processor.slots.length > 0
            ? processor.slots.map((s) => ({ ...s, identifier: s.identifier || 'slot' }))
            : [],
          slotRef: undefined,
        },
        output
      );
    }
  };

  const selectedSlot = processor.type === 'llm'
    ? (slots[0] || undefined)
    : (processor.slotRef ? slots.find((s) => s.identifier === processor.slotRef) : undefined);

  return (
    <div className="flex flex-col gap-5 overflow-x-hidden">
      <div className="flex flex-col gap-2 w-full max-w-full">
        <Label>处理器类型</Label>
        <Select
          value={processor.type}
          onValueChange={(value) => handleTypeChange(value as 'llm' | 'code')}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            {processor.type === 'llm' ? '大语言模型 (LLM Prompt)' : 'JavaScript (Web Worker 执行)'}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="llm">大语言模型 (LLM Prompt)</SelectItem>
            <SelectItem value="code">JavaScript (Web Worker 执行)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 模型插槽配置区域 */}
      <div className="flex flex-col gap-3 w-full max-w-full">
        <Label className="flex items-center justify-between">
          <span>模型插槽</span>
          <span className="text-muted-foreground text-xs font-normal">
            {processor.type === 'llm' ? '固定一个插槽，执行提示词时使用' : '代码中通过插槽标识调用模型'}
          </span>
        </Label>

        {/* LLM 模式：固定一个插槽 */}
        {processor.type === 'llm' && (
          <>
            {slots.length > 0 ? (
              <div className="flex flex-col gap-2 p-3 border rounded-xl">
                <span className="text-sm font-medium text-foreground">默认插槽</span>

                <div className="flex items-center gap-2 flex-wrap">
                  <Select
                    value={slots[0].capability}
                    onValueChange={(value) => handleUpdateSlot(slots[0].identifier, { capability: value as ModelCapability })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-[120px]">
                      {getCapabilityLabel(slots[0].capability)}
                    </SelectTrigger>
                    <SelectContent>
                      {CAPABILITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={slots[0].boundModelId || NONE_VALUE}
                    onValueChange={(value) => handleUpdateSlot(slots[0].identifier, { boundModelId: value === NONE_VALUE ? undefined : value })}
                    disabled={disabled}
                  >
                    <SelectTrigger className="flex-1 min-w-[160px]">
                      {getModelLabel(slots[0].boundModelId)}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>执行时选择模型</SelectItem>
                      {getModelsByCapability(slots[0].capability).map(({ provider, model }) => (
                        <SelectItem key={`${provider.key}/${model.model}`} value={`${provider.key}/${model.model}`}>
                          {provider.name} / {model.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-2">
                插槽初始化中...
              </div>
            )}
          </>
        )}

        {/* Code 模式：0-n 个插槽 */}
        {processor.type === 'code' && (
          <>
            {slots.length === 0 && (
              <div className="text-sm text-muted-foreground py-2">
                尚未添加模型插槽。点击下方按钮添加。
              </div>
            )}

            <div className="flex flex-col gap-2">
              {slots.map((slot, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 p-3 border rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-1">插槽标识</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          value={slot.identifier}
                          onChange={(e) => handleUpdateSlot(slot.identifier, { identifier: e.target.value })}
                          disabled={disabled}
                          className="h-8 font-mono text-sm"
                          placeholder="插槽标识"
                        />
                        <CopyButton text={slot.identifier} />
                      </div>
                    </div>
                    {!disabled && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive self-end"
                        onClick={() => handleDeleteSlot(slot.identifier)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={slot.capability}
                      onValueChange={(value) => handleUpdateSlot(slot.identifier, { capability: value as ModelCapability })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-[120px]">
                        {getCapabilityLabel(slot.capability)}
                      </SelectTrigger>
                      <SelectContent>
                        {CAPABILITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={slot.boundModelId || NONE_VALUE}
                      onValueChange={(value) => handleUpdateSlot(slot.identifier, { boundModelId: value === NONE_VALUE ? undefined : value })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="flex-1 min-w-[160px]">
                        {getModelLabel(slot.boundModelId)}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>执行时选择模型</SelectItem>
                        {getModelsByCapability(slot.capability).map(({ provider, model }) => (
                          <SelectItem key={`${provider.key}/${model.model}`} value={`${provider.key}/${model.model}`}>
                            {provider.name} / {model.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded">
                    代码引用: ai("...", "{slot.identifier}")
                  </div>
                </div>
              ))}
            </div>

            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit gap-1.5"
                onClick={() => {
                  const identifiers = new Set(slots.map((s) => s.identifier));
                  let newIdentifier = `slot${slots.length + 1}`;
                  let suffix = 1;
                  while (identifiers.has(newIdentifier)) {
                    newIdentifier = `slot${slots.length + 1}_${suffix}`;
                    suffix++;
                  }
                  const newSlot: ModelSlot = {
                    identifier: newIdentifier,
                    capability: 'chat',
                  };
                  updateProcessor({ slots: [...slots, newSlot] });
                }}
              >
                <Plus className="w-4 h-4" /> 添加插槽
              </Button>
            )}
          </>
        )}
      </div>

      {/* LLM 模式下的调用方式 */}
      {processor.type === 'llm' && selectedSlot && (() => {
        const supported = getSlotModes(selectedSlot);
        if (supported.length <= 1) return null;
        return (
          <div className="flex flex-col gap-2 w-full max-w-full">
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
                      disabled={!isSupported || disabled}
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
              readOnly: disabled,
            }}
            onChange={(value) => updateProcessor({ payload: value || '' })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-full">
        <Label>连线方式</Label>
        <Select
          value={output.connectionType}
          onValueChange={(value) => updateOutput({ connectionType: value as any })}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            {output.connectionType === 'source_to_new' && '源节点 -> 新节点'}
            {output.connectionType === 'new_to_source' && '新节点 -> 源节点'}
            {output.connectionType === 'none' && '无连线'}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="source_to_new">源节点 -&gt; 新节点</SelectItem>
            <SelectItem value="new_to_source">新节点 -&gt; 源节点</SelectItem>
            <SelectItem value="none">无连线</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
