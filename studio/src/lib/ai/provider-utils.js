/**
 * Shared provider helpers: JSON generation with a single repair retry, and cost caps.
 * `generateJson` is built from any provider's `streamText` so all four sources behave identically.
 */
import { extractJson } from '../json.js';
import { providerError, isAbortError } from './errors.js';

/** Default output caps per task type (cost guard — Pitfall 14). */
export const MAX_TOKENS = {
  lesson: 8000,
  json: 4000,
  chat: 2000,
};

const REPAIR_INSTRUCTION =
  'That was not valid JSON. Reply with ONLY valid JSON that matches the requested shape — ' +
  'no prose, no Markdown fences, no trailing commentary.';

/**
 * @param {(opts: object) => Promise<string>} streamText
 * @returns {(opts: { system?: string, messages: object[], signal?: AbortSignal, validate?: (value:any)=>true|string }) => Promise<any>}
 */
export function createGenerateJson(streamText) {
  return async function generateJson({ system, messages = [], signal, validate } = {}) {
    const first = await streamText({ system, messages, signal, effort: 'low', maxTokens: MAX_TOKENS.json });
    try {
      return coerce(first, validate);
    } catch (err) {
      if (isAbortError(err)) throw err;
      const repair = [
        ...messages,
        { role: 'assistant', content: String(first).slice(0, 4000) },
        { role: 'user', content: REPAIR_INSTRUCTION },
      ];
      const second = await streamText({ system, messages: repair, signal, effort: 'low', maxTokens: MAX_TOKENS.json });
      try {
        return coerce(second, validate);
      } catch (err2) {
        if (isAbortError(err2)) throw err2;
        throw providerError('bad_json', err2.message || 'Model did not return valid JSON');
      }
    }
  };
}

/**
 * @param {string} text
 * @param {((value:any)=>true|string)|undefined} validate
 */
function coerce(text, validate) {
  let parsed;
  try {
    parsed = extractJson(text);
  } catch (err) {
    throw providerError('bad_json', err.message);
  }
  if (validate) {
    const verdict = validate(parsed);
    if (verdict !== true) {
      throw providerError('bad_json', typeof verdict === 'string' ? verdict : 'JSON failed validation');
    }
  }
  return parsed;
}
