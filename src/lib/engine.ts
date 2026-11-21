import { generateText, streamText } from 'ai';
import { db, uid } from './db';
import { buildCheckMessages, buildReplyMessages, CHECKER_SYSTEM, replySystemPrompt, type ContextInput } from './context';
import { t } from '../i18n';
import { parseMentions } from './mentions';
import { findMatchingNote, maxSeverity, parseCheckResult } from './notes';
import { friendlyError, languageModel } from './providers';
import { getSettings } from './settings';
import { getAncestors, getQuotes, profileMap } from './store';
import { abortStream, isRunning, trackStream, untrackStream } from './streams';
import type { Note, Post, Profile, Usage } from './types';

const toUsage = (u?: { inputTokens?: number; outputTokens?: number }): Usage | undefined =>
  u && (u.inputTokens || u.outputTokens) ? { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0 } : undefined;

export { isRunning };
export function stop(postId: string) {
  if (!abortStream(postId)) {
    // Recover posts left in "streaming" after a page reload.
    void db.posts.where('id').equals(postId).and((p) => p.status === 'streaming').modify({ status: 'stopped' });
  }
}

async function contextFor(chain: Post[]): Promise<ContextInput> {
  return { chain, quotes: await getQuotes(chain), profiles: await profileMap() };
}

async function enabledProfiles(): Promise<Profile[]> {
  return (await db.profiles.toArray()).filter((p) => p.enabled);
}

/**
 * Create a user post and ask every @mentioned model to reply.
 * Replying to a model's post without any @mention addresses that model, like replying on X.
 */
export async function submitPost(input: { text: string; parentId?: string; quoteOfId?: string }): Promise<Post> {
  const text = input.text.trim();
  const parent = input.parentId ? await db.posts.get(input.parentId) : undefined;
  const id = uid();
  const post: Post = {
    id, kind: 'user', text,
    parentId: parent?.id,
    quoteOfId: input.quoteOfId,
    rootId: parent?.rootId ?? id,
    status: 'done',
    createdAt: Date.now(),
  };
  await db.posts.add(post);

  const profiles = await enabledProfiles();
  const handles = parseMentions(text, profiles.map((p) => p.handle));
  let targets = handles.map((h) => profiles.find((p) => p.handle === h)!).filter(Boolean);
  if (!targets.length && parent?.kind === 'model') {
    const author = profiles.find((p) => p.id === parent.profileId);
    if (author) targets = [author];
  }
  // Replies stream in the background; the UI updates live from the database.
  for (const p of targets) void runReply(p, post);
  return post;
}

/** Stream a reply from `profile` to `parent`, then run checkers on it. */
export async function runReply(profile: Profile, parent: Post, opts: { extraUserMessage?: string; respondsToNoteId?: string } = {}): Promise<Post> {
  const reply: Post = {
    id: uid(), kind: 'model', profileId: profile.id, text: '',
    parentId: parent.id, rootId: parent.rootId,
    status: 'streaming', respondsToNoteId: opts.respondsToNoteId, createdAt: Date.now(),
  };
  await db.posts.add(reply);
  const ctrl = new AbortController();
  trackStream(reply.id, ctrl);

  let text = '';
  let lastWrite = 0;
  try {
    const ctx = await contextFor(await getAncestors(parent));
    const result = streamText({
      model: languageModel(profile),
      system: replySystemPrompt(profile, [...ctx.profiles.values()].filter((p) => p.enabled)),
      messages: buildReplyMessages(ctx, profile, opts.extraUserMessage),
      abortSignal: ctrl.signal,
      maxRetries: 0, // never silently re-send (and re-bill) a failed call
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
        if (Date.now() - lastWrite > 60) {
          lastWrite = Date.now();
          await db.posts.update(reply.id, { text });
        }
      } else if (part.type === 'error') {
        throw part.error;
      }
    }
    // The SDK ends the stream quietly on abort; treat that as stopped, not finished (and don't check it).
    if (ctrl.signal.aborted) {
      await db.posts.update(reply.id, { text, status: 'stopped' });
      return (await db.posts.get(reply.id)) ?? { ...reply, text, status: 'stopped' };
    }
    if (!text.trim()) throw new Error(t('err.empty'));
    const usage = toUsage(await Promise.resolve(result.totalUsage).catch(() => undefined));
    await db.posts.update(reply.id, { text, status: 'done', usage });
  } catch (e) {
    const aborted = ctrl.signal.aborted;
    const error = aborted ? undefined : friendlyError(e, profile);
    await db.posts.update(reply.id, {
      text,
      status: aborted ? 'stopped' : 'error',
      error,
    });
    return (await db.posts.get(reply.id)) ?? { ...reply, text, status: aborted ? 'stopped' : 'error', error };
  } finally {
    untrackStream(reply.id);
  }

  const done = await db.posts.get(reply.id);
  if (!done) return { ...reply, text, status: 'done' };
  if (getSettings().autoCheck && !opts.respondsToNoteId) void runChecks(done);
  return done;
}

