import type { FilePart, ImagePart, TextPart } from 'ai';
import { extOf, fmtBytes } from './files';
import type { Attachment, Note, Post, Profile } from './types';

export type UserPart = TextPart | ImagePart | FilePart;
export type ChatMessage =
  | { role: 'user'; content: string | UserPart[] }
  | { role: 'assistant'; content: string };

export interface ContextInput {
  /** Posts from the shared thread memory up to the post being replied to (inclusive). */
  chain: Post[];
  /** For any post with quoteOfId: the quoted post's own chain (root → quoted post). */
  quotes: Record<string, Post[]>;
  /** Non-dismissed dissent notes keyed by postId so follow-ups remember corrections. */
  notes?: Record<string, Note[]>;
  profiles: Map<string, Profile>;
}

const MAX_POST_CHARS = 6000;
const MAX_ATTACHMENT_CHARS = 18000;
const MAX_TOTAL_CHARS = 60000;

const clip = (s: string, n = MAX_POST_CHARS) => (s.length > n ? s.slice(0, n) + '\n…[truncated]' : s);

export function authorLabel(post: Post, profiles: Map<string, Profile>): string {
  if (post.kind === 'user') return 'user';
  const p = post.profileId ? profiles.get(post.profileId) : undefined;
  return p ? `@${p.handle}` : '@unknown-model';
}

function usable(p: Post) {
  return (p.text.trim().length > 0 || (p.attachments?.length ?? 0) > 0) && p.status !== 'error';
}

function renderAttachmentsText(attachments: Attachment[] | undefined, includeBinary: boolean): string {
  if (!attachments?.length) return '';
  const blocks: string[] = [];
  for (const a of attachments) {
    if (a.kind === 'text' && a.text !== undefined) {
      const lang = extOf(a.name).replace(/[^a-z0-9_+-]/g, '');
      const snippet = clip(a.text, MAX_ATTACHMENT_CHARS);
      blocks.push(`[Attached file: ${a.name} (${fmtBytes(a.size)})]\n\`\`\`${lang}\n${snippet}\n\`\`\``);
    } else if (a.kind === 'image') {
      blocks.push(includeBinary ? `[Attached image: ${a.name}]` : `[Attached image: ${a.name} (not shown to text-only model)]`);
    } else {
      blocks.push(includeBinary ? `[Attached file: ${a.name} (${a.mediaType})]` : `[Attached file: ${a.name} (${a.mediaType}, not shown to text-only model)]`);
    }
  }
  return blocks.join('\n\n');
}

function binaryPartsOf(attachments: Attachment[] | undefined): UserPart[] {
  if (!attachments?.length) return [];
  const parts: UserPart[] = [];
  for (const a of attachments) {
    if (a.kind === 'image' && a.dataUrl) {
      parts.push({ type: 'image', image: a.dataUrl, mediaType: a.mediaType });
    } else if (a.kind === 'file' && a.dataUrl) {
      parts.push({ type: 'file', data: a.dataUrl, mediaType: a.mediaType, filename: a.name });
    }
  }
  return parts;
}

/** Text of a post including any quoted post, text attachments, and dissent notes, as the model should see it. */
export function renderPost(post: Post, input: ContextInput, includeBinary = true): string {
  let body = clip(post.text);
  const attText = renderAttachmentsText(post.attachments, includeBinary);
  if (attText) body = body ? `${body}\n\n${attText}` : attText;
  if (post.quoteOfId) {
    const q = (input.quotes[post.quoteOfId] ?? []).filter(usable);
    if (q.length) {
      const quoted = q
        .map((qp) => `[${authorLabel(qp, input.profiles)}]: ${clip(qp.text, 4000)}`)
        .join('\n\n')
        .split('\n').map((l) => `> ${l}`).join('\n');
      body = `${body}\n\n(Quoting this exchange:)\n${quoted}`;
    }
  }
  const postNotes = input.notes?.[post.id]?.filter((n) => n.status !== 'dismissed');
  if (postNotes?.length) {
    const lines = postNotes.map((n) => {
      const handles = [n.profileId, ...n.agreeProfileIds].map((id) => `@${input.profiles.get(id)?.handle ?? '?'}`).join(' · ');
      const tag = n.status === 'accepted' ? 'accepted by user' : n.severity;
      return `[Dissent note from ${handles} (${tag}) on "${clip(n.claim, 200)}"]: ${clip(n.correction, 600)}`;
    });
    body = `${body}\n\n${lines.join('\n')}`;
  }
  return body;
}

function mergeUserContent(a: string | UserPart[], b: string | UserPart[]): string | UserPart[] {
  if (typeof a === 'string' && typeof b === 'string') return `${a}\n\n${b}`;
  const toParts = (c: string | UserPart[]): UserPart[] => (typeof c === 'string' ? [{ type: 'text', text: c }] : c);
  const left = toParts(a);
  const right = toParts(b);
  const last = left[left.length - 1];
  const first = right[0];
  if (last?.type === 'text' && first?.type === 'text') {
    return [...left.slice(0, -1), { type: 'text', text: `${last.text}\n\n${first.text}` }, ...right.slice(1)];
  }
  return [...left, ...right];
}

