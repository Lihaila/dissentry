import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { OpenRouterButton } from '../components/OpenRouterButton';
import { useT } from '../i18n';
import { addOpenRouterProfiles, finishOpenRouterSignIn, listOpenRouterModels, suggestModels, OR_BASE } from '../lib/openrouter';
import type { Profile } from '../lib/types';

type Pick = { handle: string; label: string; modelId: string; on: boolean; inPrice?: number; outPrice?: number };

const fmt = (n?: number) => (n === undefined ? '?' : n < 0.1 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(0));

export function OpenRouterCallbackPage() {
  const t = useT();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [state, setState] = useState<'working' | 'pick' | 'error'>('working');
  const [error, setError] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const keyRef = useRef('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // the one-time code must only be exchanged once (StrictMode runs effects twice)
    ran.current = true;
    (async () => {
      try {
        keyRef.current = await finishOpenRouterSignIn(search);
        history.replaceState(null, '', location.pathname); // drop the code from the address bar
        const suggestions = suggestModels(await listOpenRouterModels());
        setPicks(suggestions.map((s, i) => ({ handle: s.family.handle, label: s.family.label, modelId: s.model.id, on: i < 4, inPrice: s.model.inPrice, outPrice: s.model.outPrice })));
        setState('pick');
      } catch (e) {
        const m = (e as Error).message;
        setError(m === 'cancelled' ? t('or.cancelled') : m === 'state' ? t('or.stateError') : t('or.failed', { error: m }));
        setState('error');
      }
    })();
  }, [search, t]);

  async function add() {
    const chosen = picks.filter((p) => p.on);
    if (!chosen.length) return;
    await addOpenRouterProfiles(keyRef.current, chosen.map(({ handle, label, modelId, inPrice, outPrice }) => ({ handle, label, modelId, inPrice, outPrice })));
    keyRef.current = '';
    navigate('/');
  }

  const fake = (p: Pick): Profile => ({ id: p.handle, handle: p.handle, name: p.label, color: '#64748b', presetId: 'openrouter', protocol: 'openai', baseUrl: OR_BASE, modelId: p.modelId, apiKey: '', useProxy: true, systemPrompt: '', enabled: true, isChecker: true, createdAt: 0 });

  return (
    <>
      <PageHeader title={t('or.title')} />
      {state === 'working' && <p className="px-6 py-16 text-center text-[15px] text-slate-500">{t('or.connecting')}</p>}
      {state === 'error' && (
        <div className="px-6 py-14 text-center">
          <p className="mx-auto max-w-sm text-[15px] text-slate-600">{error}</p>
          <div className="mt-6 flex justify-center gap-3"><OpenRouterButton /><Link href="/models" className="rounded-full border border-slate-200 px-4 py-2 text-[13.5px] font-semibold">{t('or.useKey')}</Link></div>
        </div>
      )}
      {state === 'pick' && (
        <div className="px-5 py-6">
          <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-800"><Check size={18} />{t('or.connected')}</div>
          <h2 className="text-[18px] font-bold tracking-tight text-ink">{t('or.pickTitle')}</h2>
          <p className="mt-1 text-[13.5px] text-slate-500">{t('or.pickSub')}</p>
          <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
            {picks.map((p, i) => (
              <li key={p.modelId}>
                <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition ${p.on ? 'bg-sky-50/50' : 'hover:bg-slate-50'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-slate-900" checked={p.on} onChange={() => setPicks((ps) => ps.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                  <Avatar profile={fake(p)} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold text-ink">{p.label} <span className="font-normal text-slate-500">@{p.handle}</span></div>
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
          <div className="mt-5 flex items-center gap-3">
            <button onClick={() => void add()} disabled={!picks.some((p) => p.on)} className="rounded-full bg-ink px-6 py-2.5 text-[14.5px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
              {t('or.add', { n: picks.filter((p) => p.on).length })}
            </button>
            <Link href="/models" className="text-[13.5px] font-medium text-slate-500 hover:text-ink">{t('or.more')}</Link>
          </div>
        </div>
      )}
    </>
  );
}
