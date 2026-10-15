/**
 * Provider configuration prechecks. Pure helpers (no React, no SDK imports) so both the AI
 * registry and the UI can validate a provider before any network call.
 *
 * Every issue is `{ code, message, hint }` ready to become a ProviderError.
 */

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {object} settings
 * @param {string} [provider]
 * @returns {{ code: string, message: string, hint: string } | null}
 */
export function configIssue(settings = {}, provider = settings.provider) {
  switch (provider) {
    case 'anthropic':
      if (!filled(settings.anthropic?.apiKey)) {
        return {
          code: 'auth',
          message: 'Add your Anthropic API key',
          hint: 'Open Settings and paste your `sk-ant-…` key, then press Test connection.',
        };
      }
      return null;
    case 'openai':
      if (!filled(settings.openai?.baseUrl)) {
        return {
          code: 'auth',
          message: 'Add a base URL for the OpenAI-compatible endpoint',
          hint: 'Pick a preset or paste a base URL such as https://openrouter.ai/api/v1.',
        };
      }
      return null;
    case 'ollama':
      if (!filled(settings.ollama?.baseUrl)) {
        return {
          code: 'unknown',
          message: 'Add the Ollama base URL',
          hint: 'The default is http://localhost:11434/v1.',
        };
      }
      return null;
    case 'bridge':
      if (!filled(settings.bridge?.bridgeUrl) && !filled(settings.bridgeUrl)) {
        return {
          code: 'auth',
          message: 'Add the local bridge URL',
          hint: 'Run `npx course-professor web` and paste the URL it prints.',
        };
      }
      if (!filled(settings.bridge?.bridgeToken) && !filled(settings.bridgeToken)) {
        return {
          code: 'auth',
          message: 'Add the pairing token',
          hint: 'The token is printed by the local server when it starts.',
        };
      }
      return null;
    default:
      return { code: 'unknown', message: `Unknown provider: ${provider}`, hint: 'Pick a provider in Settings.' };
  }
}

/** @param {object} settings @param {string} [provider] */
export function isConfigured(settings, provider) {
  return configIssue(settings, provider) === null;
}
