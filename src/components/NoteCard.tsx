import { Check, MessageSquareReply, Undo2, X } from 'lucide-react';
import { Link } from 'wouter';
import { useT } from '../i18n';
import { askAuthorToRespond, setNoteStatus } from '../lib/engine';
import type { Note, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';

const SEV = {
  minor: 'bg-amber-100 text-amber-800',
  major: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-700',
};

export function NoteCard({ note, profiles, author }: { note: Note; profiles: Map<string, Profile>; author?: Profile }) {
  const t = useT();
  const writer = profiles.get(note.profileId);
  const agree = note.agreeProfileIds.map((id) => profiles.get(id)).filter(Boolean) as Profile[];
  const all = [writer, ...agree].filter(Boolean) as Profile[];
  const dismissed = note.status === 'dismissed';
  return (
    <div className={`mt-3 overflow-hidden rounded-2xl border text-[14px] transition ${dismissed ? 'border-slate-200 bg-slate-50/50 opacity-70' : 'border-amber-200 bg-gradient-to-b from-amber-50 to-amber-50/30'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3.5 pt-3">
        <span className="flex -space-x-1.5">{all.slice(0, 4).map((p) => <span key={p.id} className="rounded-full ring-2 ring-amber-50"><Avatar profile={p} size={20} /></span>)}</span>
        <span className="text-[13px] font-bold text-amber-900">{t('note.title')}</span>
        <span className="text-[12.5px] text-slate-600">
          {t('note.from', { handle: writer?.handle ?? '?' })}
          {agree.length > 0 && <> · {t('note.agree', { handles: agree.map((a) => `@${a.handle}`).join(' · ') })}</>}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${SEV[note.severity]}`}>{t(`sev.${note.severity}`)}</span>
        {note.status === 'accepted' && <span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><Check size={13} />{t('note.accepted')}</span>}
        {dismissed && <span className="ml-auto text-[12px] font-semibold text-slate-500">{t('note.dismissed')}</span>}
      </div>
      <blockquote className="mx-3.5 mt-2 border-l-2 border-amber-300 pl-2.5 text-[13.5px] italic text-slate-600">{note.claim}</blockquote>
      <div className="px-3.5 pt-2 text-slate-800"><Markdown text={note.correction} /></div>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-2.5">
        {note.status === 'open' ? (
          <>
            <NoteButton onClick={() => setNoteStatus(note.id, 'accepted')} icon={<Check size={14} />} tone="good">{t('note.right')}</NoteButton>
            <NoteButton onClick={() => setNoteStatus(note.id, 'dismissed')} icon={<X size={14} />}>{t('note.notHelpful')}</NoteButton>
          </>
        ) : (
          <NoteButton onClick={() => setNoteStatus(note.id, 'open')} icon={<Undo2 size={13} />}>{t('note.undo')}</NoteButton>
        )}
        {author && !note.responsePostId && (
          <NoteButton onClick={() => void askAuthorToRespond(note)} icon={<MessageSquareReply size={14} />}>{t('note.askRespond', { handle: author.handle })}</NoteButton>
        )}
        {note.responsePostId && (
          <Link href={`/post/${note.responsePostId}`} onClick={(e) => e.stopPropagation()}
            className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-sky-600 hover:underline">
            {t('note.seeResponse', { handle: author?.handle ?? '?' })}
          </Link>
        )}
      </div>
    </div>
  );
}

function NoteButton({ children, onClick, icon, tone }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; tone?: 'good' }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[12.5px] font-semibold transition ${tone === 'good' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
      {icon}{children}
    </button>
  );
}
