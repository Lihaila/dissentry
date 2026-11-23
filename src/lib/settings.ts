import { useSyncExternalStore } from 'react';
import type { ThemeAccent, ThemeBg, ThemeFontSize } from './theme';

export interface Settings {
  userName: string;
  /** Local data URL for the user's custom avatar image (empty = initial letter). */
  userAvatar: string;
  /** Run checkers automatically after every model answer. */
  autoCheck: boolean;
  /** Allow supported models (OpenRouter, Gemini, Claude, OpenAI, xAI, Qwen) to search the live web. */
  webSearch: boolean;
  /** Enable extended reasoning (DeepThink) when asking models. */
  deepThink: boolean;
  /** How the local server reaches providers: OS env proxy, no proxy, or a custom proxy URL. */
  proxyMode: 'system' | 'direct' | 'custom';
  proxyUrl: string;
  /** Hosts that skip the custom proxy, e.g. ".aliyuncs.com, api.deepseek.com". */
  proxyBypass: string;
  /** Background display theme: Default light, Warm paper, X-style Dim, or OLED Lights out. */
  themeBg: ThemeBg;
  /** Accent highlight color used for primary buttons, links, mentions, and active indicators. */
  themeAccent: ThemeAccent;
  /** Font scale step (0 = extra small .. 4 = extra large, 2 = default). */
  themeFontSize: ThemeFontSize;
}

const KEY = 'dissentry.settings';
const DEFAULTS: Settings = {
  userName: '',
  userAvatar: '',
  autoCheck: true,
  webSearch: true,
  deepThink: false,
  proxyMode: 'system',
  proxyUrl: '',
  proxyBypass: '',
  themeBg: 'light',
  themeAccent: 'ink',
  themeFontSize: 2,
};
const listeners = new Set<() => void>();

let current: Settings = (() => {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // Older versions stored the English default; treat it as "not set" so it follows the UI language.
    if (saved.userName === 'You') saved.userName = '';
    // Drop unknown/corrupted display values so the theme and Display panel always see a valid preset.
    // (Inline lists: importing validators from ./theme would create an init-order cycle.)
    if (!['light', 'paper', 'dim', 'dark'].includes(saved.themeBg)) saved.themeBg = DEFAULTS.themeBg;
    if (!['ink', 'blue', 'amber', 'rose', 'violet', 'orange', 'emerald'].includes(saved.themeAccent)) saved.themeAccent = DEFAULTS.themeAccent;
    if (![0, 1, 2, 3, 4].includes(saved.themeFontSize)) saved.themeFontSize = DEFAULTS.themeFontSize;
    return saved;
  } catch { return DEFAULTS; }
})();

export const getSettings = () => current;
export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore storage quota errors */ }
  listeners.forEach((l) => l());
}
export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}

/** The user's display name, or a localized "You" when they haven't set one. */
export function displayName(s: Settings, you: string): string {
  return s.userName.trim() || you;
}
