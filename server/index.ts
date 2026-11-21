import { serve } from '@hono/node-server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { describeProxy, envProxyUrl } from './network';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag('help') || flag('h')) {
  console.log(`dissentry: Community Notes for AI answers

Usage: npx dissentry [options]

  --port <n>          Port to listen on (default 4317, env PORT)
  --host <addr>       Address to bind (default 127.0.0.1, env HOST)
  --allow-host <h>    Extra Host header to accept, comma separated (env DISSENTRY_ALLOWED_HOSTS)
  --data-dir <dir>    Directory for local disk persistence (default ~/.dissentry, env DISSENTRY_DATA_DIR)
  --no-disk           Disable automatic local disk persistence
  --no-open           Do not open the browser
`);
  process.exit(0);
}

const port = Number(opt('port') ?? process.env.PORT ?? 4317);
const host = opt('host') ?? process.env.HOST ?? '127.0.0.1';
const extraHosts = (opt('allow-host') ?? process.env.DISSENTRY_ALLOWED_HOSTS ?? '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const home = homedir();
const dataDir = flag('no-disk') ? undefined : (opt('data-dir') ?? process.env.DISSENTRY_DATA_DIR ?? join(home, '.dissentry'));
const dataFileDisplay = dataDir
  ? join(dataDir, 'data.json').replace(home, '~')
  : undefined;

const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, 'web');
if (!existsSync(join(webDir, 'index.html'))) {
  console.error(`Built web app not found at ${webDir}. Run "npm run build" first.`);
  process.exit(1);
}

if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1' && extraHosts.length === 0) {
  console.warn(`! Binding to ${host}. Requests are still only accepted with a localhost Host header;` +
    ` pass --allow-host <your-hostname> to reach it from other machines (and put it behind auth).`);
}

const app = createApp({ allowedHosts: ['localhost', '127.0.0.1', '[::1]', ...extraHosts], webDir, dataDir, dataFileDisplay });

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`\n  Dissentry is running at ${url}\n  API keys never leave this machine except to the provider you call.\n  Press Ctrl+C to stop.\n`);
  if (dataFileDisplay) console.log(`  Local disk persistence: ${dataFileDisplay} (owner-only permissions, auto-restores if browser data is cleared).\n`);
  if (envProxyUrl()) console.log(`  System proxy detected: ${describeProxy(envProxyUrl())} (used when Settings → Network proxy is "System").\n`);
  if (!flag('no-open') && !process.env.CI && host === '127.0.0.1') {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try { spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* ignore */ }
  }
});
