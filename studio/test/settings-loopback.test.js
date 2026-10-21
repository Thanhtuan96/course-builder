/**
 * @vitest-environment node
 *
 * SEC-12 — loopback predicate and settings sanitization.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SETTINGS_KEY,
  assertLoopbackBridgeUrl,
  isLoopbackBridgeUrl,
  loadSettings,
  migrateSettings,
  saveSettings,
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
    raw: () => (store.has(SETTINGS_KEY) ? JSON.parse(store.get(SETTINGS_KEY)) : null),
  };
}

beforeEach(() => {
  globalThis.localStorage = mockLocalStorage();
});

afterEach(() => {
  delete globalThis.localStorage;
});

describe('isLoopbackBridgeUrl', () => {
  it.each([
    'http://localhost:3000',
    'https://localhost',
    'http://foo.localhost:4000',
    'http://127.0.0.1:3000',
    'http://127.9.8.7',
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://0177.0.0.1',
  ])('accepts %s', (url) => {
    expect(isLoopbackBridgeUrl(url)).toBe(true);
  });

  it.each([
    'http://0.0.0.0:3000',
    'http://[::]:3000',
    'http://[::1]:3000',
    'http://[0:0:0:0:0:0:0:1]',
    'http://[::ffff:127.0.0.1]',
    'http://192.168.1.5:3000',
    'https://evil.example',
    'https://ngrok-free.app',
    'ftp://localhost',
    '',
  ])('rejects %s', (url) => {
    expect(isLoopbackBridgeUrl(url)).toBe(false);
  });

  it('throws a localizable loopback_required error', () => {
    let error;
    try {
      assertLoopbackBridgeUrl('http://evil.example');
    } catch (err) {
      error = err;
    }
    expect(error?.code).toBe('loopback_required');
    expect(error?.message).toMatch(/on this machine/i);
    expect(assertLoopbackBridgeUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('settings sanitization', () => {
  it('drops a stored non-loopback bridge URL together with its token', () => {
    const stored = migrateSettings({
      bridge: { bridgeUrl: 'http://192.168.1.5:3000', bridgeToken: 'secret' },
    });
    expect(stored.bridge.bridgeUrl).toBeUndefined();
    expect(stored.bridge.bridgeToken).toBeUndefined();
  });

  it('restores the default URL after reading tampered storage', () => {
    globalThis.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ bridge: { bridgeUrl: 'https://evil.example', bridgeToken: 'secret' } })
    );
    const settings = loadSettings();
    expect(settings.bridge.bridgeUrl).toBe('http://localhost:3000');
    expect(settings.bridge.bridgeToken).toBe('');
  });

  it('keeps a loopback URL and token', () => {
    globalThis.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ bridge: { bridgeUrl: 'http://127.0.0.1:3000', bridgeToken: 'ok' } })
    );
    const settings = loadSettings();
    expect(settings.bridge.bridgeUrl).toBe('http://127.0.0.1:3000');
    expect(settings.bridge.bridgeToken).toBe('ok');
  });

  it('returns the draft but never persists a rejected URL or its token', () => {
    const draft = saveSettings({
      bridge: { bridgeUrl: 'https://evil.example', bridgeToken: 'secret' },
    });
    expect(draft.bridge.bridgeUrl).toBe('https://evil.example');
    const raw = globalThis.localStorage.raw();
    expect(JSON.stringify(raw)).not.toContain('evil.example');
    expect(JSON.stringify(raw)).not.toContain('secret');
  });
});
