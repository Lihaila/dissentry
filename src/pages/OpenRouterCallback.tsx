import { Check, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { OpenRouterButton } from '../components/OpenRouterButton';
import { useT } from '../i18n';
import { db } from '../lib/db';
import {
  addOpenRouterProfiles,
  finishOpenRouterSignIn,
  getOpenRouterAccount,
  listOpenRouterModels,
  OR_BASE,
  suggestModels,
} from '../lib/openrouter';
import type { Profile } from '../lib/types';

type Pick = { handle: string; label: string; modelId: string; on: boolean; added: boolean; inPrice?: number; outPrice?: number };

const fmt = (n?: number) => (n === undefined ? '?' : n < 0.1 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(0));

export function OpenRouterCallbackPage() {
  const t = useT();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [state, setState] = useState<'working' | 'pick' | 'error' | 'modelsError'>('working');
  const [error, setError] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [saving, setSaving] = useState(false);
  const keyRef = useRef('');
  const hadProfilesRef = useRef(false);
  const ran = useRef(false);

  const loadModels = useCallback(async () => {
    setState('working');
    setError('');
    try {
      const [all, existing] = await Promise.all([listOpenRouterModels(), db.profiles.toArray()]);
      hadProfilesRef.current = existing.length > 0;
      const existingOrIds = new Set(existing.filter((p) => p.presetId === 'openrouter').map((p) => p.modelId));
      const suggestions = suggestModels(all);
      let preselected = 0;
      setPicks(suggestions.map((s) => {
        const added = existingOrIds.has(s.model.id);
        const on = !added && preselected < 4;
        if (on) preselected++;
        return {
          handle: s.family.handle,
          label: s.family.label,
          modelId: s.model.id,
          on,
          added,
          inPrice: s.model.inPrice,
          outPrice: s.model.outPrice,
        };
      }));
      setState('pick');
    } catch (e) {
      setError(t('or.loadModelsFailed', { error: (e as Error).message }));
      setState('modelsError');
    }
  }, [t]);

  useEffect(() => {
    if (ran.current) return; // the one-time code must only be exchanged once (StrictMode runs effects twice)
    ran.current = true;
    (async () => {
      const hasCode = new URLSearchParams(search).has('code');
      if (hasCode) {
        try {
          keyRef.current = await finishOpenRouterSignIn(search);
          history.replaceState(null, '', location.pathname); // drop the code from the address bar
        } catch (e) {
          const m = (e as Error).message;
          setError(m === 'cancelled' ? t('or.cancelled') : m === 'state' ? t('or.stateError') : t('or.failed', { error: m }));
          setState('error');
          return;
        }
        await loadModels();
        return;
      }

      // Already connected (e.g. clicked "Add models" / "Choose models" or refreshed after code was stripped).
      const saved = await getOpenRouterAccount();
      if (saved?.apiKey) {
        keyRef.current = saved.apiKey;
        await loadModels();
        return;
      }

      setError(t('or.cancelled'));
      setState('error');
    })();
  }, [search, t, loadModels]);

  const selectedCount = picks.filter((p) => p.on).length;

  async function add() {
    if (saving) return;
    const chosen = picks.filter((p) => p.on);
    if (!chosen.length) return;
    const key = keyRef.current || (await getOpenRouterAccount())?.apiKey || '';
    if (!key) return;
    setSaving(true);
    try {
      await addOpenRouterProfiles(
        key,
        chosen.map(({ handle, label, modelId, inPrice, outPrice }) => ({ handle, label, modelId, inPrice, outPrice })),
      );
      navigate(hadProfilesRef.current ? '/models' : '/');
    } finally {
      setSaving(false);
    }
  }

  const fake = (p: Pick): Profile => ({ id: p.handle, handle: p.handle, name: p.label, color: '#64748b', presetId: 'openrouter', protocol: 'openai', baseUrl: OR_BASE, modelId: p.modelId, apiKey: '', useProxy: true, systemPrompt: '', enabled: true, isChecker: true, createdAt: 0 });

  return (
    <>
      <PageHeader title={t('or.title')} />
      {state === 'working' && <p className="px-6 py-16 text-center text-[15px] text-slate-500">{t('or.connecting')}</p>}
      {state === 'error' && (
        <div className="px-6 py-14 text-center">
          <p className="mx-auto max-w-sm text-[15px] text-slate-600">{error}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <OpenRouterButton />
            <Link href="/models" className="rounded-full border border-slate-200 px-4 py-2 text-[13.5px] font-semibold">{t('or.useKey')}</Link>
          </div>
        </div>
      )}
      {state === 'modelsError' && (
        <div className="px-5 py-6">
          <div className="mb-4 flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-800"><Check size={18} />{t('or.connected')}</div>
          <p className="text-[14.5px] leading-relaxed text-slate-600">{error}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void loadModels()} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-slate-800">
              <RefreshCw size={14} /> {t('or.retry')}
            </button>
            <Link href="/models" className="rounded-full border border-slate-200 px-4 py-2.5 text-[14px] font-semibold text-ink hover:bg-slate-50">{t('nav.models')}</Link>
          </div>
        </div>
      )}
      {state === 'pick' && (
        <div className="px-5 py-6">
          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-800"><Check size={18} className="shrink-0" />{t('or.connected')}</div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] font-bold tracking-tight text-ink">{t('or.pickTitle')}</h2>
              <p className="mt-1 text-[13.5px] text-slate-500">{t('or.pickSub')}</p>
            </div>
            <button
              type="button"
              onClick={() => void add()}
              disabled={saving || selectedCount === 0}
              className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-[14px] font-semibold text-white shadow-xs transition hover:bg-slate-800 active:scale-[.98] disabled:bg-slate-300"
            >
              {t('or.add', { n: selectedCount })}
            </button>
          </div>
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {picks.map((p, i) => (
              <li key={p.modelId}>
                <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition ${p.on ? 'bg-sky-50/50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={p.on} onChange={() => setPicks((ps) => ps.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                  <Avatar profile={fake(p)} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold text-ink">
                      <span>{p.label}</span>
                      <span className="font-normal text-slate-500">@{p.handle}</span>
                      {p.added && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                          <Check size={10} strokeWidth={3} /> {t('or.added')}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[12.5px] text-slate-500">{p.modelId}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11.5px] leading-tight text-slate-500" title={t('or.priceHint')}>
                    <div className="font-semibold text-slate-700">${fmt(p.inPrice)} / ${fmt(p.outPrice)}</div>
                    <div>{t('or.perMillion')}</div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">{t('or.keyNote')}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void add()}
              disabled={saving || selectedCount === 0}
              className="rounded-full bg-ink px-6 py-2.5 text-[14.5px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300"
            >
              {t('or.add', { n: selectedCount })}
            </button>
            <Link href="/models" className="text-[13.5px] font-medium text-slate-500 hover:text-ink">{t('or.more')}</Link>
          </div>
        </div>
      )}
    </>
  );
}
