import { useSyncExternalStore } from 'react';

export interface Settings {
  userName: string;
  /** Run checkers automatically after every model answer. */
  autoCheck: boolean;
  /** How the local server reaches providers: OS env proxy, no proxy, or a custom proxy URL. */
  proxyMode: 'system' | 'direct' | 'custom';
  proxyUrl: string;
  /** Hosts that skip the custom proxy, e.g. ".aliyuncs.com, api.deepseek.com". */
  proxyBypass: string;
}

const KEY = 'dissentry.settings';
const DEFAULTS: Settings = { userName: 'You', autoCheck: true, proxyMode: 'system', proxyUrl: '', proxyBypass: '' };
const listeners = new Set<() => void>();

let current: Settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; }
})();

export const getSettings = () => current;
export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}
export function useSettings(): Settings {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSettings);
}