function normalise(msgs: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      if (last.role === 'assistant' && m.role === 'assistant') last.content += `\n\n${m.content}`;
      else if (last.role === 'user' && m.role === 'user') last.content = mergeUserContent(last.content, m.content);
    } else {
      merged.push(m.role === 'user' ? { role: 'user', content: Array.isArray(m.content) ? [...m.content] : m.content } : { ...m });
    }
  }
  if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', content: '[user]: (conversation start)' });
  return merged;
}

function msgTextLength(m: ChatMessage): number {
  if (typeof m.content === 'string') return m.content.length;
  return m.content.reduce((n, p) => n + (p.type === 'text' ? p.text.length : 500), 0);
}

/** True when any post in `chain` carries a binary image or PDF attachment. */
export function hasBinaryAttachments(chain: Post[]): boolean {
  return chain.some((p) => p.attachments?.some((a) => (a.kind === 'image' || a.kind === 'file') && !!a.dataUrl));
}

/** Build the message list for `self` to reply to the last post of `chain`. */
export function buildReplyMessages(
  input: ContextInput,
  self: Profile,
  extraUserMessage?: string,
  opts: { includeBinary?: boolean } = {},
): ChatMessage[] {
  const includeBinary = opts.includeBinary !== false;
  const raw: ChatMessage[] = [];
  for (const post of input.chain.filter(usable)) {
    const text = renderPost(post, input, includeBinary);
    const bin = includeBinary ? binaryPartsOf(post.attachments) : [];
    if (post.kind === 'model' && post.profileId === self.id && bin.length === 0) {
      raw.push({ role: 'assistant', content: text });
    } else {
      const labeled = `[${authorLabel(post, input.profiles)}]: ${text}`;
      raw.push({
        role: 'user',
        content: bin.length ? [{ type: 'text', text: labeled }, ...bin] : labeled,
      });
    }
  }
  if (extraUserMessage) raw.push({ role: 'user', content: extraUserMessage });
  let msgs = normalise(raw);
  if (msgs.length === 0 || msgs[msgs.length - 1].role === 'assistant') {
    msgs.push({ role: 'user', content: '[user]: Please continue.' });
  }
  // Trim oldest middle messages to fit, always keeping the opening post and latest turn.
  const size = () => msgs.reduce((n, m) => n + msgTextLength(m), 0);
  while (size() > MAX_TOTAL_CHARS && msgs.length > 2) {
    msgs.splice(1, 1);
    msgs = normalise(msgs);
  }
  return msgs;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function replySystemPrompt(self: Profile, others: Profile[]): string {
  const peers = others.filter((p) => p.id !== self.id).map((p) => `@${p.handle}`);
  return [
    `You are @${self.handle} (model: ${self.modelId}) on Dissentry, a timeline where a user posts and @mentions AI models.`,
    `Today's date is ${todayIso()}.`,
    peers.length ? `Other models here: ${peers.join(', ')}. All models in a thread share the same conversation memory; their posts appear labelled like [@name] and the user's appear as [user].` : '',
    'Reply to the latest post directly, using the full shared thread context (including prior answers, notes, and any attached files or images). Be accurate and concise; use Markdown when it helps.',
    'Other models may review your answer and attach correction notes, so state uncertainty honestly rather than guessing.',
    'Reply in the language of the latest user post.',
    self.systemPrompt?.trim() ? `\nAdditional instructions:\n${self.systemPrompt.trim()}` : '',
  ].filter(Boolean).join('\n');
}

export const CHECKER_SYSTEM = `You are a meticulous reviewer writing notes on another AI model's answer, in the spirit of crowd-sourced fact-check notes.

Write a note ONLY if the answer contains:
- a factual error or a wrong claim,
- incorrect code, commands or steps that would fail or cause harm,
- outdated information presented as current,
- a dangerous or misleading recommendation,
- or an omission so important that the reader would be misled.

Do NOT write notes about style, tone, length, formatting, or matters of opinion. If you are not confident the answer is wrong, do not write a note. Most good answers need no note.

Respond with ONLY a JSON object, no prose:
{"verdict":"ok"}
or
{"verdict":"note","notes":[{"claim":"<the problematic claim, quoted or closely paraphrased, max 200 chars>","correction":"<what is actually true and why, 1-4 sentences>","severity":"minor|major|critical"}]}

At most 3 notes. Write claim and correction in the same language as the answer.`;

export const checkerSystemPrompt = () => `${CHECKER_SYSTEM}\n\nToday's date is ${todayIso()}.`;

/** Single user message for a checker: the shared thread conversation plus the answer under review. */
export function buildCheckMessages(
  input: ContextInput,
  answer: Post,
  author: Profile,
  opts: { includeBinary?: boolean } = {},
): ChatMessage[] {
  const includeBinary = opts.includeBinary !== false;
  const usablePosts = input.chain.filter(usable);
  const convo = usablePosts
    .map((p) => `[${authorLabel(p, input.profiles)}]: ${renderPost(p, input, includeBinary)}`)
    .join('\n\n');
  const bin = includeBinary ? usablePosts.flatMap((p) => binaryPartsOf(p.attachments)) : [];
  const text = [
    'Conversation so far:',
    convo || '(none)',
    '',
    `Answer by @${author.handle} (${author.modelId}) to review:`,
    '<<<',
    clip(answer.text, 20000),
    '>>>',
    '',
    'Return the JSON verdict now.',
  ].join('\n');
  return [{ role: 'user', content: bin.length ? [{ type: 'text', text }, ...bin] : text }];
}
