import { useSyncExternalStore } from 'react';
import { getLocale, L, setLocale, type Locale } from '@tapearena/netlist';

/**
 * 中英文切换。文案就地写成 t('中文', 'English')，不维护 key 表。
 * 当前语言只有一份，放在 @tapearena/netlist 的 locale 里，这样编译器报错、链上步骤提示也跟着切。
 */
export type Lang = Locale;

/** 要存进 localStorage 的文案两种语言都存，显示时再按当前语言取。 */
export interface Txt { zh: string; en: string }
/** 老数据里是纯字符串，新数据是双语 */
export type Text = string | Txt;

const KEY = 'chipet.lang';
const subs = new Set<() => void>();

function initial(): Lang {
  const saved = localStorage.getItem(KEY);
  if (saved === 'zh' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function apply(lang: Lang) {
  setLocale(lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = lang === 'zh' ? 'Chipet · 芯宠' : 'Chipet · Chip Pets';
}
apply(initial());

export const getLang = getLocale;

export function setLang(next: Lang) {
  if (next === getLocale()) return;
  localStorage.setItem(KEY, next);
  apply(next);
  subs.forEach((f) => f());
}

/** 非组件代码（数据模块、工具函数）里用；组件里用 useT()，切换语言时才会重渲染。 */
export const tr = L;
export const both = (zh: string, en: string): Txt => ({ zh, en });
export const txt = (x: Text | undefined): string => (typeof x === 'string' ? x : x ? x[getLocale()] : '');
/** 英文里的单复数：plural(1, 'win') → "1 win"，plural(3, 'win') → "3 wins" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => { subs.delete(f); };
};

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLocale);
}

export function useT() {
  useLang();
  return tr;
}
