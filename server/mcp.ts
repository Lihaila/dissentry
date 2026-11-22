import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fetch as undiciFetch } from 'undici';
import pkg from '../package.json' with { type: 'json' };
import { checkerSystemPrompt, replySystemPrompt } from '../src/lib/context';
import { findMatchingNote, maxSeverity, parseCheckResult } from '../src/lib/notes';
import { isLocalProfile, isReasoningUnsupportedError, isSearchUnsupportedError, modelCall, profileKind } from '../src/lib/providers';
import { computeTrust } from '../src/lib/trust';
import type { Check, Note, Post, Profile, Severity } from '../src/lib/types';
import { dispatcherFor } from './network';

export const MCP_PROTOCOL_VERSION = '2025-03-26';
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']);
const CALL_TIMEOUT_MS = 90_000;

interface StoredSettings {
  webSearch?: boolean;
  deepThink?: boolean;
  proxyMode?: 'system' | 'direct' | 'custom';
  proxyUrl?: string;
  proxyBypass?: string;
}

export interface DissentrySnapshot {
  app?: string;
  profiles?: Profile[];
  posts?: Post[];
  notes?: Note[];
  checks?: Check[];
  settings?: StoredSettings;
}

export interface McpRuntimeOptions {
  /** Directory containing data.json (defaults to ~/.dissentry). */
  dataDir?: string;
  /** Enforce local-only models across every MCP tool call regardless of caller arguments. */
  forceLocalOnly?: boolean;
  /** Optional env override (for tests). */
  env?: Record<string, string | undefined>;
  /** Optional custom fetch (for tests or cloud SSRF guard). */
  fetchImpl?: typeof fetch;
  /** Optional pre-resolved config (used by multi-tenant Cloud MCP; skips disk & env). */
  staticConfig?: {
    profiles: Profile[];
    settings?: StoredSettings;
    source?: string;
  };
}

interface LoadedConfig {
  profiles: Profile[];
  posts: Post[];
  notes: Note[];
  checks: Check[];
  settings: StoredSettings;
  source: string;
}

