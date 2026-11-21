import { useSyncExternalStore } from 'react';

// Whether this visitor has moved past the landing page. Reactive, so clicking "Open app"
// while already on "/" re-renders immediately.
export const STARTED_KEY = 'dissentry.started';
const listeners = new Set<() => void>();
const read = () => { try { return localStorage.getItem(STARTED_KEY) === '1'; } catch { return false; } };

export function markStarted() {
  localStorage.setItem(STARTED_KEY, '1');
  listeners.forEach((l) => l());
}
export const useStarted = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, read, () => false);
