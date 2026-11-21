import { useSyncExternalStore } from 'react';
import { en, type Dict } from './en';
import { ja } from './ja';
import { ko } from './ko';
import { zh } from './zh';

export type Lang = 'en' | 'zh' | 'ja' | 'ko';
export const LANGS: { id: Lang; label: string; html: string }[] = [
  { id: 'en', label: 'English', html: 'en' },
  { id: 'zh', label: '简体中文', html: 'zh-Hans' },
  { id: 'ja', label: '日本語', html: 'ja' },
  { id: 'ko', label: '한국어', html: 'ko' },
];
const DICTS: Record<Lang, Dict> = { en, zh, ja, ko };
const KEY = 'dissentry.lang';
const listeners = new Set<() => void>();

const isLang = (s: string | null | undefined): s is Lang => !!s && s in DICTS;

function fromBrowser(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    const base = l.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

/** ?lang= (e.g. from lihaila.com links) wins and is remembered; then the saved choice; then the browser. */
function initial(): Lang {
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('lang')?.toLowerCase().replace(/^cn$/, 'zh').replace(/^jp$/, 'ja').replace(/^kr$/, 'ko');
    if (isLang(q)) {
      localStorage.setItem(KEY, q);
      url.searchParams.delete('lang');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      return q;
    }
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch { /* SSR / tests */ }
  return typeof navigator !== 'undefined' ? fromBrowser() : 'en';
}

let current: Lang = typeof window !== 'undefined' ? initial() : 'en';
const applyHtml = () => { if (typeof document !== 'undefined') document.documentElement.lang = LANGS.find((l) => l.id === current)!.html; };
applyHtml();

export const getLang = () => current;
export function setLang(l: Lang) {
  current = l;
  localStorage.setItem(KEY, l);
  applyHtml();
  listeners.forEach((fn) => fn());
}
export function useLang(): Lang {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getLang, () => 'en');
}

export type TKey = keyof Dict;
/** Translate; `{name}` placeholders are filled from vars. Usable outside React (errors, engine). */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s: string = DICTS[current][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
/** Hook form: re-renders the component when the language changes. */
export function useT() {
  useLang();
  return t;
}
