import { useSyncExternalStore } from 'react';

// Tiny global UI state: "new thread" composer modal, and mobile "recent threads" drawer.
let newThreadOpen = false;
let threadsDrawerOpen = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
export function openNewThread() { newThreadOpen = true; threadsDrawerOpen = false; notify(); }
export function closeNewThread() { newThreadOpen = false; notify(); }
export const useNewThreadOpen = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => newThreadOpen);

export function openThreadsDrawer() { threadsDrawerOpen = true; notify(); }
export function closeThreadsDrawer() { threadsDrawerOpen = false; notify(); }
export const useThreadsDrawerOpen = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => threadsDrawerOpen);

/** First line of a post, for thread titles. */
export function threadTitle(text: string, max = 60, fallback?: string): string {
  const line = text.replace(/@[a-z0-9][a-z0-9_.-]*/gi, '').replace(/\s+/g, ' ').trim();
  const base = line || fallback || text;
  return base.length > max ? base.slice(0, max - 1) + '…' : base;
}
