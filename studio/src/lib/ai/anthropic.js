/**
 * Anthropic BYOK provider — official SDK in the browser (AI-05).
 *
 * `dangerouslyAllowBrowser: true` makes the SDK add the required
 * `anthropic-dangerous-direct-browser-access` header for you; do NOT add it by hand.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ProviderError, providerError, isAbortError } from './errors.js';
import { createGenerateJson, MAX_TOKENS } from './provider-utils.js';
import { ANTHROPIC_MODELS, ANTHROPIC_DEFAULT_MODEL } from './catalog.js';

export const DEFAULT_MODEL = ANTHROPIC_DEFAULT_MODEL;

/** @type {{ id: string, label: string, advanced?: boolean }[]} */
export const MODELS = ANTHROPIC_MODELS;

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * @param {{ apiKey: string, model?: string }} config
 */
export function createAnthropicProvider({ apiKey, model = DEFAULT_MODEL } = {}) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  async function request(params, { signal, onText }) {
    const stream = client.beta.messages.stream(params, { signal });
    let text = '';
    try {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          text += event.delta.text;
          onText?.(event.delta.text);
        }
      }
      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') {
        throw providerError('refusal', 'The model declined this request.');
      }
      if (!text && Array.isArray(message.content)) {
        text = message.content.map((block) => block.text || '').join('');
      }
      return text;
    } catch (err) {
      if (isAbortError(err)) throw providerError('aborted', 'Stopped');
      throw err;
    }
  }

  /**
   * @param {{ system?: string, messages: object[], signal?: AbortSignal, onText?: (t:string)=>void, effort?: string, maxTokens?: number }} opts
   */
  async function streamText({ system, messages = [], signal, onText, effort = 'low', maxTokens } = {}) {
    const useFallback = model !== 'claude-haiku-5-5';
    const base = {
      model,
      max_tokens: maxTokens || MAX_TOKENS.lesson,
      system,
      messages,
      output_config: { effort },
    };
    if (useFallback) {
      base.betas = [FALLBACK_BETA];
      base.fallbacks = 'default';
    }

    try {
      return await request(base, { signal, onText });
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      // A 400 mentioning fallbacks/beta means the account/model does not support the beta — retry plain.
      if (useFallback && isFallbackRejection(err)) {
        const plain = { ...base };
        delete plain.betas;
        delete plain.fallbacks;
        try {
          return await request(plain, { signal, onText });
        } catch (retryErr) {
          throw mapAnthropicError(retryErr);
        }
      }
      throw mapAnthropicError(err);
    }
  }

  return { streamText, generateJson: createGenerateJson(streamText), label: 'Anthropic' };
}

function isFallbackRejection(err) {
  const status = err?.status;
  const message = String(err?.message || '').toLowerCase();
  return (status === 400 || status === 404) && (message.includes('fallback') || message.includes('beta'));
}

export function mapAnthropicError(err) {
  if (err instanceof ProviderError) return err;
  if (isAbortError(err)) return providerError('aborted', 'Stopped');
  const status = err?.status;
  const message = String(err?.message || '');
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) return providerError('auth', message);
  // The SDK throws this (without a status) when no key resolves on the client.
  if (lower.includes('authentication') || lower.includes('api key') || lower.includes('api_key')) {
    return providerError('auth', message || 'Add your Anthropic API key');
  }
  if (status === 429) return providerError('rate_limit', message);
  if (status >= 500) return providerError('network', message);
  if (err instanceof TypeError) return providerError('network', message || 'Network error reaching Anthropic');
  return providerError('unknown', message || 'Anthropic request failed');
}
