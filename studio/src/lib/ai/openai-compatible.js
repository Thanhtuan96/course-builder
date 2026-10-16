/**
 * OpenAI-compatible provider — raw fetch + ReadableStream, one adapter for OpenAI, OpenRouter,
 * Groq, LM Studio and anything else speaking `POST {base}/chat/completions` with `stream: true`.
 * (No `openai` package: it adds weight and still needs per-provider special-casing.)
 */
import { parseSSE } from './sse.js';
import { createGenerateJson, MAX_TOKENS } from './provider-utils.js';
import { providerError, isAbortError } from './errors.js';
import { localFetch, classifyNetworkError, mapHttpError } from './fetch-local.js';
import { OPENAI_PRESETS, presetForBaseUrl } from './catalog.js';

/** Suggested endpoints in Settings. */
export const PRESETS = OPENAI_PRESETS;

/** Default OpenRouter model when the user picks the preset without naming one. */
export const OPENROUTER_DEFAULT_MODEL = 'openrouter/auto';

/**
 * Extra headers OpenRouter uses for attribution/rankings. Harmless for other endpoints, so we only
 * attach them when the preset (or base URL) is OpenRouter.
 * @param {string} baseUrl
 */
function attributionHeaders(baseUrl) {
  if (presetForBaseUrl(baseUrl) !== 'openrouter') return {};
  return { 'HTTP-Referer': 'https://github.com/Thanhtuan96/course-builder', 'X-Title': 'Professor Studio' };
}

/**
 * @param {{ baseUrl: string, apiKey?: string, model?: string, preset?: string, headers?: Record<string,string> }} config
 */
export function createOpenAICompatibleProvider({ baseUrl, apiKey, model, preset, headers = {} } = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const presetId = preset || presetForBaseUrl(root);
  const resolvedModel = model || (presetId === 'openrouter' ? OPENROUTER_DEFAULT_MODEL : model);

  async function streamText({ system, messages = [], signal, onText, maxTokens } = {}) {
    const body = {
      model: resolvedModel,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      stream: true,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    };
    const url = `${root}/chat/completions`;

    let res;
    try {
      res = await localFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...attributionHeaders(root),
          ...headers,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw providerError('aborted', 'Stopped');
      throw classifyNetworkError(err, { url, what: 'the provider' });
    }
    if (!res.ok) throw await mapHttpError(res, { what: 'the provider' });
    if (!res.body) throw providerError('unknown', 'The provider returned no stream');

    let full = '';
    for await (const data of parseSSE(res)) {
      if (data === '[DONE]') break;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue; // keep-alive comments and unknown frames
      }
      if (json.error) throw providerError('unknown', json.error.message || 'Provider error');
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onText?.(delta);
      }
    }
    return full;
  }

  return { streamText, generateJson: createGenerateJson(streamText), label: 'OpenAI-compatible' };
}

/** Probe `GET {base}/models` — lightest "is this endpoint alive / is my key good" check. */
export async function listOpenAICompatibleModels({ baseUrl, apiKey } = {}) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/models`;
  let res;
  try {
    res = await localFetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  } catch (err) {
    throw classifyNetworkError(err, { url, what: 'the endpoint' });
  }
  if (!res.ok) throw await mapHttpError(res, { what: 'the endpoint' });
  const json = await res.json().catch(() => ({}));
  return (json.data || []).map((m) => m.id).filter(Boolean);
}