function envProfiles(env: Record<string, string | undefined>): Profile[] {
  const out: Profile[] = [];
  const now = Date.now();
  const base = (partial: Omit<Profile, 'useProxy' | 'systemPrompt' | 'enabled' | 'isChecker' | 'webSearch' | 'deepThink' | 'createdAt'>): Profile => ({
    ...partial,
    useProxy: false,
    systemPrompt: '',
    enabled: true,
    isChecker: true,
    webSearch: true,
    deepThink: false,
    createdAt: now + out.length,
  });

  if (env.OPENROUTER_API_KEY?.trim()) {
    const key = env.OPENROUTER_API_KEY.trim();
    const orBase = 'https://openrouter.ai/api/v1';
    out.push(
      base({ id: 'env-or-claude', handle: 'claude', name: 'Claude', color: '#d97706', presetId: 'openrouter', protocol: 'openai', baseUrl: orBase, modelId: 'anthropic/claude-sonnet-4', apiKey: key }),
      base({ id: 'env-or-gpt', handle: 'gpt', name: 'GPT', color: '#10a37f', presetId: 'openrouter', protocol: 'openai', baseUrl: orBase, modelId: 'openai/gpt-4.1', apiKey: key }),
      base({ id: 'env-or-gemini', handle: 'gemini', name: 'Gemini', color: '#2563eb', presetId: 'openrouter', protocol: 'openai', baseUrl: orBase, modelId: 'google/gemini-2.5-flash', apiKey: key }),
    );
  }
  if (env.ANTHROPIC_API_KEY?.trim() && !out.some((p) => p.handle === 'claude')) {
    out.push(base({
      id: 'env-anthropic', handle: 'claude', name: 'Claude', color: '#d97706',
      presetId: 'anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1',
      modelId: env.DISSENTRY_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514',
      apiKey: env.ANTHROPIC_API_KEY.trim(),
    }));
  }
  if (env.OPENAI_API_KEY?.trim() && !out.some((p) => p.handle === 'gpt')) {
    out.push(base({
      id: 'env-openai', handle: 'gpt', name: 'GPT', color: '#10a37f',
      presetId: 'openai', protocol: 'openai', baseUrl: 'https://api.openai.com/v1',
      modelId: env.DISSENTRY_OPENAI_MODEL?.trim() || 'gpt-4.1',
      apiKey: env.OPENAI_API_KEY.trim(),
    }));
  }
  const googleKey = env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (googleKey && !out.some((p) => p.handle === 'gemini')) {
    out.push(base({
      id: 'env-google', handle: 'gemini', name: 'Gemini', color: '#2563eb',
      presetId: 'google', protocol: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      modelId: env.DISSENTRY_GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
      apiKey: googleKey,
    }));
  }
  if (env.DEEPSEEK_API_KEY?.trim() && !out.some((p) => p.handle === 'deepseek')) {
    out.push(base({
      id: 'env-deepseek', handle: 'deepseek', name: 'DeepSeek', color: '#4f46e5',
      presetId: 'deepseek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1',
      modelId: env.DISSENTRY_DEEPSEEK_MODEL?.trim() || 'deepseek-chat',
      apiKey: env.DEEPSEEK_API_KEY.trim(),
    }));
  }
  if (env.DASHSCOPE_API_KEY?.trim() && !out.some((p) => p.handle === 'qwen')) {
    out.push(base({
      id: 'env-qwen', handle: 'qwen', name: 'Qwen', color: '#7c3aed',
      presetId: 'qwen', protocol: 'openai',
      baseUrl: env.DISSENTRY_QWEN_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modelId: env.DISSENTRY_QWEN_MODEL?.trim() || 'qwen-plus',
      apiKey: env.DASHSCOPE_API_KEY.trim(),
    }));
  }
  if (env.XAI_API_KEY?.trim() && !out.some((p) => p.handle === 'grok')) {
    out.push(base({
      id: 'env-xai', handle: 'grok', name: 'Grok', color: '#0f172a',
      presetId: 'xai', protocol: 'openai', baseUrl: 'https://api.x.ai/v1',
      modelId: env.DISSENTRY_XAI_MODEL?.trim() || 'grok-3',
      apiKey: env.XAI_API_KEY.trim(),
    }));
  }
  if (env.DISSENTRY_OLLAMA_MODEL?.trim()) {
    const host = (env.OLLAMA_HOST?.trim() || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    out.push(base({
      id: 'env-ollama', handle: 'ollama', name: 'Ollama', color: '#111827',
      presetId: 'ollama', protocol: 'openai', baseUrl: host.endsWith('/v1') ? host : `${host}/v1`,
      modelId: env.DISSENTRY_OLLAMA_MODEL.trim(),
      apiKey: '',
    }));
  }
  return out;
}

export async function loadDissentryConfig(opts: McpRuntimeOptions = {}): Promise<LoadedConfig> {
  if (opts.staticConfig) {
    return {
      profiles: opts.staticConfig.profiles,
      posts: [],
      notes: [],
      checks: [],
      settings: opts.staticConfig.settings ?? {},
      source: opts.staticConfig.source ?? 'Dissentry Cloud MCP',
    };
  }
  const env = opts.env ?? process.env;
  const dataDir = opts.dataDir ?? env.DISSENTRY_DATA_DIR ?? join(homedir(), '.dissentry');
  const dataFile = join(dataDir, 'data.json');

  try {
    const raw = await readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw) as DissentrySnapshot;
    if (parsed?.app === 'dissentry') {
      const fileProfiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
      const enabledChat = fileProfiles.filter((p) => p.enabled && profileKind(p) === 'chat');
      if (enabledChat.length > 0) {
        return {
          profiles: fileProfiles,
          posts: Array.isArray(parsed.posts) ? parsed.posts : [],
          notes: Array.isArray(parsed.notes) ? parsed.notes : [],
          checks: Array.isArray(parsed.checks) ? parsed.checks : [],
          settings: parsed.settings ?? {},
          source: dataFile,
        };
      }
    }
  } catch {
    // Missing or unreadable data.json; fall back to environment variables.
  }

  const fallback = envProfiles(env);
  return {
    profiles: fallback,
    posts: [],
    notes: [],
    checks: [],
    settings: {},
    source: fallback.length ? 'environment' : `${dataFile} (not configured)`,
  };
}

