/**
 * Settings & secrets (AI-03).
 *
 * Everything here lives in localStorage under `professor-studio:settings` and never enters
 * repository exports/backups — the repository has no settings table at all, so keys cannot leak.
 */
import { useCallback, useEffect, useState } from 'react';
import { configIssue } from './ai/config.js';
import { loadProviderStatus } from './ai/status.js';
import { BRIDGE_DEFAULT_URL, DEFAULT_BRIDGE_AGENT, isAnthropicModelId, isValidAgentModel } from './ai/catalog.js';
import { DEFAULT_LANGUAGE, isSupportedCode, normalizeLanguage } from './i18n/languages.js';
import { providerError } from './ai/errors.js';

export const SETTINGS_KEY = 'professor-studio:settings';

/**
 * Whether a bridge/runner URL is a loopback endpoint (SEC-12). Parses with WHATWG `URL` so alternate
 * IPv4 spellings (`127.1`, `2130706433`, `0x7f000001`) normalize before the check. Accepts
 * `localhost`, `*.localhost` and the whole `127.0.0.0/8` range over http(s); rejects IPv6 literals
 * (`[::1]`, `[::]`, `[::ffff:…]` — CSP cannot express them), `0.0.0.0`, LAN IPs, domains and
 * non-http(s) schemes.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLoopbackBridgeUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  // IPv6 literals are not expressible as a CSP host-source (Chrome ignores `http://[::1]:*`), so a
  // bridge on them would pass the guard and then be blocked in the browser. Reject them here.
  if (host.startsWith('[')) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const match = host.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return Boolean(match) && match.slice(1).every((part) => Number(part) <= 255);
}

/**
 * Throw a localizable `loopback_required` error unless `value` is a loopback bridge/runner URL.
 * @param {unknown} value
 * @returns {unknown} the input, unchanged, on success
 */
export function assertLoopbackBridgeUrl(value) {
  if (!isLoopbackBridgeUrl(value)) throw providerError('loopback_required');
  return value;
}

export const DEFAULT_PROVIDER = 'anthropic';

/** Provider id for "My local agent" (the CLI bridge). */
export const BRIDGE_PROVIDER = 'bridge';

/**
 * Where learning data is written (STORE-01). `null` means the learner has not chosen yet — the app
 * then resolves a default (SQLite when a bridge is paired, else the browser) and records it.
 */
export const STORAGE_BROWSER = 'browser';
export const STORAGE_SQLITE = 'sqlite';
export const STORAGE_KINDS = [STORAGE_BROWSER, STORAGE_SQLITE];

/** One model slot per bridge agent — no more global `model` leaking between providers. */
export const DEFAULT_BRIDGE_MODELS = {
  claude: '',
  opencode: '',
  cursor: '',
  gemini: '',
  antigravity: '',
  ollama: '',
};

