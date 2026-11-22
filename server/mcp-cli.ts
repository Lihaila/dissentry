import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { handleMcpHttpRequest, startMcpStdioServer } from './mcp';

const args = process.argv.slice(2).filter((a) => a !== 'mcp' && a !== '--mcp');
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag('help') || flag('h')) {
  process.stderr.write(`dissentry mcp: Multi-model fact-checking MCP server (stdio & Streamable HTTP)

Usage:
  npx -y dissentry mcp [options]              Run over stdio (Claude Code, Cursor, DSH, WorkBuddy, Qwen Work)
  npx -y dissentry mcp --http [options]       Run headless Streamable HTTP server at http://127.0.0.1:<port>/mcp

Options:
  --http              Serve MCP over Streamable HTTP instead of stdio
  --port <n>          HTTP port when --http is set (default 4318, env PORT)
  --host <addr>       HTTP bind address when --http is set (default 127.0.0.1, env HOST)
  --allow-host <h>    Extra Host headers to accept in --http mode, comma separated
  --data-dir <dir>    Directory containing data.json (default ~/.dissentry, env DISSENTRY_DATA_DIR)
  --local-only        Lock all MCP calls strictly to local models (Ollama, LM Studio, LAN)
  --help              Show this help message

Tools exposed:
  dissentry_check        Adversarially fact-check an answer/plan/code with your checker models
  dissentry_ask          Ask other configured models for a second opinion (with optional checking)
  dissentry_list_models  List configured models and checkers (local vs cloud)
  dissentry_trust        Read personal model trust stats from Dissentry history
`);
  process.exit(0);
}

const dataDir = opt('data-dir') ?? process.env.DISSENTRY_DATA_DIR;
const forceLocalOnly = flag('local-only') || process.env.DISSENTRY_LOCAL_ONLY === '1';

if (flag('http')) {
  const port = Number(opt('port') ?? process.env.PORT ?? 4318);
  const host = opt('host') ?? process.env.HOST ?? '127.0.0.1';
  const extraHosts = (opt('allow-host') ?? process.env.DISSENTRY_ALLOWED_HOSTS ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowedHosts = ['localhost', '127.0.0.1', '[::1]', ...extraHosts];
  const anyHost = allowedHosts.includes('*');

  const hostname = (h: string | undefined) => {
    if (!h) return '';
    if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1);
    return h.split(':')[0].toLowerCase();
  };

  const app = new Hono();
  app.use('/mcp', async (c, next) => {
    const reqHost = c.req.header('host');
    if (!anyHost && !allowedHosts.includes(hostname(reqHost))) {
      return c.json({ error: 'Host not allowed' }, 403);
    }
    const origin = c.req.header('origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* invalid */ }
      if (originHost !== reqHost) return c.json({ error: 'Cross-origin requests are not allowed' }, 403);
    }
    await next();
  });
  app.all('/mcp', (c) => handleMcpHttpRequest(c.req.raw, { dataDir, forceLocalOnly }));

  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    process.stderr.write(`Dissentry MCP (Streamable HTTP) listening at http://${host}:${info.port}/mcp${forceLocalOnly ? ' (local-only locked)' : ''}\n`);
  });
} else {
  startMcpStdioServer({ dataDir, forceLocalOnly });
}
