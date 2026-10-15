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
import { MAX_TOKENS } from './provider-utils.js';
import { ProviderError } from './errors.js';
import {
  ANTHROPIC_MODELS,
  OPENAI_PRESETS,
  OLLAMA_DEFAULT_BASE_URL,
  BRIDGE_DEFAULT_URL,
} from './catalog.js';

export { MAX_TOKENS, ProviderError };
export { ANTHROPIC_MODELS, OPENAI_PRESETS };
export { configIssue, isConfigured } from './config.js';

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
 * Build the provider for the active settings, loading its adapter on demand.
 * @param {object} settings
 * @returns {Promise<object>}
 */
export async function getProvider(settings = {}) {
  const provider = settings.provider || 'anthropic';

  const issue = configIssue(settings, provider);
  if (issue) throw providerError(issue.code, issue.message, issue.hint);

  switch (provider) {
    case 'anthropic': {
      const { createAnthropicProvider } = await import('./anthropic.js');
      return createAnthropicProvider({
        apiKey: settings.anthropic?.apiKey || '',
        model: settings.model || settings.anthropic?.model,
      });
    }
    case 'openai': {
      const { createOpenAICompatibleProvider } = await import('./openai-compatible.js');
      return createOpenAICompatibleProvider({
        baseUrl: settings.openai?.baseUrl,
        apiKey: settings.openai?.apiKey || '',
        model: settings.model || settings.openai?.model,
      });
    }
    case 'ollama': {
      const { createOllamaProvider } = await import('./ollama.js');
      return createOllamaProvider({
        baseUrl: settings.ollama?.baseUrl || OLLAMA_DEFAULT_BASE_URL,
        model: settings.model || settings.ollama?.model,
      });
    }
    case 'bridge': {
      const { createBridgeProvider } = await import('./bridge.js');
      return createBridgeProvider({
        bridgeUrl: settings.bridge?.bridgeUrl || settings.bridgeUrl || BRIDGE_DEFAULT_URL,
        bridgeToken: settings.bridge?.bridgeToken || settings.bridgeToken,
        agent: settings.bridge?.agent,
        model: settings.model,
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
