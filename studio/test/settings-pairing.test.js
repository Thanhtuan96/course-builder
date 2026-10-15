/**
 * CLI-05 — `course-professor studio` pairing: `applyPairingFromUrl` reads the bridge URL and token
 * from the URL hash, saves them, picks the local-agent provider on a fresh install, and strips the
 * secrets from the address bar.
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyPairingFromUrl,
  parsePairingHash,
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

  it('never overrides a provider the learner already configured', () => {
    globalThis.localStorage = mockLocalStorage({ provider: 'anthropic', onboardingDone: true });
    const replaceState = vi.fn();
    const stored = applyPairingFromUrl({
      location: { hash: PAIRING_HASH, pathname: '/', search: '' },
      history: { replaceState },
    });

    expect(stored.provider).toBe('anthropic');
    expect(stored.bridge.bridgeToken).toBe('abc123');
    expect(replaceState).toHaveBeenCalledTimes(1);
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
