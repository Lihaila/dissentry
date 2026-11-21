import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldCheck } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { computeTrust, pct } from '../lib/trust';

export function TrustPage() {
  const t = useT();
  const rows = useLiveQuery(async () => computeTrust(
    await db.profiles.toArray(), await db.posts.toArray(), await db.notes.toArray(), await db.checks.toArray(),
  ), []);
  const totals = rows?.reduce((a, r) => ({ corrected: a.corrected + r.correctedAnswers, checked: a.checked + r.checkedAnswers }), { corrected: 0, checked: 0 });

  return (
    <>
      <PageHeader title={t('trust.title')} sub={t('trust.sub')} />
      {totals && totals.checked > 0 && (
        <div className="border-b border-slate-200/80 bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-white px-5 py-6">
          <p className="text-[42px] font-extrabold leading-none tracking-tight tabular-nums text-ink">{totals.corrected}</p>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-slate-600">{t('trust.summary', { n: totals.checked })}</p>
        </div>
      )}
      {rows?.length === 0 && (
        <div className="px-6 py-14 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70">
            <ShieldCheck size={20} />
          </span>
          <p className="mx-auto max-w-sm text-[14.5px] leading-relaxed text-slate-500">{t('trust.empty')}</p>
        </div>
      )}
      {rows?.map((r) => {
        const heldRatio = r.checkedAnswers ? (r.checkedAnswers - r.correctedAnswers) / r.checkedAnswers : undefined;
        const ratedTotal = r.notesAccepted + r.notesDismissed;
        const noteRatio = ratedTotal ? r.notesAccepted / ratedTotal : undefined;
        return (
          <div key={r.profile.id} className="border-b border-slate-200/80 px-4 py-4 transition hover:bg-slate-50/40">
            <div className="flex items-center gap-3">
              <Avatar profile={r.profile} size={38} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <b className="truncate text-ink">{r.profile.name}</b>
                  <span className="truncate text-[13.5px] text-slate-500">@{r.profile.handle}</span>
                </div>
                <div className="truncate font-mono text-[11.5px] text-slate-400">{r.profile.modelId}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
              <Stat title={t('trust.asAnswerer')} empty={r.checkedAnswers === 0 ? t('trust.noAnswers') : ''}
                big={pct(r.checkedAnswers - r.correctedAnswers, r.checkedAnswers)} bigLabel={t('trust.heldUp')}
                ratio={heldRatio} tone="emerald"
                lines={[t('trust.answers', { a: r.answers, c: r.checkedAnswers }), t('trust.corrected', { n: r.correctedAnswers }), r.openNotesReceived ? t('trust.awaiting', { n: r.openNotesReceived }) : '']} />
              <Stat title={t('trust.asChecker')} empty={r.checksRun === 0 ? t('trust.noChecks') : ratedTotal === 0 ? t('trust.noRated', { a: r.checksRun, n: r.notesWritten }) : ''}
                big={pct(r.notesAccepted, ratedTotal)} bigLabel={t('trust.notesRight')}
                ratio={noteRatio} tone="sky"
                lines={[t('trust.reviewed', { a: r.checksRun, n: r.notesWritten }), t('trust.acceptedDismissed', { a: r.notesAccepted, d: r.notesDismissed })]} />
            </div>
          </div>
        );
      })}
      <p className="px-4 py-4 text-[12px] leading-relaxed text-slate-400">{t('trust.footnote')}</p>
    </>
  );
}

function Stat({ title, big, bigLabel, lines, empty, ratio, tone }: { title: string; big: string; bigLabel: string; lines: string[]; empty?: string; ratio?: number; tone: 'emerald' | 'sky' }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${empty ? 'border-dashed border-slate-200 bg-slate-50/50' : 'border-slate-200/80 bg-white shadow-2xs'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
      {empty ? (
        <p className="mt-2 text-[13px] leading-snug text-slate-400">{empty}</p>
      ) : (
        <>
          <div className="mt-1"><span className="text-[26px] font-extrabold tracking-tight tabular-nums text-ink">{big}</span> <span className="text-[12.5px] text-slate-500">{bigLabel}</span></div>
          {ratio !== undefined && (
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full transition-all ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
          )}
          <div className="space-y-0.5 text-[12.5px] text-slate-500">
            {lines.filter(Boolean).map((l) => <div key={l}>{l}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