function makeNodeFetch(settings: StoredSettings): typeof fetch {
  const mode = settings.proxyMode === 'direct'
    ? 'direct'
    : settings.proxyMode === 'custom' && settings.proxyUrl?.trim()
      ? settings.proxyUrl.trim()
      : 'system';
  const bypass = settings.proxyMode === 'custom' ? (settings.proxyBypass ?? '') : '';

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    const dispatcher = dispatcherFor(url, mode, bypass);
    if (!dispatcher) return fetch(input, init);
    return undiciFetch(url, { ...(init as Record<string, unknown>), dispatcher } as never) as unknown as Response;
  }) as typeof fetch;
}

function cleanHandle(h: string): string {
  return h.trim().toLowerCase().replace(/^@+/, '');
}

function matchesAuthor(p: Profile, author?: string): boolean {
  if (!author?.trim()) return false;
  const target = cleanHandle(author);
  if (!target) return false;
  return (
    p.handle.toLowerCase() === target ||
    p.name.toLowerCase() === target ||
    p.modelId.toLowerCase() === target ||
    p.modelId.toLowerCase().includes(target)
  );
}

async function generateWithFallback(
  profile: Profile,
  params: { system: string; prompt: string; webSearch: boolean; deepThink: boolean; fetchImpl: typeof fetch },
) {
  let useSearch = params.webSearch;
  let useThink = params.deepThink;
  for (let attempt = 0; attempt < 3; attempt++) {
    const cfg = modelCall(profile, { webSearch: useSearch, deepThink: useThink, fetchImpl: params.fetchImpl });
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
    try {
      return await generateText({
        model: cfg.model,
        tools: cfg.tools,
        reasoning: cfg.reasoning,
        providerOptions: cfg.providerOptions,
        system: params.system,
        prompt: params.prompt,
        maxRetries: 0,
        abortSignal: ac.signal,
      });
    } catch (e) {
      if (cfg.searchActive && isSearchUnsupportedError(e)) {
        useSearch = false;
        continue;
      }
      if (cfg.thinkActive && isReasoningUnsupportedError(e)) {
        useThink = false;
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Model call failed after fallback retries');
}

export interface MergedDissentNote {
  severity: Severity;
  claim: string;
  correction: string;
  agreedBy: string[];
}

export interface CheckSummary {
  verdict: 'ok' | 'dissent' | 'error';
  notes: MergedDissentNote[];
  checkedBy: string[];
  noDissent: string[];
  errors: { model: string; error: string }[];
  localOnly: boolean;
}

async function runCheckers(args: {
  question?: string;
  answer: string;
  authorLabel: string;
  checkers: Profile[];
  webSearch: boolean;
  localOnly: boolean;
  fetchImpl: typeof fetch;
}): Promise<CheckSummary> {
  const prompt = [
    'Conversation so far:',
    args.question?.trim() ? `[user]: ${args.question.trim()}` : '(none)',
    '',
    `Answer by ${args.authorLabel} to review:`,
    '<<<',
    args.answer.slice(0, 20000),
    '>>>',
    '',
    'Return the JSON verdict now.',
  ].join('\n');

  const system = checkerSystemPrompt();
  const settled = await Promise.allSettled(
    args.checkers.map(async (checker) => {
      const res = await generateWithFallback(checker, {
        system,
        prompt,
        webSearch: args.localOnly ? false : args.webSearch,
        deepThink: false,
        fetchImpl: args.fetchImpl,
      });
      return { checker, parsed: parseCheckResult(res.text) };
    }),
  );

  const rawNotes: Note[] = [];
  const checkedBy: string[] = [];
  const noDissent: string[] = [];
  const errors: { model: string; error: string }[] = [];

  for (let i = 0; i < settled.length; i++) {
    const checker = args.checkers[i];
    const outcome = settled[i];
    if (outcome.status === 'rejected') {
      errors.push({ model: `@${checker.handle}`, error: (outcome.reason as Error)?.message ?? String(outcome.reason) });
      continue;
    }
    const { parsed } = outcome.value;
    checkedBy.push(`@${checker.handle}`);
    if (parsed.verdict === 'ok' || parsed.notes.length === 0) {
      noDissent.push(`@${checker.handle}`);
      continue;
    }
    for (const draft of parsed.notes) {
      const match = findMatchingNote(rawNotes, draft, checker.id);
      if (match) {
        match.agreeProfileIds.push(checker.id);
        match.severity = maxSeverity(match.severity, draft.severity);
      } else {
        rawNotes.push({
          id: `n-${rawNotes.length + 1}`,
          postId: 'mcp',
          profileId: checker.id,
          agreeProfileIds: [],
          claim: draft.claim,
          correction: draft.correction,
          severity: draft.severity,
          status: 'open',
          createdAt: Date.now(),
        });
      }
    }
  }

  const byId = new Map(args.checkers.map((c) => [c.id, c]));
  const severityRank: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
  const notes: MergedDissentNote[] = rawNotes
    .map((n) => ({
      severity: n.severity,
      claim: n.claim,
      correction: n.correction,
      agreedBy: [n.profileId, ...n.agreeProfileIds].map((id) => `@${byId.get(id)?.handle ?? '?'}`),
    }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.agreedBy.length - a.agreedBy.length);

  const verdict: CheckSummary['verdict'] =
    checkedBy.length === 0 && errors.length > 0 ? 'error' : notes.length > 0 ? 'dissent' : 'ok';

  return { verdict, notes, checkedBy, noDissent, errors, localOnly: args.localOnly };
}

function formatCheckMarkdown(res: CheckSummary): string {
  const lines: string[] = [];
  if (res.verdict === 'ok') {
    lines.push(`Verdict: OK — no dissent from ${res.checkedBy.join(', ')}.`);
  } else if (res.verdict === 'dissent') {
    lines.push(`Verdict: DISSENT (${res.notes.length} note${res.notes.length === 1 ? '' : 's'})`);
    for (const n of res.notes) {
      lines.push('');
      lines.push(`- [${n.severity.toUpperCase()}] (${n.agreedBy.join(' · ')})`);
      lines.push(`  Claim: "${n.claim}"`);
      lines.push(`  Correction: ${n.correction}`);
    }
    if (res.noDissent.length) {
      lines.push('');
      lines.push(`No dissent from: ${res.noDissent.join(', ')}`);
    }
  } else {
    lines.push('Verdict: ERROR — all checkers failed.');
  }
  if (res.errors.length) {
    lines.push('');
    lines.push(`Checker errors: ${res.errors.map((e) => `${e.model} (${e.error})`).join('; ')}`);
  }
  return lines.join('\n');
}

export const MCP_TOOLS = [
  {
    name: 'dissentry_list_models',
    title: 'List Configured AI Models',
    description:
      'List the AI models and fact-checkers configured in Dissentry (from ~/.dissentry/data.json or environment variables), including each model handle, provider, modelId, checker flag, and whether it runs locally or in the cloud.',
    inputSchema: {
      type: 'object',
      properties: {
        localOnly: {
          type: 'boolean',
          description: 'When true, only return local on-device models (Ollama, LM Studio, LAN).',
        },
      },
      additionalProperties: false,
    },
    annotations: { title: 'List Configured AI Models', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'dissentry_check',
    title: 'Fact-Check with Multiple AI Models',
    description:
      'Fact-check and adversarially review an AI answer, architecture plan, code snippet, or technical claim using your configured Dissentry checker models in parallel (Community Notes for AI). Checkers stay silent unless they find a concrete error, bug, outdated claim, dangerous step, or critical omission, and duplicate findings merge into consensus notes. Use for high-stakes plans, code/security reviews, and factual verification — not trivial chatter.',
    inputSchema: {
      type: 'object',
      required: ['answer'],
      properties: {
        answer: {
          type: 'string',
          description: 'The answer, plan, code, or claim to fact-check.',
        },
        question: {
          type: 'string',
          description: 'Optional original user prompt or task context.',
        },
        author: {
          type: 'string',
          description: 'Optional model handle or name that wrote the answer (e.g. "claude" or "gpt") so it does not check its own work.',
        },
        checkers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific Dissentry model handles to run as checkers (defaults to all enabled checkers).',
        },
        webSearch: {
          type: 'boolean',
          description: 'Enable provider-native web search for checkers that support it (forced off when localOnly is true).',
        },
        localOnly: {
          type: 'boolean',
          description: 'When true, restrict checking strictly to local models so sensitive data never leaves this machine.',
        },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Fact-Check with Multiple AI Models', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'dissentry_ask',
    title: 'Ask Another AI Model Family',
    description:
      'Ask one or more configured Dissentry models (e.g. gpt, gemini, claude, deepseek, qwen, grok, or local ollama) for a second opinion, optionally letting your other checker models fact-check each answer and attach consensus dissent notes.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: {
          type: 'string',
          description: 'The question or prompt to send to the model(s).',
        },
        models: {
          type: 'array',
          items: { type: 'string' },
          description: 'Model handles to ask (e.g. ["gpt", "gemini"], or ["all"]). Defaults to the first enabled chat model.',
        },
        check: {
          type: 'boolean',
          description: 'When true (default), run your other enabled checker models to fact-check each answer.',
        },
        webSearch: {
          type: 'boolean',
          description: 'Enable provider-native web search when supported (forced off when localOnly is true).',
        },
        deepThink: {
          type: 'boolean',
          description: 'Enable extended reasoning (DeepThink) when supported.',
        },
        localOnly: {
          type: 'boolean',
          description: 'When true, restrict both answering and checking strictly to local models.',
        },
      },
      additionalProperties: false,
    },
    annotations: { title: 'Ask Another AI Model Family', readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'dissentry_trust',
    title: 'Read Model Trust Statistics',
    description:
      'Read your personal model trust statistics computed from your Dissentry history (~/.dissentry/data.json), showing how often each model was corrected and how often its dissent notes were accepted.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { title: 'Read Model Trust Statistics', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as const;

function noModelsError(localOnly: boolean, source: string) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: localOnly
        ? `No local Dissentry chat models are configured (checked ${source}). Add a local model (Ollama or LM Studio) in "npx dissentry" or set DISSENTRY_OLLAMA_MODEL.`
        : `No Dissentry chat models are configured (checked ${source}). Run "npx dissentry" once to sign in with OpenRouter or add models, or set OPENROUTER_API_KEY / provider API key environment variables.`,
    }],
  };
}

export async function callMcpTool(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
  opts: McpRuntimeOptions = {},
): Promise<{ content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean }> {
  const args = rawArgs ?? {};
  const cfg = await loadDissentryConfig(opts);
  const effectiveLocalOnly = Boolean(opts.forceLocalOnly || args.localOnly);
  const fetchImpl = opts.fetchImpl ?? makeNodeFetch(cfg.settings);

  const chatProfiles = cfg.profiles.filter(
    (p) => p.enabled && profileKind(p) === 'chat' && (!effectiveLocalOnly || isLocalProfile(p)),
  );

  if (name === 'dissentry_list_models') {
    const trust = computeTrust(cfg.profiles, cfg.posts, cfg.notes, cfg.checks);
    const trustById = new Map(trust.map((r) => [r.profile.id, r]));
    const items = chatProfiles.map((p) => {
      const tr = trustById.get(p.id);
      return {
        handle: p.handle,
        name: p.name,
        modelId: p.modelId,
        provider: p.presetId,
        location: isLocalProfile(p) ? 'local' : 'cloud',
        isChecker: p.isChecker,
        webSearch: p.webSearch !== false,
        deepThink: !!p.deepThink,
        ...(tr && (tr.answers > 0 || tr.checksRun > 0)
          ? { answers: tr.answers, correctedAnswers: tr.correctedAnswers, notesWritten: tr.notesWritten, notesAccepted: tr.notesAccepted }
          : {}),
      };
    });
    const structured = {
      source: cfg.source,
      localOnly: effectiveLocalOnly,
      models: items,
    };
    const text = items.length === 0
      ? noModelsError(effectiveLocalOnly, cfg.source).content[0].text
      : [
          `Configured Dissentry chat models (${items.length}, source: ${cfg.source}${effectiveLocalOnly ? ', local-only locked' : ''}):`,
          ...items.map(
            (m) => `- @${m.handle} (${m.modelId}) · ${m.location}${m.isChecker ? ' · checker' : ''}`,
          ),
        ].join('\n');
    return { content: [{ type: 'text', text }], structuredContent: structured };
  }

  if (name === 'dissentry_trust') {
    const rows = computeTrust(cfg.profiles, cfg.posts, cfg.notes, cfg.checks).map((r) => ({
      handle: r.profile.handle,
      name: r.profile.name,
      modelId: r.profile.modelId,
      location: isLocalProfile(r.profile) ? 'local' : 'cloud',
      answers: r.answers,
      checkedAnswers: r.checkedAnswers,
      correctedAnswers: r.correctedAnswers,
      checksRun: r.checksRun,
      notesWritten: r.notesWritten,
      notesAccepted: r.notesAccepted,
      notesDismissed: r.notesDismissed,
    }));
    const text = rows.length === 0
      ? `No Dissentry trust history found in ${cfg.source}.`
      : [
          `Dissentry personal trust stats (${cfg.source}):`,
          ...rows.map(
            (r) => `- @${r.handle} (${r.modelId}): ${r.answers} answers (${r.correctedAnswers} corrected), ${r.checksRun} checks, ${r.notesWritten} notes (${r.notesAccepted} accepted, ${r.notesDismissed} dismissed)`,
          ),
        ].join('\n');
    return { content: [{ type: 'text', text }], structuredContent: { source: cfg.source, rows } };
  }

  if (name === 'dissentry_check') {
    const answer = typeof args.answer === 'string' ? args.answer.trim() : '';
    if (!answer) {
      return { isError: true, content: [{ type: 'text', text: 'Missing required parameter "answer".' }] };
    }
    const question = typeof args.question === 'string' ? args.question : undefined;
    const author = typeof args.author === 'string' ? args.author : undefined;
    const requestedCheckers = Array.isArray(args.checkers)
      ? args.checkers.filter((x): x is string => typeof x === 'string').map(cleanHandle).filter(Boolean)
      : [];

    if (chatProfiles.length === 0) return noModelsError(effectiveLocalOnly, cfg.source);

    let checkers: Profile[];
    if (requestedCheckers.length > 0) {
      checkers = chatProfiles.filter((p) => requestedCheckers.includes(p.handle.toLowerCase()));
      if (checkers.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: `None of the requested checkers (${requestedCheckers.join(', ')}) are enabled${effectiveLocalOnly ? ' as local models' : ''}. Available: ${chatProfiles.map((p) => `@${p.handle}`).join(', ')}.` }],
        };
      }
    } else {
      const enabledCheckers = chatProfiles.filter((p) => p.isChecker && !matchesAuthor(p, author));
      checkers = enabledCheckers.length > 0
        ? enabledCheckers
        : chatProfiles.filter((p) => !matchesAuthor(p, author));
      if (checkers.length === 0) checkers = chatProfiles;
    }

    const webSearch = effectiveLocalOnly ? false : (typeof args.webSearch === 'boolean' ? args.webSearch : (cfg.settings.webSearch ?? true));
    const result = await runCheckers({
      question,
      answer,
      authorLabel: author?.trim() ? `@${cleanHandle(author)}` : 'another AI model',
      checkers,
      webSearch,
      localOnly: effectiveLocalOnly,
      fetchImpl,
    });

    return {
      isError: result.verdict === 'error',
      content: [{ type: 'text', text: formatCheckMarkdown(result) }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  }

  if (name === 'dissentry_ask') {
    const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
    if (!prompt) {
      return { isError: true, content: [{ type: 'text', text: 'Missing required parameter "prompt".' }] };
    }
    if (chatProfiles.length === 0) return noModelsError(effectiveLocalOnly, cfg.source);

    const requested = Array.isArray(args.models)
      ? args.models.filter((x): x is string => typeof x === 'string').map(cleanHandle).filter(Boolean)
      : [];

    let targets: Profile[];
    if (requested.length === 0) {
      targets = [chatProfiles[0]];
    } else if (requested.includes('all')) {
      targets = chatProfiles;
    } else {
      targets = chatProfiles.filter((p) => requested.includes(p.handle.toLowerCase()));
      if (targets.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: `None of the requested models (${requested.join(', ')}) are enabled${effectiveLocalOnly ? ' as local models' : ''}. Available: ${chatProfiles.map((p) => `@${p.handle}`).join(', ')}.` }],
        };
      }
    }

    const wantCheck = args.check !== false;
    const webSearch = effectiveLocalOnly ? false : (typeof args.webSearch === 'boolean' ? args.webSearch : (cfg.settings.webSearch ?? true));
    const deepThink = typeof args.deepThink === 'boolean' ? args.deepThink : Boolean(cfg.settings.deepThink);

    const answers = await Promise.all(
      targets.map(async (target) => {
        try {
          const res = await generateWithFallback(target, {
            system: replySystemPrompt(target, chatProfiles),
            prompt,
            webSearch,
            deepThink,
            fetchImpl,
          });
          const peerCheckers = wantCheck
            ? chatProfiles.filter((p) => p.isChecker && p.id !== target.id)
            : [];
          const check = peerCheckers.length > 0
            ? await runCheckers({
                question: prompt,
                answer: res.text,
                authorLabel: `@${target.handle} (${target.modelId})`,
                checkers: peerCheckers,
                webSearch,
                localOnly: effectiveLocalOnly,
                fetchImpl,
              })
            : undefined;
          return {
            handle: target.handle,
            modelId: target.modelId,
            location: isLocalProfile(target) ? 'local' : 'cloud',
            answer: res.text,
            ...(check ? { check } : {}),
          };
        } catch (e) {
          return {
            handle: target.handle,
            modelId: target.modelId,
            location: isLocalProfile(target) ? 'local' : 'cloud',
            error: (e as Error)?.message ?? String(e),
          };
        }
      }),
    );

    const sections = answers.map((a) => {
      if ('error' in a) {
        return `### @${a.handle} (${a.modelId}) — Error\n${a.error}`;
      }
      const parts = [`### @${a.handle} (${a.modelId})`, a.answer];
      if (a.check) {
        parts.push('', `**Fact-check:** ${formatCheckMarkdown(a.check)}`);
      }
      return parts.join('\n');
    });

    const allFailed = answers.every((a) => 'error' in a);
    return {
      isError: allFailed,
      content: [{ type: 'text', text: sections.join('\n\n---\n\n') }],
      structuredContent: { localOnly: effectiveLocalOnly, answers },
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
  };
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Handle one JSON-RPC 2.0 MCP message. Returns null for notifications that expect no reply. */
export async function handleMcpMessage(
  msg: JsonRpcRequest,
  opts: McpRuntimeOptions = {},
): Promise<JsonRpcResponse | null> {
  const isNotification = msg.id === undefined;
  const id = msg.id ?? null;

  if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } };
  }

  switch (msg.method) {
    case 'initialize': {
      const requested = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '';
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.has(requested) ? requested : MCP_PROTOCOL_VERSION;
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion,
          capabilities: { tools: {} },
          serverInfo: {
            name: 'dissentry',
            title: 'Dissentry',
            version: pkg.version,
            websiteUrl: 'https://dissentry.lihaila.com/mcp',
            icons: [{ src: 'https://dissentry.lihaila.com/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] }],
          },
          instructions: opts.staticConfig
            ? 'Dissentry Cloud MCP provides multi-model fact-checking (Community Notes for AI) using the models you authorized via OAuth. Use dissentry_check to adversarially verify high-stakes answers, plans, or code; use dissentry_ask for a second opinion from another model family.'
            : 'Dissentry provides multi-model fact-checking (Community Notes for AI) using the models and keys configured locally in ~/.dissentry/data.json. Use dissentry_check to adversarially verify high-stakes answers, plans, or code; use dissentry_ask for a second opinion from another model family.',
        },
      };
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return isNotification ? null : { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return isNotification ? null : { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };
    case 'resources/list':
      return isNotification ? null : { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'resources/templates/list':
      return isNotification ? null : { jsonrpc: '2.0', id, result: { resourceTemplates: [] } };
    case 'prompts/list':
      return isNotification ? null : { jsonrpc: '2.0', id, result: { prompts: [] } };
    case 'tools/call': {
      if (isNotification) return null;
      const toolName = typeof msg.params?.name === 'string' ? msg.params.name : '';
      if (!toolName) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
      }
      const toolArgs = (msg.params?.arguments && typeof msg.params.arguments === 'object'
        ? msg.params.arguments
        : {}) as Record<string, unknown>;
      try {
        const res = await callMcpTool(toolName, toolArgs, opts);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: res.content,
            ...(res.isError ? { isError: true } : {}),
          },
        };
      } catch (e) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: (e as Error)?.message ?? String(e) }],
          },
        };
      }
    }
    default:
      if (isNotification) return null;
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

