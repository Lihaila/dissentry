import type { Post, Profile } from './types';

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface ContextInput {
  /** Posts from the thread root down to the post being replied to (inclusive). */
  chain: Post[];
  /** For any post with quoteOfId: the quoted post's own chain (root → quoted post). */
  quotes: Record<string, Post[]>;
  profiles: Map<string, Profile>;
}

const MAX_POST_CHARS = 6000;
const MAX_TOTAL_CHARS = 60000;

const clip = (s: string, n = MAX_POST_CHARS) => (s.length > n ? s.slice(0, n) + '\n…[truncated]' : s);

export function authorLabel(post: Post, profiles: Map<string, Profile>): string {
  if (post.kind === 'user') return 'user';
  const p = post.profileId ? profiles.get(post.profileId) : undefined;
  return p ? `@${p.handle}` : '@unknown-model';
}

function usable(p: Post) {
  return p.text.trim().length > 0 && p.status !== 'error';
}

/** Text of a post including any quoted post, as the model should see it. */
export function renderPost(post: Post, input: ContextInput): string {
  let body = clip(post.text);
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
  return body;
}

function normalise(msgs: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push({ ...m });
  }
  if (merged[0]?.role === 'assistant') merged.unshift({ role: 'user', content: '[user]: (conversation start)' });
  return merged;
}

/** Build the message list for `self` to reply to the last post of `chain`. */
export function buildReplyMessages(input: ContextInput, self: Profile, extraUserMessage?: string): ChatMessage[] {
  const raw: ChatMessage[] = [];
  for (const post of input.chain.filter(usable)) {
    const content = renderPost(post, input);
    if (post.kind === 'model' && post.profileId === self.id) raw.push({ role: 'assistant', content });
    else raw.push({ role: 'user', content: `[${authorLabel(post, input.profiles)}]: ${content}` });
  }
  if (extraUserMessage) raw.push({ role: 'user', content: extraUserMessage });
  let msgs = normalise(raw);
  if (msgs.length === 0 || msgs[msgs.length - 1].role === 'assistant') {
    msgs.push({ role: 'user', content: '[user]: Please continue.' });
  }
  // Trim oldest middle messages to fit, always keeping the opening post.
  const size = () => msgs.reduce((n, m) => n + m.content.length, 0);
  while (size() > MAX_TOTAL_CHARS && msgs.length > 2) {
    msgs.splice(1, 1);
    msgs = normalise(msgs);
  }
  return msgs;
}

export function replySystemPrompt(self: Profile, others: Profile[]): string {
  const peers = others.filter((p) => p.id !== self.id).map((p) => `@${p.handle}`);
  return [
    `You are @${self.handle} (model: ${self.modelId}) on Dissentry, a timeline where a user posts and @mentions AI models.`,
    peers.length ? `Other models here: ${peers.join(', ')}. Their posts appear labelled like [@name]; the user's appear as [user].` : '',
    'Reply to the latest post directly, like a knowledgeable reply in a thread. Be accurate and concise; use Markdown when it helps.',
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

/** Single user message for a checker: the conversation plus the answer under review. */
export function buildCheckMessages(input: ContextInput, answer: Post, author: Profile): ChatMessage[] {
  const convo = input.chain.filter(usable)
    .map((p) => `[${authorLabel(p, input.profiles)}]: ${renderPost(p, input)}`)
    .join('\n\n');
  const content = [
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
  return [{ role: 'user', content }];
}