export const DEFAULT_SETTINGS = {
  provider: DEFAULT_PROVIDER,
  anthropic: { apiKey: '', model: 'claude-opus-5-5' },
  openai: {
    preset: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
  bridge: {
    bridgeUrl: 'http://localhost:3000',
    bridgeToken: '',
    agent: DEFAULT_BRIDGE_AGENT,
    models: { ...DEFAULT_BRIDGE_MODELS },
  },
  learnerName: '',
  // The ONE learning language (LANG-01): a BCP-47 code. Legacy display names are migrated below.
  language: DEFAULT_LANGUAGE,
  onboardingDone: false,
  storage: null,
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

/**
 * Migrate the old single global `model` field (shared by every provider, which leaked e.g. an
 * Anthropic model id into the bridge) into the provider it belongs to. The value moves into the
 * provider only when it is valid there — otherwise it is dropped. The top-level `model` is always
 * removed so no provider ever reads it again.
 *
 * @param {object} raw stored settings (parsed JSON)
 * @param {{ sanitizeBridge?: boolean }} [opts]
 * @returns {object} settings without a top-level `model`
 */
export function migrateSettings(raw, { sanitizeBridge = true } = {}) {
  if (!raw || typeof raw !== 'object') return raw;
  const next = { ...raw };
  // STORE-01: keep only a known storage kind; an absent/invalid value means "undecided" so the app
  // can migrate existing users from the store that actually holds their data.
  if (next.storage !== undefined && !STORAGE_KINDS.includes(next.storage)) delete next.storage;
  // LANG-01: fold the old display-name values ("Vietnamese"/"English") and any unsupported value
  // into a BCP-47 code so prompts, labels and detection all read one vocabulary.
  if (next.language !== undefined && !isSupportedCode(next.language)) {
    next.language = normalizeLanguage(next.language);
  }
  const legacy = typeof next.model === 'string' ? next.model.trim() : '';
  delete next.model;

  const provider = next.provider || DEFAULT_PROVIDER;
  if (legacy) {
    if (provider === 'anthropic') {
      if (isAnthropicModelId(legacy)) next.anthropic = { ...(next.anthropic || {}), model: legacy };
    } else if (provider === 'openai') {
      next.openai = { ...(next.openai || {}), model: legacy };
    } else if (provider === 'ollama') {
      next.ollama = { ...(next.ollama || {}), model: legacy };
    } else if (provider === BRIDGE_PROVIDER) {
      const agent = next.bridge?.agent || DEFAULT_BRIDGE_AGENT;
      if (isValidAgentModel(agent, legacy)) {
        next.bridge = { ...(next.bridge || {}), models: { ...(next.bridge?.models || {}), [agent]: legacy } };
      }
    }
  }
  return sanitizeBridge ? sanitizeBridgeSettings(next) : next;
}

/**
 * Drop a non-loopback bridge URL together with its pairing token (SEC-12). Used on read/migration
 * and before persisting, so a rejected URL never leaves its token in localStorage.
 * @param {object} next
 * @returns {object} the same settings object, sanitized in place
 */
function sanitizeBridgeSettings(next) {
  const url = next?.bridge?.bridgeUrl || next?.bridgeUrl;
  if (!url || isLoopbackBridgeUrl(url)) return next;
  if (next.bridge) {
    const bridge = { ...next.bridge };
    delete bridge.bridgeUrl;
    delete bridge.bridgeToken;
    next.bridge = bridge;
  }
  delete next.bridgeUrl;
  delete next.bridgeToken;
  return next;
}

function read() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? deepMerge(DEFAULT_SETTINGS, migrateSettings(JSON.parse(raw))) : { ...DEFAULT_SETTINGS };
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
  const next = migrateSettings(deepMerge(read(), patch), { sanitizeBridge: false });
  const persisted = sanitizeBridgeSettings({ ...next, bridge: { ...(next.bridge || {}) } });
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(persisted));
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
  if (queryAt === -1) {
    // SEC-12: Phase 2 prints a bare `#token=<value>` fragment; accept a bare `bridge=…&token=…` too.
    const firstKey = raw.split('=')[0];
    if (!raw || (firstKey !== 'token' && firstKey !== 'bridge')) return null;
    const params = new URLSearchParams(raw);
    const bridgeUrl = (params.get('bridge') || '').trim();
    const token = (params.get('token') || '').trim();
    if (!bridgeUrl && !token) return null;
    return { bridgeUrl, token, path: '/' };
  }
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

  const scrub = () => {
    if (!hist || typeof hist.replaceState !== 'function') return;
    const search = loc.search || '';
    const hash = pairing.path === '/' ? '' : `#${pairing.path}`;
    try {
      hist.replaceState(null, '', `${loc.pathname || '/'}${search}${hash}`);
    } catch {
      /* some embedded webviews disallow replaceState — nothing else to do */
    }
  };

  // SEC-12: never save a pairing that points the token at a non-loopback host. Still scrub the URL
  // so a malicious/prefilled fragment does not linger in the address bar.
  const targetBridge = pairing.bridgeUrl || BRIDGE_DEFAULT_URL;
  if (!isLoopbackBridgeUrl(targetBridge)) {
    scrub();
    return null;
  }

  const stored = rawStoredSettings();
  const patch = { bridge: {} };
  patch.bridge.bridgeUrl = targetBridge;
  if (pairing.token) patch.bridge.bridgeToken = pairing.token;
  // Choose the local agent unless the learner already has a ready provider: `course-professor
  // studio` exists to hand them a working local setup, so an unconfigured/untested provider yields.
  if (!providerIsReady(stored)) patch.provider = BRIDGE_PROVIDER;
  if (!stored || stored.onboardingDone !== true) patch.onboardingDone = true;
  // A paired bridge means a local server exists — default to SQLite (STORE-01) unless the learner
  // has already chosen where their data lives.
  if (!stored || !STORAGE_KINDS.includes(stored.storage)) patch.storage = STORAGE_SQLITE;

  const next = saveSettings(patch);
  scrub();
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

/**
 * The model stored for one bridge agent ('' when "Default" — the bridge then omits `--model`).
 * @param {object} settings
 * @param {string} agent
 */
export function bridgeAgentModel(settings, agent) {
  if (!agent) return '';
  return settings?.bridge?.models?.[agent] || '';
}

/**
 * The model id the active provider should use. Providers are fully independent: the bridge reads
 * only the selected agent's slot, and the API providers read only their own `model`.
 * @param {object} settings
 */
export function activeModel(settings) {
  if (!settings) return '';
  if (settings.provider === BRIDGE_PROVIDER) {
    return bridgeAgentModel(settings, settings.bridge?.agent || DEFAULT_BRIDGE_AGENT);
  }
  return settings[settings.provider]?.model || '';
}
