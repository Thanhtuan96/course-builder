/**
 * fetch wrapper for local (loopback) targets.
 *
 * Chrome ≥142 gates a public origin's requests to the local network behind a permission prompt
 * ("Local Network Access"). Declaring `targetAddressSpace: 'loopback'` for known-local hosts is the
 * documented opt-in; browsers that reject the option get a retry without it (feature detection).
 *
 * Failure classification is deliberately separate so Settings can show the right hint:
 *   local_network_blocked · cors · not_running
 */
import { providerError } from './errors.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];

/** @param {string} url */
export function isLocalUrl(url) {
  try {
    const base = globalThis.location?.href || 'http://localhost/';
    const host = new URL(url, base).hostname;
    return LOCAL_HOSTS.includes(host) || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

export function isPageLocal() {
  try {
    return isLocalUrl(globalThis.location?.origin || 'http://localhost');
  } catch {
    return true;
  }
}

/**
 * fetch with Local Network Access opt-in for loopback hosts.
 * @param {string} url
 * @param {RequestInit & { targetAddressSpace?: string }} [options]
 */
export async function localFetch(url, options = {}) {
  const local = isLocalUrl(url);
  const withOption = local && !options.targetAddressSpace ? { ...options, targetAddressSpace: 'loopback' } : options;
  try {
    return await fetch(url, withOption);
  } catch (err) {
    // Some browsers throw on the unknown/unsupported option — retry once without it.
    if (withOption !== options && String(err?.message || '').toLowerCase().includes('targetaddressspace')) {
      return fetch(url, options);
    }
    throw err;
  }
}

/**
 * Map a thrown fetch error into a ProviderError with an actionable code.
 * @param {unknown} err
 * @param {{ url: string, what?: string, notRunningHint?: string }} opts
 */
export function classifyNetworkError(err, { url, what = 'provider', notRunningHint } = {}) {
  const message = String(err?.message || err || '');
  const lower = message.toLowerCase();
  const local = isLocalUrl(url);

  if (lower.includes('address space') || lower.includes('local network') || lower.includes('mixed content') || lower.includes('permission')) {
    return providerError('local_network_blocked', message || `${what} blocked by the browser`);
  }
  if (lower.includes('cors') || lower.includes('blocked by')) {
    return providerError('cors', message || `${what} blocked by CORS`);
  }
  if (err instanceof TypeError) {
    if (local && isPageLocal()) {
      return providerError('not_running', `${what} is not reachable`, notRunningHint);
    }
    return providerError('cors', message || `${what} could not be reached from the browser`, undefined);
  }
  return providerError('network', message || `${what} connection failed`);
}

/**
 * Map a non-OK HTTP response into a ProviderError.
 * @param {Response} res
 * @param {{ what?: string }} [opts]
 */
export async function mapHttpError(res, { what = 'provider' } = {}) {
  let body = '';
  try {
    body = (await res.text()).slice(0, 500);
  } catch {
    /* ignore */
  }
  const status = res.status;
  if (status === 401 || status === 403) return providerError('auth', `${what} rejected the credentials (${status}) ${body}`.trim());
  if (status === 402) {
    return providerError(
      'billing',
      `${what} requires payment or credits (402) ${body}`.trim(),
      'Your account is out of credit or unpaid. Top it up, or switch to a local source.'
    );
  }
  if (status === 429) return providerError('rate_limit', `${what} rate limit reached (429) ${body}`.trim());
  if (status === 404) {
    return providerError('unknown', `${what} returned 404 — check the model name and base URL. ${body}`.trim());
  }
  return providerError('unknown', `${what} error ${status} ${body}`.trim());
}
