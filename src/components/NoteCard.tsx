import { Check, MessageSquareReply, Undo2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n';
import { askAuthorToRespond, setNoteStatus } from '../lib/engine';
import type { Note, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';

const THEME = {
  minor: {
    card: 'border-amber-200/90 bg-gradient-to-b from-amber-50/70 to-white',
    head: 'border-amber-200/60 bg-amber-50/90',
    title: 'text-amber-900',
    quote: 'border-amber-300 bg-amber-50/80',
    foot: 'border-amber-100/90 bg-amber-50/30',
    badge: 'bg-amber-100 text-amber-800 ring-amber-200/80',
    ring: 'ring-amber-50',
  },
  major: {
    card: 'border-amber-300/85 bg-gradient-to-b from-amber-50/85 to-white',
    head: 'border-amber-200/80 bg-amber-100/55',
    title: 'text-amber-950',
    quote: 'border-amber-400 bg-amber-100/45',
    foot: 'border-amber-200/60 bg-amber-50/35',
    badge: 'bg-orange-100 text-orange-800 ring-orange-200/80',
    ring: 'ring-amber-100',
  },
  critical: {
    card: 'border-red-200/90 bg-gradient-to-b from-red-50/60 to-white',
    head: 'border-red-200/70 bg-red-50/85',
    title: 'text-red-900',
    quote: 'border-red-300 bg-red-50/70',
    foot: 'border-red-100/90 bg-red-50/25',
    badge: 'bg-red-100 text-red-700 ring-red-200/80',
    ring: 'ring-red-50',
  },
};

export function NoteCard({ note, profiles, author }: { note: Note; profiles: Map<string, Profile>; author?: Profile }) {
  const t = useT();
  const [responding, setResponding] = useState(false);
  const writer = profiles.get(note.profileId);
  const agree = note.agreeProfileIds.map((id) => profiles.get(id)).filter(Boolean) as Profile[];
  const all = [writer, ...agree].filter(Boolean) as Profile[];
  const dismissed = note.status === 'dismissed';
  const th = THEME[note.severity];

  async function askRespond() {
    if (responding) return;
    setResponding(true);
    try { await askAuthorToRespond(note); } finally { setResponding(false); }
  }

  return (
    <div className={`note-card mt-3 overflow-hidden rounded-2xl border text-[14px] shadow-2xs transition ${dismissed ? 'note-dismissed border-slate-200 bg-slate-50/60 opacity-75' : th.card}`}>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3.5 py-2.5 ${dismissed ? 'border-slate-200/70 bg-slate-100/50' : th.head}`}>
        <span className="flex -space-x-1.5">
          {all.slice(0, 4).map((p) => (
            <span key={p.id} className={`rounded-full ring-2 ${dismissed ? 'ring-slate-100' : th.ring}`}>
              <Avatar profile={p} size={20} />
            </span>
          ))}
        </span>
        <span className={`text-[13px] font-bold tracking-tight ${dismissed ? 'text-slate-700' : th.title}`}>{t('note.title')}</span>
        <span className="text-[12.5px] text-slate-600">
          {t('note.from', { handle: writer?.handle ?? '?' })}
          {agree.length > 0 && <> · {t('note.agree', { handles: agree.map((a) => `@${a.handle}`).join(' · ') })}</>}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${th.badge}`}>{t(`sev.${note.severity}`)}</span>
        {note.status === 'accepted' && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
            <Check size={12} strokeWidth={2.5} />{t('note.accepted')}
          </span>
        )}
        {dismissed && <span className="ml-auto text-[11.5px] font-semibold text-slate-500">{t('note.dismissed')}</span>}
      </div>

      <div className="px-3.5 py-3">
        <blockquote className={`rounded-r-lg border-l-[3px] py-1.5 pl-3 pr-3 text-[13.5px] italic leading-relaxed text-slate-600 ${dismissed ? 'border-slate-300 bg-slate-100/60' : th.quote}`}>
          {note.claim}
        </blockquote>
        <div className="pt-2.5 text-slate-800"><Markdown text={note.correction} /></div>
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 border-t px-3.5 py-2.5 ${dismissed ? 'border-slate-200/70 bg-slate-50/40' : th.foot}`}>
        {note.status === 'open' ? (
          <>
            <NoteButton onClick={() => setNoteStatus(note.id, 'accepted')} icon={<Check size={13.5} strokeWidth={2.5} />} tone="good">{t('note.right')}</NoteButton>
            <NoteButton onClick={() => setNoteStatus(note.id, 'dismissed')} icon={<X size={13.5} />}>{t('note.notHelpful')}</NoteButton>
          </>
        ) : (
          <NoteButton onClick={() => setNoteStatus(note.id, 'open')} icon={<Undo2 size={12.5} />}>{t('note.undo')}</NoteButton>
        )}
        {author && !note.responsePostId && (
          <NoteButton disabled={responding} onClick={() => void askRespond()} icon={<MessageSquareReply size={13.5} />}>
            {t('note.askRespond', { handle: author.handle })}{responding && '…'}
          </NoteButton>
        )}
        {note.responsePostId && (
          <Link href={`/post/${note.responsePostId}`} onClick={(e) => e.stopPropagation()}
            className="ml-auto rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-accent transition hover:bg-slate-100/70 hover:underline">
            {t('note.seeResponse', { handle: author?.handle ?? '?' })}
          </Link>
        )}
      </div>
    </div>
  );
}

function NoteButton({ children, onClick, icon, tone, disabled }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; tone?: 'good'; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-[12px] font-semibold shadow-2xs transition active:scale-[.98] disabled:opacity-60 ${
        tone === 'good'
          ? 'border-emerald-200/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50'
          : 'border-slate-200/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {icon}{children}
    </button>
  );
}
