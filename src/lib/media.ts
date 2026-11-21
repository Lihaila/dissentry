import { uid } from './db';
import { fetchFor } from './providers';
import type { Attachment, GeneratedMedia, ModelKind, Profile } from './types';

export interface MediaGenInput {
  profile: Profile;
  kind: Exclude<ModelKind, 'chat'>;
  prompt: string;
  refImages?: Attachment[];
  signal?: AbortSignal;
  onProgress?: (status: string) => void;
  fetchImpl?: typeof fetch;
}

export interface MediaGenOutput {
  media: GeneratedMedia[];
  text?: string;
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');
const isDashScope = (url: string) => url.toLowerCase().includes('aliyuncs.com');
const isOpenRouter = (url: string) => url.toLowerCase().includes('openrouter.ai');

function dashScopeApiBase(baseUrl: string): string {
  try {
    return `${new URL(baseUrl.trim()).origin}/api/v1`;
  } catch {
    return trimSlash(baseUrl.trim()).replace(/\/compatible-mode\/v1$/i, '/api/v1');
  }
}

/** Optional voice override: if user put a single token (e.g. "Ethan", "nova", "Kore") in Extra instructions. */
function voiceHint(p: Profile, fallback: string): string {
  const raw = p.systemPrompt?.trim() ?? '';
  return /^[a-z0-9_-]{2,24}$/i.test(raw) ? raw : fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/** Wrap raw 16-bit signed linear PCM (e.g. Gemini TTS audio/L16;rate=24000) in a standard WAV header. */
export function pcmToWavDataUrl(pcmBase64: string, sampleRate = 24000, channels = 1): string {
  const pcm = base64ToBytes(pcmBase64);
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) wav[off + i] = s.charCodeAt(i); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return `data:audio/wav;base64,${bytesToBase64(wav)}`;
}

async function readError(res: Response): Promise<Error & { statusCode?: number; responseBody?: string }> {
  const body = await res.text().catch(() => '');
  let msg = `${res.status} ${res.statusText}`;
  try {
    const j = JSON.parse(body);
    const extracted = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message ?? j.detail;
    if (typeof extracted === 'string' && extracted.trim()) msg = extracted;
  } catch {
    if (body.trim()) msg = body.slice(0, 300);
  }
  const err = new Error(msg) as Error & { statusCode?: number; responseBody?: string };
  err.statusCode = res.status;
  err.responseBody = body;
  return err;
}

async function postJson(
  f: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await readError(res);
  return (await res.json()) as Record<string, unknown>;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })); };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function extForMime(mime: string, fallback: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  return fallback;
}

/** Try to cache a remote image/audio URL locally as a data URL so expiring provider links survive locally. */
async function cacheAsDataUrl(
  f: typeof fetch,
  url: string,
  fallbackMime: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ url: string; mediaType: string }> {
  if (url.startsWith('data:')) {
    const parsed = parseDataUrl(url);
    return { url, mediaType: parsed?.mimeType ?? fallbackMime };
  }
  try {
    const res = await f(url, { headers, signal });
    if (!res.ok) return { url, mediaType: fallbackMime };
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || fallbackMime;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { url: `data:${mime};base64,${bytesToBase64(bytes)}`, mediaType: mime };
  } catch {
    // In static hosted mode without local proxy, third-party OSS/CDN URLs may not send CORS headers.
    return { url, mediaType: fallbackMime };
  }
}

/** Try to cache a remote video URL locally as a Blob so IndexedDB stores it efficiently and links never expire. */
async function cacheAsBlob(
  f: typeof fetch,
  url: string,
  fallbackMime: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ url: string; blob?: Blob; mediaType: string }> {
  try {
    const res = await f(url, { headers, signal });
    if (!res.ok) return { url, mediaType: fallbackMime };
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || fallbackMime;
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: mime });
    return { url: '', blob, mediaType: mime };
  } catch {
    return { url, mediaType: fallbackMime };
  }
}

