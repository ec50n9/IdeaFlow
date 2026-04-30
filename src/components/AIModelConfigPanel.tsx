import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Bot, Plus, Trash2, X, Cpu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AIModelConfig } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function AIModelConfigPanel() {
  const { models, addModel, updateModel, deleteModel } = useStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModelConfig | null>(null);

  const handleAddNew = () => {
    const newModel: AIModelConfig = {
      id: uuidv4(),
      name: '自定义模型',
      provider: 'custom',
      type: 'text',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      endpoint: 'https://api.openai.com/v1',
    };
    addModel(newModel);
    setEditingModel(newModel);
  };

  const handleSaveEdit = () => {
    if (editingModel) {
      updateModel(editingModel.id, editingModel);
      setEditingModel(null);
    }
  };

  return (
    <>
      <Button variant="outline" size="icon" className="fixed top-4 right-16 z-50 bg-background/80 backdrop-blur-md shadow-sm" onClick={() => setPanelOpen(true)}>
        <Cpu className="w-5 h-5 text-muted-foreground" />
      </Button>

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-none w-screen h-[100dvh] overflow-y-auto p-0 m-0 rounded-none border-none bg-background/95 backdrop-blur-lg flex flex-col sm:max-w-none [&>button]:hidden gap-0">
          <div className="flex-none p-6 border-b flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10 w-full">
            <h2 className="text-2xl font-semibold tracking-tight pl-2 flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              AI 模型配置
            </h2>
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full bg-background/50 backdrop-blur shadow-sm border" onClick={() => setPanelOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground">管理并配置您的各类 AI 模型，支持文本、图像、视频等多种能力。</p>
              </div>
              <Button onClick={handleAddNew} className="gap-2 shadow-sm shrink-0 whitespace-nowrap">
                <Plus className="w-4 h-4" /> 添加模型
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.map(mod => (
                <div key={mod.id} className="group flex flex-col p-5 border rounded-2xl bg-card text-card-foreground shadow-sm hover:shadow-md transition-all hover:border-primary/30 relative overflow-hidden">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="font-semibold text-lg line-clamp-1">{mod.name}</div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setEditingModel(mod)}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteModel(mod.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-auto">
                    <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-max">
                      提供商: {mod.provider}
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md w-max">
                      类型: {mod.type === 'text' ? '文本对话' : mod.type === 'image' ? '图像生成' : '视频生成'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" title={mod.model}>
                      模型: {mod.model}
                    </div>
                  </div>
                </div>
              ))}
              
              {models.length === 0 && (
                <div className="col-span-full py-16 text-center border-2 border-dashed rounded-xl bg-muted/20 text-muted-foreground flex flex-col items-center justify-center gap-3">
                  <Bot className="w-10 h-10 opacity-20" />
                  <p>您还没有配置任何模型。</p>
                  <Button variant="outline" onClick={handleAddNew}>立即添加</Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingModel} onOpenChange={(open) => !open && setEditingModel(null)}>
        <DialogContent className="sm:max-w-[600px] gap-6 flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-xl font-semibold">编辑模型</h2>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setEditingModel(null)}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          
          {editingModel && (
            <div className="flex flex-col gap-5 overflow-y-auto py-2 pr-2">
              <div className="grid gap-3">
                <Label>配置名称</Label>
                <Input value={editingModel.name} onChange={e => setEditingModel({...editingModel, name: e.target.value})} placeholder="例如：我的GPT-4" />
              </div>

              <div className="grid gap-3">
                <Label>提供商 (Provider)</Label>
                <select 
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={editingModel.provider}
                  onChange={e => setEditingModel({...editingModel, provider: e.target.value as any})}
                >
                  <option value="custom">自定义 / 其他</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div className="grid gap-3">
                <Label>模型能力类型</Label>
                <select 
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={editingModel.type}
                  onChange={e => setEditingModel({...editingModel, type: e.target.value as any})}
                >
                  <option value="text">文本对话 (Text / Chat)</option>
                  <option value="image">图像生成 (Image)</option>
                  <option value="video">视频生成 (Video)</option>
                </select>
              </div>

              <div className="grid gap-3">
                <Label>模型标识符 (Model ID)</Label>
                <Input value={editingModel.model} onChange={e => setEditingModel({...editingModel, model: e.target.value})} placeholder="例如：gpt-4o, claude-3-opus, gemini-1.5-pro" />
              </div>

              <div className="grid gap-3">
                <Label>接口地址 (Endpoint URL)</Label>
                <Input value={editingModel.endpoint || ''} onChange={e => setEditingModel({...editingModel, endpoint: e.target.value})} placeholder="对于自定义服务必填，例如 https://api.openai.com/v1" />
              </div>

              <div className="grid gap-3">
                <Label>API Key</Label>
                <Input type="password" value={editingModel.apiKey} onChange={e => setEditingModel({...editingModel, apiKey: e.target.value})} placeholder="sk-..." />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSaveEdit} className="px-8">保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
