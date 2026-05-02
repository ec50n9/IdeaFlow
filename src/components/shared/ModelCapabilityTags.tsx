import { cn } from '@/lib/utils';
import { findModelByRef, MODEL_CAPABILITIES, modelSupportsCapability } from '@/lib/modelUtils';
import { AIProviderConfig } from '@/types';

interface ModelCapabilityTagsProps {
  modelRef?: string;
  providers: AIProviderConfig[];
  size?: 'sm' | 'xs';
}

export function ModelCapabilityTags({ modelRef, providers, size = 'xs' }: ModelCapabilityTagsProps) {
  if (!modelRef) return null;

  const found = findModelByRef(modelRef, providers);
  if (!found) return null;

  const { model } = found;

  const caps = MODEL_CAPABILITIES.map((cap) => ({
    ...cap,
    active: modelSupportsCapability(model, cap.key),
  }));

  return (
    <div className="flex items-center gap-1">
      {caps.map((cap) => (
        <span
          key={cap.key}
          className={cn(
            'rounded-full border',
            size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
            cap.active
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted/30 text-muted-foreground/50 border-transparent'
          )}
        >
          {cap.shortLabel}
        </span>
      ))}
    </div>
  );
}
