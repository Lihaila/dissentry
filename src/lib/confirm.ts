import { useSyncExternalStore } from 'react';

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
}

interface Pending extends ConfirmRequest { resolve: (ok: boolean) => void }

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** In-app replacement for window.confirm (browsers can silently suppress native dialogs). */
export function confirmAction(req: ConfirmRequest): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => { pending = { ...req, resolve }; emit(); });
}

export function settleConfirm(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

export const usePendingConfirm = () =>
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => pending);
