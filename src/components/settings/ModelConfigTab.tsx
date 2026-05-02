import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Bot, Plus, Trash2, Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AIProviderConfig, AIModelConfig, ModelProtocol } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PROTOCOL_LABELS: Record<ModelProtocol, string> = {
  openai: 'OpenAI (Images API)',
  'openai-responses': 'OpenAI (Responses API)',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  generic: '通用',
};

function getCapabilityLabels(model: AIModelConfig): string[] {
  const labels: string[] = [];
  if (model.supportsText) labels.push('文生文');
  if (model.supportsTextToImage) labels.push('文生图');
  if (model.supportsImageToImage) labels.push('图生图');
  if (model.supportsVision) labels.push('视觉');
  if (model.supportsDocument) labels.push('文档');
  return labels;
}

function getDefaultProtocol(): ModelProtocol {
  return 'openai';
}

function normalizeProvider(provider: AIProviderConfig): AIProviderConfig {
  return {
    ...provider,
    models: provider.models.map((model) => ({
      ...model,
      supportsVision: model.supportsVision ?? false,
      supportsDocument: model.supportsDocument ?? false,
      contextWindow: model.contextWindow ?? 128000,
    })),
  };
}

export function ModelConfigTab() {
  const { providers, addProvider, updateProvider, deleteProvider } = useStore();

  const [editingProvider, setEditingProvider] = useState<AIProviderConfig | null>(null);
  const [isNewProvider, setIsNewProvider] = useState(false);

  const handleAddNew = () => {
    const newProvider: AIProviderConfig = {
      id: uuidv4(),
      name: '自定义供应商',
      key: 'custom',
      endpoint: 'https://api.openai.com/v1',
      apiKey: '',
      models: [
        {
          id: uuidv4(),
          protocol: 'openai',
          model: 'gpt-3.5-turbo',
          supportsText: true,
          supportsTextToImage: false,
          supportsImageToImage: false,
          supportsVision: false,
          supportsDocument: false,
          contextWindow: 128000,
        }
      ]
    };
    setIsNewProvider(true);
    setEditingProvider(newProvider);
  };

  const handleSaveEdit = () => {
    if (editingProvider) {
      const existing = providers?.find(p => p.id === editingProvider.id);
      if (existing) {
        updateProvider(editingProvider.id, editingProvider);
      } else {
        addProvider(editingProvider);
      }
      setEditingProvider(null);
      setIsNewProvider(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            AI 模型配置
          </h2>
          <p className="text-muted-foreground text-base mt-1">管理并配置您的各类 AI 提供商与模型。</p>
        </div>
        <Button onClick={handleAddNew} className="gap-2 shadow-sm shrink-0 whitespace-nowrap">
          <Plus className="w-4 h-4" /> 添加供应商配置
        </Button>
      </div>

      <div className="flex flex-col gap-8 pb-20">
        {providers?.map(provider => (
          <div key={provider.id} className="group flex flex-col border rounded-3xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all hover:border-primary/30 relative overflow-hidden">
            <div className="flex items-center justify-between bg-muted/30 px-6 py-4 border-b gap-4">
               <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="font-semibold text-xl truncate">{provider.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">API接口: {provider.endpoint || '默认'}</div>
               </div>
               <div className="flex gap-2 shrink-0">
                 <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setEditingProvider(normalizeProvider(provider))}>
                   <Settings className="w-4 h-4" /> 配置
                 </Button>
                 <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={() => deleteProvider(provider.id)}>
                   <Trash2 className="w-4 h-4" />
                 </Button>
               </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
              {provider.models.map(mod => (
                <div key={mod.id} className="flex flex-col p-4 border rounded-2xl bg-background shadow-sm">
                   <div className="font-medium text-base mb-1">{mod.model}</div>
                   <div className="flex flex-wrap gap-1 mb-3">
                     {mod.protocol && PROTOCOL_LABELS[mod.protocol] && (
                       <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                         {PROTOCOL_LABELS[mod.protocol]}
                       </span>
                     )}
                     {getCapabilityLabels(mod).map(label => (
                       <span key={label} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">
                         {label}
                       </span>
                     ))}
                   </div>
                   <div className="text-xs font-mono text-muted-foreground truncate" title={mod.model}>
                     标识 ID: {mod.model}
                   </div>
                </div>
              ))}
              {(!provider.models || provider.models.length === 0) && (
                 <div className="col-span-full text-sm text-muted-foreground">暂未配置任何下属模型。</div>
              )}
            </div>
          </div>
        ))}
        
        {(!providers || providers.length === 0) && (
          <div className="py-20 text-center border-2 border-dashed rounded-3xl bg-muted/20 text-muted-foreground flex flex-col items-center justify-center gap-3">
            <Bot className="w-12 h-12 opacity-20 mb-2" />
            <p className="text-lg">您还没有配置任何供应商。</p>
            <Button variant="outline" onClick={handleAddNew} className="mt-2">立即添加配置</Button>
          </div>
        )}
      </div>

      <Dialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)}>
        <DialogContent className="sm:max-w-[700px] gap-6 flex flex-col max-h-[85dvh] overflow-hidden p-0">
          <DialogHeader className="px-6 py-4 border-b m-0 flex-none shrink-0 border-b relative">
            <DialogTitle>{isNewProvider ? '新建供应商配置' : '编辑供应商配置'}</DialogTitle>
          </DialogHeader>
          
          {editingProvider && (
            <div className="flex flex-col gap-8 overflow-y-auto px-6 py-2">
              <div className="flex flex-col gap-6">
                 <div>
                   <h3 className="text-lg font-medium mb-4">供应商基础信息</h3>
                   <div className="grid gap-4">
                     <div className="grid gap-2">
                       <Label>供应商名称</Label>
                       <Input value={editingProvider.name} onChange={e => setEditingProvider({...editingProvider, name: e.target.value})} placeholder="例如：DeepSeek、OpenAI、极兔AI 等" />
                     </div>

                     <div className="grid gap-2">
                       <Label>供应商标识（唯一）</Label>
                       <Input value={editingProvider.key} onChange={e => setEditingProvider({...editingProvider, key: e.target.value})} placeholder="如: openai, deepseek" />
                     </div>
       
                     <div className="grid gap-2">
                       <Label>接口地址 (Endpoint URL)</Label>
                       <Input value={editingProvider.endpoint || ''} onChange={e => setEditingProvider({...editingProvider, endpoint: e.target.value})} placeholder="例如 https://api.openai.com/v1" />
                     </div>
       
                     <div className="grid gap-2">
                       <Label>API Key</Label>
                       <Input type="password" value={editingProvider.apiKey} onChange={e => setEditingProvider({...editingProvider, apiKey: e.target.value})} placeholder="sk-..." />
                     </div>
                   </div>
                 </div>

                 <div className="w-full h-px bg-border"></div>

                 <div>
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="text-lg font-medium">包含的模型列表 ({editingProvider.models.length})</h3>
                     <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                        setEditingProvider({
                           ...editingProvider,
                           models: [
                              ...editingProvider.models,
                              { 
                                id: uuidv4(), 
                                protocol: getDefaultProtocol(),
                                model: '',
                                supportsText: true,
                                supportsTextToImage: false,
                                supportsImageToImage: false,
                                supportsVision: false,
                                supportsDocument: false,
                                contextWindow: 128000,
                              }
                           ]
                        });
                     }}>
                       <Plus className="w-4 h-4" /> 添加模型
                     </Button>
                   </div>
                   
                   <div className="flex flex-col gap-4">
                     {editingProvider.models.map((mod, index) => (
                       <div key={mod.id} className="flex flex-col gap-4 p-4 border rounded-xl bg-muted/10 relative">
                         <div className="flex flex-col sm:flex-row gap-4 items-start">
                           <div className="grid gap-2 flex-1 w-full">
                             <Label className="text-xs text-muted-foreground">模型名称</Label>
                             <Input value={mod.model} onChange={e => {
                                const newModels = [...editingProvider.models];
                                newModels[index].model = e.target.value;
                                setEditingProvider({...editingProvider, models: newModels});
                             }} placeholder="如: gpt-4o, deepseek-chat" />
                           </div>
                           
                           <div className="grid gap-2 w-full sm:w-44 shrink-0">
                             <Label className="text-xs text-muted-foreground">协议</Label>
                             <Select
                               value={mod.protocol}
                               onValueChange={value => {
                                  const newModels = [...editingProvider.models];
                                  newModels[index].protocol = value as ModelProtocol;
                                  if (value === 'openai-responses' && (newModels[index].supportsTextToImage || newModels[index].supportsImageToImage) && !newModels[index].imageModel) {
                                    newModels[index].imageModel = 'gpt-image-2';
                                  }
                                  setEditingProvider({...editingProvider, models: newModels});
                               }}
                             >
                               <SelectTrigger className="w-full">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                 {(Object.entries(PROTOCOL_LABELS) as [ModelProtocol, string][]).map(([key, label]) => (
                                   <SelectItem key={key} value={key}>{label}</SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                           </div>

                           <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive shrink-0 self-end mb-0.5" onClick={() => {
                              const newModels = [...editingProvider.models];
                              newModels.splice(index, 1);
                              setEditingProvider({...editingProvider, models: newModels});
                           }}>
                             <Trash2 className="w-4 h-4" />
                           </Button>
                         </div>

                         <div className="flex flex-wrap gap-5">
                           <label className="flex items-center gap-2 text-sm cursor-pointer">
                             <Checkbox
                               checked={mod.supportsText}
                               onCheckedChange={(checked) => {
                                 const newModels = [...editingProvider.models];
                                 newModels[index].supportsText = checked === true;
                                 setEditingProvider({...editingProvider, models: newModels});
                               }}
                             />
                             <span>文生文</span>
                           </label>
                           <label className="flex items-center gap-2 text-sm cursor-pointer">
                             <Checkbox
                               checked={mod.supportsTextToImage}
                               onCheckedChange={(checked) => {
                                 const newModels = [...editingProvider.models];
                                 newModels[index].supportsTextToImage = checked === true;
                                 if (checked === true && mod.protocol === 'openai-responses' && !newModels[index].imageModel) {
                                   newModels[index].imageModel = 'gpt-image-2';
                                 }
                                 setEditingProvider({...editingProvider, models: newModels});
                               }}
                             />
                             <span>文生图</span>
                           </label>
                           <label className="flex items-center gap-2 text-sm cursor-pointer">
                             <Checkbox
                               checked={mod.supportsImageToImage}
                               onCheckedChange={(checked) => {
                                 const newModels = [...editingProvider.models];
                                 newModels[index].supportsImageToImage = checked === true;
                                 if (checked === true && mod.protocol === 'openai-responses' && !newModels[index].imageModel) {
                                   newModels[index].imageModel = 'gpt-image-2';
                                 }
                                 setEditingProvider({...editingProvider, models: newModels});
                               }}
                             />
                             <span>图生图</span>
                           </label>
                           <label className="flex items-center gap-2 text-sm cursor-pointer">
                             <Checkbox
                               checked={mod.supportsVision}
                               onCheckedChange={(checked) => {
                                 const newModels = [...editingProvider.models];
                                 newModels[index].supportsVision = checked === true;
                                 setEditingProvider({...editingProvider, models: newModels});
                               }}
                             />
                             <span>视觉输入</span>
                           </label>
                           <label className="flex items-center gap-2 text-sm cursor-pointer">
                             <Checkbox
                               checked={mod.supportsDocument}
                               onCheckedChange={(checked) => {
                                 const newModels = [...editingProvider.models];
                                 newModels[index].supportsDocument = checked === true;
                                 setEditingProvider({...editingProvider, models: newModels});
                               }}
                             />
                             <span>文档解析</span>
                           </label>
                         </div>

                         <div className="grid gap-2">
                           <Label className="text-xs text-muted-foreground">上下文窗口大小 (tokens)</Label>
                           <Input
                             type="number"
                             value={mod.contextWindow}
                             onChange={(e) => {
                               const newModels = [...editingProvider.models];
                               newModels[index].contextWindow = parseInt(e.target.value) || 0;
                               setEditingProvider({...editingProvider, models: newModels});
                             }}
                             placeholder="128000"
                           />
                         </div>

                         {mod.protocol === 'openai-responses' && (mod.supportsTextToImage || mod.supportsImageToImage) && (
                           <div className="grid gap-2">
                             <Label className="text-xs text-muted-foreground">Responses 图像模型</Label>
                             <Select
                               value={mod.imageModel || 'gpt-image-2'}
                               onValueChange={value => {
                                 const newModels = [...editingProvider.models];
                                 newModels[index].imageModel = value ?? undefined;
                                 setEditingProvider({...editingProvider, models: newModels});
                               }}
                             >
                               <SelectTrigger className="w-full">
                                 <SelectValue placeholder="请选择图像模型" />
                               </SelectTrigger>
                               <SelectContent>
                                 <SelectItem value="gpt-image-2">gpt-image-2</SelectItem>
                               </SelectContent>
                             </Select>
                           </div>
                         )}
                       </div>
                     ))}
                     {editingProvider.models.length === 0 && (
                        <div className="text-sm text-muted-foreground py-4 text-center border-2 border-dashed rounded-xl">
                           暂无模型。请点击右上角按钮添加。
                        </div>
                     )}
                   </div>
                 </div>
              </div>
            </div>
          )}

          <div className="flex-none p-4 border-t bg-background flex justify-end shrink-0">
            <Button onClick={handleSaveEdit} className="px-8 w-full sm:w-auto">保存配置</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
