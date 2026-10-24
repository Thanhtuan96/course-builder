/**
 * One-repair strict-JSON request for reviews (D-03, LOOP-02).
 *
 * This deliberately bypasses the shared JSON helper: that helper adds a generic repair instruction
 * and an independent locale retry, which would let one review cost four model calls (research
 * Pitfall 4). Here the budget is exactly two calls, and the single repair message carries the
 * validator's own rejection text.
 */
import { extractJson } from '../../lib/json.js';
import { providerError, isAbortError } from '../../lib/ai/errors.js';
import { MAX_TOKENS } from '../../lib/ai/provider-utils.js';

/** @param {string} reason */
function repairInstruction(reason) {
  return (
    `That review was not valid: ${reason}. ` +
    'Reply with ONLY the corrected review JSON, same shape, no prose, no Markdown fences.'
  );
}

/**
 * Ask the provider for a review and coerce it to strict JSON with exactly one repair retry.
 *
 * @param {object} opts
 * @param {{ streamText: (opts: object) => Promise<string> }} opts.provider
 * @param {string} [opts.system]
 * @param {Array<{ role: string, content: string }>} [opts.messages]
 * @param {AbortSignal} [opts.signal]
 * @param {(value: any) => true|string} [opts.validate]
 * @returns {Promise<any>} the parsed, validated review value
 * @throws {import('../../lib/ai/errors.js').ProviderError} `bad_json` after the second failure
 */
export async function requestReviewJson({
  provider,
  system,
  messages = [],
  signal,
  validate,
} = {}) {
  const ask = (list) =>
    provider.streamText({
      system,
      messages: list,
      signal,
      effort: 'low',
      maxTokens: MAX_TOKENS.json,
    });

  const coerce = (text) => {
    const parsed = extractJson(text);
    const verdict = validate ? validate(parsed) : true;
    if (verdict !== true) {
      throw new Error(typeof verdict === 'string' ? verdict : 'Invalid review JSON');
    }
    return parsed;
  };

  const first = await ask(messages);
  try {
    return coerce(first);
  } catch (err) {
    if (isAbortError(err)) throw err;
    const repair = [
      ...messages,
      { role: 'assistant', content: String(first).slice(0, 4000) },
      { role: 'user', content: repairInstruction(err?.message || 'invalid review JSON') },
    ];
    const second = await ask(repair);
    try {
      return coerce(second);
    } catch (err2) {
      if (isAbortError(err2)) throw err2;
      throw providerError('bad_json', err2?.message || 'Model did not return a valid review');
    }
  }
}
