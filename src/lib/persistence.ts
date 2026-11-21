import { useSyncExternalStore } from 'react';
import { db } from './db';
import { getDiskStoragePath, hasDiskStorage } from './providers';
import { subscribeSettings } from './settings';
import { markStarted } from './started';
import { exportAll, importAll, onClearAll } from './store';

interface FileSystemWritableFileStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandleLike {
  name: string;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

type SaveFilePicker = (opts?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandleLike>;

export interface PersistenceState {
  /** Local server (~/.dissentry/data.json) persistence status. */
  diskEnabled: boolean;
  diskPath: string | null;
  diskStatus: 'idle' | 'saving' | 'saved' | 'error';
  diskSavedAt: number | null;
  diskRestored: boolean;
  diskError: string;
  /** Browser Persistent Storage API status (navigator.storage.persisted()). */
  browserPersisted: boolean | null;
  /** Hosted-mode linked local backup file via File System Access API (Chrome/Edge/Arc/Brave). */
  backupFileName: string | null;
  backupFileSavedAt: number | null;
  backupFileNeedsPerm: boolean;
}

const BACKUP_HANDLE_KEY = 'backupFileHandle';

let state: PersistenceState = {
  diskEnabled: false,
  diskPath: null,
  diskStatus: 'idle',
  diskSavedAt: null,
  diskRestored: false,
  diskError: '',
  browserPersisted: null,
  backupFileName: null,
  backupFileSavedAt: null,
  backupFileNeedsPerm: false,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setState = (patch: Partial<PersistenceState>) => { state = { ...state, ...patch }; emit(); };

export const getPersistenceState = () => state;
export function usePersistence(): PersistenceState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getPersistenceState);
}

export function canPickBackupFile(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker === 'function';
}

let backupHandle: FileSystemFileHandleLike | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let dirtyAgain = false;
let suppressSchedule = false;
let initialized = false;

/** Request browser Persistent Storage so the browser avoids evicting IndexedDB under storage pressure. */
export async function requestBrowserPersistence(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage) return null;
  try {
    let ok = (await navigator.storage.persisted?.()) ?? false;
    if (!ok && navigator.storage.persist) ok = await navigator.storage.persist();
    setState({ browserPersisted: ok });
    return ok;
  } catch {
    return null;
  }
}

async function writeToBackupFile(json: string, requestPermission = false): Promise<boolean> {
  if (!backupHandle) return false;
  try {
    let perm = (await backupHandle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (perm !== 'granted' && requestPermission) {
      perm = (await backupHandle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    }
    if (perm !== 'granted') {
      setState({ backupFileNeedsPerm: true });
      return false;
    }
    const stream = await backupHandle.createWritable();
    await stream.write(json);
    await stream.close();
    setState({ backupFileSavedAt: Date.now(), backupFileNeedsPerm: false });
    return true;
  } catch {
    setState({ backupFileNeedsPerm: true });
    return false;
  }
}

/** Sync current IndexedDB + settings snapshot to local disk (~/.dissentry/data.json) and/or linked backup file. */
export async function syncPersistenceNow(opts: { includeKeysInFile?: boolean; requestFilePermission?: boolean } = {}): Promise<void> {
  const wantDisk = hasDiskStorage();
  const wantFile = Boolean(backupHandle);
  if (!wantDisk && !wantFile) return;

  if (syncing) {
    dirtyAgain = true;
    return;
  }
  syncing = true;
  try {
    const dump = await exportAll(opts.includeKeysInFile ?? true);
    const json = JSON.stringify(dump, null, 2);

    if (wantDisk) {
      setState({ diskStatus: 'saving', diskError: '' });
      const res = await fetch('/api/storage', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: json,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState({ diskStatus: 'saved', diskSavedAt: Date.now(), diskError: '' });
    }

    if (wantFile) {
      await writeToBackupFile(json, Boolean(opts.requestFilePermission));
    }
  } catch (e) {
    if (wantDisk) setState({ diskStatus: 'error', diskError: (e as Error).message });
  } finally {
    syncing = false;
    if (dirtyAgain) {
      dirtyAgain = false;
      scheduleSync(600);
    }
  }
}

function scheduleSync(delayMs = 1200) {
  if (suppressSchedule) return;
  if (!hasDiskStorage() && !backupHandle) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncPersistenceNow();
  }, delayMs);
}

/** Pick a local JSON file (File System Access API) to automatically receive backups whenever data changes. */
export async function linkBackupFile(): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (!picker) return false;
  try {
    const handle = await picker({
      suggestedName: 'dissentry-backup.json',
      types: [{ description: 'Dissentry JSON Backup', accept: { 'application/json': ['.json'] } }],
    });
    backupHandle = handle;
    await db.kv.put({ key: BACKUP_HANDLE_KEY, value: handle }).catch(() => {});
    setState({ backupFileName: handle.name, backupFileNeedsPerm: false });
    await syncPersistenceNow({ requestFilePermission: true });
    return true;
  } catch {
    return false; // user cancelled
  }
}

