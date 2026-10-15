/**
 * Settings & secrets (AI-03).
 *
 * Everything here lives in localStorage under `professor-studio:settings` and never enters
 * repository exports/backups — the repository has no settings table at all, so keys cannot leak.
 */
import { useCallback, useEffect, useState } from 'react';
import { configIssue } from './ai/config.js';
import { loadProviderStatus } from './ai/status.js';

export const SETTINGS_KEY = 'professor-studio:settings';

export const DEFAULT_PROVIDER = 'anthropic';

/** Provider id for "My local agent" (the CLI bridge). */
export const BRIDGE_PROVIDER = 'bridge';

export const DEFAULT_SETTINGS = {
  provider: DEFAULT_PROVIDER,
  model: '',
  anthropic: { apiKey: '', model: 'claude-opus-5-5' },
  openai: {
    preset: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: '', agent: '' },
  learnerName: '',
  language: 'English',
  onboardingDone: false,
};

const listeners = new Set();

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(base?.[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function read() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? deepMerge(DEFAULT_SETTINGS, JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** @returns {typeof DEFAULT_SETTINGS} */
export function loadSettings() {
  return read();
}

/**
 * Merge a patch into stored settings and notify subscribers.
 * @param {object} patch
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function saveSettings(patch) {
  const next = deepMerge(read(), patch);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage full — settings will simply not persist */
    }
  }
  for (const fn of listeners) fn(next);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('professor:settings', { detail: next }));
  return next;
}

/* --------------------------------------------------------------- pairing (CLI-05) */

/** Raw stored settings object, or null when nothing has been saved yet. */
function rawStoredSettings() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Read `bridge` + `token` out of a `#/settings?bridge=…&token=…` hash (the URL the CLI prints).
 * Returns null when the fragment carries no pairing parameters.
 * @param {string} [hash]
 * @returns {{ bridgeUrl: string, token: string, path: string }|null}
 */
export function parsePairingHash(hash = '') {
  const raw = String(hash || '').replace(/^#/, '');
  const queryAt = raw.indexOf('?');
  if (queryAt === -1) return null;
  const params = new URLSearchParams(raw.slice(queryAt + 1));
  const bridgeUrl = (params.get('bridge') || '').trim();
  const token = (params.get('token') || '').trim();
  if (!bridgeUrl && !token) return null;
  const path = raw.slice(0, queryAt) || '/';
  return { bridgeUrl, token, path: path.startsWith('/') ? path : `/${path}` };
}

function resolveGlobal(name, override) {
  if (override) return override;
  if (typeof window !== 'undefined' && window[name]) return window[name];
  if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
  return null;
}

/**
 * Whether the stored provider is ready to use: it must be configured (per `configIssue`) AND its
 * last connection test must have succeeded (`lastTestOk`, persisted by `lib/ai/status.js`).
 * @param {object|null} settings
 * @param {Record<string, { ok: boolean }>} [status]
 * @returns {boolean}
 */
export function providerIsReady(settings, status = loadProviderStatus()) {
  const provider = settings?.provider;
  if (!provider) return false;
  if (configIssue(settings, provider) !== null) return false;
  return settings.lastTestOk === true || status?.[provider]?.ok === true;
}

/**
 * Apply the CLI's one-command pairing: save `bridge`/`token` from the URL hash as the bridge
 * config, pick the "My local agent" provider when the stored provider is not ready, finish
 * onboarding, then strip the secrets from the address bar with `history.replaceState` so they are
 * never bookmarked or shared.
 *
 * Called once from `main.jsx` before render, and again on `hashchange` (see
 * `installPairingWatcher`) so an already-open tab navigated to a pairing URL switches too. Safe to
 * call anywhere — returns null when there is no pairing hash (or no browser-like environment).
 *
 * @param {{ location?: object, history?: object }} [env] injected for tests
 * @returns {typeof DEFAULT_SETTINGS|null} the saved settings, or null when nothing was applied
 */
export function applyPairingFromUrl(env = {}) {
  const loc = resolveGlobal('location', env.location);
  const hist = resolveGlobal('history', env.history);
  if (!loc) return null;

  const pairing = parsePairingHash(loc.hash);
  if (!pairing) return null;

  const stored = rawStoredSettings();
  const patch = { bridge: {} };
  if (pairing.bridgeUrl) patch.bridge.bridgeUrl = pairing.bridgeUrl;
  if (pairing.token) patch.bridge.bridgeToken = pairing.token;
  // Choose the local agent unless the learner already has a ready provider: `course-professor
  // studio` exists to hand them a working local setup, so an unconfigured/untested provider yields.
  if (!providerIsReady(stored)) patch.provider = BRIDGE_PROVIDER;
  if (!stored || stored.onboardingDone !== true) patch.onboardingDone = true;

  const next = saveSettings(patch);

  if (hist && typeof hist.replaceState === 'function') {
    const search = loc.search || '';
    const hash = pairing.path === '/' ? '' : `#${pairing.path}`;
    try {
      hist.replaceState(null, '', `${loc.pathname || '/'}${search}${hash}`);
    } catch {
      /* some embedded webviews disallow replaceState — the settings are already saved */
    }
  }

  return next;
}

/**
 * Re-run pairing whenever the URL fragment changes, so a tab that was already open when the
 * pairing URL is pasted still switches to the local agent. Returns an unsubscribe function.
 * @param {{ window?: object, location?: object, history?: object }} [env]
 * @returns {() => void}
 */
export function installPairingWatcher(env = {}) {
  const win = resolveGlobal('window', env.window);
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const onHash = () => applyPairingFromUrl(env);
  win.addEventListener('hashchange', onHash);
  return () => win.removeEventListener?.('hashchange', onHash);
}

// In the browser, watch the hash so pairing works without a reload. No-op in Node/tests.
if (typeof window !== 'undefined') installPairingWatcher();

/** Remove every API key / token, keeping provider preferences. */
export function clearSecrets() {
  return saveSettings({
    anthropic: { apiKey: '' },
    openai: { apiKey: '' },
    bridge: { bridgeToken: '' },
  });
}

/** @param {(settings: typeof DEFAULT_SETTINGS) => void} fn */
export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React binding: [settings, update]. */
export function useSettings() {
  const [settings, setSettings] = useState(read);
  useEffect(() => {
    const off = subscribeSettings(setSettings);
    const onStorage = (e) => {
      if (e.key === SETTINGS_KEY) setSettings(read());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const update = useCallback((patch) => saveSettings(patch), []);
  return [settings, update];
}

/** The model id the active provider should use. */
export function activeModel(settings) {
  return settings.model || settings[settings.provider]?.model || '';
}
