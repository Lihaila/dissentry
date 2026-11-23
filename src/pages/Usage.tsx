import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { fmtCost, fmtTokens, summarize } from '../lib/usage';

const DAY = 86_400_000;
const RANGES = [
  { id: 'today', days: 0 },
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: 'all', days: Infinity },
] as const;

export function UsagePage() {
  const t = useT();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30d');
  const data = useLiveQuery(async () => ({
    profiles: await db.profiles.toArray(), posts: await db.posts.toArray(), checks: await db.checks.toArray(),
  }), []);
  if (!data) return <PageHeader title={t('usage.title')} />;

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const since = (days: number) => (days === 0 ? startOfToday.getTime() : days === Infinity ? 0 : Date.now() - days * DAY);
  const tiles = RANGES.slice(0, 3).map((r) => ({ r, s: summarize(data.profiles, data.posts, data.checks, since(r.days)) }));
  const sel = summarize(data.profiles, data.posts, data.checks, since(RANGES.find((r) => r.id === range)!.days));
  const share = sel.total.tokens ? Math.round((sel.total.checkTokens / sel.total.tokens) * 100) : 0;
  const cost = (c: number, priced: boolean) => (priced ? fmtCost(c) : `≥ ${fmtCost(c)}`);

  return (
    <>
      <PageHeader title={t('usage.title')} sub={t('usage.sub')} />
      <div className="grid grid-cols-3 gap-3 border-b border-slate-200/80 px-4 py-5">
        {tiles.map(({ r, s }) => (
          <button key={r.id} onClick={() => setRange(r.id)}
            className={`surface-card rounded-2xl border p-3.5 text-left transition ${range === r.id ? 'bg-white' : 'border-slate-200/80 bg-white hover:border-slate-300'}`}
            style={range === r.id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 3px var(--accent-soft)' } : undefined}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t(`usage.range.${r.id}`)}</div>
            <div className="mt-1 text-[24px] font-extrabold tracking-tight text-ink">{fmtTokens(s.total.tokens)}</div>
            <div className="text-[12.5px] text-slate-500">{t('usage.tokens')} · {s.total.tokens ? cost(s.total.cost, s.total.priced) : '$0'}</div>
          </button>
        ))}
      </div>

      {sel.total.tokens > 0 && (
        <div className="border-b border-slate-200/80 px-4 py-4">
          <div className="mb-2 flex justify-between text-[12.5px] text-slate-500">
            <span>{t('usage.answering')} · {fmtTokens(sel.total.answerTokens)}</span>
            <span>{t('usage.checking')} · {fmtTokens(sel.total.checkTokens)} ({share}%)</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-sky-500" style={{ width: `${100 - share}%` }} />
            <div className="bg-amber-400" style={{ width: `${share}%` }} />
          </div>
          <p className="mt-2 text-[12.5px] text-slate-500">{t('usage.checkInsight', { pct: share })}</p>
        </div>
      )}

      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <h2 className="text-[15px] font-bold text-ink">{t('usage.byModel')}</h2>
        <div className="flex rounded-full bg-slate-100 p-0.5 text-[12px] font-medium">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className={`rounded-full px-2.5 py-1 ${range === r.id ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}>{t(`usage.range.${r.id}`)}</button>
          ))}
        </div>
      </div>
      {sel.rows.length === 0 && <p className="px-4 py-8 text-[14px] text-slate-500">{t('usage.empty')}</p>}
      {sel.rows.map((r) => {
        const total = r.answerTokens + r.checkTokens;
        const pctWidth = sel.total.tokens ? Math.max(2, Math.round((total / sel.total.tokens) * 100)) : 0;
        const checkPct = total ? Math.round((r.checkTokens / total) * 100) : 0;
        return (
          <div key={r.profile.id} className="border-b border-slate-100 px-4 py-3.5 transition hover:bg-slate-50/50">
            <div className="flex items-center gap-3">
              <Avatar profile={r.profile} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{r.profile.name} <span className="font-normal text-slate-500">@{r.profile.handle}</span></div>
                <div className="text-[12px] text-slate-500">{t('usage.split', { a: fmtTokens(r.answerTokens), c: fmtTokens(r.checkTokens) })}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-semibold tabular-nums text-ink">{fmtTokens(total)}</div>
                <div className="text-[12px] tabular-nums text-slate-500" title={r.priced ? '' : t('usage.noPrice')}>{r.priced ? fmtCost(r.cost) : t('usage.addPrice')}</div>
              </div>
            </div>
            <div className="mt-2 pl-12">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" style={{ width: `${pctWidth}%` }}>
                <div className="bg-sky-500" style={{ width: `${100 - checkPct}%` }} />
                <div className="bg-amber-400" style={{ width: `${checkPct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      <p className="px-4 py-4 text-[12px] leading-relaxed text-slate-400">{t('usage.footnote')}</p>
    </>
  );
}
