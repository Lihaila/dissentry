import { useSyncExternalStore } from 'react';

// Tiny global UI state: whether the "new thread" composer is open.
let newThreadOpen = false;
const listeners = new Set<() => void>();
export function openNewThread() { newThreadOpen = true; listeners.forEach((l) => l()); }
export function closeNewThread() { newThreadOpen = false; listeners.forEach((l) => l()); }
export const useNewThreadOpen = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => newThreadOpen);

/** First line of a post, for thread titles. */
export function threadTitle(text: string, max = 60): string {
  const line = text.replace(/@[a-z0-9][a-z0-9_.-]*/gi, '').replace(/\s+/g, ' ').trim();
  return line.length > max ? line.slice(0, max - 1) + '…' : line || text.slice(0, max);
}
