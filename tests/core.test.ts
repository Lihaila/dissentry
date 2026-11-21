import { describe, expect, it } from 'vitest';
import { buildCheckMessages, buildReplyMessages, type ContextInput } from '../src/lib/context';
import { mentionQueryAt, parseMentions, toHandle } from '../src/lib/mentions';
import { findMatchingNote, noteSimilarity, parseCheckResult } from '../src/lib/notes';
import { computeTrust } from '../src/lib/trust';
import type { Note, Post, Profile } from '../src/lib/types';

const prof = (id: string, handle: string): Profile => ({
  id, handle, name: handle, color: '#000', presetId: 'custom', protocol: 'openai', baseUrl: 'http://x', modelId: `${handle}-model`,
  apiKey: '', useProxy: false, systemPrompt: '', enabled: true, isChecker: true, createdAt: 0,
});
const claude = prof('c', 'claude');
const qwen = prof('q', 'qwen');
const profiles = new Map([[claude.id, claude], [qwen.id, qwen]]);
let t = 0;
const post = (p: Partial<Post> & Pick<Post, 'id' | 'kind' | 'text'>): Post => ({ rootId: 'r', status: 'done', createdAt: t++, ...p });

describe('mentions', () => {
  const known = ['claude', 'qwen', 'llama'];
  it('finds known handles in order, ignoring emails and unknowns', () => {
    expect(parseMentions('hey @Qwen and @claude, cc me@claude.com @nobody', known)).toEqual(['qwen', 'claude']);
  });
  it('expands @all and dedupes', () => {
    expect(parseMentions('@claude @all', known)).toEqual(['claude', 'qwen', 'llama']);
  });
  it('strips trailing punctuation', () => {
    expect(parseMentions('ask @llama.', known)).toEqual(['llama']);
  });
  it('detects the partial mention at the caret', () => {
    expect(mentionQueryAt('hello @cl', 9)).toEqual({ query: 'cl', start: 6 });
    expect(mentionQueryAt('mail a@b', 8)).toBeNull();
  });
  it('normalises handles', () => {
    expect(toHandle(' Claude Opus ')).toBe('claude-opus');
  });
});

describe('context builder', () => {
  const q1 = post({ id: 'u1', kind: 'user', text: '@claude @qwen what is 2+2?' });
  const a1 = post({ id: 'a1', kind: 'model', profileId: 'c', parentId: 'u1', text: '5' });
  const u2 = post({ id: 'u2', kind: 'user', parentId: 'a1', text: 'are you sure?' });

  it('maps own posts to assistant and labels everyone else', () => {
    const input: ContextInput = { chain: [q1, a1, u2], quotes: {}, profiles };
    expect(buildReplyMessages(input, claude)).toEqual([
      { role: 'user', content: '[user]: @claude @qwen what is 2+2?' },
      { role: 'assistant', content: '5' },
      { role: 'user', content: '[user]: are you sure?' },
    ]);
    const forQwen = buildReplyMessages(input, qwen);
    expect(forQwen).toHaveLength(1);
    expect(forQwen[0].content).toContain('[@claude]: 5');
  });

  it('inlines a quoted exchange into the quoting post', () => {
    const quote = post({ id: 'qp', kind: 'user', text: '@qwen critique this', quoteOfId: 'a1', rootId: 'qp' });
    const msgs = buildReplyMessages({ chain: [quote], quotes: { a1: [q1, a1] }, profiles }, qwen);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toMatch(/critique this[\s\S]*> \[user\]: @claude @qwen what is 2\+2\?[\s\S]*> \[@claude\]: 5/);
  });

  it('starts with a user turn and ends with a user turn', () => {
    const msgs = buildReplyMessages({ chain: [a1], quotes: {}, profiles }, claude);
    expect(msgs[0].role).toBe('user');
    expect(msgs[msgs.length - 1].role).toBe('user');
  });

  it('skips errored posts and appends the extra message', () => {
    const bad = post({ id: 'x', kind: 'model', profileId: 'q', text: 'partial', status: 'error' });
    const msgs = buildReplyMessages({ chain: [q1, bad, a1], quotes: {}, profiles }, claude, 'note: it is 4');
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[2].content).toBe('note: it is 4');
  });

  it('check prompt contains the conversation and the answer', () => {
    const [m] = buildCheckMessages({ chain: [q1], quotes: {}, profiles }, a1, claude);
    expect(m.content).toContain('[user]: @claude @qwen what is 2+2?');
    expect(m.content).toContain('Answer by @claude (claude-model) to review:\n<<<\n5\n>>>');
  });
});

describe('checker output parsing', () => {
  it('parses fenced JSON with chatter and think tags', () => {
    const out = '<think>hmm {not json}</think>Sure!\n```json\n{"verdict":"note","notes":[{"claim":"2+2=5","correction":"2+2=4.","severity":"MAJOR"}]}\n```';
    expect(parseCheckResult(out)).toEqual({ verdict: 'note', notes: [{ claim: '2+2=5', correction: '2+2=4.', severity: 'major' }] });
  });
  it('handles braces inside strings', () => {
    const r = parseCheckResult('{"verdict":"note","notes":[{"claim":"use {x}","correction":"use {y} } instead","severity":"minor"}]}');
    expect(r.notes[0].correction).toBe('use {y} } instead');
  });
  it('treats a note verdict without notes as ok and unknown severity as minor', () => {
    expect(parseCheckResult('{"verdict":"note","notes":[]}')).toEqual({ verdict: 'ok', notes: [] });
    expect(parseCheckResult('{"verdict":"note","notes":[{"claim":"a","correction":"b","severity":"huge"}]}').notes[0].severity).toBe('minor');
  });
  it('throws when there is no JSON', () => {
    expect(() => parseCheckResult('looks fine to me')).toThrow();
  });
});

