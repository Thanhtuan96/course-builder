/**
 * Per-provider connection status persisted in localStorage (never exported with data/backups).
 *
 * The header pill derives its state from this plus `configIssue()`:
 *   missing config  -> grey  "Not set up"
 *   configured, untested (or last test failed) -> amber "Untested"
 *   last test succeeded -> green "Ready"
 */
import { useEffect, useState } from 'react';
import { isConfigured } from './config.js';

export const STATUS_KEY = 'professor-studio:provider-status';

const listeners = new Set();

/** @returns {Record<string, { ok: boolean, at: string }>} */
export function loadProviderStatus() {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * @param {string} provider
 * @param {boolean} ok
 */
export function recordProviderTest(provider, ok) {
  const next = { ...loadProviderStatus(), [provider]: { ok: Boolean(ok), at: new Date().toISOString() } };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STATUS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  for (const fn of listeners) fn(next);
  return next;
}

export function clearProviderStatus() {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STATUS_KEY);
    } catch {
      /* ignore */
    }
  }
  for (const fn of listeners) fn({});
}

/** @param {(status: Record<string, { ok: boolean, at: string }>) => void} fn */
export function subscribeProviderStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Readiness for the active provider.
 * @param {object} settings
 * @param {Record<string, { ok: boolean }>} [status]
 * @returns {{ state: 'missing'|'untested'|'ready', label: string, dot: string }}
 */
export function providerReadiness(settings, status = loadProviderStatus()) {
  const provider = settings?.provider;
  if (!isConfigured(settings, provider)) {
    return { state: 'missing', label: 'Not set up', dot: 'bg-neutral-400' };
  }
  if (status?.[provider]?.ok) {
    return { state: 'ready', label: 'Ready', dot: 'bg-green-500' };
  }
  return { state: 'untested', label: 'Untested', dot: 'bg-amber-500' };
}

/** React binding that re-renders when the status changes. */
export function useProviderStatus() {
  const [status, setStatus] = useState(loadProviderStatus);
  useEffect(() => {
    const off = subscribeProviderStatus(setStatus);
    const onStorage = (e) => {
      if (e.key === STATUS_KEY) setStatus(loadProviderStatus());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return status;
}
