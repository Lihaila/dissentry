import type { Protocol } from './types';

export interface Preset {
  id: string;
  label: string;
  protocol: Protocol;
  baseUrl: string;
  handle: string;
  color: string;
  needsKey: boolean;
  local?: boolean;
  keyUrl?: string;
  modelHint: string;
  note?: string;
  /** Optional regional/alternate base URL shortcuts shown as quick-pick pills. */
  endpoints?: { label: string; url: string }[];
}

// Model IDs change often, so we only hint and let "Fetch models" list what your key can use.
export const PRESETS: Preset[] = [
  { id: 'anthropic', label: 'Anthropic (Claude)', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', handle: 'claude', color: '#d97757', needsKey: true, keyUrl: 'https://console.anthropic.com/settings/keys', modelHint: 'claude-sonnet-5-5' },
  { id: 'openai', label: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', handle: 'gpt', color: '#10a37f', needsKey: true, keyUrl: 'https://platform.openai.com/api-keys', modelHint: 'pick from Fetch models' },
  { id: 'google', label: 'Google Gemini', protocol: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', handle: 'gemini', color: '#4285f4', needsKey: true, keyUrl: 'https://aistudio.google.com/apikey', modelHint: 'pick from Fetch models' },
  { id: 'openrouter', label: 'OpenRouter (hundreds of models)', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', handle: 'router', color: '#6467f2', needsKey: true, keyUrl: 'https://openrouter.ai/keys', modelHint: 'vendor/model, e.g. qwen/…' },
  { id: 'deepseek', label: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com/v1', handle: 'deepseek', color: '#4d6bfe', needsKey: true, keyUrl: 'https://platform.deepseek.com/api_keys', modelHint: 'deepseek-chat' },
  {
    id: 'qwen', label: 'Qwen (Alibaba Model Studio)', protocol: 'openai',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    handle: 'qwen', color: '#615ced', needsKey: true,
    keyUrl: 'https://modelstudio.console.alibabacloud.com/', modelHint: 'qwen-plus',
    note: 'Pick the region that matches where your API key was created.',
    endpoints: [
      { label: 'Singapore (Intl)', url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
      { label: 'Beijing (CN)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
      { label: 'Virginia (US)', url: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1' },
      { label: 'Coding Plan (CN)', url: 'https://coding.dashscope.aliyuncs.com/v1' },
      { label: 'Coding Plan (Intl)', url: 'https://coding-intl.dashscope.aliyuncs.com/v1' },
    ],
  },
  { id: 'xai', label: 'xAI (Grok)', protocol: 'openai', baseUrl: 'https://api.x.ai/v1', handle: 'grok', color: '#111827', needsKey: true, keyUrl: 'https://console.x.ai/', modelHint: 'pick from Fetch models' },
  { id: 'groq', label: 'Groq', protocol: 'openai', baseUrl: 'https://api.groq.com/openai/v1', handle: 'groq', color: '#f55036', needsKey: true, keyUrl: 'https://console.groq.com/keys', modelHint: 'pick from Fetch models' },
  { id: 'mistral', label: 'Mistral', protocol: 'openai', baseUrl: 'https://api.mistral.ai/v1', handle: 'mistral', color: '#fa520f', needsKey: true, keyUrl: 'https://console.mistral.ai/api-keys', modelHint: 'mistral-large-latest' },
  { id: 'ollama', label: 'Ollama (local)', protocol: 'openai', baseUrl: 'http://localhost:11434/v1', handle: 'llama', color: '#334155', needsKey: false, local: true, modelHint: 'e.g. llama3.2, qwen3', note: 'Runs on your machine. In Docker use http://host.docker.internal:11434/v1' },
  { id: 'lmstudio', label: 'LM Studio (local)', protocol: 'openai', baseUrl: 'http://localhost:1234/v1', handle: 'local', color: '#7c3aed', needsKey: false, local: true, modelHint: 'model loaded in LM Studio', note: 'Start the server in LM Studio → Developer.' },
  { id: 'custom', label: 'Custom (OpenAI-compatible)', protocol: 'openai', baseUrl: 'http://localhost:8000/v1', handle: 'custom', color: '#64748b', needsKey: false, modelHint: 'model id', note: 'vLLM, llama.cpp server, LiteLLM, Together, Fireworks, …' },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1];
