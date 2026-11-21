import { useLiveQuery } from 'dexie-react-hooks';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { db } from '../lib/db';
import { computeTrust, pct } from '../lib/trust';

export function TrustPage() {
  const rows = useLiveQuery(async () => computeTrust(
    await db.profiles.toArray(), await db.posts.toArray(), await db.notes.toArray(), await db.checks.toArray(),
  ), []);
  const totals = rows?.reduce((t, r) => ({ corrected: t.corrected + r.correctedAnswers, checked: t.checked + r.checkedAnswers }), { corrected: 0, checked: 0 });

  return (
    <>
      <PageHeader title="Trust" sub="Who gets corrected, and whose notes hold up, on your questions" />
      {totals && totals.checked > 0 && (
        <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <p className="text-3xl font-extrabold">{totals.corrected}</p>
          <p className="text-[14px] text-slate-500">answers you confirmed were wrong, out of {totals.checked} checked. Without a second opinion you might have trusted those.</p>
        </div>
      )}
      {rows?.length === 0 && <p className="p-6 text-slate-500">Add models and ask some questions to build your trust table.</p>}
      {rows?.map((r) => (
        <div key={r.profile.id} className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Avatar profile={r.profile} size={36} />
            <div className="min-w-0">
              <b>{r.profile.name}</b> <span className="text-slate-500">@{r.profile.handle}</span>
              <div className="truncate text-[12px] text-slate-500">{r.profile.modelId}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
            <Stat title="As answerer"
              big={pct(r.checkedAnswers - r.correctedAnswers, r.checkedAnswers)} bigLabel="held up"
              lines={[`${r.answers} answers · ${r.checkedAnswers} checked`, `${r.correctedAnswers} corrected by a note you accepted`, r.openNotesReceived ? `${r.openNotesReceived} notes awaiting your verdict` : '']} />
            <Stat title="As checker"
              big={pct(r.notesAccepted, r.notesAccepted + r.notesDismissed)} bigLabel="of rated notes were right"
              lines={[`${r.checksRun} answers reviewed · ${r.notesWritten} notes`, `${r.notesAccepted} accepted · ${r.notesDismissed} dismissed`]} />
          </div>
        </div>
      ))}
      <p className="px-4 py-4 text-[12px] text-slate-500">Numbers come only from your own votes on notes, so they describe how each model does on <i>your</i> questions.</p>
    </>
  );
}

function Stat({ title, big, bigLabel, lines }: { title: string; big: string; bigLabel: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1"><span className="text-2xl font-extrabold">{big}</span> <span className="text-slate-500">{bigLabel}</span></div>
      {lines.filter(Boolean).map((l) => <div key={l} className="text-slate-500">{l}</div>)}
    </div>
  );
}
