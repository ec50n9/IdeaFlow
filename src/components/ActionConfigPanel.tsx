import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Settings, Plus, Trash2, Pencil, X, HelpCircle } from 'lucide-react';
import { ActionProcessorForm, getCapabilityLabels } from '@/components/ActionProcessorForm';
import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';
import { ActionConfig } from '@/types';

import { v4 as uuidv4 } from 'uuid';
import { PRESET_ACTION_COLORS, ACTION_DOT_CLASS } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';



export function ActionConfigPanel() {
  const { actions, addAction, updateAction, deleteAction, providers } = useStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<ActionConfig | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Helper to get model details
  const getModelLabel = (modelRef?: string) => {
    if (!modelRef) return "未配置模型";
    const parts = modelRef.split('/');
    if (parts.length !== 2) return "未知模型";
    const [pKey, mName] = parts;
    const p = providers?.find(prov => prov.key === pKey);
    if (!p) return "未知供应商";
    const m = p.models.find(mod => mod.model === mName);
    if (!m) return "未知模型";
    const caps = getCapabilityLabels(m).join(', ');
    return `${p.name} - ${m.model} (${caps})`;
  };

  const handleAddNew = () => {
    // 为新增动作分配一个未使用的颜色，若全部用完则默认 purple
    const usedColors = new Set(actions.map(a => a.color).filter(Boolean));
    const defaultColor = PRESET_ACTION_COLORS.find(c => !usedColors.has(c.name))?.name || 'purple';
    const newAction: ActionConfig = {
      id: uuidv4(),
      name: '新动作',
      color: defaultColor,
      trigger: { minNodes: 1, maxNodes: 1 },
      processor: {
        type: 'llm',
        payload: '提示词模板使用 {{selected_content}}'
      },
      output: { connectionType: 'source_to_new' }
    };
    addAction(newAction);
    setEditingAction(newAction);
  };

  const handleSaveEdit = () => {
    if (editingAction) {
      updateAction(editingAction.id, editingAction);
      setEditingAction(null);
    }
  };

  return (
    <>
      <Button variant="outline" size="icon" className="fixed top-4 right-4 z-50 bg-background/80 backdrop-blur-md shadow-sm" onClick={() => setPanelOpen(true)}>
        <Settings className="w-5 h-5 text-muted-foreground" />
      </Button>

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-none w-screen h-[100dvh] overflow-y-auto p-0 m-0 rounded-none border-none bg-background/95 backdrop-blur-lg flex flex-col sm:max-w-none [&>button]:hidden gap-0">
          <div className="flex-none p-6 border-b flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-md z-10 w-full">
            <h2 className="text-2xl font-semibold tracking-tight pl-2">动作配置中心</h2>
            <div className="flex items-center gap-4">
              <Button onClick={handleAddNew} className="gap-1.5 rounded-full px-5">
                <Plus className="w-4 h-4" /> 添加动作
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setPanelOpen(false)} className="rounded-full shrink-0">
                <X className="w-6 h-6" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 p-6 sm:p-10 max-w-7xl mx-auto w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {actions.map((action) => (
                <div key={action.id} className="border bg-card text-card-foreground rounded-2xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-3 h-3 rounded-full shrink-0", ACTION_DOT_CLASS[action.color || 'purple'])} />
                      <h3 className="font-semibold text-lg">{action.name}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setEditingAction(action)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteAction(action.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    <p>触发条件: {action.trigger.minNodes} 到 {action.trigger.maxNodes === null ? '∞' : action.trigger.maxNodes} 个节点</p>
                    <p>连线输出: {
                      action.output.connectionType === 'source_to_new' ? '源节点 -> 新节点' :
                      action.output.connectionType === 'new_to_source' ? '新节点 -> 源节点' : '无连线'
                    }</p>
                    {action.processor.type === 'llm' && (
                      <p>AI模型: {getModelLabel(action.processor.modelId)}</p>
                    )}
                  </div>
                  
                  <div className="mt-auto pt-4 relative">
                    <div className="text-xs font-mono bg-muted/50 p-3 rounded-lg line-clamp-3 text-muted-foreground border">
                      {action.processor.payload}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {actions.length === 0 && (
              <div className="text-center py-20 text-muted-foreground mt-10 border-2 border-dashed rounded-3xl">
                <Settings className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="text-lg">暂无动作配置</p>
                <p className="text-sm">点击 "添加动作" 以开始使用。</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={!!editingAction} onOpenChange={(open) => !open && setEditingAction(null)}>
        <DialogContent className="sm:max-w-[600px] gap-6 w-[90vw] overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingAction?.id && !actions.find(a => a.id === editingAction.id) ? '新建动作' : '编辑动作'}</DialogTitle>
          </DialogHeader>
          
          {editingAction && (
            <div className="flex flex-col gap-5 py-4 overflow-x-hidden">
              <div className="flex flex-col gap-2">
                <Label>动作名称</Label>
                <Input 
                  value={editingAction.name} 
                  onChange={e => setEditingAction({ ...editingAction, name: e.target.value })}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>标签颜色</Label>
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="flex items-center gap-2.5 w-fit px-3 py-2 rounded-lg border border-input bg-background hover:bg-muted/50 transition-colors text-sm cursor-pointer"
                      >
                        <div className={cn("w-4 h-4 rounded-full", ACTION_DOT_CLASS[editingAction.color || 'purple'])} />
                        <span>
                          {PRESET_ACTION_COLORS.find(c => c.name === editingAction.color)?.label
                            || PRESET_ACTION_COLORS[0].label}
                        </span>
                      </button>
                    }
                  />
                  <PopoverContent className="w-72">
                    <div className="grid grid-cols-4 gap-2">
                      {PRESET_ACTION_COLORS.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setEditingAction({ ...editingAction, color: c.name })}
                          className={cn(
                            "flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all",
                            editingAction.color === c.name
                              ? "border-primary ring-1 ring-primary/20 bg-primary/5"
                              : "border-transparent hover:border-muted hover:bg-muted/50"
                          )}
                        >
                          <div className={cn("w-7 h-7 rounded-full", ACTION_DOT_CLASS[c.name])} />
                          <span className="text-xs">{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>最少选中节点数</Label>
                  <Input 
                    type="number" 
                    min={1}
                    value={editingAction.trigger.minNodes}
                    onChange={e => setEditingAction({ 
                      ...editingAction, 
                      trigger: { ...editingAction.trigger, minNodes: parseInt(e.target.value) || 1 }
                    })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>最多选中节点数</Label>
                  <Input 
                    type="number" 
                    placeholder="无限定"
                    value={editingAction.trigger.maxNodes === null ? '' : editingAction.trigger.maxNodes}
                    onChange={e => {
                      const val = e.target.value;
                      setEditingAction({ 
                        ...editingAction, 
                        trigger: { ...editingAction.trigger, maxNodes: val === '' ? null : parseInt(val) }
                      });
                    }}
                  />
                </div>
              </div>

              <ActionProcessorForm
                processor={editingAction.processor}
                output={editingAction.output}
                onChange={(processor, output) => setEditingAction({ ...editingAction, processor, output })}
                onShowHelp={() => setHelpOpen(true)}
              />

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setEditingAction(null)}>取消</Button>
                <Button onClick={handleSaveEdit}>保存修改</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Code Help Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-[700px] gap-6 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>代码逻辑开发说明</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-6 py-2 text-sm">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-base">入参: nodes</h3>
              <p className="text-muted-foreground">当前选中的节点数组。每个节点是一个完整的 <code>IdeaNode</code> 对象。</p>
              <pre className="bg-muted/50 p-4 rounded-lg overflow-auto border font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">
{`[
  {
    "id": "node-1",
    "type": "ideaNode",
    "position": { "x": 100, "y": 200 },
    "data": {
      "content": "这里是节点的文本内容",
      "status": "idle"
    },
    "selected": true
  }
]`}
              </pre>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-base">入参方法: ai(prompt: string, modelId: string, mode?: string)</h3>
              <p className="text-muted-foreground">调用大模型（处理核心逻辑），传入 prompt、模型 ID（可在模型配置中复制）和可选的调用方式 mode（"chat" | "generateImage" | "editImage"），等待返回。</p>
              <pre className="bg-muted/50 p-4 rounded-lg overflow-auto border font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">
{`// 调用模型必须指定模型 ID，格式为 "<供应商标识>/<模型名称>"
const results = await ai("将以下内容翻译成英文: \\n" + nodes[0].data.content, "openai/gpt-4o");

// 指定图片模型（自动推断或显式指定 mode）
const imgResults = await ai("画一只可爱的猫咪", "openai/gpt-image-2");
const imgResults2 = await ai("画一只可爱的猫咪", "openai/gpt-image-2", "generateImage");

// 图生图（传入 mode 为 "editImage"，系统会自动提取选中节点中的图片）
const editResults = await ai("把这只猫变成水彩风格", "openai/gpt-image-2", "editImage");

// 返回值格式
// [
//   { "content": "English translation here" }
// ]`}
              </pre>
              <div className="mt-2 text-sm text-foreground bg-muted/30 p-3 rounded-lg border">
                <strong>当前配置的模型：</strong>
                {providers && providers.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {providers.map(p => (
                      <li key={p.id}>
                        <span className="font-medium text-primary">{p.name}</span>
                        {p.models && p.models.length > 0 ? (
                          <ul className="ml-4 mt-1 space-y-1 list-disc text-muted-foreground">
                            {p.models.map(m => (
                              <li key={m.id}>
                                <code className="text-primary">{p.key || '?'}/{m.model}</code>
                                <span className="text-muted-foreground"> ({m.protocol}, {getCapabilityLabels(m).join(', ')})</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground text-xs ml-2">无模型配置</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-muted-foreground">暂无自定义配置。</p>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-base">返参 (两种模式)</h3>
              <p className="text-muted-foreground">
                <strong>模式一：简易数组模式</strong><br/>
                返回由 <code>{`{ content: string }`}</code> 组成的对象数组。系统将自动应用布局并根据配置的连线方式将源节点与新节点连接。你也可以额外返回 <code>style</code>, <code>className</code> 或者完整的 <code>position</code> (x, y坐标) 覆盖内置参数。<br/>
                例如：<code>{`return [{ content: "想法1", style: { backgroundColor: "pink" } }];`}</code>
              </p>
              <div className="bg-border h-px w-full my-2"></div>
              <p className="text-muted-foreground">
                <strong>模式二：高定连线 (图配置模式)</strong><br/>
                如果不想使用自动连线和布局，可以透传完全自定义的 <code>nodes</code> 和 <code>edges</code>，结构参考 React Flow。此模式下，原有的"连线方式"将会被忽略。
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-base">图配置模式示例</h3>
              <pre className="bg-muted/50 p-4 rounded-lg overflow-auto border font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">
{`// 调用 ai 获取结果（默认 mode 为 "chat"）
const result = await ai("总结: " + nodes[0].data.content, "openai/gpt-4o");
const newNodeId = "node-" + Math.random();

return {
  nodes: [
    { 
      id: newNodeId, 
      position: { x: nodes[0].position.x + 300, y: nodes[0].position.y }, 
      data: { content: result[0].content } // content 必须包裹在 data 里，也可外平铺
    }
  ],
  edges: [
    { 
      id: "edge-" + Math.random(), 
      source: nodes[0].id, // 从源节点
      target: newNodeId,   // 连到新节点
      animated: true,
      style: { stroke: '#ff0000', strokeWidth: 2 } // 红色线
    }
  ]
};`}
              </pre>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="font-semibold text-base">完整示例</h3>
              <pre className="bg-muted/50 p-4 rounded-lg overflow-auto border font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">
{`// 1. 获取所有选中节点的文本并拼接
const text = nodes.map(n => n.data.content).join("\\n");

// 2. 调用模型处理数据（文生文，mode 默认为 "chat"）
const results = await ai(\`请提炼以下内容的核心观点：\\n\${text}\`, "openai/gpt-4o");

// 3. 将结果输出（新节点的生成由外部连线方式决定）
return results;`}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
