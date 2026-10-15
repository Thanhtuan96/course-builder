/**
 * AI provider registry. `getProvider(settings)` returns an object implementing the shared
 * interface: `streamText(...)`, `generateJson(...)`, and optionally `listModels()` / `health()`.
 */
import { createAnthropicProvider, MODELS as ANTHROPIC_MODELS } from './anthropic.js';
import { createOpenAICompatibleProvider, PRESETS as OPENAI_PRESETS } from './openai-compatible.js';
import { createOllamaProvider, DEFAULT_BASE_URL as OLLAMA_BASE_URL } from './ollama.js';
import { createBridgeProvider, DEFAULT_BRIDGE_URL } from './bridge.js';
import { MAX_TOKENS } from './provider-utils.js';
import { ProviderError } from './errors.js';

export { MAX_TOKENS, ProviderError };
export { createAnthropicProvider, createOpenAICompatibleProvider, createOllamaProvider, createBridgeProvider };
export { ANTHROPIC_MODELS, OPENAI_PRESETS };

/**
 * Metadata driving the Settings / Onboarding cards.
 * @type {{ id: string, label: string, tagline: string, pros: string, cons: string, needsKey: boolean, models?: object[] }[]}
 */
export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    tagline: 'Best lesson quality with your own API key.',
    pros: 'Highest-quality lessons and JSON',
    cons: 'Needs a paid API key',
    needsKey: true,
    models: ANTHROPIC_MODELS,
  },
  {
    id: 'openai',
    label: 'OpenAI-compatible',
    tagline: 'OpenAI, OpenRouter, Groq, LM Studio…',
    pros: 'Many providers and models',
    cons: 'Some endpoints block browser CORS',
    needsKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (free, local)',
    tagline: 'Runs on your machine, no key, no cost.',
    pros: 'Free and private',
    cons: 'Needs a local install',
    needsKey: false,
  },
  {
    id: 'bridge',
    label: 'My local agent',
    tagline: 'Use Claude Code, OpenCode or Cursor CLI.',
    pros: 'Free with your existing subscription',
    cons: 'Needs the local server running',
    needsKey: false,
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

/**
 * @param {object} settings
 * @returns {object} a provider implementing the shared interface
 */
export function getProvider(settings = {}) {
  const provider = settings.provider || 'anthropic';
  switch (provider) {
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: settings.anthropic?.apiKey || '',
        model: settings.model || settings.anthropic?.model,
      });
    case 'openai':
      return createOpenAICompatibleProvider({
        baseUrl: settings.openai?.baseUrl,
        apiKey: settings.openai?.apiKey || '',
        model: settings.model || settings.openai?.model,
      });
    case 'ollama':
      return createOllamaProvider({
        baseUrl: settings.ollama?.baseUrl || OLLAMA_BASE_URL,
        model: settings.model || settings.ollama?.model,
      });
    case 'bridge':
      return createBridgeProvider({
        bridgeUrl: settings.bridge?.bridgeUrl || settings.bridgeUrl || DEFAULT_BRIDGE_URL,
        bridgeToken: settings.bridge?.bridgeToken || settings.bridgeToken,
        agent: settings.bridge?.agent,
        model: settings.model,
      });
    default:
      throw new ProviderError('unknown', `Unknown provider: ${provider}`);
  }
}

/**
 * Streams a one-sentence reply and returns it, or throws a ProviderError with an actionable hint.
 * @param {object} settings
 * @param {{ signal?: AbortSignal, onText?: (t: string) => void }} [opts]
 * @returns {Promise<string>}
 */
export async function testConnection(settings, { signal, onText } = {}) {
  const provider = getProvider(settings);
  return provider.streamText({
    system: 'You are a connectivity test. Reply in one short sentence.',
    messages: [{ role: 'user', content: 'Say hello and confirm you are reachable.' }],
    effort: 'low',
    maxTokens: MAX_TOKENS.chat,
    signal,
    onText,
  });
}

export { createGenerateJson } from './provider-utils.js';
export { parseSSE, parseSSEStream } from './sse.js';