/** Run the MCP server over newline-delimited JSON-RPC 2.0 on stdin/stdout. */
export function startMcpStdioServer(opts: McpRuntimeOptions = {}) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const write = (res: JsonRpcResponse) => {
    process.stdout.write(`${JSON.stringify(res)}\n`);
  };

  let pending = 0;
  let closed = false;
  const maybeExit = () => {
    if (closed && pending === 0) process.exit(0);
  };

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    pending++;
    void handleMcpMessage(parsed, opts)
      .then((res) => { if (res) write(res); })
      .catch((e) => {
        if (parsed.id !== undefined) {
          write({ jsonrpc: '2.0', id: parsed.id ?? null, error: { code: -32603, message: (e as Error)?.message ?? 'Internal error' } });
        }
      })
      .finally(() => {
        pending--;
        maybeExit();
      });
  });

  rl.on('close', () => {
    closed = true;
    maybeExit();
  });
}

/**
 * Stateless MCP Streamable HTTP endpoint handler (POST / DELETE).
 * Compatible with DSH (streamable-http), WorkBuddy, Qwen Work / Qwen Code (httpUrl),
 * Claude Code, Cursor, Windsurf, and any standard MCP Streamable HTTP client.
 */
export async function handleMcpHttpRequest(req: Request, opts: McpRuntimeOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
  };
  const sessionId = req.headers.get('mcp-session-id');
  if (sessionId) headers['mcp-session-id'] = sessionId;

  if (req.method === 'DELETE') {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed; send JSON-RPC 2.0 via POST /mcp' }), {
      status: 405,
      headers: { ...headers, allow: 'POST, DELETE', 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }),
      { status: 400, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  if (Array.isArray(body)) {
    if (body.length === 0) {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }),
        { status: 400, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } },
      );
    }
    const results = (await Promise.all(body.map((item) => handleMcpMessage(item as JsonRpcRequest, opts)))).filter(
      (r): r is JsonRpcResponse => r !== null,
    );
    if (results.length === 0) return new Response(null, { status: 202, headers });
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const res = await handleMcpMessage(body as JsonRpcRequest, opts);
  if (!res) return new Response(null, { status: 202, headers });
  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}
