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

import { generateText } from 'ai';
import { splitInlineThink } from '../src/lib/engine';
import { classifyFile, fmtBytes, readAvatarImage } from '../src/lib/files';
import { generateMedia, pcmToWavDataUrl } from '../src/lib/media';
import {
  detectModelKind,
  isMediaUnsupportedError,
  isNonChatModel,
  isReasoningUnsupportedError,
  isSearchUnsupportedError,
  listModelOptions,
  modelCall,
  profileWebSearchEnabled,
  supportsWebSearch,
} from '../src/lib/providers';
describe('web search & deepthink provider wiring', () => {
  const mk = (protocol: Profile['protocol'], baseUrl: string, modelId = 'm', extra: Partial<Profile> = {}): Profile => ({
    ...claude, protocol, baseUrl, modelId, apiKey: 'k', ...extra,
  });
  it('identifies providers with native web search and respects per-model webSearch toggle', () => {
    expect(supportsWebSearch(mk('openai', 'https://openrouter.ai/api/v1'))).toBe(true);
    expect(supportsWebSearch(mk('google', 'https://generativelanguage.googleapis.com/v1beta'))).toBe(true);
    expect(supportsWebSearch(mk('anthropic', 'https://api.anthropic.com/v1'))).toBe(true);
    expect(supportsWebSearch(mk('openai', 'https://api.openai.com/v1'))).toBe(true);
    expect(supportsWebSearch(mk('openai', 'https://api.x.ai/v1'))).toBe(true);
    expect(supportsWebSearch(mk('openai', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'))).toBe(true);
    expect(supportsWebSearch(mk('openai', 'http://localhost:11434/v1'))).toBe(false);
    expect(supportsWebSearch(mk('openai', 'https://api.deepseek.com/v1'))).toBe(false);
    expect(profileWebSearchEnabled(mk('openai', 'https://openrouter.ai/api/v1', 'm', { webSearch: false }))).toBe(false);
    expect(profileWebSearchEnabled(mk('openai', 'https://openrouter.ai/api/v1', 'm', { webSearch: true }))).toBe(true);
  });
  it('sends the right web-search and deepthink payloads on the wire for each provider', async () => {
    async function capture(profile: Profile, opts: { webSearch?: boolean; deepThink?: boolean }) {
      let url = '';
      let body: Record<string, unknown> = {};
      const fakeFetch: typeof fetch = async (input, init) => {
        url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ error: { message: 'stop' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      };
      const call = modelCall(profile, { ...opts, fetchImpl: fakeFetch });
      await generateText({
        model: call.model,
        tools: call.tools,
        reasoning: call.reasoning,
        providerOptions: call.providerOptions,
        prompt: 'weather?',
        maxRetries: 0,
      }).catch(() => {});
      return { url, body, call };
    }

    const orOn = await capture(mk('openai', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash-1017'), { webSearch: true });
    expect(orOn.call.searchActive).toBe(true);
    expect(orOn.call.thinkActive).toBe(false);
    expect(orOn.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(orOn.body.plugins).toEqual([{ id: 'web' }]);
    expect(orOn.body.reasoning).toBeUndefined();

    const orBoth = await capture(mk('openai', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash-1017'), { webSearch: true, deepThink: true });
    expect(orBoth.call.searchActive).toBe(true);
    expect(orBoth.call.thinkActive).toBe(true);
    expect(orBoth.body.plugins).toEqual([{ id: 'web' }]);
    expect(orBoth.body.reasoning).toEqual({ effort: 'high' });

    const orModelWebOff = await capture(mk('openai', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash-1017', { webSearch: false }), { webSearch: true });
    expect(orModelWebOff.call.searchActive).toBe(false);
    expect(orModelWebOff.body.plugins).toBeUndefined();

    const orModelThinkOn = await capture(mk('openai', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash-1017', { deepThink: true }), {});
    expect(orModelThinkOn.call.thinkActive).toBe(true);
    expect(orModelThinkOn.body.reasoning).toEqual({ effort: 'high' });

    const orThinkFallbackOff = await capture(mk('openai', 'https://openrouter.ai/api/v1', 'deepseek/deepseek-v4.1-flash-1017', { deepThink: true }), { deepThink: false });
    expect(orThinkFallbackOff.call.thinkActive).toBe(false);
    expect(orThinkFallbackOff.body.reasoning).toBeUndefined();

    const qwenBoth = await capture(mk('openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-flash'), { webSearch: true, deepThink: true });
    expect(qwenBoth.body.enable_search).toBe(true);
    expect(qwenBoth.body.enable_thinking).toBe(true);

    const dsThink = await capture(mk('openai', 'https://api.deepseek.com/v1', 'deepseek-chat'), { deepThink: true });
    expect(dsThink.call.thinkActive).toBe(true);
    expect(dsThink.body.thinking).toEqual({ type: 'enabled' });

    const oaBoth = await capture(mk('openai', 'https://api.openai.com/v1', 'gpt-6-luna'), { webSearch: true, deepThink: true });
    expect(oaBoth.url).toBe('https://api.openai.com/v1/responses');
    expect((oaBoth.body.tools as Array<{ type: string }>)?.[0]?.type).toBe('web_search');
    expect(oaBoth.body.reasoning).toMatchObject({ summary: 'auto' });

    const xaiOn = await capture(mk('openai', 'https://api.x.ai/v1', 'grok-4.3'), { webSearch: true });
    expect(xaiOn.url).toBe('https://api.x.ai/v1/responses');
    expect((xaiOn.body.tools as Array<{ type: string }>)?.[0]?.type).toBe('web_search');

    const gBoth = await capture(mk('google', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-3.5-flash'), { webSearch: true, deepThink: true });
    expect(JSON.stringify(gBoth.body.tools)).toContain('googleSearch');
    expect(JSON.stringify(gBoth.body.generationConfig)).toContain('includeThoughts');

    const aBoth = await capture(mk('anthropic', 'https://api.anthropic.com/v1', 'claude-sonnet-5-5'), { webSearch: true, deepThink: true });
    expect((aBoth.body.tools as Array<{ type: string }>)?.[0]?.type).toBe('web_search_20250305');
    expect(aBoth.body.thinking).toBeDefined();

    const ollamaOn = await capture(mk('openai', 'http://localhost:11434/v1', 'qwen3', { presetId: 'ollama' }), { webSearch: true, deepThink: true });
    expect(ollamaOn.call.searchActive).toBe(false);
    expect(ollamaOn.call.thinkActive).toBe(true);
    expect(ollamaOn.body.plugins).toBeUndefined();
    expect(ollamaOn.body.think).toBe(true);
  });
  it('detects unsupported search, reasoning, and media errors without catching auth or rate-limit errors', () => {
    expect(isSearchUnsupportedError({ statusCode: 400, message: 'web_search tool is not supported for this model' })).toBe(true);
    expect(isSearchUnsupportedError({ statusCode: 401, message: 'Invalid API key' })).toBe(false);
    expect(isSearchUnsupportedError({ statusCode: 429, message: 'rate limit exceeded' })).toBe(false);

    expect(isReasoningUnsupportedError({ statusCode: 400, message: 'Unknown parameter: reasoning_effort' })).toBe(true);
    expect(isReasoningUnsupportedError({ statusCode: 400, message: 'Model does not support thinking' })).toBe(true);
    expect(isReasoningUnsupportedError({ statusCode: 401, message: 'Invalid API key' })).toBe(false);

    expect(isMediaUnsupportedError({ statusCode: 400, message: 'This model does not support image_url inputs' })).toBe(true);
    expect(isMediaUnsupportedError({ statusCode: 429, message: 'quota exceeded' })).toBe(false);
  });

  it('parses model lists with names and OpenRouter pricing', async () => {
    const fakeOrFetch: typeof fetch = async () => new Response(JSON.stringify({
      data: [
        { id: 'openai/gpt-6', name: 'OpenAI: GPT-6', pricing: { prompt: '0.000002', completion: '0.000008' } },
        { id: 'anthropic/claude-sonnet', name: 'Anthropic: Claude Sonnet', pricing: { prompt: '0.000003', completion: '0.000015' } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const list = await listModelOptions(
      { protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1/', apiKey: 'k', useProxy: false },
      fakeOrFetch,
    );
    expect(list).toEqual([
      { id: 'anthropic/claude-sonnet', name: 'Anthropic: Claude Sonnet', inPrice: 3, outPrice: 15, kind: 'chat' },
      { id: 'openai/gpt-6', name: 'OpenAI: GPT-6', inPrice: 2, outPrice: 8, kind: 'chat' },
    ]);
  });

  it('classifies models into chat, image, audio, video, and other', () => {
    expect(detectModelKind('qwen-image-plus')).toBe('image');
    expect(detectModelKind('qwen-image-edit')).toBe('image');
    expect(detectModelKind('wanx2.1-t2i-turbo')).toBe('image');
    expect(detectModelKind('dall-e-3')).toBe('image');
    expect(detectModelKind('gpt-image-1')).toBe('image');
    expect(detectModelKind('imagen-4.0-generate-001')).toBe('image');
    expect(detectModelKind('qwen3-tts-flash')).toBe('audio');
    expect(detectModelKind('tts-1-hd')).toBe('audio');
    expect(detectModelKind('gemini-2.5-flash-preview-tts')).toBe('audio');
    expect(detectModelKind('wan2.6-t2v')).toBe('video');
    expect(detectModelKind('wan2.7-t2v')).toBe('video');
    expect(detectModelKind('wan2.7-videoedit')).toBe('video');
    expect(detectModelKind('wan2.7-image')).toBe('image');
    expect(detectModelKind('wan2.7-image-pro')).toBe('image');
    expect(detectModelKind('sora-2')).toBe('video');
    expect(detectModelKind('veo-3.0-generate-001')).toBe('video');
    expect(detectModelKind('text-embedding-v3')).toBe('other');
    expect(detectModelKind('whisper-1')).toBe('other');

    expect(isNonChatModel('qwen-image-plus')).toBe(true);
    expect(detectModelKind('qwen-plus')).toBe('chat');
    expect(detectModelKind('qwen-vl-max')).toBe('chat');
    expect(detectModelKind('qwen3-vl-plus')).toBe('chat');
    expect(detectModelKind('qwen3.5-plus')).toBe('chat');
    expect(detectModelKind('claude-sonnet-5-5')).toBe('chat');
    expect(detectModelKind('gpt-4o')).toBe('chat');
    expect(detectModelKind('gemini-3.5-flash')).toBe('chat');
  });

  it('generates images, audio, and video across Qwen DashScope, OpenAI, Google, and OpenRouter', async () => {
    const qwenProf = mk('openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-image-plus', { kind: 'image' });
    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const qwenImgFetch: typeof fetch = async (u, init) => {
      const url = String(u);
      if (url.includes('multimodal-generation')) {
        capturedUrl = url;
        capturedBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          output: { choices: [{ message: { content: [{ image: 'https://oss.example/img.png' }] } }] },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
    };
    const qImg = await generateMedia({ profile: qwenProf, kind: 'image', prompt: 'a red panda', fetchImpl: qwenImgFetch });
    expect(capturedUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(capturedBody.model).toBe('qwen-image-plus');
    expect(qImg.media[0].kind).toBe('image');
    expect(qImg.media[0].url).toMatch(/^data:image\/png;base64,/);

    const wanImgProf = mk('openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'wan2.7-image-pro', { kind: 'image' });
    let wanImgUrl = '';
    const wanImg = await generateMedia({
      profile: wanImgProf,
      kind: 'image',
      prompt: 'mountain lake',
      fetchImpl: async (u) => {
        const url = String(u);
        if (url.includes('multimodal-generation')) {
          wanImgUrl = url;
          return new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ image: 'data:image/png;base64,CCCC' }] } }] } }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('', { status: 404 });
      },
    });
    expect(wanImgUrl).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    expect(wanImg.media[0].url).toBe('data:image/png;base64,CCCC');

    const qwenTtsProf = mk('openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3-tts-flash', { kind: 'audio' });
    const qwenTtsFetch: typeof fetch = async (u) => {
      if (String(u).includes('multimodal-generation')) {
        return new Response(JSON.stringify({ output: { audio: { url: 'https://oss.example/a.wav' } } }), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { 'content-type': 'audio/wav' } });
    };
    const qAudio = await generateMedia({ profile: qwenTtsProf, kind: 'audio', prompt: 'hello', fetchImpl: qwenTtsFetch });
    expect(qAudio.media[0].kind).toBe('audio');
    expect(qAudio.media[0].url).toMatch(/^data:audio\/wav;base64,/);

    const oaImgProf = mk('openai', 'https://api.openai.com/v1', 'gpt-image-1', { kind: 'image' });
    const oaImg = await generateMedia({
      profile: oaImgProf,
      kind: 'image',
      prompt: 'sunset',
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ b64_json: 'AAAA', revised_prompt: 'vivid sunset' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    });
    expect(oaImg.media[0].url).toBe('data:image/png;base64,AAAA');
    expect(oaImg.text).toBe('vivid sunset');

    const oaTtsProf = mk('openai', 'https://api.openai.com/v1', 'tts-1', { kind: 'audio' });
    const oaAudio = await generateMedia({
      profile: oaTtsProf,
      kind: 'audio',
      prompt: 'say hi',
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    });
    expect(oaAudio.media[0].url).toMatch(/^data:audio\/mpeg;base64,/);

    const gTtsProf = mk('google', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash-preview-tts', { kind: 'audio' });
    const gAudio = await generateMedia({
      profile: gTtsProf,
      kind: 'audio',
      prompt: 'test',
      fetchImpl: async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: 'AAAAAA==' } }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    expect(gAudio.media[0].mediaType).toBe('audio/wav');
    expect(gAudio.media[0].url.startsWith('data:audio/wav;base64,UklGR')).toBe(true); // RIFF header
    expect(pcmToWavDataUrl('AAAAAA==', 24000).startsWith('data:audio/wav;base64,UklGR')).toBe(true);

    const orImgProf = mk('openai', 'https://openrouter.ai/api/v1', 'google/gemini-2.5-flash-image-preview', { kind: 'image' });
    const orImg = await generateMedia({
      profile: orImgProf,
      kind: 'image',
      prompt: 'cat',
      fetchImpl: async () => new Response(JSON.stringify({
        choices: [{ message: { content: 'Here is a cat', images: [{ image_url: { url: 'data:image/png;base64,BBBB' } }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    });
    expect(orImg.media[0].url).toBe('data:image/png;base64,BBBB');
    expect(orImg.text).toBe('Here is a cat');

    const oaVidProf = mk('openai', 'https://api.openai.com/v1', 'sora-2', { kind: 'video' });
    const oaVid = await generateMedia({
      profile: oaVidProf,
      kind: 'video',
      prompt: 'ocean waves',
      fetchImpl: async (u) => {
        if (String(u).endsWith('/videos')) {
          return new Response(JSON.stringify({ id: 'vid_1', status: 'completed' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(new Uint8Array([0, 0, 0, 24]), { status: 200, headers: { 'content-type': 'video/mp4' } });
      },
    });
    expect(oaVid.media[0].kind).toBe('video');
    expect(oaVid.media[0].blob).toBeInstanceOf(Blob);
  });
});

describe('inline think extraction, files & multimodal context', () => {
  it('lifts inline <think> blocks both while streaming and when closed', () => {
    expect(splitInlineThink('<think>step 1\nstep 2', '')).toEqual({ text: '', reasoning: 'step 1\nstep 2' });
    expect(splitInlineThink('<think>step 1</think>\nFinal answer.', '')).toEqual({ text: 'Final answer.', reasoning: 'step 1' });
    expect(splitInlineThink('Plain answer', 'native thought')).toEqual({ text: 'Plain answer', reasoning: 'native thought' });
  });

  it('classifies images, PDFs, and text/code files and formats byte sizes', () => {
    expect(classifyFile({ name: 'photo.png', type: 'image/png' })).toBe('image');
    expect(classifyFile({ name: 'report.pdf', type: 'application/pdf' })).toBe('pdf');
    expect(classifyFile({ name: 'app.tsx', type: '' })).toBe('text');
    expect(classifyFile({ name: 'archive.zip', type: 'application/zip' })).toBeNull();
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
    expect(fmtBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('validates user avatar uploads (rejects non-images and oversized files)', async () => {
    const bad = new File(['hello'], 'note.txt', { type: 'text/plain' });
    await expect(readAvatarImage(bad)).rejects.toThrow('unsupported');
    const huge = { name: 'big.png', type: 'image/png', size: 20 * 1024 * 1024 } as File;
    await expect(readAvatarImage(huge)).rejects.toThrow('tooBig');
  });

  it('builds multimodal reply & check messages with attachments and non-dismissed dissent notes', () => {
    const imgPost = post({
      id: 'u1',
      kind: 'user',
      text: '@claude inspect these',
      attachments: [
        { id: 'f1', name: 'main.py', mediaType: 'text/plain', size: 22, kind: 'text', text: 'print("hello world")' },
        { id: 'f2', name: 'shot.png', mediaType: 'image/png', size: 1000, kind: 'image', dataUrl: 'data:image/png;base64,AAAA' },
        { id: 'f3', name: 'doc.pdf', mediaType: 'application/pdf', size: 5000, kind: 'file', dataUrl: 'data:application/pdf;base64,BBBB' },
      ],
    });
    const ans = post({ id: 'a1', kind: 'model', profileId: 'c', parentId: 'u1', text: 'It prints goodbye.' });
    const follow = post({ id: 'u2', kind: 'user', parentId: 'a1', text: '@qwen check again' });
    const openNote: Note = {
      id: 'n1', postId: 'a1', profileId: 'q', agreeProfileIds: [], claim: 'goodbye', correction: 'It prints hello world.', severity: 'major', status: 'accepted', createdAt: 0,
    };
    const dismissedNote: Note = {
      id: 'n2', postId: 'a1', profileId: 'q', agreeProfileIds: [], claim: 'style', correction: 'ignore me', severity: 'minor', status: 'dismissed', createdAt: 0,
    };

    const msgs = buildReplyMessages({ chain: [imgPost, ans, follow], quotes: {}, notes: { a1: [openNote, dismissedNote] }, profiles }, qwen);
    expect(msgs).toHaveLength(1);
    expect(Array.isArray(msgs[0].content)).toBe(true);
    const parts = msgs[0].content as Array<{ type: string; text?: string }>;
    expect(parts.some((p) => p.type === 'image')).toBe(true);
    expect(parts.some((p) => p.type === 'file')).toBe(true);
    const combinedText = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    expect(combinedText).toContain('print("hello world")');
    expect(combinedText).toContain('It prints hello world.');
    expect(combinedText).not.toContain('ignore me');

    const textOnly = buildReplyMessages({ chain: [imgPost], quotes: {}, profiles }, qwen, undefined, { includeBinary: false });
    expect(typeof textOnly[0].content).toBe('string');
    expect(textOnly[0].content).toContain('not shown to text-only model');

    const [checkMsg] = buildCheckMessages({ chain: [imgPost], quotes: {}, profiles }, ans, claude);
    expect(Array.isArray(checkMsg.content)).toBe(true);
    const [checkTextOnly] = buildCheckMessages({ chain: [imgPost], quotes: {}, profiles }, ans, claude, { includeBinary: false });
    expect(typeof checkTextOnly.content).toBe('string');
  });
});
