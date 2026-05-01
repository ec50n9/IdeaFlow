import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 预设 Action 颜色 → Tailwind 完整类名字符串（含 dark 模式） */
const ACTION_COLOR_MAP: Record<string, string> = {
  purple:  'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-800',
  blue:    'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800',
  amber:   'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-800',
  rose:    'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900 dark:text-rose-300 dark:border-rose-800',
  cyan:    'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900 dark:text-cyan-300 dark:border-cyan-800',
  indigo:  'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:border-indigo-800',
  pink:    'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900 dark:text-pink-300 dark:border-pink-800',
}

/** Action 颜色名 → 对应的 Tailwind CSS 类名字符串 */
export function getActionColorClasses(color?: string): string {
  return ACTION_COLOR_MAP[color || 'purple'] || ACTION_COLOR_MAP.purple
}

/** 颜色圆点展示用的 Tailwind bg 类 */
export const ACTION_DOT_CLASS: Record<string, string> = {
  purple: 'bg-purple-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
  indigo: 'bg-indigo-500',
  pink: 'bg-pink-500',
}

/** 供 UI 展示用的预设颜色列表 */
export const PRESET_ACTION_COLORS = [
  { name: 'purple',  label: '紫' },
  { name: 'blue',    label: '蓝' },
  { name: 'emerald', label: '翠绿' },
  { name: 'amber',   label: '琥珀' },
  { name: 'rose',    label: '玫瑰' },
  { name: 'cyan',    label: '青' },
  { name: 'indigo',  label: '靛蓝' },
  { name: 'pink',    label: '粉' },
]

/** 判断元素是否为输入类元素（用于全局快捷键拦截） */
export function isInputElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || el.isContentEditable;
}
