/**
 * OpenAI-compatible provider — raw fetch + ReadableStream, one adapter for OpenAI, OpenRouter,
 * Groq, LM Studio and anything else speaking `POST {base}/chat/completions` with `stream: true`.
 * (No `openai` package: it adds weight and still needs per-provider special-casing.)
 */
import { parseSSE } from './sse.js';
import { createGenerateJson, MAX_TOKENS } from './provider-utils.js';
import { providerError, isAbortError } from './errors.js';
import { localFetch, classifyNetworkError, mapHttpError } from './fetch-local.js';

/** Suggested endpoints in Settings. */
export const PRESETS = [
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', note: 'Direct browser access may be blocked by CORS at times.' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.5-sonnet', note: 'Reliable from the browser.' },
  { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', note: 'Fast; they recommend a proxy for keys.' },
  { id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', note: 'Enable CORS in LM Studio; local sources work best with `npm run dev`.' },
  { id: 'custom', label: 'Custom', baseUrl: '', model: '', note: 'Any OpenAI-compatible endpoint.' },
];

/**
 * @param {{ baseUrl: string, apiKey?: string, model: string, headers?: Record<string,string> }} config
 */
export function createOpenAICompatibleProvider({ baseUrl, apiKey, model, headers = {} } = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');

  async function streamText({ system, messages = [], signal, onText, maxTokens } = {}) {
    const body = {
      model,
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
