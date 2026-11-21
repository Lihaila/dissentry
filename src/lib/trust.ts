import type { Check, Note, Post, Profile } from './types';

export interface TrustRow {
  profile: Profile;
  answers: number;
  checkedAnswers: number;
  /** Answers with at least one note the user accepted (the model was wrong). */
  correctedAnswers: number;
  openNotesReceived: number;
  checksRun: number;
  notesWritten: number;
  notesAccepted: number;
  notesDismissed: number;
}

export function computeTrust(profiles: Profile[], posts: Post[], notes: Note[], checks: Check[]): TrustRow[] {
  const answers = posts.filter((p) => p.kind === 'model' && p.status === 'done' && !p.respondsToNoteId);
  const notesByPost = new Map<string, Note[]>();
  for (const n of notes) notesByPost.set(n.postId, [...(notesByPost.get(n.postId) ?? []), n]);
  const checkedPosts = new Set(checks.filter((c) => c.verdict === 'ok' || c.verdict === 'note').map((c) => c.postId));

  return profiles.map((profile) => {
    const mine = answers.filter((a) => a.profileId === profile.id);
    const received = mine.flatMap((a) => notesByPost.get(a.id) ?? []);
    const written = notes.filter((n) => n.profileId === profile.id || n.agreeProfileIds.includes(profile.id));
    return {
      profile,
      answers: mine.length,
      checkedAnswers: mine.filter((a) => checkedPosts.has(a.id)).length,
      correctedAnswers: mine.filter((a) => (notesByPost.get(a.id) ?? []).some((n) => n.status === 'accepted')).length,
      openNotesReceived: received.filter((n) => n.status === 'open').length,
      checksRun: checks.filter((c) => c.profileId === profile.id && (c.verdict === 'ok' || c.verdict === 'note')).length,
      notesWritten: written.length,
      notesAccepted: written.filter((n) => n.status === 'accepted').length,
      notesDismissed: written.filter((n) => n.status === 'dismissed').length,
    };
  }).sort((a, b) => b.answers + b.checksRun - (a.answers + a.checksRun));
}

export const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
