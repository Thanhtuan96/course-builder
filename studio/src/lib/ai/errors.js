/**
 * Provider error taxonomy. Every provider adapter throws ProviderError so the UI can show a
 * distinct, actionable message per failure mode (AI-02) instead of a generic "connection failed".
 */

export const ERROR_CODES = [
  'auth',
  'network',
  'cors',
  'local_network_blocked',
  'rate_limit',
  'refusal',
  'bad_json',
  'not_running',
  'aborted',
  'unknown',
];

/** Default human hints per code. Providers override when they have something more specific. */
export const ERROR_HINTS = {
  auth: 'Check the API key — it was rejected. Re-enter it in Settings.',
  network: 'Could not reach the provider. Check your internet connection and try again.',
  cors: 'The provider blocked the browser request (CORS). Try a different source or run the app locally with `npm run dev`.',
  local_network_blocked:
    'Your browser blocked access to a local server (Local Network Access). Allow the local-network permission prompt, or run Studio itself locally with `npm run dev`.',
  rate_limit: 'The provider is rate limiting you. Wait a moment, or switch to a local source.',
  refusal: 'The model declined to answer this request. Rephrase it, or try a different model.',
  bad_json: 'The model did not return valid JSON. Try again, or use a larger model.',
  not_running: 'The local server is not reachable. Start it and try again.',
  aborted: 'Stopped.',
  unknown: 'Something went wrong talking to the provider.',
};

export class ProviderError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {string} [hint]
   * @param {{ cause?: unknown }} [opts]
   */
  constructor(code, message, hint, opts = {}) {
    super(message || ERROR_HINTS[code] || ERROR_HINTS.unknown);
    this.name = 'ProviderError';
    this.code = ERROR_CODES.includes(code) ? code : 'unknown';
    this.hint = hint || ERROR_HINTS[this.code];
    if (opts.cause) this.cause = opts.cause;
  }
}

/**
 * @param {string} code
 * @param {string} [message]
 * @param {string} [hint]
 */
export function providerError(code, message, hint) {
  return new ProviderError(code, message, hint);
}

/** True when the error means the user aborted. */
export function isAbortError(err) {
  return err?.name === 'AbortError' || err?.name === 'APIUserAbortError' || err?.code === 'aborted';
}