async function pollDashScopeTask(
  f: typeof fetch,
  apiBase: string,
  apiKey: string,
  taskId: string,
  intervalMs: number,
  onProgress?: (s: string) => void,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await sleep(intervalMs, signal);
    const res = await f(`${apiBase}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    if (!res.ok) throw await readError(res);
    const json = (await res.json()) as Record<string, unknown>;
    const output = (json.output ?? {}) as Record<string, unknown>;
    const status = String(output.task_status ?? json.task_status ?? '').toUpperCase();
    if (status === 'SUCCEEDED') return json;
    if (status === 'FAILED' || status === 'CANCELED' || status === 'CANCELLED') {
      const msg = String(output.message ?? json.message ?? `Task ${status.toLowerCase()}`);
      throw new Error(msg);
    }
    if (status) onProgress?.(status);
  }
  throw new Error('Generation timed out');
}

function authHeaders(p: Profile): Record<string, string> {
  const h: Record<string, string> = {};
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  if (isOpenRouter(p.baseUrl)) {
    h['HTTP-Referer'] = 'https://dissentry.lihaila.com';
    h['X-Title'] = 'Dissentry';
  }
  return h;
}

async function generateImage(input: MediaGenInput): Promise<MediaGenOutput> {
  const { profile: p, prompt, refImages = [], signal, onProgress } = input;
  const f = input.fetchImpl ?? fetchFor(p);
  const base = trimSlash(p.baseUrl.trim());

  // 1. Alibaba DashScope / Qwen (qwen-image*, z-image*, wanx*, wan2*-t2i*)
  if (isDashScope(base)) {
    const apiBase = dashScopeApiBase(base);
    const headers = authHeaders(p);
    // Legacy wanx* and wan2.*-t2i* use async text2image/image-synthesis;
    // newer qwen-image*, z-image*, and wan2.6/2.7-image* use sync multimodal-generation/generation.
    const isLegacyWanT2i = /^(wanx|wan\d[\d.]*-t2i)/i.test(p.modelId);
    if (isLegacyWanT2i) {
      const submitted = await postJson(
        f,
        `${apiBase}/services/aigc/text2image/image-synthesis`,
        { ...headers, 'X-DashScope-Async': 'enable' },
        { model: p.modelId, input: { prompt }, parameters: { n: 1 } },
        signal,
      );
      const taskId = String(((submitted.output ?? {}) as Record<string, unknown>).task_id ?? '');
      if (!taskId) throw new Error('DashScope did not return a task_id');
      onProgress?.('PENDING');
      const done = await pollDashScopeTask(f, apiBase, p.apiKey, taskId, 2500, onProgress, signal);
      const results = (((done.output ?? {}) as Record<string, unknown>).results ?? []) as Array<{ url?: string }>;
      const urls = results.map((r) => r.url).filter((u): u is string => !!u);
      const media: GeneratedMedia[] = [];
      for (const u of urls) {
        const cached = await cacheAsDataUrl(f, u, 'image/png', undefined, signal);
        media.push({ id: uid(), kind: 'image', mediaType: cached.mediaType, url: cached.url, name: `${p.handle}.${extForMime(cached.mediaType, 'png')}` });
      }
      if (!media.length) throw new Error('No image returned');
      return { media };
    }

    const content: Array<Record<string, string>> = [];
    for (const img of refImages) {
      if (img.dataUrl) content.push({ image: img.dataUrl });
    }
    content.push({ text: prompt });
    const resp = await postJson(
      f,
      `${apiBase}/services/aigc/multimodal-generation/generation`,
      headers,
      {
        model: p.modelId,
        input: { messages: [{ role: 'user', content }] },
        parameters: { n: 1 },
      },
      signal,
    );
    const output = (resp.output ?? {}) as Record<string, unknown>;
    const choices = (output.choices ?? []) as Array<{ message?: { content?: Array<{ image?: string; text?: string }> } }>;
    const media: GeneratedMedia[] = [];
    const captions: string[] = [];
    for (const ch of choices) {
      for (const item of ch.message?.content ?? []) {
        if (item.image) {
          const cached = await cacheAsDataUrl(f, item.image, 'image/png', undefined, signal);
          media.push({ id: uid(), kind: 'image', mediaType: cached.mediaType, url: cached.url, name: `${p.handle}.${extForMime(cached.mediaType, 'png')}` });
        } else if (item.text) {
          captions.push(item.text);
        }
      }
    }
    if (!media.length) throw new Error('No image returned');
    return { media, text: captions.join('\n').trim() || undefined };
  }

  // 2. Google Gemini (Imagen :predict and Gemini multimodal :generateContent)
  if (p.protocol === 'google') {
    const headers = { 'x-goog-api-key': p.apiKey };
    if (/^imagen/i.test(p.modelId)) {
      const resp = await postJson(
        f,
        `${base}/models/${encodeURIComponent(p.modelId)}:predict`,
        headers,
        { instances: [{ prompt }], parameters: { sampleCount: 1 } },
        signal,
      );
      const preds = (resp.predictions ?? []) as Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
      const media: GeneratedMedia[] = preds
        .filter((x) => x.bytesBase64Encoded)
        .map((x) => {
          const mime = x.mimeType || 'image/png';
          return {
            id: uid(),
            kind: 'image',
            mediaType: mime,
            url: `data:${mime};base64,${x.bytesBase64Encoded}`,
            name: `${p.handle}.${extForMime(mime, 'png')}`,
          };
        });
      if (!media.length) throw new Error('No image returned');
      return { media };
    }

    const parts: Array<Record<string, unknown>> = [];
    for (const img of refImages) {
      const parsed = img.dataUrl ? parseDataUrl(img.dataUrl) : null;
      if (parsed) parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
    }
    parts.push({ text: prompt });
    const resp = await postJson(
      f,
      `${base}/models/${encodeURIComponent(p.modelId)}:generateContent`,
      headers,
      { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } },
      signal,
    );
    const cand = ((resp.candidates ?? []) as Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>)[0];
    const media: GeneratedMedia[] = [];
    const texts: string[] = [];
    for (const part of cand?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        media.push({
          id: uid(),
          kind: 'image',
          mediaType: mime,
          url: `data:${mime};base64,${part.inlineData.data}`,
          name: `${p.handle}.${extForMime(mime, 'png')}`,
        });
      } else if (part.text) {
        texts.push(part.text);
      }
    }
    if (!media.length) throw new Error('No image returned');
    return { media, text: texts.join('\n').trim() || undefined };
  }

  // 3. OpenRouter multimodal image generation via /chat/completions with modalities
  if (isOpenRouter(base)) {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    for (const img of refImages) {
      if (img.dataUrl) content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
    }
    const resp = await postJson(
      f,
      `${base}/chat/completions`,
      authHeaders(p),
      {
        model: p.modelId,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content: content.length === 1 ? prompt : content }],
      },
      signal,
    );
    const msg = (((resp.choices ?? []) as Array<{ message?: { content?: string; images?: Array<{ image_url?: { url?: string }; url?: string }> } }>)[0])?.message;
    const media: GeneratedMedia[] = [];
    for (const item of msg?.images ?? []) {
      const u = item.image_url?.url ?? item.url;
      if (!u) continue;
      const cached = await cacheAsDataUrl(f, u, 'image/png', undefined, signal);
      media.push({ id: uid(), kind: 'image', mediaType: cached.mediaType, url: cached.url, name: `${p.handle}.${extForMime(cached.mediaType, 'png')}` });
    }
    if (!media.length) throw new Error('No image returned');
    return { media, text: typeof msg?.content === 'string' && msg.content.trim() ? msg.content.trim() : undefined };
  }

  // 4. OpenAI / xAI / OpenAI-compatible (/images/generations)
  const resp = await postJson(
    f,
    `${base}/images/generations`,
    authHeaders(p),
    { model: p.modelId, prompt, n: 1 },
    signal,
  );
  const items = (resp.data ?? []) as Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
  const media: GeneratedMedia[] = [];
  let revised: string | undefined;
  for (const item of items) {
    if (item.revised_prompt && !revised) revised = item.revised_prompt;
    if (item.b64_json) {
      media.push({ id: uid(), kind: 'image', mediaType: 'image/png', url: `data:image/png;base64,${item.b64_json}`, name: `${p.handle}.png` });
    } else if (item.url) {
      const cached = await cacheAsDataUrl(f, item.url, 'image/png', undefined, signal);
      media.push({ id: uid(), kind: 'image', mediaType: cached.mediaType, url: cached.url, name: `${p.handle}.${extForMime(cached.mediaType, 'png')}` });
    }
  }
  if (!media.length) throw new Error('No image returned');
  return { media, text: revised };
}

async function generateAudio(input: MediaGenInput): Promise<MediaGenOutput> {
  const { profile: p, prompt, signal } = input;
  const f = input.fetchImpl ?? fetchFor(p);
  const base = trimSlash(p.baseUrl.trim());

  // 1. Alibaba DashScope / Qwen TTS (qwen-tts*, qwen3-tts-flash*)
  if (isDashScope(base)) {
    const apiBase = dashScopeApiBase(base);
    const resp = await postJson(
      f,
      `${apiBase}/services/aigc/multimodal-generation/generation`,
      authHeaders(p),
      {
        model: p.modelId,
        input: { text: prompt, voice: voiceHint(p, 'Cherry') },
      },
      signal,
    );
    const audio = (((resp.output ?? {}) as Record<string, unknown>).audio ?? {}) as { url?: string; data?: string };
    if (audio.url) {
      const cached = await cacheAsDataUrl(f, audio.url, 'audio/wav', undefined, signal);
      return {
        media: [{ id: uid(), kind: 'audio', mediaType: cached.mediaType, url: cached.url, name: `${p.handle}.${extForMime(cached.mediaType, 'wav')}` }],
      };
    }
    if (audio.data) {
      const url = pcmToWavDataUrl(audio.data, 24000, 1);
      return { media: [{ id: uid(), kind: 'audio', mediaType: 'audio/wav', url, name: `${p.handle}.wav` }] };
    }
    throw new Error('No audio returned');
  }

  // 2. Google Gemini TTS (:generateContent with responseModalities: ['AUDIO'])
  if (p.protocol === 'google') {
    const resp = await postJson(
      f,
      `${base}/models/${encodeURIComponent(p.modelId)}:generateContent`,
      { 'x-goog-api-key': p.apiKey },
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceHint(p, 'Kore') } } },
        },
      },
      signal,
    );
    const cand = ((resp.candidates ?? []) as Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>)[0];
    const part = cand?.content?.parts?.find((x) => x.inlineData?.data);
    if (!part?.inlineData?.data) throw new Error('No audio returned');
    const rawMime = part.inlineData.mimeType || 'audio/L16;rate=24000';
    if (/audio\/(l16|pcm)/i.test(rawMime)) {
      const rateMatch = /rate=(\d+)/i.exec(rawMime);
      const rate = rateMatch ? Number(rateMatch[1]) : 24000;
      const url = pcmToWavDataUrl(part.inlineData.data, rate, 1);
      return { media: [{ id: uid(), kind: 'audio', mediaType: 'audio/wav', url, name: `${p.handle}.wav` }] };
    }
    const mime = rawMime.split(';')[0];
    return {
      media: [{ id: uid(), kind: 'audio', mediaType: mime, url: `data:${mime};base64,${part.inlineData.data}`, name: `${p.handle}.${extForMime(mime, 'wav')}` }],
    };
  }

  // 3. OpenAI / OpenAI-compatible (/audio/speech)
  const res = await f(`${base}/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders(p) },
    body: JSON.stringify({ model: p.modelId, input: prompt, voice: voiceHint(p, 'alloy'), response_format: 'mp3' }),
    signal,
  });
  if (!res.ok) throw await readError(res);
  const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new Error('No audio returned');
  return {
    media: [{ id: uid(), kind: 'audio', mediaType: mime, url: `data:${mime};base64,${bytesToBase64(bytes)}`, name: `${p.handle}.${extForMime(mime, 'mp3')}` }],
  };
}

