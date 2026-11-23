import { Check, ExternalLink, LogOut, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { useProfiles } from '../lib/hooks';
import { presetLogo } from '../lib/logos';
import { maskOpenRouterKey, signOutOpenRouter, useOpenRouterAccount } from '../lib/openrouter';
import { OpenRouterButton } from './OpenRouterButton';

export function OpenRouterAccountCard({ variant }: { variant: 'models' | 'settings' }) {
  const t = useT();
  const account = useOpenRouterAccount();
  const profiles = useProfiles();

  if (account === undefined) return null;

  const orModels = (profiles ?? []).filter((p) => p.presetId === 'openrouter');

  async function onSignOut() {
    const ok = await confirmAction({
      title: t('or.signOutTitle'),
      body: orModels.length > 0 ? t('or.signOutBody', { n: orModels.length }) : t('or.signOutBodyNoModels'),
      confirmLabel: t('or.signOut'),
      danger: true,
    });
    if (!ok) return;
    await signOutOpenRouter();
  }

  if (account) {
    const masked = maskOpenRouterKey(account.apiKey);
    const summary = orModels.length > 0
      ? t('or.connectedSummary', { n: orModels.length, key: masked })
      : t('or.connectedNoModels', { key: masked });

    return (
      <div className={variant === 'models'
        ? 'border-b border-slate-200/80 bg-gradient-to-r from-emerald-50/75 via-transparent to-transparent px-4 py-4'
        : 'border-b border-slate-200/80 px-4 py-5'}>
        {variant === 'settings' && <h2 className="mb-3 text-[15px] font-bold text-ink">{t('or.settingsTitle')}</h2>}
        <div className={variant === 'settings'
          ? 'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-3.5'
          : 'flex flex-wrap items-center gap-x-4 gap-y-3'}>
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="logo-chip mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/80 bg-white shadow-2xs">
              <img src={presetLogo('openrouter')} alt="" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14.5px] font-semibold text-ink">OpenRouter</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
                  <Check size={11} strokeWidth={3} />
                  {t('or.connectedBadge')}
                </span>
              </div>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{summary}</p>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
              >
                {t('or.manageKeys')}
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href="/auth/openrouter"
              className="btn-accent inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold shadow-2xs transition active:scale-[.98]"
            >
              <Plus size={14} />
              {orModels.length > 0 ? t('or.addModels') : t('or.chooseModels')}
            </Link>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-red-600 transition hover:bg-red-50 active:scale-[.98]"
            >
              <LogOut size={14} />
              {t('or.signOut')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'settings') {
    return (
      <div className="border-b border-slate-200/80 px-4 py-5">
        <h2 className="text-[15px] font-bold text-ink">{t('or.settingsTitle')}</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5">
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">{t('or.settingsDisconnected')}</p>
          <OpenRouterButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/70 to-transparent px-4 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-ink">{t('or.cardTitle')}</p>
        <p className="text-[12.5px] text-slate-500">{t('or.pitch')}</p>
      </div>
      <OpenRouterButton />
    </div>
  );
}