// Notes for one post are merged one checker at a time, so parallel checkers don't create duplicates.
const mergeQueues = new Map<string, Promise<unknown>>();
function serialised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mergeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  mergeQueues.set(key, next.catch(() => {}));
  return next;
}

/** Ask every enabled checker (other than the author) to review a model answer. */
export async function runChecks(post: Post, only?: Profile[]): Promise<void> {
  if (post.kind !== 'model' || post.status !== 'done') return;
  const all = await enabledProfiles();
  const author = all.find((p) => p.id === post.profileId) ?? (await db.profiles.get(post.profileId!));
  if (!author) return;
  const checkers = (only ?? all.filter((p) => p.isChecker)).filter((p) => p.id !== author.id);
  if (!checkers.length) return;

  const chain = await getAncestors(post);
  const ctx = await contextFor(chain.slice(0, -1));
  const messages = buildCheckMessages(ctx, post, author);

  await Promise.all(checkers.map(async (checker) => {
    await db.checks.put({ postId: post.id, profileId: checker.id, verdict: 'pending', createdAt: Date.now() });
    try {
      const gen = await generateText({ model: languageModel(checker), system: CHECKER_SYSTEM, messages, maxRetries: 0 });
      const usage = toUsage(gen.totalUsage);
      const result = parseCheckResult(gen.text);
      await serialised(post.id, async () => {
        if (!(await db.posts.get(post.id))) return;
        const existing = await db.notes.where('postId').equals(post.id).toArray();
        // A recheck replaces this checker's earlier open notes.
        for (const n of existing) {
          if (n.status !== 'open') continue;
          if (n.profileId === checker.id) {
            if (n.agreeProfileIds.length) {
              const [first, ...rest] = n.agreeProfileIds;
              await db.notes.update(n.id, { profileId: first, agreeProfileIds: rest });
            } else await db.notes.delete(n.id);
          } else if (n.agreeProfileIds.includes(checker.id)) {
            await db.notes.update(n.id, { agreeProfileIds: n.agreeProfileIds.filter((x) => x !== checker.id) });
          }
        }
        const fresh = await db.notes.where('postId').equals(post.id).toArray();
        for (const draft of result.notes) {
          const match = findMatchingNote(fresh, draft, checker.id);
          if (match) {
            match.agreeProfileIds = [...match.agreeProfileIds, checker.id];
            match.severity = maxSeverity(match.severity, draft.severity);
            await db.notes.update(match.id, { agreeProfileIds: match.agreeProfileIds, severity: match.severity });
          } else {
            const note: Note = { id: uid(), postId: post.id, profileId: checker.id, agreeProfileIds: [], ...draft, status: 'open', createdAt: Date.now() };
            fresh.push(note);
            await db.notes.add(note);
          }
        }
      });
      if (await db.posts.get(post.id)) {
        await db.checks.put({ postId: post.id, profileId: checker.id, verdict: result.verdict, usage, createdAt: Date.now() });
      }
    } catch (e) {
      if (await db.posts.get(post.id)) {
        await db.checks.put({ postId: post.id, profileId: checker.id, verdict: 'error', error: friendlyError(e, checker), createdAt: Date.now() });
      }
    }
  }));
}

/** Generate another answer from the same model to the same parent. */
export async function regenerate(post: Post) {
  if (post.kind !== 'model' || !post.parentId) return;
  const [profile, parent] = await Promise.all([db.profiles.get(post.profileId!), db.posts.get(post.parentId)]);
  if (profile && parent) await runReply(profile, parent);
}

/** The note's target model answers the note: concede and correct, or push back. */
export async function askAuthorToRespond(note: Note) {
  const post = await db.posts.get(note.postId);
  if (!post?.profileId) return;
  const [author, checker] = await Promise.all([db.profiles.get(post.profileId), db.profiles.get(note.profileId)]);
  if (!author) return;
  const agree = note.agreeProfileIds.length ? ` (${note.agreeProfileIds.length} other model(s) agreed)` : '';
  const extra = [
    `[note from @${checker?.handle ?? 'reviewer'}${agree} on your answer above]`,
    `Claim: ${note.claim}`,
    `Correction: ${note.correction}`,
    '',
    'Respond to this note. If it is right, say so plainly and give the corrected answer. If it is wrong, explain why with evidence. Keep it short.',
  ].join('\n');
  const reply = await runReply(author, post, { extraUserMessage: extra, respondsToNoteId: note.id });
  if (await db.posts.get(reply.id)) await db.notes.update(note.id, { responsePostId: reply.id });
}

export const setNoteStatus = (id: string, status: Note['status']) => db.notes.update(id, { status });