async function generateVideo(input: MediaGenInput): Promise<MediaGenOutput> {
  const { profile: p, prompt, refImages = [], signal, onProgress } = input;
  const f = input.fetchImpl ?? fetchFor(p);
  const base = trimSlash(p.baseUrl.trim());

  // 1. Alibaba DashScope / Wan video-synthesis (async task + polling)
  if (isDashScope(base)) {
    const apiBase = dashScopeApiBase(base);
    const taskInput: Record<string, unknown> = { prompt };
    if (refImages[0]?.dataUrl) taskInput.img_url = refImages[0].dataUrl;
    const submitted = await postJson(
      f,
      `${apiBase}/services/aigc/video-generation/video-synthesis`,
      { ...authHeaders(p), 'X-DashScope-Async': 'enable' },
      { model: p.modelId, input: taskInput },
      signal,
    );
    const taskId = String(((submitted.output ?? {}) as Record<string, unknown>).task_id ?? '');
    if (!taskId) throw new Error('DashScope did not return a task_id');
    onProgress?.('PENDING');
    const done = await pollDashScopeTask(f, apiBase, p.apiKey, taskId, 4000, onProgress, signal);
    const out = (done.output ?? {}) as Record<string, unknown>;
    const videoUrl = String(out.video_url ?? ((out.results as Array<{ url?: string }> | undefined)?.[0]?.url) ?? '');
    if (!videoUrl) throw new Error('No video URL returned');
    const cached = await cacheAsBlob(f, videoUrl, 'video/mp4', undefined, signal);
    return {
      media: [{ id: uid(), kind: 'video', mediaType: cached.mediaType, url: cached.url, blob: cached.blob, name: `${p.handle}.mp4` }],
    };
  }

  // 2. Google Gemini Veo (:predictLongRunning + operation polling)
  if (p.protocol === 'google') {
    const headers = { 'x-goog-api-key': p.apiKey };
    const inst: Record<string, unknown> = { prompt };
    if (refImages[0]?.dataUrl) {
      const parsed = parseDataUrl(refImages[0].dataUrl);
      if (parsed) inst.image = { bytesBase64Encoded: parsed.data, mimeType: parsed.mimeType };
    }
    const op = await postJson(
      f,
      `${base}/models/${encodeURIComponent(p.modelId)}:predictLongRunning`,
      headers,
      { instances: [inst] },
      signal,
    );
    const opName = String(op.name ?? '');
    if (!opName) throw new Error('Provider did not return an operation name');
    onProgress?.('RUNNING');
    const deadline = Date.now() + 10 * 60_000;
    let finalOp = op;
    while (!finalOp.done && Date.now() < deadline) {
      await sleep(5000, signal);
      const r = await f(`${base}/${opName.replace(/^\/+/, '')}`, { headers, signal });
      if (!r.ok) throw await readError(r);
      finalOp = (await r.json()) as Record<string, unknown>;
    }
    if (finalOp.error) {
      const err = finalOp.error as { message?: string };
      throw new Error(err.message || 'Video generation failed');
    }
    const resp = (finalOp.response ?? {}) as Record<string, unknown>;
    const gvr = (resp.generateVideoResponse ?? resp) as Record<string, unknown>;
    const samples = (gvr.generatedSamples ?? gvr.videos ?? []) as Array<{ video?: { uri?: string }; uri?: string }>;
    const uri = samples[0]?.video?.uri ?? samples[0]?.uri;
    if (!uri) throw new Error('No video URI returned');
    const cached = await cacheAsBlob(f, uri, 'video/mp4', headers, signal);
    return {
      media: [{ id: uid(), kind: 'video', mediaType: cached.mediaType, url: cached.url, blob: cached.blob, name: `${p.handle}.mp4` }],
    };
  }

  // 3. OpenAI Sora / OpenAI-compatible (/videos -> poll -> /videos/{id}/content)
  const headers = authHeaders(p);
  const job = await postJson(f, `${base}/videos`, headers, { model: p.modelId, prompt }, signal);
  const jobId = String(job.id ?? job.task_id ?? '');
  if (!jobId) throw new Error('Provider did not return a video job id');
  onProgress?.(String(job.status ?? 'queued').toUpperCase());
  const deadline = Date.now() + 10 * 60_000;
  let cur = job;
  while (Date.now() < deadline) {
    const st = String(cur.status ?? '').toLowerCase();
    if (st === 'completed' || st === 'succeeded' || st === 'done') break;
    if (st === 'failed' || st === 'error' || st === 'cancelled' || st === 'canceled') {
      const errObj = cur.error as { message?: string } | string | undefined;
      throw new Error(typeof errObj === 'string' ? errObj : errObj?.message ?? 'Video generation failed');
    }
    const pct = typeof cur.progress === 'number' ? ` ${Math.round(cur.progress)}%` : '';
    if (st) onProgress?.(`${st.toUpperCase()}${pct}`);
    await sleep(4000, signal);
    const r = await f(`${base}/videos/${encodeURIComponent(jobId)}`, { headers, signal });
    if (!r.ok) throw await readError(r);
    cur = (await r.json()) as Record<string, unknown>;
  }
  const directUrl = typeof cur.url === 'string' ? cur.url : typeof cur.video_url === 'string' ? cur.video_url : '';
  const contentUrl = directUrl || `${base}/videos/${encodeURIComponent(jobId)}/content`;
  const cached = await cacheAsBlob(f, contentUrl, 'video/mp4', directUrl ? undefined : headers, signal);
  if (!cached.blob && !cached.url) throw new Error('No video returned');
  return {
    media: [{ id: uid(), kind: 'video', mediaType: cached.mediaType, url: cached.url, blob: cached.blob, name: `${p.handle}.mp4` }],
  };
}

/** Generate image, audio, or video media from a model profile. */
export async function generateMedia(input: MediaGenInput): Promise<MediaGenOutput> {
  if (input.kind === 'image') return generateImage(input);
  if (input.kind === 'audio') return generateAudio(input);
  return generateVideo(input);
}
