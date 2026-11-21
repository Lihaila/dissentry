import { generateText, streamText } from 'ai';
import { db, uid } from './db';
import { buildCheckMessages, buildReplyMessages, checkerSystemPrompt, hasBinaryAttachments, replySystemPrompt, type ContextInput } from './context';
import { t } from '../i18n';
import { generateMedia } from './media';
import { parseMentions } from './mentions';
import { findMatchingNote, maxSeverity, parseCheckResult } from './notes';
import { friendlyError, isMediaUnsupportedError, isReasoningUnsupportedError, isSearchUnsupportedError, modelCall, profileKind } from './providers';
import { getSettings } from './settings';
import { getQuotes, getThreadNotes, getThreadPosts, profileMap } from './store';
import { abortStream, isRunning, trackStream, untrackStream } from './streams';
import type { Attachment, Note, Post, Profile, Source, Usage } from './types';

const toUsage = (u?: { inputTokens?: number; outputTokens?: number }): Usage | undefined =>
  u && (u.inputTokens || u.outputTokens) ? { input: u.inputTokens ?? 0, output: u.outputTokens ?? 0 } : undefined;

export { isRunning };
export function stop(postId: string) {
  if (!abortStream(postId)) {
    // Recover posts left in "streaming" after a page reload.
    void db.posts.where('id').equals(postId).and((p) => p.status === 'streaming').modify({ status: 'stopped' });
  }
}

async function contextFor(chain: Post[], opts: { includeNotes?: boolean } = {}): Promise<ContextInput> {
  const [quotes, profiles, notes] = await Promise.all([
    getQuotes(chain),
    profileMap(),
    opts.includeNotes === false ? Promise.resolve(undefined) : getThreadNotes(chain),
  ]);
  return { chain, quotes, notes, profiles };
}

async function enabledProfiles(): Promise<Profile[]> {
  return (await db.profiles.toArray()).filter((p) => p.enabled);
}

/** Lift leading <think>...</think> blocks emitted inline by local/custom models into separate reasoning text. */
export function splitInlineThink(rawText: string, streamReasoning: string): { text: string; reasoning: string } {
  const trimmed = rawText.trimStart();
  if (!trimmed.startsWith('<think>')) return { text: rawText, reasoning: streamReasoning };
  const afterOpen = trimmed.slice('<think>'.length);
  const end = afterOpen.indexOf('</think>');
  if (end === -1) {
    const combined = streamReasoning ? `${streamReasoning}\n${afterOpen}` : afterOpen;
    return { text: '', reasoning: combined.trimStart() };
  }
  const inline = afterOpen.slice(0, end).trim();
  const rest = afterOpen.slice(end + '</think>'.length).replace(/^\s+/, '');
  const combined = streamReasoning && inline ? `${streamReasoning}\n${inline}` : streamReasoning || inline;
  return { text: rest, reasoning: combined };
}

/**
 * Create a user post and ask every @mentioned model to reply.
 * Replying to a model's post without any @mention addresses that model, like replying on X.
 */
