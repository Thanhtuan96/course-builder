/**
 * AI provider registry.
 *
 * `getProvider(settings)` is async and dynamic-imports only the chosen adapter, so the Anthropic
 * SDK and the other heavy modules stay out of the main bundle. It validates configuration first
 * (see config.js) so a missing key/URL fails fast with an actionable ProviderError instead of a
 * raw SDK message.
 *
 * Provider interface: `streamText(...)`, `generateJson(...)`, optionally `listModels()` / `health()`.
 */
import { providerError } from './errors.js';
import { configIssue } from './config.js';
import { isLoopbackBridgeUrl } from '../settings.js';
import { MAX_TOKENS } from './provider-utils.js';
import { ProviderError } from './errors.js';
import {
  ANTHROPIC_MODELS,
  OPENAI_PRESETS,
  OLLAMA_DEFAULT_BASE_URL,
  BRIDGE_DEFAULT_URL,
  DEFAULT_BRIDGE_AGENT,
  presetForBaseUrl,
} from './catalog.js';

export { MAX_TOKENS, ProviderError };
export { ANTHROPIC_MODELS, OPENAI_PRESETS };
export { configIssue, isConfigured } from './config.js';
export { BRIDGE_AGENTS, BRIDGE_AGENT_IDS, DEFAULT_BRIDGE_AGENT } from './catalog.js';

/**
 * The model a provider should use, read ONLY from that provider's own slot. The top-level
 * `settings.model` is never consulted — that legacy field leaked one provider's model into another
 * (e.g. an Anthropic id reaching the OpenCode bridge). The bridge additionally scopes the model to
 * the selected agent.
 *
 * @param {object} settings
 * @param {string} provider
 * @param {string} [agent] bridge agent id (defaults to `settings.bridge.agent`)
 * @returns {string|undefined} the model id, or undefined to let the provider pick its default
 */
export function resolveProviderModel(settings = {}, provider = settings.provider, agent) {
  switch (provider) {
    case 'anthropic':
      return settings.anthropic?.model || undefined;
    case 'openai':
      return settings.openai?.model || undefined;
    case 'ollama':
      return settings.ollama?.model || undefined;
    case 'bridge': {
      const chosen = agent || settings.bridge?.agent || DEFAULT_BRIDGE_AGENT;
      return settings.bridge?.models?.[chosen] || undefined;
    }
    default:
      return undefined;
  }
}

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
    tagline: 'Use Claude Code, OpenCode, Cursor, Gemini, Antigravity or Ollama.',
    pros: 'Free with your existing subscription',
    cons: 'Needs the local server running',
    needsKey: false,
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

/** Origins the Studio CSP allows for BYOK API providers (mirrors studio/index.html). */
const CSP_PROVIDER_ORIGINS = new Set(['https://api.openai.com', 'https://openrouter.ai', 'https://api.groq.com']);

/**
 * Fail fast when a configured base URL cannot be reached under the shipped CSP. A malformed URL is
 * a configuration error; a well-formed but unlisted origin is a CSP limitation.
 * @param {unknown} value
 */
function assertCspAllowedBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw providerError('config');
  }
  if (isLoopbackBridgeUrl(url.href) || CSP_PROVIDER_ORIGINS.has(url.origin)) return;
  throw providerError('csp_blocked');
}

/**
 * Build the provider for the active settings, loading its adapter on demand.
 * @param {object} settings
 * @returns {Promise<object>}
 */
export async function getProvider(settings = {}) {
  const provider = settings.provider || 'anthropic';

  const issue = configIssue(settings, provider);
  if (issue) throw providerError(issue.code, issue.message, issue.hint);
  if (provider === 'openai') assertCspAllowedBaseUrl(settings.openai?.baseUrl);
  if (provider === 'ollama') {
    const ollamaUrl = settings.ollama?.baseUrl || OLLAMA_DEFAULT_BASE_URL;
    if (!isLoopbackBridgeUrl(ollamaUrl)) throw providerError('csp_blocked');
  }

  switch (provider) {
    case 'anthropic': {
      const { createAnthropicProvider } = await import('./anthropic.js');
      return createAnthropicProvider({
        apiKey: settings.anthropic?.apiKey || '',
        model: resolveProviderModel(settings, 'anthropic'),
      });
    }
    case 'openai': {
      const { createOpenAICompatibleProvider } = await import('./openai-compatible.js');
      const baseUrl = settings.openai?.baseUrl;
      return createOpenAICompatibleProvider({
        baseUrl,
        apiKey: settings.openai?.apiKey || '',
        model: resolveProviderModel(settings, 'openai'),
        preset: settings.openai?.preset || presetForBaseUrl(baseUrl),
      });
    }
    case 'ollama': {
      const { createOllamaProvider } = await import('./ollama.js');
      return createOllamaProvider({
        baseUrl: settings.ollama?.baseUrl || OLLAMA_DEFAULT_BASE_URL,
        model: resolveProviderModel(settings, 'ollama'),
      });
    }
    case 'bridge': {
      const { createBridgeProvider } = await import('./bridge.js');
      const agent = settings.bridge?.agent || DEFAULT_BRIDGE_AGENT;
      return createBridgeProvider({
        bridgeUrl: settings.bridge?.bridgeUrl || settings.bridgeUrl || BRIDGE_DEFAULT_URL,
        bridgeToken: settings.bridge?.bridgeToken || settings.bridgeToken,
        agent,
        model: resolveProviderModel(settings, 'bridge', agent),
      });
    }
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
  const provider = await getProvider(settings);
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
