/**
 * CLI-05 — `course-professor studio` pairing: `applyPairingFromUrl` reads the bridge URL and token
 * from the URL hash, saves them, picks the local-agent provider on a fresh install, and strips the
 * secrets from the address bar.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyPairingFromUrl,
  installPairingWatcher,
  parsePairingHash,
  providerIsReady,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  BRIDGE_PROVIDER,
} from '../src/lib/settings.js';

function mockLocalStorage(initial) {
  const store = new Map();
  if (initial) store.set(SETTINGS_KEY, JSON.stringify(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

const PAIRING_HASH = '#/settings?bridge=http%3A%2F%2Flocalhost%3A3000&token=abc123';

beforeEach(() => {
  globalThis.localStorage = mockLocalStorage();
});

afterEach(() => {
  delete globalThis.localStorage;
  vi.restoreAllMocks();
});

describe('parsePairingHash', () => {
  it('extracts bridge, token and the clean path', () => {
    expect(parsePairingHash(PAIRING_HASH)).toEqual({
      bridgeUrl: 'http://localhost:3000',
      token: 'abc123',
      path: '/settings',
    });
  });

  it('returns null when the fragment carries no pairing params', () => {
    expect(parsePairingHash('#/settings')).toBeNull();
    expect(parsePairingHash('#/review')).toBeNull();
    expect(parsePairingHash('')).toBeNull();
    expect(parsePairingHash('#/settings?token=')).toBeNull();
  });
});

describe('providerIsReady', () => {
  it('requires a configured provider that has passed a connection test', () => {
    expect(providerIsReady(null)).toBe(false);
    expect(providerIsReady({ provider: 'anthropic' })).toBe(false);
    expect(providerIsReady({ provider: 'anthropic', anthropic: { apiKey: 'k' } })).toBe(false);
    expect(providerIsReady({ provider: 'anthropic', anthropic: { apiKey: 'k' } }, { anthropic: { ok: true } })).toBe(true);
    expect(providerIsReady({ provider: 'anthropic', anthropic: { apiKey: 'k' }, lastTestOk: true })).toBe(true);
  });
});

describe('applyPairingFromUrl', () => {
  it('saves the bridge config and selects the local agent on a fresh install', () => {
    const replaceState = vi.fn();
    const stored = applyPairingFromUrl({
      location: { hash: PAIRING_HASH, pathname: '/', search: '' },
      history: { replaceState },
    });

    expect(stored.bridge).toMatchObject({ bridgeUrl: 'http://localhost:3000', bridgeToken: 'abc123' });
    expect(stored.provider).toBe(BRIDGE_PROVIDER);
    expect(stored.onboardingDone).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/settings');

    const persisted = loadSettings();
    expect(persisted.bridge.bridgeToken).toBe('abc123');
  });

  it('switches to the local agent when the stored provider is not ready', () => {
    // Stored provider has no key and was never tested — the CLI pairing should win.
    globalThis.localStorage = mockLocalStorage({ provider: 'anthropic', onboardingDone: true });
    const replaceState = vi.fn();
    const stored = applyPairingFromUrl({
      location: { hash: PAIRING_HASH, pathname: '/', search: '' },
      history: { replaceState },
    });

    expect(stored.provider).toBe(BRIDGE_PROVIDER);
    expect(stored.bridge.bridgeToken).toBe('abc123');
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('keeps a provider that is configured and verified', () => {
    globalThis.localStorage = mockLocalStorage({
      provider: 'anthropic',
      onboardingDone: true,
      anthropic: { apiKey: 'sk-ant-x' },
      lastTestOk: true,
    });
    const replaceState = vi.fn();
    const stored = applyPairingFromUrl({
      location: { hash: PAIRING_HASH, pathname: '/', search: '' },
      history: { replaceState },
    });

    expect(stored.provider).toBe('anthropic');
    expect(stored.bridge.bridgeToken).toBe('abc123');
  });

  it('does nothing when there is no pairing hash', () => {
    const replaceState = vi.fn();
    saveSettings({ provider: 'ollama' });
    const result = applyPairingFromUrl({
      location: { hash: '#/settings', pathname: '/', search: '' },
      history: { replaceState },
    });
    expect(result).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('returns null without a location', () => {
    expect(applyPairingFromUrl({})).toBeNull();
  });
});

describe('installPairingWatcher', () => {
  it('re-applies pairing when the hash changes on an already-open tab', () => {
    const win = new EventTarget();
    const loc = { hash: '#/', pathname: '/', search: '' };
    const history = { replaceState: vi.fn() };
    const off = installPairingWatcher({ window: win, location: loc, history });

    loc.hash = PAIRING_HASH;
    win.dispatchEvent(new Event('hashchange'));

    const stored = loadSettings();
    expect(stored.bridge.bridgeToken).toBe('abc123');
    expect(stored.provider).toBe(BRIDGE_PROVIDER);
    off();
  });

  it('is a no-op without a window', () => {
    expect(installPairingWatcher({})).toBeTypeOf('function');
  });
});

describe('bare fragment pairing (SEC-12)', () => {
  it('parses a bare #token=<value> fragment', () => {
    expect(parsePairingHash('#token=abc123')).toEqual({ bridgeUrl: '', token: 'abc123', path: '/' });
  });

  it('parses a bare #bridge=…&token=… fragment', () => {
    expect(parsePairingHash('#bridge=http%3A%2F%2Flocalhost%3A3000&token=abc123')).toEqual({
      bridgeUrl: 'http://localhost:3000',
      token: 'abc123',
      path: '/',
    });
  });

  it('stores a bare token with the default bridge URL and scrubs the fragment', () => {
    const replaceState = vi.fn();
    const stored = applyPairingFromUrl({
      location: { hash: '#token=abc123', pathname: '/', search: '' },
      history: { replaceState },
    });

    expect(stored.bridge).toMatchObject({ bridgeUrl: 'http://localhost:3000', bridgeToken: 'abc123' });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(loadSettings().bridge).toMatchObject({ bridgeUrl: 'http://localhost:3000', bridgeToken: 'abc123' });
  });

  it('scrubs a bare fragment even when the hash is on another route', () => {
    const replaceState = vi.fn();
    applyPairingFromUrl({
      location: { hash: '#token=abc123', pathname: '/review', search: '?x=1' },
      history: { replaceState },
    });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/review?x=1');
  });

  it('rejects a non-loopback pairing without saving anything and still scrubs', () => {
    globalThis.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ provider: 'anthropic', onboardingDone: true, storage: 'browser' })
    );
    const before = globalThis.localStorage.getItem(SETTINGS_KEY);
    const replaceState = vi.fn();

    const result = applyPairingFromUrl({
      location: {
        hash: '#bridge=https%3A%2F%2Fevil.example&token=abc123',
        pathname: '/',
        search: '',
      },
      history: { replaceState },
    });

    expect(result).toBeNull();
    expect(globalThis.localStorage.getItem(SETTINGS_KEY)).toBe(before);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });
});
