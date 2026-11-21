// Brand logos from @lobehub/icons (MIT). Logos are trademarks of their respective owners
// and are used only to identify which model wrote a post.
import claude from '@lobehub/icons-static-svg/icons/claude-color.svg?url';
import cohere from '@lobehub/icons-static-svg/icons/cohere-color.svg?url';
import deepseek from '@lobehub/icons-static-svg/icons/deepseek-color.svg?url';
import doubao from '@lobehub/icons-static-svg/icons/doubao-color.svg?url';
import gemini from '@lobehub/icons-static-svg/icons/gemini-color.svg?url';
import grok from '@lobehub/icons-static-svg/icons/grok.svg?url';
import groq from '@lobehub/icons-static-svg/icons/groq.svg?url';
import kimi from '@lobehub/icons-static-svg/icons/kimi-color.svg?url';
import lmstudio from '@lobehub/icons-static-svg/icons/lmstudio.svg?url';
import meta from '@lobehub/icons-static-svg/icons/meta-color.svg?url';
import minimax from '@lobehub/icons-static-svg/icons/minimax-color.svg?url';
import mistral from '@lobehub/icons-static-svg/icons/mistral-color.svg?url';
import ollama from '@lobehub/icons-static-svg/icons/ollama.svg?url';
import openai from '@lobehub/icons-static-svg/icons/openai.svg?url';
import openrouter from '@lobehub/icons-static-svg/icons/openrouter.svg?url';
import perplexity from '@lobehub/icons-static-svg/icons/perplexity-color.svg?url';
import qwen from '@lobehub/icons-static-svg/icons/qwen-color.svg?url';
import zhipu from '@lobehub/icons-static-svg/icons/zhipu-color.svg?url';
import type { Profile } from './types';

// The model family wins over the provider: "anthropic/claude-…" on OpenRouter shows Claude,
// "llama3" on Ollama shows Meta.
const BY_MODEL: [RegExp, string][] = [
  [/claude/, claude],
  [/(^|\/)(gpt|chatgpt|o[1-9](-|$)|openai)/, openai],
  [/gemini|gemma/, gemini],
  [/deepseek/, deepseek],
  [/qwen|qwq/, qwen],
  [/grok/, grok],
  [/mistral|mixtral|codestral|magistral|ministral|devstral/, mistral],
  [/llama/, meta],
  [/kimi|moonshot/, kimi],
  [/glm|zhipu|chatglm/, zhipu],
  [/doubao/, doubao],
  [/minimax|abab/, minimax],
  [/command|cohere|aya/, cohere],
  [/sonar|perplexity/, perplexity],
];

const BY_PRESET: Record<string, string> = {
  anthropic: claude, openai, google: gemini, openrouter, deepseek, qwen, xai: grok,
  groq, mistral, ollama, lmstudio,
};

export function logoFor(p: Pick<Profile, 'modelId' | 'presetId'>): string | undefined {
  const id = (p.modelId ?? '').toLowerCase();
  for (const [re, url] of BY_MODEL) if (re.test(id)) return url;
  return BY_PRESET[p.presetId];
}

export const presetLogo = (presetId: string): string | undefined => BY_PRESET[presetId];
