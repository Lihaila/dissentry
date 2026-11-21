import { Check, MessageSquareReply, X } from 'lucide-react';
import { Link } from 'wouter';
import { askAuthorToRespond, setNoteStatus } from '../lib/engine';
import type { Note, Profile } from '../lib/types';
import { Markdown } from './Markdown';

const SEV = {
  minor: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  major: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
};

export function NoteCard({ note, profiles, author }: { note: Note; profiles: Map<string, Profile>; author?: Profile }) {
  const writer = profiles.get(note.profileId);
  const agree = note.agreeProfileIds.map((id) => profiles.get(id)).filter(Boolean) as Profile[];
  const closed = note.status !== 'open';
  return (
    <div className={`mt-3 rounded-2xl border p-3 text-[14px] ${closed ? 'opacity-70' : ''} ${note.status === 'dismissed' ? 'border-slate-200 dark:border-slate-800' : 'border-amber-300/70 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="font-bold">📝 Dissent</span>
        <span className="text-slate-600 dark:text-slate-400">
          from <b>@{writer?.handle ?? 'unknown'}</b>
          {agree.length > 0 && <> · {agree.map((a) => `@${a.handle}`).join(' · ')} agree</>}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${SEV[note.severity]}`}>{note.severity}</span>
        {note.status === 'accepted' && <span className="ml-auto text-[12px] font-semibold text-emerald-600">✓ You accepted this note</span>}
        {note.status === 'dismissed' && <span className="ml-auto text-[12px] font-semibold text-slate-500">Dismissed</span>}
      </div>
      <p className="mt-2 text-slate-600 italic dark:text-slate-400">“{note.claim}”</p>
      <div className="mt-1.5"><Markdown text={note.correction} /></div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {!closed && (
          <>
            <NoteButton onClick={() => setNoteStatus(note.id, 'accepted')} icon={<Check size={14} />}>Note is right</NoteButton>
            <NoteButton onClick={() => setNoteStatus(note.id, 'dismissed')} icon={<X size={14} />}>Not helpful</NoteButton>
          </>
        )}
        {closed && <NoteButton onClick={() => setNoteStatus(note.id, 'open')}>Undo</NoteButton>}
        {author && !note.responsePostId && (
          <NoteButton onClick={() => void askAuthorToRespond(note)} icon={<MessageSquareReply size={14} />}>Ask @{author.handle} to respond</NoteButton>
        )}
        {note.responsePostId && (
          <Link href={`/post/${note.responsePostId}`} onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold text-sky-600 hover:underline dark:text-sky-400">
            See @{author?.handle ?? 'author'}’s response →
          </Link>
        )}
      </div>
    </div>
  );
}

function NoteButton({ children, onClick, icon }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[12.5px] font-semibold hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900">
      {icon}{children}
    </button>
  );
}