describe('note merging', () => {
  const base: Note = {
    id: 'n1', postId: 'a1', profileId: 'q', agreeProfileIds: [], status: 'open', createdAt: 0, severity: 'minor',
    claim: 'Step 3 deletes the old access key before the new key is deployed',
    correction: 'Deleting the old key first causes downtime; deactivate it after the new key is live.',
  };
  it('merges a paraphrase of the same problem', () => {
    const draft = { claim: 'deletes the old access key before deploying the new key', correction: 'This causes downtime. Deactivate the old key only after the new key is live.', severity: 'major' as const };
    expect(noteSimilarity(base, draft)).toBeGreaterThanOrEqual(0.5);
    expect(findMatchingNote([base], draft, 'g')?.id).toBe('n1');
  });
  it('does not merge unrelated notes, or a checker with itself', () => {
    const other = { claim: 'IAM roles cannot be used with Lambda', correction: 'Lambda functions use execution roles routinely.', severity: 'minor' as const };
    expect(findMatchingNote([base], other, 'g')).toBeUndefined();
    expect(findMatchingNote([base], { ...base }, 'q')).toBeUndefined();
  });
  it('works for Chinese text', () => {
    const zh: Note = { ...base, claim: '长城在太空中肉眼可见', correction: '长城在太空中肉眼不可见，这是常见误解。' };
    expect(findMatchingNote([zh], { claim: '从太空肉眼可以看到长城', correction: '实际上肉眼看不到长城。', severity: 'minor' }, 'g')?.id).toBe('n1');
  });
});

describe('trust', () => {
  it('counts corrections and checker precision', () => {
    const posts = [post({ id: 'a1', kind: 'model', profileId: 'c', text: 'x' }), post({ id: 'a2', kind: 'model', profileId: 'c', text: 'y' })];
    const notes: Note[] = [{ id: 'n', postId: 'a1', profileId: 'q', agreeProfileIds: [], claim: 'x', correction: 'z', severity: 'minor', status: 'accepted', createdAt: 0 }];
    const checks = [
      { postId: 'a1', profileId: 'q', verdict: 'note' as const, createdAt: 0 },
      { postId: 'a2', profileId: 'q', verdict: 'ok' as const, createdAt: 0 },
    ];
    const rows = computeTrust([claude, qwen], posts, notes, checks);
    const c = rows.find((r) => r.profile.id === 'c')!;
    const q = rows.find((r) => r.profile.id === 'q')!;
    expect([c.answers, c.checkedAnswers, c.correctedAnswers]).toEqual([2, 2, 1]);
    expect([q.checksRun, q.notesWritten, q.notesAccepted]).toEqual([2, 1, 1]);
  });
});

import { markClaims } from '../src/lib/claims';
describe('markClaims', () => {
  const note = (claim: string, status: 'open' | 'dismissed' = 'open') => ({ claim, status });
  it('wraps a disputed sentence even across bold markers', () => {
    const md = 'Yes — the **Great Wall of China is visible from space with the naked eye**, and more.';
    expect(markClaims(md, [note('The Great Wall of China is visible from space with the naked eye')]))
      .toBe('Yes — ~~the Great Wall of China is visible from space with the naked eye~~, and more.');
  });
  it('falls back to the best-matching sentence when the checker paraphrased', () => {
    const md = 'Yes — the **Great Wall of China is visible from space with the naked eye**. It is 21,196 km long.';
    expect(markClaims(md, [note('The Great Wall is visible from space with the naked eye')]))
      .toBe('~~Yes — the Great Wall of China is visible from space with the naked eye.~~ It is 21,196 km long.');
  });
  it('ignores dismissed notes, short claims, code blocks and non-matches', () => {
    const md = 'Text here.\n```\nGreat Wall visible\n```';
    expect(markClaims(md, [note('Great Wall visible')])).toBe(md);
    expect(markClaims('abc def ghi jkl', [note('abc def ghi', 'dismissed')])).toBe('abc def ghi jkl');
    expect(markClaims('hello world', [note('something else entirely')])).toBe('hello world');
  });
});

import { costOf, fmtCost, fmtTokens, summarize } from '../src/lib/usage';
describe('usage', () => {
  it('costs and formats', () => {
    expect(costOf({ input: 1_000_000, output: 500_000 }, { inPrice: 2, outPrice: 10 })).toBe(7);
    expect(costOf({ input: 10, output: 10 }, {})).toBeUndefined();
    expect(fmtTokens(950)).toBe('950'); expect(fmtTokens(1234)).toBe('1.2k'); expect(fmtTokens(2_500_000)).toBe('2.50M');
    expect(fmtCost(0.00213)).toBe('$0.0021'); expect(fmtCost(0.5)).toBe('$0.500'); expect(fmtCost(12.3)).toBe('$12.30');
  });
  it('splits answering vs checking and flags unpriced models', () => {
    const a = { ...claude, inPrice: 1, outPrice: 1 };
    const posts = [post({ id: 'x', kind: 'model', profileId: 'c', text: 'hi', usage: { input: 1000, output: 1000 } })];
    const checks = [{ postId: 'x', profileId: 'q', verdict: 'ok' as const, usage: { input: 500, output: 10 }, createdAt: Date.now() }];
    const s = summarize([a, qwen], posts, checks);
    expect(s.total.answerTokens).toBe(2000);
    expect(s.total.checkTokens).toBe(510);
    expect(s.rows.find((r) => r.profile.id === 'c')!.cost).toBeCloseTo(0.002);
    expect(s.total.priced).toBe(false);
  });
});