export async function submitPost(input: {
  text: string;
  parentId?: string;
  quoteOfId?: string;
  webSearch?: boolean;
  deepThink?: boolean;
  attachments?: Attachment[];
}): Promise<Post> {
  const text = input.text.trim();
  const attachments = input.attachments?.length ? input.attachments : undefined;
  const parent = input.parentId ? await db.posts.get(input.parentId) : undefined;
  const settings = getSettings();
  const webSearch = input.webSearch ?? settings.webSearch;
  const deepThink = input.deepThink ?? settings.deepThink;
  const id = uid();
  const post: Post = {
    id, kind: 'user', text,
    parentId: parent?.id,
    quoteOfId: input.quoteOfId,
    rootId: parent?.rootId ?? id,
    status: 'done',
    webSearch: webSearch || undefined,
    deepThink: deepThink || undefined,
    attachments,
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
  for (const p of targets) void runReply(p, post, { webSearch, deepThink });
  return post;
}

const stripMentions = (text: string) => text.replace(/(^|\s)@[a-z0-9][a-z0-9_.-]*/gi, '$1').replace(/\s+/g, ' ').trim();

/** Stream a reply from `profile` to `parent`, sharing the full thread memory, then run checkers on it. */
export async function runReply(
  profile: Profile,
  parent: Post,
  opts: { extraUserMessage?: string; respondsToNoteId?: string; webSearch?: boolean; deepThink?: boolean } = {},
): Promise<Post> {
  const kind = profileKind(profile);
  if (kind !== 'chat') return runMediaReply(profile, parent, kind);

  const settings = getSettings();
  const wantSearch = opts.webSearch ?? parent.webSearch ?? settings.webSearch;
  const wantThink = (opts.deepThink ?? parent.deepThink ?? settings.deepThink) || !!profile.deepThink;
  const initialCall = modelCall(profile, { webSearch: wantSearch, deepThink: wantThink });
  const reply: Post = {
    id: uid(), kind: 'model', profileId: profile.id, text: '',
    parentId: parent.id, rootId: parent.rootId,
    status: 'streaming', respondsToNoteId: opts.respondsToNoteId,
    webSearch: initialCall.searchActive || undefined,
    deepThink: initialCall.thinkActive || undefined,
    createdAt: Date.now(),
  };
  await db.posts.add(reply);
  const ctrl = new AbortController();
  trackStream(reply.id, ctrl);

  let rawText = '';
  let streamReasoning = '';
  let lastWrite = 0;
  let usedSearch = initialCall.searchActive;
  let usedThink = initialCall.thinkActive;
  const sources: Source[] = [];
  const seenUrls = new Set<string>();

  async function execute(call: ReturnType<typeof modelCall>, ctx: ContextInput, includeBinary: boolean) {
    const result = streamText({
      model: call.model,
      tools: call.tools,
      reasoning: call.reasoning,
      providerOptions: call.providerOptions,
      system: replySystemPrompt(profile, [...ctx.profiles.values()].filter((p) => p.enabled)),
      messages: buildReplyMessages(ctx, profile, opts.extraUserMessage, { includeBinary }),
      abortSignal: ctrl.signal,
      maxRetries: 0, // never silently re-send (and re-bill) a failed call
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        rawText += part.text;
        if (Date.now() - lastWrite > 60) {
          lastWrite = Date.now();
          const split = splitInlineThink(rawText, streamReasoning);
          await db.posts.update(reply.id, { text: split.text, reasoning: split.reasoning || undefined });
        }
      } else if (part.type === 'reasoning-delta' && part.text) {
        streamReasoning += part.text;
        if (Date.now() - lastWrite > 60) {
          lastWrite = Date.now();
          const split = splitInlineThink(rawText, streamReasoning);
          await db.posts.update(reply.id, { text: split.text, reasoning: split.reasoning || undefined });
        }
      } else if (part.type === 'source' && part.sourceType === 'url' && part.url && !seenUrls.has(part.url) && sources.length < 8) {
        seenUrls.add(part.url);
        sources.push({ url: part.url, title: part.title || undefined });
      } else if (part.type === 'error') {
        throw part.error;
      }
    }
    return result;
  }

  try {
    const thread = await getThreadPosts(parent, [reply.id]);
    const ctx = await contextFor(thread);
    const parentHasBinary = hasBinaryAttachments([parent]);
    const threadHasBinary = hasBinaryAttachments(thread);
    let call = initialCall;
    let includeBinary = true;
    let result: Awaited<ReturnType<typeof execute>>;

    while (true) {
      try {
        result = await execute(call, ctx, includeBinary);
        break;
      } catch (e) {
        const cleanStart = !ctrl.signal.aborted && !rawText && !streamReasoning;
        // Fallback 1: specific model rejects DeepThink / reasoning parameters.
        if (call.thinkActive && cleanStart && isReasoningUnsupportedError(e)) {
          usedThink = false;
          call = modelCall(profile, { webSearch: call.searchActive, deepThink: false });
          await db.posts.update(reply.id, { deepThink: undefined });
          continue;
        }
        // Fallback 2: specific model rejects web-search tools/plugins.
        if (call.searchActive && cleanStart && isSearchUnsupportedError(e)) {
          usedSearch = false;
          call = modelCall(profile, { webSearch: false, deepThink: call.thinkActive });
          await db.posts.update(reply.id, { webSearch: undefined });
          continue;
        }
        // Fallback 3: a text-only model sees an older image/PDF from earlier in the shared thread.
        if (includeBinary && threadHasBinary && !parentHasBinary && cleanStart && isMediaUnsupportedError(e)) {
          includeBinary = false;
          continue;
        }
        throw e;
      }
    }

    const final = splitInlineThink(rawText, streamReasoning);
    // The SDK ends the stream quietly on abort; treat that as stopped, not finished (and don't check it).
    if (ctrl.signal.aborted) {
      await db.posts.update(reply.id, { text: final.text, reasoning: final.reasoning || undefined, status: 'stopped' });
      return (await db.posts.get(reply.id)) ?? { ...reply, text: final.text, reasoning: final.reasoning || undefined, status: 'stopped' };
    }
    if (!final.text.trim()) throw new Error(t('err.empty'));
    const usage = toUsage(await Promise.resolve(result.totalUsage).catch(() => undefined));
    await db.posts.update(reply.id, {
      text: final.text,
      reasoning: final.reasoning || undefined,
      status: 'done',
      usage,
      webSearch: usedSearch || undefined,
      deepThink: usedThink || undefined,
      sources: sources.length ? sources : undefined,
    });
  } catch (e) {
    const aborted = ctrl.signal.aborted;
    const error = aborted ? undefined : friendlyError(e, profile);
    const final = splitInlineThink(rawText, streamReasoning);
    await db.posts.update(reply.id, {
      text: final.text,
      reasoning: final.reasoning || undefined,
      status: aborted ? 'stopped' : 'error',
      error,
    });
    return (await db.posts.get(reply.id)) ?? { ...reply, text: final.text, reasoning: final.reasoning || undefined, status: aborted ? 'stopped' : 'error', error };
  } finally {
    untrackStream(reply.id);
  }

  const done = await db.posts.get(reply.id);
  if (!done) return { ...reply, text: splitInlineThink(rawText, streamReasoning).text, status: 'done' };
  if (getSettings().autoCheck && !opts.respondsToNoteId) void runChecks(done);
  return done;
}

/** Generate an image, audio clip, or video for a media-generation model profile. */
async function runMediaReply(profile: Profile, parent: Post, kind: 'image' | 'audio' | 'video'): Promise<Post> {
  const reply: Post = {
    id: uid(), kind: 'model', profileId: profile.id, text: '',
    parentId: parent.id, rootId: parent.rootId,
    status: 'streaming',
    mediaStatus: kind,
    createdAt: Date.now(),
  };
  await db.posts.add(reply);
  const ctrl = new AbortController();
  trackStream(reply.id, ctrl);

  try {
    const thread = await getThreadPosts(parent, [reply.id]);
    const latestPrompt = stripMentions(parent.text);
    // If replying inside a thread with an image/edit follow-up, carry forward the latest reference image if needed.
    const directImgs = (parent.attachments ?? []).filter((a) => a.kind === 'image' && a.dataUrl);
    let refImages: Attachment[] = directImgs;
    if (!refImages.length) {
      for (let i = thread.length - 1; i >= 0; i--) {
        const p = thread[i];
        const attImgs = (p.attachments ?? []).filter((a) => a.kind === 'image' && a.dataUrl);
        if (attImgs.length) { refImages = attImgs.slice(0, 2); break; }
        const genImg = (p.media ?? []).find((m) => m.kind === 'image' && m.url);
        if (genImg) {
          refImages = [{ id: genImg.id, name: genImg.name ?? 'image.png', mediaType: genImg.mediaType, size: 0, kind: 'image', dataUrl: genImg.url }];
          break;
        }
      }
    }
    const prompt = latestPrompt || parent.text.trim() || refImages.map((r) => r.name).join(', ');
    if (!prompt) throw new Error(t('err.empty'));

    const res = await generateMedia({
      profile,
      kind,
      prompt,
      refImages,
      signal: ctrl.signal,
      onProgress: (st) => { void db.posts.update(reply.id, { mediaStatus: `${kind}:${st}` }); },
    });
    if (ctrl.signal.aborted) {
      await db.posts.update(reply.id, { status: 'stopped', mediaStatus: undefined });
      return (await db.posts.get(reply.id)) ?? { ...reply, status: 'stopped', mediaStatus: undefined };
    }
    await db.posts.update(reply.id, {
      text: res.text ?? '',
      media: res.media,
      mediaStatus: undefined,
      status: 'done',
    });
    return (await db.posts.get(reply.id)) ?? { ...reply, text: res.text ?? '', media: res.media, mediaStatus: undefined, status: 'done' };
  } catch (e) {
    const aborted = ctrl.signal.aborted;
    const error = aborted ? undefined : friendlyError(e, profile);
    await db.posts.update(reply.id, {
      status: aborted ? 'stopped' : 'error',
      mediaStatus: undefined,
      error,
    });
    return (await db.posts.get(reply.id)) ?? { ...reply, status: aborted ? 'stopped' : 'error', mediaStatus: undefined, error };
  } finally {
    untrackStream(reply.id);
  }
}

// Notes for one post are merged one checker at a time, so parallel checkers don't create duplicates.
const mergeQueues = new Map<string, Promise<unknown>>();
function serialised<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mergeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  mergeQueues.set(key, next.catch(() => {}));
  return next;
}

