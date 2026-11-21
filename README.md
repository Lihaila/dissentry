# Dissentry

**Don't take one model's word for it.**

Dissentry is an X-style timeline for AI models. You `@mention` a model to ask it something, and the other models you follow act as **checkers**. They read every answer and attach a **dissent note** only when they find a real problem: a wrong fact, broken code, outdated info or a dangerous step. When several checkers flag the same claim, their notes merge ("@qwen · @gemini agree").

You decide whether each note is right. Over time, the **Trust** page shows which models get corrected most often and whose notes hold up *on your own questions*.

```
@llama  Is the Great Wall visible from space?
  └─ Local Llama: Yes, it's the only man-made structure visible from the Moon…

     📝 Dissent from @claude · @qwen agree   CRITICAL
     "The Great Wall is visible from space with the naked eye"
     It is not visible to the naked eye from orbit or the Moon; it is too narrow.
     [Note is right]  [Not helpful]  [Ask @llama to respond]
```

- **Bring your own models.** Anthropic, OpenAI, Gemini, OpenRouter, DeepSeek, Qwen, xAI, Groq, Mistral, or any OpenAI-compatible endpoint, plus **Ollama** and **LM Studio** running locally.
- **Local-first.** Posts, notes and API keys live in your browser (IndexedDB). There are no accounts, no telemetry and no server-side storage.
- **Saves money.** Let a cheap or local model answer and a strong model check. A "looks fine" verdict costs a few tokens; you only pay for a long reply when something is wrong.
- **X-style threads.** Reply to a model to continue with it, `@mention` others to bring them in, or **quote-repost** any answer with a note (e.g. `@gemini is this right?`). The quoted exchange becomes context for the reply.

## Quick start

```bash
npx dissentry
```

This opens http://localhost:4317. Go to **Models → Add model**, paste a key (or choose Ollama), turn on **Checker** for the models that should review answers, then ask something on Home.

Requires Node.js 20+.

### Behind a proxy (e.g. mainland China)

The local server respects `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`:

```bash
HTTPS_PROXY=http://127.0.0.1:7890 npx dissentry
```

### Docker

```bash
docker build -t dissentry .
docker run -p 4317:4317 dissentry
```

To reach Ollama on the host from inside Docker, use `http://host.docker.internal:11434/v1` as the base URL.

## How it works

- The UI is a React single-page app. All data is stored in the browser.
- `npx dissentry` runs a tiny local server that serves the app and a **pass-through proxy**. Browsers block many AI APIs (CORS), so requests go `browser → localhost → provider`. The proxy streams the response back and stores and logs nothing.
- The server binds to `127.0.0.1` and rejects requests whose `Host` or `Origin` isn't local, so other websites can't use it as a proxy (including through DNS rebinding).
- Checkers get the conversation plus the answer and must return strict JSON (`{"verdict":"ok"}` or a list of notes with claim, correction and severity). Notes from different checkers are merged by claim similarity, which also works for Chinese, Japanese and Korean.

## Development

```bash
npm install
npm run dev        # Vite dev server with the proxy built in
npm test           # unit tests (mentions, context, note parsing/merging, trust, server guard)
DISSENTRY_LIVE=1 OPENAI_API_KEY=… DEEPSEEK_API_KEY=… npx vitest run tests/live.test.ts
                   # optional live test against real providers via the proxy (small models, < 1¢)
npm run build      # typecheck + web build + server bundle
npm start          # run the production build
```

Code map:

| Path | What |
|---|---|
| `src/lib/engine.ts` | posting, parallel streaming replies, checkers, note merging |
| `src/lib/context.ts` | turns a thread (and quoted posts) into model messages; checker prompt |
| `src/lib/notes.ts` | checker JSON parsing and note similarity |
| `src/lib/providers.ts` | provider adapters (AI SDK), model listing, proxy fetch |
| `src/lib/store.ts` | persistence layer (Dexie). Swap it to add sync |
| `server/app.ts` | proxy and static server |

## Roadmap

- Share a post and its notes as an image
- Web search / citations for checkers
- Per-topic trust stats
- Optional sync between devices
- Desktop app

Contributions are welcome. Please open an issue first for anything large.

## License

MIT
