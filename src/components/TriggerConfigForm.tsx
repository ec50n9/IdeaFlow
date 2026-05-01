import { ActionTrigger, TriggerConstraint } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';

interface TriggerConfigFormProps {
  trigger: ActionTrigger;
  onChange: (trigger: ActionTrigger) => void;
  disabled?: boolean;
}

export function TriggerConfigForm({ trigger, onChange, disabled }: TriggerConfigFormProps) {
  const isConstraintMode = !!trigger.constraints;

  const switchToSimple = () => {
    onChange({
      minNodes: trigger.minNodes,
      maxNodes: trigger.maxNodes ?? null,
    });
  };

  const switchToConstraint = () => {
    onChange({
      minNodes: trigger.minNodes,
      maxNodes: trigger.maxNodes,
      constraints: trigger.constraints || [{ id: '输入', mediaType: 'any', min: 1, max: null }],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Label className="flex items-center justify-between">
        <span>激活条件</span>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'px-3 py-1 text-xs rounded-md transition-all disabled:opacity-50',
              !isConstraintMode
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={switchToSimple}
          >
            简化模式
          </button>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'px-3 py-1 text-xs rounded-md transition-all disabled:opacity-50',
              isConstraintMode
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={switchToConstraint}
          >
            约束组模式
          </button>
        </div>
      </Label>

      {/* 简化模式 */}
      {!isConstraintMode && (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">最少选中节点数</Label>
            <Input
              type="number"
              min={1}
              disabled={disabled}
              value={trigger.minNodes}
              onChange={(e) =>
                onChange({
                  ...trigger,
                  minNodes: parseInt(e.target.value) || 1,
                })
              }
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">最多选中节点数</Label>
            <Input
              type="number"
              placeholder="无限定"
              disabled={disabled}
              value={trigger.maxNodes === null ? '' : trigger.maxNodes}
              onChange={(e) => {
                const val = e.target.value;
                onChange({
                  ...trigger,
                  maxNodes: val === '' ? null : parseInt(val),
                });
              }}
            />
          </div>
        </div>
      )}

      {/* 约束组模式 */}
      {isConstraintMode && (
        <div className="flex flex-col gap-3">
          {trigger.constraints!.map((constraint, index) => (
            <div key={index} className="flex flex-col gap-2 p-3 border rounded-xl bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">约束标识</Label>
                    <Input
                      value={constraint.id}
                      disabled={disabled}
                      onChange={(e) => {
                        const newConstraints = [...trigger.constraints!];
                        newConstraints[index] = { ...constraint, id: e.target.value };
                        onChange({ ...trigger, constraints: newConstraints });
                      }}
                      className="h-8 text-sm"
                      placeholder="如：提示词"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">媒体类型</Label>
                    <select
                      value={constraint.mediaType}
                      disabled={disabled}
                      onChange={(e) => {
                        const newConstraints = [...trigger.constraints!];
                        newConstraints[index] = { ...constraint, mediaType: e.target.value as TriggerConstraint['mediaType'] };
                        onChange({ ...trigger, constraints: newConstraints });
                      }}
                      className="h-8 text-sm rounded-md border border-input bg-background px-2"
                    >
                      <option value="text">文本</option>
                      <option value="image">图片</option>
                      <option value="mixed">混合</option>
                      <option value="any">任意</option>
                    </select>
                  </div>
                </div>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive self-end"
                    onClick={() => {
                      const newConstraints = trigger.constraints!.filter((_, i) => i !== index);
                      onChange({ ...trigger, constraints: newConstraints });
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">最少</Label>
                  <Input
                    type="number"
                    min={0}
                    disabled={disabled}
                    value={constraint.min}
                    onChange={(e) => {
                      const newConstraints = [...trigger.constraints!];
                      newConstraints[index] = { ...constraint, min: parseInt(e.target.value) || 0 };
                      onChange({ ...trigger, constraints: newConstraints });
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">最多</Label>
                  <Input
                    type="number"
                    placeholder="∞"
                    disabled={disabled}
                    value={constraint.max === null ? '' : constraint.max}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newConstraints = [...trigger.constraints!];
                      newConstraints[index] = { ...constraint, max: val === '' ? null : parseInt(val) };
                      onChange({ ...trigger, constraints: newConstraints });
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">描述（可选）</Label>
                  <Input
                    value={constraint.description || ''}
                    disabled={disabled}
                    onChange={(e) => {
                      const newConstraints = [...trigger.constraints!];
                      newConstraints[index] = { ...constraint, description: e.target.value || undefined };
                      onChange({ ...trigger, constraints: newConstraints });
                    }}
                    className="h-8 text-sm"
                    placeholder="用途说明"
                  />
                </div>
              </div>
            </div>
          ))}
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit gap-1.5"
              onClick={() => {
                const newConstraint: TriggerConstraint = {
                  id: `输入${(trigger.constraints?.length || 0) + 1}`,
                  mediaType: 'any',
                  min: 1,
                  max: null,
                };
                onChange({
                  ...trigger,
                  constraints: [...(trigger.constraints || []), newConstraint],
                });
              }}
            >
              <Plus className="w-4 h-4" /> 添加约束
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
