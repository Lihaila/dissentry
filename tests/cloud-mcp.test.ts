import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCloudMcpApp, makeCloudSafeFetch } from '../server/cloud-mcp';

const SECRET = 'test-cloud-mcp-secret-at-least-32-chars-long-0123456789';
const ORIGIN = 'https://dissentry.lihaila.com';

function sha256B64Url(v: string): string {
  return createHash('sha256').update(v, 'utf8').digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mockProviderFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://openrouter.ai/api/v1/auth/keys') {
      return new Response(JSON.stringify({ key: 'sk-or-v1-test-user-key-9999' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://openrouter.ai/api/v1/models') {
      return new Response(JSON.stringify({
        data: [
          { id: 'anthropic/claude-sonnet-4', created: 2000, pricing: { prompt: '0.000003', completion: '0.000015' } },
          { id: 'openai/gpt-4.1', created: 2000, pricing: { prompt: '0.000002', completion: '0.000008' } },
          { id: 'google/gemini-2.5-flash', created: 2000, pricing: { prompt: '0.0000003', completion: '0.000002' } },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      const text = body.model?.includes('claude')
        ? JSON.stringify({ verdict: 'note', notes: [{ claim: 'HTTP 204 returns JSON', correction: 'HTTP 204 must not include a body.', severity: 'major' }] })
        : JSON.stringify({ verdict: 'ok' });
      return new Response(JSON.stringify({
        id: 'cmpl-1',
        object: 'chat.completion',
        created: 1,
        model: body.model ?? 'test',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('Cloud MCP OAuth 2.1 + Streamable HTTP', () => {
  it('serves RFC 9728 protected resource & RFC 8414 auth server metadata and 401 WWW-Authenticate', async () => {
    const app = createCloudMcpApp({ publicOrigin: ORIGIN, secret: SECRET, fetchImpl: mockProviderFetch() });

    const unauth = await app.request('/v1/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    expect(unauth.status).toBe(401);
    const www = unauth.headers.get('www-authenticate') ?? '';
    expect(www).toContain('Bearer');
    expect(www).toContain(`${ORIGIN}/.well-known/oauth-protected-resource/v1/mcp`);

    const prm = await (await app.request('/.well-known/oauth-protected-resource/v1/mcp')).json();
    expect(prm.resource).toBe(`${ORIGIN}/v1/mcp`);
    expect(prm.authorization_servers).toEqual([ORIGIN]);

    const asm = await (await app.request('/.well-known/oauth-authorization-server')).json();
    expect(asm.issuer).toBe(ORIGIN);
    expect(asm.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`);
    expect(asm.token_endpoint).toBe(`${ORIGIN}/oauth/token`);
    expect(asm.registration_endpoint).toBe(`${ORIGIN}/oauth/register`);
    expect(asm.code_challenge_methods_supported).toContain('S256');
    expect(asm.client_id_metadata_document_supported).toBe(true);
  });

  it('completes stateless DCR + OpenRouter OAuth PKCE + token exchange + MCP tool calls', async () => {
    const app = createCloudMcpApp({ publicOrigin: ORIGIN, secret: SECRET, fetchImpl: mockProviderFetch() });

    // 1. Dynamic Client Registration (stateless, survives restarts with same secret)
    const regRes = await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Google App', redirect_uris: ['https://gemini.google.com/oauth/callback'] }),
    });
    expect(regRes.status).toBe(201);
    const reg = await regRes.json();
    expect(reg.client_id).toMatch(/^dcr_/);

    // 2. Fresh app instance (simulates process restart) still accepts the DCR client_id
    const restarted = createCloudMcpApp({ publicOrigin: ORIGIN, secret: SECRET, fetchImpl: mockProviderFetch() });

    const verifier = 'pkce-verifier-0123456789abcdefghijklmnopqrstuvwxyz';
    const challenge = sha256B64Url(verifier);
    const authUrl = `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent('https://gemini.google.com/oauth/callback')}&code_challenge=${challenge}&code_challenge_method=S256&state=xyz&resource=${encodeURIComponent(`${ORIGIN}/v1/mcp`)}`;
    const authPage = await restarted.request(authUrl);
    expect(authPage.status).toBe(200);
    const csp = authPage.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('form-action');
    const cookie = (authPage.headers.get('set-cookie') ?? '').split(';')[0];
    const html = await authPage.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
    const sid = /name="sid" value="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(csrf).toBeTruthy();
    expect(sid).toBeTruthy();

    // 3. Start OpenRouter PKCE handoff
    const startForm = new URLSearchParams({ sid, csrf });
    const orStart = await restarted.request('/oauth/openrouter/start', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: startForm.toString(),
    });
    expect(orStart.status).toBe(302);
    const orAuthUrl = new URL(orStart.headers.get('location')!);
    expect(orAuthUrl.origin).toBe('https://openrouter.ai');
    const orState = orAuthUrl.searchParams.get('state')!;

    // 4. OpenRouter callback exchanges code for user's key in RAM
    const orCb = await restarted.request(`/oauth/openrouter/callback?code=or-code-123&state=${encodeURIComponent(orState)}`, {
      headers: { cookie },
    });
    expect(orCb.status).toBe(302);
    expect(orCb.headers.get('location')).toContain('/oauth/authorize?sid=');

    // 5. Consent page now shows connected OpenRouter & model picks
    const connectedPage = await restarted.request(orCb.headers.get('location')!, { headers: { cookie } });
    const connectedHtml = await connectedPage.text();
    expect(connectedHtml).toContain('OpenRouter connected');

    // 6. Approve consent → redirects back with single-use authorization code
    const approveForm = new FormData();
    approveForm.set('sid', sid);
    approveForm.set('csrf', csrf);
    approveForm.set('mode', 'openrouter');
    approveForm.set('action', 'approve');
    approveForm.append('or_model', 'claude|Claude|anthropic/claude-sonnet-4');
    approveForm.append('or_model', 'gpt|GPT|openai/gpt-4.1');
    const approved = await restarted.request('/oauth/authorize', {
      method: 'POST',
      headers: { cookie },
      body: approveForm,
    });
    expect(approved.status).toBe(302);
    const cbLoc = new URL(approved.headers.get('location')!);
    expect(cbLoc.origin).toBe('https://gemini.google.com');
    expect(cbLoc.searchParams.get('state')).toBe('xyz');
    const authCode = cbLoc.searchParams.get('code')!;
    expect(authCode).toMatch(/^dsc_code_/);

    // 7. Exchange code + PKCE verifier for Bearer token
    const tokRes = await restarted.request('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        client_id: reg.client_id,
        redirect_uri: 'https://gemini.google.com/oauth/callback',
        code_verifier: verifier,
      }).toString(),
    });
    expect(tokRes.status).toBe(200);
    const tokens = await tokRes.json();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token).toMatch(/^dsc_at_/);
    expect(tokens.refresh_token).toMatch(/^dsc_rt_/);

    // 8. Replaying the same authorization code fails
    const replay = await restarted.request('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        client_id: reg.client_id,
        redirect_uri: 'https://gemini.google.com/oauth/callback',
        code_verifier: verifier,
      }).toString(),
    });
    expect(replay.status).toBe(400);

    // 9. Call /v1/mcp with Bearer token (dissentry_list_models + dissentry_check)
    const listRes = await restarted.request('/v1/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.access_token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dissentry_list_models', arguments: {} } }),
    });
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.result.content[0].text).toContain('@claude');
    expect(listJson.result.content[0].text).toContain('@gpt');

    const checkRes = await restarted.request('/v1/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.access_token}` },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'dissentry_check', arguments: { answer: 'HTTP 204 returns JSON.' } },
      }),
    });
    expect(checkRes.status).toBe(200);
    const checkJson = await checkRes.json();
    expect(checkJson.result.content[0].text).toContain('Verdict: DISSENT');
    expect(checkJson.result.content[0].text).toContain('@claude');

    // 10. Refresh token issues fresh valid access token
    const refRes = await restarted.request('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: reg.client_id,
      }).toString(),
    });
    expect(refRes.status).toBe(200);
    const refreshed = await refRes.json();
    expect(refreshed.access_token).toMatch(/^dsc_at_/);
  });

  it('rejects wrong PKCE verifier, supports BYOK keys, and blocks SSRF targets in cloudSafeFetch', async () => {
    const app = createCloudMcpApp({ publicOrigin: ORIGIN, secret: SECRET, fetchImpl: mockProviderFetch() });
    const reg = await (await app.request('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Cursor', redirect_uris: ['cursor://oauth/callback'] }),
    })).json();

    const verifier = 'correct-pkce-verifier-0123456789abcdefghijk';
    const challenge = sha256B64Url(verifier);
    const page = await app.request(`/oauth/authorize?response_type=code&client_id=${encodeURIComponent(reg.client_id)}&redirect_uri=${encodeURIComponent('cursor://oauth/callback')}&code_challenge=${challenge}&code_challenge_method=S256`);
    const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0];
    const html = await page.text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
    const sid = /name="sid" value="([^"]+)"/.exec(html)?.[1] ?? '';

    const form = new FormData();
    form.set('sid', sid);
    form.set('csrf', csrf);
    form.set('mode', 'byok');
    form.set('action', 'approve');
    form.set('deepseek_key', 'sk-deepseek-test');
    const approved = await app.request('/oauth/authorize', { method: 'POST', headers: { cookie }, body: form });
    expect(approved.status).toBe(302);
    const code = new URL(approved.headers.get('location')!).searchParams.get('code')!;

    const wrongPkce = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: reg.client_id,
        redirect_uri: 'cursor://oauth/callback',
        code_verifier: 'wrong-verifier-zzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      }).toString(),
    });
    expect(wrongPkce.status).toBe(400);

    const safeFetch = makeCloudSafeFetch(mockProviderFetch());
    await expect(safeFetch('http://127.0.0.1:8795/v1/mcp/health')).rejects.toThrow(/non-HTTPS/i);
    await expect(safeFetch('https://169.254.169.254/latest/meta-data')).rejects.toThrow(/not allowlisted/i);
    await expect(safeFetch('https://evil.example.com/v1/chat/completions')).rejects.toThrow(/not allowlisted/i);
    await expect(safeFetch('https://api.openai.com:8443/v1/chat/completions')).rejects.toThrow(/port/i);
  });

  it('keeps server.json aligned with package.json for Official MCP Registry publishing', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
    const srv = JSON.parse(readFileSync(resolve(process.cwd(), 'server.json'), 'utf8'));
    expect(pkg.mcpName).toBe(srv.name);
    expect(srv.version).toBe(pkg.version);
    expect(srv.packages[0].version).toBe(pkg.version);
    expect(srv.packages[0].identifier).toBe(pkg.name);
    expect(srv.description.length).toBeLessThanOrEqual(100);
    expect(srv.remotes[0].type).toBe('streamable-http');
    expect(srv.remotes[0].url).toBe('https://dissentry.lihaila.com/v1/mcp');
  });
});
