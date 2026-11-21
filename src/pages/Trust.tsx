import { useLiveQuery } from 'dexie-react-hooks';
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
        <div className="border-b border-slate-200/80 bg-gradient-to-br from-amber-50 to-white px-5 py-6">
          <p className="text-[40px] font-extrabold leading-none tracking-tight text-ink">{totals.corrected}</p>
          <p className="mt-2 text-[14px] text-slate-600">{t('trust.summary', { n: totals.checked })}</p>
        </div>
      )}
      {rows?.length === 0 && <p className="p-6 text-slate-500">{t('trust.empty')}</p>}
      {rows?.map((r) => (
        <div key={r.profile.id} className="border-b border-slate-200/80 px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar profile={r.profile} size={38} />
            <div className="min-w-0">
              <b className="text-ink">{r.profile.name}</b> <span className="text-slate-500">@{r.profile.handle}</span>
              <div className="truncate text-[12px] text-slate-500">{r.profile.modelId}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            <Stat title={t('trust.asAnswerer')} empty={r.checkedAnswers === 0 ? t('trust.noAnswers') : ''}
              big={pct(r.checkedAnswers - r.correctedAnswers, r.checkedAnswers)} bigLabel={t('trust.heldUp')}
              lines={[t('trust.answers', { a: r.answers, c: r.checkedAnswers }), t('trust.corrected', { n: r.correctedAnswers }), r.openNotesReceived ? t('trust.awaiting', { n: r.openNotesReceived }) : '']} />
            <Stat title={t('trust.asChecker')} empty={r.checksRun === 0 ? t('trust.noChecks') : r.notesAccepted + r.notesDismissed === 0 ? t('trust.noRated', { a: r.checksRun, n: r.notesWritten }) : ''}
              big={pct(r.notesAccepted, r.notesAccepted + r.notesDismissed)} bigLabel={t('trust.notesRight')}
              lines={[t('trust.reviewed', { a: r.checksRun, n: r.notesWritten }), t('trust.acceptedDismissed', { a: r.notesAccepted, d: r.notesDismissed })]} />
          </div>
        </div>
      ))}
      <p className="px-4 py-4 text-[12px] text-slate-400">{t('trust.footnote')}</p>
    </>
  );
}

function Stat({ title, big, bigLabel, lines, empty }: { title: string; big: string; bigLabel: string; lines: string[]; empty?: string }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${empty ? 'border-dashed border-slate-200 bg-slate-50/50' : 'border-slate-200/80 bg-white'}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>
      {empty ? (
        <p className="mt-2 text-[13px] leading-snug text-slate-400">{empty}</p>
      ) : (
        <>
          <div className="mt-1"><span className="text-[26px] font-extrabold tracking-tight text-ink">{big}</span> <span className="text-slate-500">{bigLabel}</span></div>
          {lines.filter(Boolean).map((l) => <div key={l} className="text-slate-500">{l}</div>)}
        </>
      )}
    </div>
  );
}
