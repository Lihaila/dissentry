import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db';
import type { Profile } from './types';

export function useProfiles(): Profile[] | undefined {
  return useLiveQuery(() => db.profiles.orderBy('createdAt').toArray(), []);
}

export function useProfileMap(): Map<string, Profile> {
  const list = useProfiles();
  return new Map((list ?? []).map((p) => [p.id, p]));
}

/** Re-render periodically so relative timestamps stay fresh. */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
