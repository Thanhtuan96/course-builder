/**
 * 02-05 — legacy browser client: fragment pairing, header auth, loopback validation and banner.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  authHeaders,
  apiBase,
  apiBaseFrom,
  initPairing,
  pairingError,
  resetPairing,
  validateBridgeUrl,
} from '../../web/client/src/api/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'web', 'client', 'src');
const read = (...parts) => readFileSync(join(SRC, ...parts), 'utf8');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function mockBrowser(hash = '') {
  const store = new Map();
  const replaced = [];
  const location = { hash, pathname: '/', search: '' };
  globalThis.window = {
    location,
    history: {
      replaceState: (...args) => replaced.push(args),
    },
  };
  globalThis.location = location;
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  return { store, replaced };
}

beforeEach(() => {
  resetPairing();
});

afterEach(() => {
  resetPairing();
  delete globalThis.window;
  delete globalThis.location;
  delete globalThis.sessionStorage;
});

describe('bridge loopback validation', () => {
  it('accepts loopback http/https origins and normalizes to the origin', () => {
    expect(validateBridgeUrl('http://localhost:4000')).toBe('http://localhost:4000');
    expect(validateBridgeUrl('http://127.0.0.1:4000')).toBe('http://127.0.0.1:4000');
    expect(validateBridgeUrl('http://[::1]:4000')).toBe('http://[::1]:4000');
    expect(validateBridgeUrl('https://localhost:4000/api')).toBe('https://localhost:4000');
  });

  it('rejects remote hosts, non-http protocols and malformed values', () => {
    expect(validateBridgeUrl('http://evil.example')).toBeNull();
    expect(validateBridgeUrl('https://192.168.1.10:4000')).toBeNull();
    expect(validateBridgeUrl('file:///tmp/token')).toBeNull();
    expect(validateBridgeUrl('not a url')).toBeNull();
    expect(validateBridgeUrl(null)).toBeNull();
  });
});

describe('apiBase and initPairing', () => {
  it('uses same-origin /api with no bridge', () => {
    expect(apiBaseFrom(null)).toBe('/api');
    mockBrowser('');
    initPairing();
    expect(apiBase()).toBe('/api');
  });

  it('reads #bridge= and #token=, persists in sessionStorage and scrubs the fragment', () => {
    const browser = mockBrowser('#bridge=http://127.0.0.1:4000&token=paired-token');
    initPairing();
    expect(apiBase()).toBe('http://127.0.0.1:4000/api');
    expect(browser.store.get('professor.bridgeToken')).toBe('paired-token');
    expect(browser.store.get('professor.bridgeBase')).toBe('http://127.0.0.1:4000');
    expect(authHeaders()).toEqual({ 'X-Studio-Token': 'paired-token' });
    expect(browser.replaced).toHaveLength(1);
    expect(browser.replaced[0][2]).toBe('/');
  });

  it('rejects a non-loopback bridge, records a visible error and sends no token', () => {
    const browser = mockBrowser('#bridge=http://evil.example&token=paired-token');
    initPairing();
    expect(pairingError()).toBe('Bridge URL must be loopback');
    expect(apiBase()).toBe('/api');
    expect(browser.store.has('professor.bridgeBase')).toBe(false);
    expect(authHeaders()).toEqual({});
    expect(browser.replaced).toHaveLength(1);
  });

  it('does not read a query-string token', () => {
    mockBrowser('');
    globalThis.location.search = '?token=query-token';
    initPairing();
    expect(authHeaders()).toEqual({});
  });
});

describe('legacy client source contract', () => {
  it('never uses EventSource or a query-string token', () => {
    for (const file of [['api', 'client.js'], ['hooks', 'useSSE.js'], ['components', 'ChatPanel.jsx']]) {
      const source = stripComments(read(...file));
      expect(source, file.join('/')).not.toMatch(/\bEventSource\b/);
      expect(source, file.join('/')).not.toMatch(/\?token=/);
      expect(source, file.join('/')).not.toMatch(/searchParams\.set\(['"]token/);
    }
  });

  it('stores the token in sessionStorage only and always sends X-Studio-Token', () => {
    const client = stripComments(read('api', 'client.js'));
    expect(client).toMatch(/sessionStorage/);
    expect(client).toMatch(/X-Studio-Token/);
    expect(client).not.toMatch(/localStorage/);
    expect(client).not.toMatch(/fetch\(`\$\{API_BASE\}/);
    const fetchBlocks = client.split(/\bfetch\(/).slice(1);
    expect(fetchBlocks.length).toBeGreaterThan(0);
    for (const block of fetchBlocks) {
      expect(block.slice(0, 400)).toMatch(/requestHeaders\(/);
    }
  });

  it('routes every legacy API call through apiBase()', () => {
    const useSSE = read('hooks', 'useSSE.js');
    const chat = read('components', 'ChatPanel.jsx');
    expect(useSSE).toMatch(/resolveApiUrl/);
    expect(useSSE).toMatch(/authHeaders\(\)/);
    expect(chat).toMatch(/\$\{apiBase\(\)\}\/agents\/capabilities/);
    expect(chat).toMatch(/\$\{apiBase\(\)\}\/agents\/models/);
    expect(chat).toMatch(/authHeaders\(\)/);
    expect(chat).not.toMatch(/fetch\('\/api\//);
    expect(chat).not.toMatch(/`\/api\/agents/);
  });

  it('renders a persistent deprecation banner above the shell with the Studio link', () => {
    const app = read('App.jsx');
    const banner = read('components', 'DeprecationBanner.jsx');
    expect(app).toMatch(/import DeprecationBanner/);
    expect(app).toMatch(/<DeprecationBanner \/>/);
    expect(app.indexOf('<DeprecationBanner')).toBeLessThan(app.indexOf('<Header'));
    expect(app).toMatch(/initPairing\(\)/);
    expect(banner).toMatch(/http:\/\/localhost:5180/);
    expect(banner).toMatch(/deprecated/i);
    expect(banner).toMatch(/shrink-0/);
  });
});