/** Ask every enabled checker (other than the author) to review a model answer using the shared thread context. */
export async function runChecks(post: Post, only?: Profile[]): Promise<void> {
  if (post.kind !== 'model' || post.status !== 'done' || !post.text.trim()) return;
  const all = await enabledProfiles();
  const author = all.find((p) => p.id === post.profileId) ?? (await db.profiles.get(post.profileId!));
  if (!author) return;
  const checkers = (only ?? all.filter((p) => p.isChecker && profileKind(p) === 'chat')).filter((p) => p.id !== author.id);
  if (!checkers.length) return;

  const history = (await getThreadPosts(post)).filter((p) => p.id !== post.id);
  const ctx = await contextFor(history, { includeNotes: false });
  const historyHasBinary = hasBinaryAttachments(history);
  const wantSearch = post.webSearch ?? getSettings().webSearch;
  const sys = checkerSystemPrompt();

  await Promise.all(checkers.map(async (checker) => {
    await db.checks.put({ postId: post.id, profileId: checker.id, verdict: 'pending', createdAt: Date.now() });
    try {
      let call = modelCall(checker, { webSearch: wantSearch, deepThink: !!checker.deepThink });
      let includeBinary = true;
      let gen: Awaited<ReturnType<typeof generateText>>;
      while (true) {
        try {
          const messages = buildCheckMessages(ctx, post, author, { includeBinary });
          gen = await generateText({
            model: call.model,
            tools: call.tools,
            reasoning: call.reasoning,
            providerOptions: call.providerOptions,
            system: sys,
            messages,
            maxRetries: 0,
          });
          break;
        } catch (e) {
          if (call.thinkActive && isReasoningUnsupportedError(e)) {
            call = modelCall(checker, { webSearch: call.searchActive, deepThink: false });
            continue;
          }
          if (call.searchActive && isSearchUnsupportedError(e)) {
            call = modelCall(checker, { webSearch: false, deepThink: call.thinkActive });
            continue;
          }
          if (includeBinary && historyHasBinary && isMediaUnsupportedError(e)) {
            includeBinary = false;
            continue;
          }
          throw e;
        }
      }
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
  if (profile && parent) {
    const s = getSettings();
    await runReply(profile, parent, { webSearch: s.webSearch, deepThink: s.deepThink });
  }
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
