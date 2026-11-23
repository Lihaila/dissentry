import { useState } from 'react';
import { useT } from '../i18n';
import { presetLogo } from '../lib/logos';
import { startOpenRouterSignIn } from '../lib/openrouter';

export function OpenRouterButton({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={() => { setBusy(true); void startOpenRouterSignIn(); }}
      disabled={busy}
      className={`btn-accent inline-flex items-center justify-center gap-2.5 rounded-full font-semibold shadow-sm shadow-slate-900/10 transition active:scale-[.98] disabled:opacity-70 ${size === 'lg' ? 'px-6 py-3 text-[15px]' : 'px-4 py-2 text-[13.5px]'} ${className}`}
    >
      <span className="logo-chip flex h-6 w-6 items-center justify-center rounded-full bg-white"><img src={presetLogo('openrouter')} alt="" className="h-4 w-4" /></span>
      {busy ? t('or.redirecting') : t('or.signIn')}
    </button>
  );
}
