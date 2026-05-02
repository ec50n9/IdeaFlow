import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '@/store/useStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Image as ImageIcon,
  Loader2,
  Plus,
  X,
  Wand2,
  AlertCircle,
  Send,
} from 'lucide-react';
import { CardNode } from '@/types';
import { sendImageGenRequest } from '@/lib/imageEngine';
import { resolveImageUrl } from '@/lib/fileUtils';

interface ImageGenResult {
  id: string;
  imageUrl: string;
  prompt: string;
}

interface ImageGenPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAtomNodes: CardNode[];
}

export function ImageGenPanel({ open, onOpenChange, selectedAtomNodes }: ImageGenPanelProps) {
  const providers = useStore((state) => state.providers);
  const addNode = useStore((state) => state.addNode);
  const nodes = useStore((state) => state.nodes);

  const [modelRef, setModelRef] = useState('');
  const [prompt, setPrompt] = useState('');
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [results, setResults] = useState<ImageGenResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 解析参考图 + 拼装文本卡片内容到提示词
  useEffect(() => {
    if (!open) return;

    // 1. 解析参考图
    const imagePromises = selectedAtomNodes
      .filter((n) => n.data.atomType === 'image' && n.data.content)
      .map(async (n) => {
        let url = n.data.content!;
        if (url.startsWith('idb://')) {
          url = (await resolveImageUrl(url)) || url;
        }
        return url;
      });

    Promise.all(imagePromises).then((urls) => {
      setReferenceImages(urls.filter(Boolean));
    });

    // 2. 拼装文本卡片内容到提示词输入框
    const textContents = selectedAtomNodes
      .filter((n) => n.data.atomType === 'text' && n.data.content?.trim())
      .map((n) => n.data.content!.trim());

    if (textContents.length > 0) {
      setPrompt(textContents.join('\n\n'));
    }
  }, [open, selectedAtomNodes]);

  // 可用模型（支持图像生成或编辑）
  const availableModels = useMemo(() => {
    const list: { providerName: string; modelRef: string; modelName: string }[] = [];
    for (const provider of providers) {
      for (const model of provider.models) {
        if (model.imageGeneration || model.imageEditing) {
          list.push({
            providerName: provider.name,
            modelRef: `${provider.key}/${model.model}`,
            modelName: model.model,
          });
        }
      }
    }
    return list;
  }, [providers]);

  // 默认选中第一个可用模型
  useEffect(() => {
    if (open && availableModels.length > 0 && !modelRef) {
      setModelRef(availableModels[0].modelRef);
    }
  }, [open, availableModels, modelRef]);

  const handleGenerate = useCallback(async () => {
    if (!modelRef || !prompt.trim() || isGenerating) return;

    setError(null);
    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      const result = await sendImageGenRequest(modelRef, prompt.trim(), referenceImages, abortControllerRef.current.signal);
      // 从 markdown 图片语法中提取 URL
      const match = result.match(/!\[.*?\]\((.+?)\)/);
      const imageUrl = match ? match[1] : result;

      setResults((prev) => [
        { id: uuidv4(), imageUrl, prompt: prompt.trim() },
        ...prev,
      ]);
      setPrompt('');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户取消，不显示错误
      } else {
        const msg = e instanceof Error ? e.message : '生成失败，请重试';
        setError(msg);
      }
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }, [modelRef, prompt, referenceImages, isGenerating]);

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleRemoveReference = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExtractToCanvas = (imageUrl: string) => {
    const atomNodes = selectedAtomNodes.filter((n) => n.data.cardType === 'atom');
    const baseX = atomNodes.length > 0
      ? Math.max(...atomNodes.map((n) => n.position.x + 250))
      : window.innerWidth / 2;
    const baseY = atomNodes.length > 0
      ? atomNodes.reduce((sum, n) => sum + n.position.y, 0) / atomNodes.length
      : window.innerHeight / 2;

    const existingImages = nodes.filter(
      (n) => n.data.cardType === 'atom' && n.data.atomType === 'image' && n.data.sourceType === 'ai'
    );
    const offsetY = existingImages.length * 30;

    addNode({
      id: uuidv4(),
      type: 'cardNode',
      position: { x: baseX + 100, y: baseY + offsetY },
      data: {
        cardType: 'atom',
        atomType: 'image',
        content: imageUrl,
        status: 'idle',
        sourceType: 'ai',
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] gap-0 w-[95vw] overflow-hidden max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 px-6 py-4 border-b flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-500" />
            图像生成
          </DialogTitle>
          <div className="flex items-center gap-2">
            <select
              value={modelRef}
              onChange={(e) => setModelRef(e.target.value)}
              className="text-xs border rounded-lg px-2 py-1 bg-muted/50 outline-none focus:ring-1 focus:ring-primary"
            >
              {availableModels.length === 0 && (
                <option value="">未配置图像模型</option>
              )}
              {availableModels.map(({ providerName, modelRef: ref, modelName }) => (
                <option key={ref} value={ref}>
                  {providerName} / {modelName}
                </option>
              ))}
            </select>
          </div>
        </DialogHeader>

        {/* 参考图 */}
        {referenceImages.length > 0 && (
          <div className="shrink-0 px-6 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <ImageIcon className="w-3.5 h-3.5" />
              参考图（将作为图像编辑的输入）
            </div>
            <div className="flex gap-2 flex-wrap">
              {referenceImages.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`参考图 ${index + 1}`}
                    className="w-16 h-16 rounded-lg object-cover border"
                  />
                  <button
                    onClick={() => handleRemoveReference(index)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 生成历史 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {results.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <ImageIcon className="w-10 h-10 opacity-30" />
              <p className="text-sm">输入提示词生成图片</p>
              <p className="text-xs">
                {referenceImages.length > 0
                  ? '将基于参考图进行图像编辑'
                  : '将基于提示词生成新图片'}
              </p>
            </div>
          )}

          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-sm text-muted-foreground">生成中...</p>
              <Button variant="outline" size="sm" onClick={handleCancel}>
                取消
              </Button>
            </div>
          )}

          {results.map((result) => (
            <div
              key={result.id}
              className="flex flex-col gap-3 p-4 border rounded-xl bg-card"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground truncate max-w-[70%]">
                  &ldquo;{result.prompt}&rdquo;
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => handleExtractToCanvas(result.imageUrl)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  提取到画布
                </Button>
              </div>
              <img
                src={result.imageUrl}
                alt={result.prompt}
                className="rounded-lg max-h-[400px] w-full object-contain bg-muted/30"
              />
            </div>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="shrink-0 px-6 py-2 border-t bg-red-50 dark:bg-red-900/20">
            <div className="text-xs text-red-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div className="shrink-0 border-t bg-background px-4 py-3">
          <div className="flex gap-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                availableModels.length > 0
                  ? referenceImages.length > 0
                    ? '描述如何编辑参考图...'
                    : '描述想要生成的图片...'
                  : '请先配置支持图像生成的模型'
              }
              disabled={availableModels.length === 0 || isGenerating}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-xl bg-muted/50 px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleGenerate}
              disabled={!prompt.trim() || availableModels.length === 0 || isGenerating}
              className={cn(
                'shrink-0 h-auto rounded-xl',
                !isGenerating && 'bg-purple-500 hover:bg-purple-600'
              )}
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
