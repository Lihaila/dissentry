<p align="center">
  <img src="https://raw.githubusercontent.com/Lihaila/dissentry/main/public/og.png" alt="Dissentry: don't take one AI's word for it" width="800" />
</p>

<h1 align="center">Dissentry</h1>
<p align="center"><b>Don’t take one AI’s word for it.</b><br/>Ask one model. The others fact-check it, and add a note only when it’s wrong.</p>

<p align="center">
  <a href="https://dissentry.lihaila.com"><b>Try it →</b></a> ·
  <a href="https://www.npmjs.com/package/dissentry"><img src="https://img.shields.io/npm/v/dissentry?color=0f172a&label=npm" alt="npm" /></a>
  <a href="https://github.com/Lihaila/dissentry/actions/workflows/ci.yml"><img src="https://github.com/Lihaila/dissentry/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/license-MIT-f59e0b" alt="MIT" />
</p>

---

Dissentry is an X-style timeline for AI models. You `@mention` a model to ask it something, and the other models you follow act as **checkers**: they read every answer and attach a **dissent note** only when they find a real problem (a wrong fact, broken code, outdated info or a dangerous step). The disputed sentence is underlined in the answer, and when several checkers flag the same claim their notes merge (“@claude · @qwen · @gemini agree”).

You decide whether each note is right, and the **Trust** page shows which models get corrected and whose notes hold up, on *your* questions.

<p align="center"><img src="https://raw.githubusercontent.com/Lihaila/dissentry/main/docs/screenshots/thread.jpg" alt="An answer from DeepSeek with a dissent note that Claude, Qwen and Gemini agree on" width="900" /></p>

## Features

- **Community notes for AI answers**: checkers speak up only when something is wrong; duplicate notes merge into a consensus.
- **Sign in with OpenRouter**: one login for Claude, GPT, Gemini, DeepSeek, Qwen, Grok and hundreds more, billed to your own account. No keys to copy.
- **Or bring your own keys**: OpenAI, Anthropic, Gemini, DeepSeek, Qwen, xAI, Mistral, Groq, any OpenAI-compatible endpoint, plus **Ollama** and **LM Studio** for local models.
- **Share as image**: turn any answer and its notes into a polished card for X, in one click.
- **Token usage**: tokens and estimated cost per answer, per model, and how much checking costs compared with answering.
- **Trust scores**: built from your own verdicts, not someone else’s benchmark.
- **Private by design**: keys and chats live in your browser (IndexedDB). No accounts, no telemetry.
- **Four languages**: English, 简体中文, 日本語, 한국어.
- **Works behind proxies**: HTTP, HTTPS and SOCKS5 with a bypass list (local version).

<table>
  <tr>
    <td width="50%"><img src="https://raw.githubusercontent.com/Lihaila/dissentry/main/docs/screenshots/share-card.jpg" alt="Share-as-image card" /></td>
    <td width="50%"><img src="https://raw.githubusercontent.com/Lihaila/dissentry/main/docs/screenshots/timeline-zh.jpg" alt="The timeline in Chinese" /><br/><br/><img src="https://raw.githubusercontent.com/Lihaila/dissentry/main/docs/screenshots/landing.jpg" alt="Landing page" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Share as image: a 2400px card ready for X</sub></td>
    <td align="center"><sub>Full UI in Chinese, Japanese and Korean · landing page</sub></td>
  </tr>
</table>

## Get started

**Hosted:** open **https://dissentry.lihaila.com**, click *Sign in with OpenRouter* (or add a model with your API key), turn on **Checker** for two or three models, and ask something. Requests go straight from your browser to each provider and never touch our server.

**Local** (recommended for local models and maximum privacy; needs Node.js 20+):

```bash
npx dissentry
```

This opens http://localhost:4317. The local version adds a built-in pass-through proxy, so every provider works and local models need no CORS setup.

**Docker:**

```bash
docker build -t dissentry . && docker run -p 4317:4317 dissentry
```

Inside Docker, reach Ollama on the host at `http://host.docker.internal:11434/v1`.

### Using a proxy (mainland China, company networks)

Local version: **Settings → Network proxy**: *System* (uses `HTTPS_PROXY` / `NO_PROXY`), *No proxy*, or *Custom* (`http://`, `https://` or `socks5://`, optional `user:pass@`, bypass list such as `.aliyuncs.com, api.deepseek.com`). **Test connection** checks reachability. Hosted version: requests use your browser’s / system proxy or VPN.

### Can I use my ChatGPT Plus or Claude Pro subscription?

No. Providers don’t allow third-party apps to use consumer subscriptions (Anthropic explicitly banned it in 2026), and accounts that try can be suspended. *Sign in with OpenRouter* is the supported one-login alternative.

## How it works

- React single-page app; all data in the browser. `npx dissentry` adds a tiny local server that serves the app and a stateless pass-through proxy, bound to `127.0.0.1`, rejecting requests whose `Host`/`Origin` aren’t local (blocks other sites and DNS rebinding).
- Checkers get the conversation plus the answer and must return strict JSON (`{"verdict":"ok"}` or notes with claim, correction and severity). Notes from different checkers merge by claim similarity (CJK-aware), and the disputed sentence is located in the answer even when paraphrased.
- Token usage comes from each provider’s response; costs use prices you set (auto-filled for OpenRouter).

## Self-hosting

`npm run build:web` and serve `dist/web` from any static host. See [`deploy/Caddyfile.example`](deploy/Caddyfile.example) for a config with a strict Content-Security-Policy, and host it on its **own origin** (a subdomain), because browser storage, including API keys, is shared by everything on the same origin.

## Development

```bash
npm install
npm run dev        # Vite dev server with the proxy built in
npm test           # unit tests
npm run build      # typecheck + web build + server bundle
DISSENTRY_LIVE=1 OPENAI_API_KEY=… npx vitest run tests/live.test.ts   # optional live provider test
```

| Path | What |
|---|---|
| `src/lib/engine.ts` | posting, parallel streaming replies, checkers, note merging, usage |
| `src/lib/context.ts` | thread → model messages; checker prompt |
| `src/lib/notes.ts`, `src/lib/claims.ts` | checker JSON parsing, note merging, disputed-claim highlighting |
| `src/lib/providers.ts`, `src/lib/openrouter.ts` | provider adapters, OpenRouter sign-in (OAuth PKCE) |
| `src/i18n/` | UI strings in four languages |
| `server/` | local proxy and static server |

## Releasing (maintainers)

`npm version patch` (or `minor`), then `git push --follow-tags`. GitHub Actions tests and publishes to npm through trusted publishing, with provenance.

## License

MIT © Lihai La LLC. Provider logos come from [@lobehub/icons](https://github.com/lobehub/lobe-icons) (MIT); they are trademarks of their owners and are used only to show which model wrote a post.
