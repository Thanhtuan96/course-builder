import { describe, it, expect, beforeEach } from 'vitest';
import { providerReadiness, recordProviderTest, loadProviderStatus } from '../src/lib/ai/status.js';

function mockStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

beforeEach(() => mockStorage());

const configured = { provider: 'anthropic', anthropic: { apiKey: 'sk-ant-x' } };

describe('provider readiness', () => {
  it('is grey "Not set up" when required config is missing', () => {
    const state = providerReadiness({ provider: 'anthropic', anthropic: { apiKey: '' } }, {});
    expect(state.state).toBe('missing');
    expect(state.label).toBe('Not set up');
    expect(state.dot).toBe('bg-neutral-400');
  });

  it('is amber "Untested" when configured but never tested', () => {
    const state = providerReadiness(configured, {});
    expect(state.state).toBe('untested');
    expect(state.label).toBe('Untested');
    expect(state.dot).toBe('bg-amber-500');
  });

  it('is green "Ready" only after a successful test', () => {
    const state = providerReadiness(configured, { anthropic: { ok: true } });
    expect(state.state).toBe('ready');
    expect(state.dot).toBe('bg-green-500');
  });

  it('falls back to "Untested" after a failed test', () => {
    expect(providerReadiness(configured, { anthropic: { ok: false } }).state).toBe('untested');
  });
});

describe('provider status persistence', () => {
  it('records and reads per-provider results', () => {
    recordProviderTest('anthropic', true);
    recordProviderTest('ollama', false);
    const status = loadProviderStatus();
    expect(status.anthropic.ok).toBe(true);
    expect(status.ollama.ok).toBe(false);
    expect(status.anthropic.at).toBeTruthy();
  });
});
