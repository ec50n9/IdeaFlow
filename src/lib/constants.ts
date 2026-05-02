/**
 * 全局常量定义（唯一可信来源 SSOT）
 */

/** assistant 消息在生成过程中的占位文本 */
export const ASSISTANT_LOADING_PLACEHOLDER = '生成中...';

/** 强制 AI 输出 JSON 数组格式的系统指令 */
export const TEXT_INSTRUCTION = '\n\n请务必只输出严格的 JSON 数组格式，例如 [{"content": "生成的内容1"}, {"content": "生成的内容2"}]。请根据任务要求决定输出的数组元素个数，如果任务没有明确要求拆分节点，则务必将所有内容整合到一个对象的 content 中，即数组中只有一个对象。不要输出任何额外的标记或解释文字。';
