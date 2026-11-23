import { logoFor } from '../lib/logos';
import { useSettings } from '../lib/settings';
import type { Profile } from '../lib/types';

export function Avatar({ profile, size = 40, user, avatarUrl }: { profile?: Profile; size?: number; user?: string; avatarUrl?: string }) {
  const settings = useSettings();
  if (user !== undefined) {
    const src = avatarUrl !== undefined ? avatarUrl : settings.userAvatar;
    if (src) {
      return (
        <div
          className="shrink-0 select-none overflow-hidden rounded-full border border-slate-200/90 bg-slate-100"
          style={{ width: size, height: size }}
          aria-hidden
        >
          <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      );
    }
    return (
      <div className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold"
        style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }} aria-hidden>
        {(user.trim()[0] ?? 'Y').toUpperCase()}
      </div>
    );
  }
  const logo = profile ? logoFor(profile) : undefined;
  if (logo) {
    return (
      <div className="logo-chip flex shrink-0 select-none items-center justify-center rounded-full border border-slate-200 bg-white"
        style={{ width: size, height: size }} aria-hidden>
        <img src={logo} alt="" draggable={false} style={{ width: size * 0.58, height: size * 0.58 }} />
      </div>
    );
  }
  const label = (profile?.name ?? '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2);
  return (
    <div className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: profile?.color ?? '#64748b', fontSize: size * 0.38 }} aria-hidden>
      {label.toUpperCase()}
    </div>
  );
}
