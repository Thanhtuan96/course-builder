/**
 * @vitest-environment node
 *
 * SEC-12 — bridge/remote-adapter egress guards and the getProvider CSP preflight.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBridgeProvider } from '../src/lib/ai/bridge.js';
import { getProvider } from '../src/lib/ai/index.js';
import { createRemoteAdapter } from '../src/lib/repo/remote-adapter.js';
import { translate } from '../src/lib/i18n/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bridge loopback guard', () => {
  it('throws before headers/fetch for a non-loopback bridge', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => createBridgeProvider({ bridgeUrl: 'https://evil.example', bridgeToken: 'secret' })).toThrow(
      expect.objectContaining({ code: 'loopback_required' })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still constructs the default localhost bridge', () => {
    expect(() => createBridgeProvider()).not.toThrow();
    expect(() => createBridgeProvider({ bridgeUrl: 'http://127.0.0.1:3000', bridgeToken: 't' })).not.toThrow();
  });
});

describe('remote adapter loopback guard', () => {
  it.each([
    ['with a token', 'secret'],
    ['without a token', undefined],
  ])('rejects post and health %s for a non-loopback base URL', async (_label, token) => {
    const fetchMock = vi.fn();
    const adapter = createRemoteAdapter({ baseUrl: 'http://192.168.1.5:3000', token, fetchImpl: fetchMock });

    await expect(adapter.list('courses', {})).rejects.toMatchObject({ code: 'loopback_required' });
    await expect(adapter.health()).rejects.toMatchObject({ code: 'loopback_required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a localhost adapter working', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: [] }), { status: 200 }));
    const adapter = createRemoteAdapter({ baseUrl: 'http://127.0.0.1:3000', token: 't', fetchImpl: fetchMock });
    await expect(adapter.list('courses', {})).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getProvider CSP preflight', () => {
  const base = {
    openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' },
  };

  it('rejects a custom OpenAI-compatible origin with csp_blocked', async () => {
    await expect(
      getProvider({ provider: 'openai', openai: { ...base.openai, baseUrl: 'https://example.com/v1' } })
    ).rejects.toMatchObject({ code: 'csp_blocked' });
  });

  it('rejects a malformed OpenAI base URL as a config error', async () => {
    await expect(
      getProvider({ provider: 'openai', openai: { ...base.openai, baseUrl: 'not a url' } })
    ).rejects.toMatchObject({ code: 'config' });
  });

  it('builds the allowed presets and a loopback Ollama endpoint', async () => {
    for (const baseUrl of ['https://api.openai.com/v1', 'https://openrouter.ai/api/v1', 'https://api.groq.com/openai/v1']) {
      await expect(getProvider({ provider: 'openai', openai: { ...base.openai, baseUrl } })).resolves.toBeTruthy();
    }
    await expect(
      getProvider({ provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' } })
    ).resolves.toBeTruthy();
  });

  it('rejects a non-loopback Ollama endpoint with csp_blocked', async () => {
    await expect(
      getProvider({ provider: 'ollama', ollama: { baseUrl: 'http://192.168.1.5:11434/v1', model: 'x' } })
    ).rejects.toMatchObject({ code: 'csp_blocked' });
  });

  it('localizes the new error codes in both languages', () => {
    for (const code of ['loopback_required', 'csp_blocked']) {
      const en = translate('en', `errors.${code}`);
      const vi = translate('vi', `errors.${code}`);
      expect(en).toBeTruthy();
      expect(vi).toBeTruthy();
      expect(vi).not.toBe(en);
    }
  });
});
