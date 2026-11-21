import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { dispatcherFor, isBypassed, validateProxyUrl } from '../server/network';

describe('proxy bypass rules', () => {
  it('matches exact hosts, dot-suffixes and wildcards', () => {
    const rules = 'api.deepseek.com, .aliyuncs.com, *.example.org';
    expect(isBypassed('api.deepseek.com', rules)).toBe(true);
    expect(isBypassed('dashscope.aliyuncs.com', rules)).toBe(true);
    expect(isBypassed('aliyuncs.com', rules)).toBe(true);
    expect(isBypassed('a.b.example.org', rules)).toBe(true);
    expect(isBypassed('api.openai.com', rules)).toBe(false);
    expect(isBypassed('evil-aliyuncs.com', rules)).toBe(false);
  });
});

describe('proxy URL validation', () => {
  it('accepts http, https, socks5 with optional auth', () => {
    for (const u of ['http://127.0.0.1:7890', 'https://proxy.corp:8443', 'socks5://127.0.0.1:1080', 'http://u:p%40ss@10.0.0.1:3128']) {
      expect(validateProxyUrl(u)).toBeNull();
    }
  });
  it('rejects garbage and unsupported schemes', () => {
    expect(validateProxyUrl('127.0.0.1:7890')).toMatch(/Unsupported|URL/);
    expect(validateProxyUrl('ftp://x:21')).toMatch(/Unsupported/);
    expect(validateProxyUrl('not a url')).toMatch(/URL/);
  });
});

describe('dispatcher selection', () => {
  const openai = new URL('https://api.openai.com/v1/models');
  it('direct and local targets never use a proxy', () => {
    expect(dispatcherFor(openai, 'direct')).toBeUndefined();
    expect(dispatcherFor(new URL('http://localhost:11434/v1'), 'http://127.0.0.1:7890')).toBeUndefined();
    expect(dispatcherFor(new URL('http://host.docker.internal:11434/v1'), 'socks5://127.0.0.1:1080')).toBeUndefined();
  });
  it('custom proxy applies unless bypassed, and agents are reused', () => {
    const a = dispatcherFor(openai, 'http://127.0.0.1:7890');
    expect(a).toBeDefined();
    expect(dispatcherFor(openai, 'http://127.0.0.1:7890')).toBe(a);
    expect(dispatcherFor(new URL('https://api.deepseek.com'), 'http://127.0.0.1:7890', '.deepseek.com')).toBeUndefined();
    expect(dispatcherFor(openai, 'socks5://127.0.0.1:1080')).toBeDefined();
  });
});

describe('proxy errors through the API', () => {
  const app = createApp({ allowedHosts: ['localhost'] });
  const call = (headers: Record<string, string>) => app.request('http://localhost/api/proxy', {
    headers: { host: 'localhost', 'x-dissentry-target': 'https://api.openai.com/v1/models', ...headers },
  });
  it('rejects an invalid proxy setting with a clear message', async () => {
    const r = await call({ 'x-dissentry-proxy': 'ftp://x:1' });
    expect(r.status).toBe(400);
    expect((await r.json()).error.message).toMatch(/Unsupported proxy type/);
  });
  it('explains a proxy that is not running', async () => {
    const r = await call({ 'x-dissentry-proxy': 'http://127.0.0.1:9' });
    expect(r.status).toBe(502);
    expect((await r.json()).error.message).toMatch(/via proxy http:\/\/127\.0\.0\.1:9.*refused/);
  });
});
