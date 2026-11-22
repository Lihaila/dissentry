import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { callMcpTool, handleMcpHttpRequest, handleMcpMessage, MCP_TOOLS } from '../server/mcp';
import type { Check, Note, Post, Profile } from '../src/lib/types';

function makeProfile(overrides: Partial<Profile> & Pick<Profile, 'id' | 'handle' | 'modelId'>): Profile {
  return {
    name: overrides.handle.toUpperCase(),
    color: '#0f172a',
    presetId: 'openai',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-secret-do-not-leak',
    useProxy: false,
    systemPrompt: '',
    enabled: true,
    isChecker: true,
    webSearch: false,
    deepThink: false,
    createdAt: 1000,
    ...overrides,
  };
}

function mockOpenAiChatFetch(responder: (body: { model?: string; messages?: Array<{ role: string; content: string }> }, url: string) => string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const text = responder(body, url);
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? 'test-model',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

describe('Dissentry MCP server (stdio & Streamable HTTP)', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dissentry-mcp-test-'));
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('handles MCP handshake, tools/list, empty resources/prompts probes, notifications, and unknown methods', async () => {
    const init = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dsh', version: '1.0' } },
    });
    expect(init?.result).toMatchObject({
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'dissentry' },
    });

    // Notifications must return null (no JSON-RPC reply).
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();

    const ping = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'ping' });
    expect(ping?.result).toEqual({});

    const list = await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const tools = (list?.result as { tools: typeof MCP_TOOLS }).tools;
    expect(tools.map((t) => t.name)).toEqual([
      'dissentry_list_models',
      'dissentry_check',
      'dissentry_ask',
      'dissentry_trust',
    ]);

    // Compatibility probes used by WorkBuddy / Qwen Work / Claude Desktop.
    expect((await handleMcpMessage({ jsonrpc: '2.0', id: 4, method: 'resources/list' }))?.result).toEqual({ resources: [] });
    expect((await handleMcpMessage({ jsonrpc: '2.0', id: 5, method: 'prompts/list' }))?.result).toEqual({ prompts: [] });

    const missing = await handleMcpMessage({ jsonrpc: '2.0', id: 6, method: 'unknown/method' });
    expect(missing?.error?.code).toBe(-32601);
  });

  it('lists models from data.json without leaking API keys, and falls back to env vars (including DashScope/Qwen)', async () => {
    const snapshot = {
      app: 'dissentry',
      profiles: [
        makeProfile({ id: 'p1', handle: 'gpt', modelId: 'gpt-4.1', presetId: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-top-secret-123' }),
        makeProfile({ id: 'p2', handle: 'ollama', modelId: 'qwen3:8b', presetId: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '' }),
      ],
    };
    await writeFile(join(dir, 'data.json'), JSON.stringify(snapshot), 'utf8');

    const res = await callMcpTool('dissentry_list_models', {}, { dataDir: dir });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('@gpt');
    expect(res.content[0].text).toContain('@ollama');
    expect(JSON.stringify(res)).not.toContain('sk-top-secret-123');

    const localOnlyRes = await callMcpTool('dissentry_list_models', { localOnly: true }, { dataDir: dir });
    expect(localOnlyRes.content[0].text).toContain('@ollama');
    expect(localOnlyRes.content[0].text).not.toContain('@gpt');

    // Env-var fallback when data.json does not exist (including DASHSCOPE_API_KEY for Qwen Work users).
    const emptyDir = await mkdtemp(join(tmpdir(), 'dissentry-mcp-empty-'));
    try {
      const envRes = await callMcpTool('dissentry_list_models', {}, {
        dataDir: emptyDir,
        env: { DASHSCOPE_API_KEY: 'sk-dashscope-secret', DEEPSEEK_API_KEY: 'sk-ds-secret' },
      });
      expect(envRes.content[0].text).toContain('@qwen');
      expect(envRes.content[0].text).toContain('@deepseek');
      expect(JSON.stringify(envRes)).not.toContain('sk-dashscope-secret');
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('runs dissentry_check in parallel, merges consensus notes, excludes author, and enforces forceLocalOnly', async () => {
    const snapshot = {
      app: 'dissentry',
      profiles: [
        makeProfile({ id: 'p-claude', handle: 'claude', modelId: 'claude-sonnet-4' }),
        makeProfile({ id: 'p-gpt', handle: 'gpt', modelId: 'gpt-4.1' }),
        makeProfile({ id: 'p-gemini', handle: 'gemini', modelId: 'gemini-2.5-flash' }),
        makeProfile({ id: 'p-local', handle: 'ollama', modelId: 'llama3.3', presetId: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '' }),
      ],
    };
    await writeFile(join(dir, 'data.json'), JSON.stringify(snapshot), 'utf8');

    const calledModels: string[] = [];
    const fakeFetch = mockOpenAiChatFetch((body) => {
      calledModels.push(String(body.model));
      if (body.model === 'gpt-4.1') {
        return JSON.stringify({
          verdict: 'note',
          notes: [{ claim: 'HTTP 204 returns a JSON body', correction: 'HTTP 204 No Content must not include a message body per RFC 9110.', severity: 'major' }],
        });
      }
      if (body.model === 'gemini-2.5-flash') {
        return JSON.stringify({
          verdict: 'note',
          notes: [{ claim: 'HTTP 204 returns a JSON body', correction: 'RFC 9110 forbids a response body on HTTP 204 No Content responses.', severity: 'critical' }],
        });
      }
      return JSON.stringify({ verdict: 'ok' });
    });

    const res = await callMcpTool(
      'dissentry_check',
      { question: 'Does HTTP 204 return JSON?', answer: 'HTTP 204 returns a JSON body with status.', author: 'claude' },
      { dataDir: dir, fetchImpl: fakeFetch },
    );

    // Claude should NOT check its own answer.
    expect(calledModels).not.toContain('claude-sonnet-4');
    expect(calledModels).toContain('gpt-4.1');
    expect(calledModels).toContain('gemini-2.5-flash');
    expect(calledModels).toContain('llama3.3');

    // Overlapping notes from @gpt and @gemini should merge into one consensus note with elevated severity 'critical'.
    const structured = res.structuredContent as { verdict: string; notes: Array<{ severity: string; agreedBy: string[] }>; noDissent: string[] };
    expect(structured.verdict).toBe('dissent');
    expect(structured.notes).toHaveLength(1);
    expect(structured.notes[0].severity).toBe('critical');
    expect(structured.notes[0].agreedBy.sort()).toEqual(['@gemini', '@gpt']);
    expect(structured.noDissent).toEqual(['@ollama']);
    expect(res.content[0].text).toContain('CRITICAL');

    // Global --local-only lock prevents ANY cloud model from being called even when caller omits localOnly.
    calledModels.length = 0;
    const localLocked = await callMcpTool(
      'dissentry_check',
      { answer: 'Sensitive internal code snippet' },
      { dataDir: dir, forceLocalOnly: true, fetchImpl: fakeFetch },
    );
    expect(calledModels).toEqual(['llama3.3']);
    expect(localLocked.content[0].text).toContain('Verdict: OK');
  });

  it('runs dissentry_ask with automatic peer fact-checking and reads dissentry_trust', async () => {
    const p1 = makeProfile({ id: 'p-gpt', handle: 'gpt', modelId: 'gpt-4.1' });
    const p2 = makeProfile({ id: 'p-gemini', handle: 'gemini', modelId: 'gemini-2.5-flash' });
    const post: Post = { id: 'post-1', kind: 'model', profileId: 'p-gpt', text: 'ans', rootId: 'post-1', status: 'done', createdAt: 100 };
    const note: Note = { id: 'n-1', postId: 'post-1', profileId: 'p-gemini', agreeProfileIds: [], claim: 'c', correction: 'fix', severity: 'minor', status: 'accepted', createdAt: 101 };
    const check: Check = { postId: 'post-1', profileId: 'p-gemini', verdict: 'note', createdAt: 101 };
    await writeFile(join(dir, 'data.json'), JSON.stringify({ app: 'dissentry', profiles: [p1, p2], posts: [post], notes: [note], checks: [check] }), 'utf8');

    const fakeFetch = mockOpenAiChatFetch((body) => {
      if (body.model === 'gpt-4.1') return 'Use SQLite WAL mode for concurrent reads.';
      return JSON.stringify({ verdict: 'ok' });
    });

    const ask = await callMcpTool('dissentry_ask', { prompt: 'How do I speed up SQLite reads?', models: ['gpt'], check: true }, { dataDir: dir, fetchImpl: fakeFetch });
    expect(ask.isError).toBeFalsy();
    expect(ask.content[0].text).toContain('Use SQLite WAL mode');
    expect(ask.content[0].text).toContain('no dissent from @gemini');

    const trust = await callMcpTool('dissentry_trust', {}, { dataDir: dir });
    expect(trust.content[0].text).toContain('@gpt');
    expect(trust.content[0].text).toContain('1 corrected');
    expect(trust.content[0].text).toContain('1 accepted');
  });

  it('serves MCP over Streamable HTTP (/mcp) with localhost Host guard and batch support', async () => {
    const app = createApp({ allowedHosts: ['localhost', '127.0.0.1', '[::1]'], dataDir: dir });

    // Rejects foreign Host (DNS-rebinding protection).
    const blocked = await app.request('http://evil.example/mcp', {
      method: 'POST',
      headers: { host: 'evil.example', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(blocked.status).toBe(403);

    // Accepts standard Streamable HTTP POST on localhost.
    const ok = await app.request('http://127.0.0.1:4317/mcp', {
      method: 'POST',
      headers: { host: '127.0.0.1:4317', 'content-type': 'application/json', 'mcp-session-id': 'sess-1' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('mcp-session-id')).toBe('sess-1');
    const json = await ok.json();
    expect(json.result.tools).toHaveLength(4);

    // Notification returns 202 Accepted; batch returns array; DELETE returns 200; GET returns 405.
    const notif = await handleMcpHttpRequest(
      new Request('http://127.0.0.1:4317/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }),
      { dataDir: dir },
    );
    expect(notif.status).toBe(202);

    const batch = await handleMcpHttpRequest(
      new Request('http://127.0.0.1:4317/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          { jsonrpc: '2.0', id: 10, method: 'ping' },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
        ]),
      }),
      { dataDir: dir },
    );
    expect(batch.status).toBe(200);
    expect(await batch.json()).toEqual([{ jsonrpc: '2.0', id: 10, result: {} }]);

    const del = await handleMcpHttpRequest(new Request('http://127.0.0.1:4317/mcp', { method: 'DELETE' }), { dataDir: dir });
    expect(del.status).toBe(200);

    const get = await handleMcpHttpRequest(new Request('http://127.0.0.1:4317/mcp', { method: 'GET' }), { dataDir: dir });
    expect(get.status).toBe(405);
  });
});
