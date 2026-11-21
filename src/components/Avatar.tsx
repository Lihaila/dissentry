import type { Profile } from '../lib/types';

export function Avatar({ profile, size = 40, user }: { profile?: Profile; size?: number; user?: string }) {
  const label = user !== undefined ? (user.trim()[0] ?? 'Y') : (profile?.name ?? '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2);
  const bg = user !== undefined ? '#0ea5e9' : profile?.color ?? '#64748b';
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {label.toUpperCase()}
    </div>
  );
}