export async function unlinkBackupFile(): Promise<void> {
  backupHandle = null;
  await db.kv.delete(BACKUP_HANDLE_KEY).catch(() => {});
  setState({ backupFileName: null, backupFileSavedAt: null, backupFileNeedsPerm: false });
}

/**
 * Initialize persistence right after detectProxy() and before mounting React:
 * 1. If running locally (`npx dissentry`) and browser IndexedDB is empty, auto-restore from ~/.dissentry/data.json.
 * 2. Request browser Persistent Storage (`navigator.storage.persist()`).
 * 3. Load any previously linked backup file handle (hosted mode).
 * 4. Subscribe to Dexie + settings mutations for automatic debounced saves.
 */
export async function initPersistence(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const diskEnabled = hasDiskStorage();
  const diskPath = getDiskStoragePath();
  setState({ diskEnabled, diskPath });

  // 1. Auto-restore from local disk if browser storage was cleared, or seed disk on first upgrade.
  if (diskEnabled) {
    try {
      const [pCount, postCount] = await Promise.all([db.profiles.count(), db.posts.count()]);
      const res = await fetch('/api/storage', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const diskHasData = data?.app === 'dissentry' && ((data.profiles?.length ?? 0) > 0 || (data.posts?.length ?? 0) > 0);
        if (pCount === 0 && postCount === 0 && diskHasData) {
          suppressSchedule = true;
          try {
            await importAll(data);
            markStarted();
            setState({ diskRestored: true, diskStatus: 'saved', diskSavedAt: Date.now() });
          } finally {
            suppressSchedule = false;
          }
        } else if ((pCount > 0 || postCount > 0) && !diskHasData) {
          // Existing browser data with no disk snapshot yet: seed ~/.dissentry/data.json right away.
          void syncPersistenceNow();
        } else if (diskHasData) {
          setState({ diskStatus: 'saved' });
        }
      }
    } catch { /* non-fatal; browser IndexedDB remains usable */ }
  }

  // 2. Request persistent browser storage (non-blocking).
  void requestBrowserPersistence();

  // 3. Reload previously linked local backup file handle (hosted mode).
  if (!diskEnabled && canPickBackupFile()) {
    try {
      const rec = await db.kv.get(BACKUP_HANDLE_KEY);
      const handle = rec?.value as FileSystemFileHandleLike | undefined;
      if (handle?.name) {
        backupHandle = handle;
        const perm = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
        setState({ backupFileName: handle.name, backupFileNeedsPerm: perm !== 'granted' });
      }
    } catch { /* ignore */ }
  }

  // 4. Observe mutations across all Dexie data tables + settings.
  const trigger = () => scheduleSync();
  for (const tbl of [db.profiles, db.posts, db.notes, db.checks]) {
    tbl.hook('creating', trigger);
    tbl.hook('updating', trigger);
    tbl.hook('deleting', trigger);
  }
  subscribeSettings(trigger);

  // 5. Ensure "Clear all data" also wipes ~/.dissentry/data.json so cleared data doesn't resurrect on reload.
  onClearAll(async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (hasDiskStorage()) {
      await fetch('/api/storage', { method: 'DELETE' }).catch(() => {});
      setState({ diskStatus: 'idle', diskSavedAt: null });
    }
  });
}
