/**
 * Live test against real providers, through Dissentry's own proxy code.
 * Skipped unless DISSENTRY_LIVE=1. Keys come from env vars and are never printed:
 *   OPENAI_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY, QWEN_API_KEY (+ optional *_MODEL, QWEN_BASE_URL)
 * Uses small models and maxRetries 0, so a run costs well under one US cent.
 */
import { generateText, streamText } from 'ai';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { buildCheckMessages, buildReplyMessages, CHECKER_SYSTEM, replySystemPrompt, type ContextInput } from '../src/lib/context';
import { findMatchingNote, parseCheckResult } from '../src/lib/notes';
import { languageModel } from '../src/lib/providers';
import type { CheckNoteDraft, Note, Post, Profile } from '../src/lib/types';

const LIVE = process.env.DISSENTRY_LIVE === '1';
const env = (k: string, d = '') => process.env[k] ?? d;

const app = createApp({ allowedHosts: ['localhost'] });
// Same path the browser uses: request → /api/proxy (Hono app) → provider.
const viaProxy: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const headers = new Headers(init?.headers);
  headers.set('x-dissentry-target', url);
  headers.set('host', 'localhost');
  return app.request('http://localhost/api/proxy', { ...init, headers });
};

const mk = (id: string, handle: string, baseUrl: string, modelId: string, apiKey: string): Profile => ({
  id, handle, name: handle, color: '#000', presetId: id, protocol: 'openai', baseUrl, modelId, apiKey,
  useProxy: true, systemPrompt: '', enabled: true, isChecker: true, createdAt: 0,
});

const all = [
  mk('openai', 'gpt', 'https://api.openai.com/v1', env('OPENAI_MODEL', 'gpt-6-luna'), env('OPENAI_API_KEY')),
  mk('xai', 'grok', 'https://api.x.ai/v1', env('GROK_MODEL', 'grok-4.3'), env('XAI_API_KEY')),
  mk('deepseek', 'deepseek', 'https://api.deepseek.com/v1', env('DEEPSEEK_MODEL', 'deepseek-flash'), env('DEEPSEEK_API_KEY')),
  mk('qwen', 'qwen', env('QWEN_BASE_URL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'), env('QWEN_MODEL', 'qwen-flash'), env('QWEN_API_KEY')),
].filter((p) => p.apiKey);
const profiles = new Map(all.map((p) => [p.id, p]));

const question: Post = { id: 'q', kind: 'user', text: 'In two sentences: why is the sky blue?', rootId: 'q', status: 'done', createdAt: 0 };
const wrongAnswer = (author: string): Post => ({ id: 'w', kind: 'model', profileId: author, parentId: 'q2', rootId: 'q2', status: 'done', createdAt: 1,
  text: 'Yes. The Great Wall of China is easily visible from the Moon with the naked eye. It is the only human-made structure visible from space.' });
const rightAnswer = (author: string): Post => ({ id: 'r', kind: 'model', profileId: author, parentId: 'q3', rootId: 'q3', status: 'done', createdAt: 1,
  text: 'Water boils at 100 °C at standard sea-level pressure (1 atm). At higher altitudes it boils at a lower temperature because air pressure is lower.' });

const t0 = () => performance.now();
const ms = (s: number) => `${Math.round(performance.now() - s)}ms`;

describe.skipIf(!LIVE)('live providers via proxy', () => {
  it('has keys', () => { expect(all.length).toBeGreaterThan(0); });

  for (const p of all) {
    it(`@${p.handle} (${p.modelId}) streams an answer`, async () => {
      const s = t0();
      const ctx: ContextInput = { chain: [question], quotes: {}, profiles };
      const r = streamText({ model: languageModel(p, viaProxy), system: replySystemPrompt(p, all), messages: buildReplyMessages(ctx, p), maxRetries: 0 });
      let text = '', chunks = 0;
      for await (const part of r.fullStream) {
        if (part.type === 'text-delta') { text += part.text; chunks++; }
        if (part.type === 'error') throw part.error;
      }
      console.log(`  ANSWER @${p.handle} ${ms(s)} ${chunks} chunks: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
      expect(text.length).toBeGreaterThan(20);
    }, 90_000);
  }

  it('checkers flag a planted error, pass a correct answer, and merge duplicate notes', async () => {
    const author = all[0];
    const checkers = all.length > 1 ? all.slice(1) : all;
    const q2: Post = { id: 'q2', kind: 'user', text: 'Can you see the Great Wall from space?', rootId: 'q2', status: 'done', createdAt: 0 };
    const q3: Post = { id: 'q3', kind: 'user', text: 'At what temperature does water boil?', rootId: 'q3', status: 'done', createdAt: 0 };
    const run = async (c: Profile, qPost: Post, ans: Post) => {
      const s = t0();
      let text = '';
      try {
        ({ text } = await generateText({
          model: languageModel(c, viaProxy), system: CHECKER_SYSTEM, maxRetries: 0,
          messages: buildCheckMessages({ chain: [qPost], quotes: {}, profiles }, ans, author),
        }));
        return { c, res: parseCheckResult(text), time: ms(s) };
      } catch (e) {
        // The app records this as "could not check" for that checker; log why.
        console.log(`  CHECK-ERROR @${c.handle}: ${(e as Error).message.slice(0, 200)} | raw: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
        return { c, res: { verdict: 'ok' as const, notes: [] }, time: ms(s), failed: true };
      }
    };
    const wrong = await Promise.all(checkers.map((c) => run(c, q2, wrongAnswer(author.id))));
    const right = await Promise.all(checkers.map((c) => run(c, q3, rightAnswer(author.id))));

    // Merge exactly like the engine does.
    const notes: Note[] = [];
    for (const { c, res } of wrong) {
      for (const d of res.notes as CheckNoteDraft[]) {
        const m = findMatchingNote(notes, d, c.id);
        if (m) m.agreeProfileIds.push(c.id);
        else notes.push({ id: `${c.id}-${notes.length}`, postId: 'w', profileId: c.id, agreeProfileIds: [], ...d, status: 'open', createdAt: 0 });
      }
    }
    for (const { c, res, time } of wrong) console.log(`  CHECK wrong  @${c.handle} ${time}: ${res.verdict} ${res.notes.map((n) => `[${n.severity}] ${n.claim.slice(0, 70)}`).join(' | ')}`);
    for (const { c, res, time } of right) console.log(`  CHECK right  @${c.handle} ${time}: ${res.verdict} ${res.notes.map((n) => `[${n.severity}] ${n.claim.slice(0, 70)}`).join(' | ')}`);
    console.log(`  MERGED: ${wrong.reduce((n, w) => n + w.res.notes.length, 0)} raw notes → ${notes.length} shown:`);
    for (const n of notes) console.log(`    @${profiles.get(n.profileId)?.handle}${n.agreeProfileIds.map((a) => ` · @${profiles.get(a)?.handle}`).join('')} agree [${n.severity}] ${n.claim.slice(0, 80)}`);

    expect([...wrong, ...right].filter((x) => 'failed' in x)).toHaveLength(0);
    expect(wrong.filter((w) => w.res.verdict === 'note').length).toBeGreaterThanOrEqual(Math.ceil(checkers.length / 2));
    expect(right.filter((r) => r.res.verdict === 'ok' && !('failed' in r)).length).toBeGreaterThanOrEqual(Math.ceil(checkers.length / 2));
  }, 120_000);
});
