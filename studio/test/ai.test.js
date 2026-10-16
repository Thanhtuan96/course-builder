import { describe, it, expect, vi } from 'vitest';
import { ProviderError, providerError, isAbortError } from '../src/lib/ai/errors.js';
import { createGenerateJson, MAX_TOKENS } from '../src/lib/ai/provider-utils.js';
import { classifyNetworkError, mapHttpError } from '../src/lib/ai/fetch-local.js';
import { getProvider } from '../src/lib/ai/index.js';
import { configIssue, isConfigured } from '../src/lib/ai/config.js';
import { mapAnthropicError } from '../src/lib/ai/anthropic.js';

function fakeResponse(status, body = '') {
  return { status, ok: status >= 200 && status < 300, text: async () => body };
}

describe('ProviderError', () => {
  it('normalises codes and supplies hints', () => {
    const err = providerError('auth', 'nope');
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('auth');
    expect(err.hint).toMatch(/API key/i);
    expect(providerError('made-up').code).toBe('unknown');
  });

  it('detects abort errors', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
    expect(isAbortError({ code: 'aborted' })).toBe(true);
    expect(isAbortError(new Error('x'))).toBe(false);
  });
});

describe('HTTP error mapping', () => {
  it('maps status codes to actionable codes', async () => {
    expect((await mapHttpError(fakeResponse(401))).code).toBe('auth');
    expect((await mapHttpError(fakeResponse(403))).code).toBe('auth');
    expect((await mapHttpError(fakeResponse(429))).code).toBe('rate_limit');
    expect((await mapHttpError(fakeResponse(404))).code).toBe('unknown');
    expect((await mapHttpError(fakeResponse(500))).code).toBe('unknown');
  });
});

describe('network error classification', () => {
  it('separates local-network, CORS and not-running', () => {
    const local = 'http://localhost:11434/v1/chat/completions';
    expect(classifyNetworkError(new TypeError('Failed to fetch'), { url: local }).code).toBe('not_running');
    expect(classifyNetworkError(new Error('blocked by CORS policy'), { url: 'https://api.openai.com/v1/x' }).code).toBe('cors');
    expect(
      classifyNetworkError(new Error('The request was blocked because it targets the local network address space'), { url: local }).code
    ).toBe('local_network_blocked');
  });
});

describe('generateJson', () => {
  it('parses fenced JSON and validates', async () => {
    const streamText = vi.fn(async () => '```json\n{"a":1}\n```');
    const generateJson = createGenerateJson(streamText);
    const result = await generateJson({ messages: [], validate: (v) => v.a === 1 || 'bad' });
    expect(result).toEqual({ a: 1 });
    expect(streamText).toHaveBeenCalledTimes(1);
  });

  it('retries ONCE with a repair message when the first reply is not JSON', async () => {
    const streamText = vi
      .fn()
      .mockResolvedValueOnce('Sure! Here is your answer: not json at all')
      .mockResolvedValueOnce('{"ok":true}');
    const generateJson = createGenerateJson(streamText);
    const result = await generateJson({ messages: [{ role: 'user', content: 'give json' }] });
    expect(result).toEqual({ ok: true });
    expect(streamText).toHaveBeenCalledTimes(2);
    const repairMessages = streamText.mock.calls[1][0].messages;
    expect(repairMessages.at(-1).content).toMatch(/only valid JSON/i);
  });

  it('retries when validation fails, then succeeds', async () => {
    const streamText = vi.fn().mockResolvedValueOnce('{"a":1}').mockResolvedValueOnce('{"a":2}');
    const generateJson = createGenerateJson(streamText);
    const result = await generateJson({ messages: [], validate: (v) => v.a === 2 || 'need a=2' });
    expect(result).toEqual({ a: 2 });
    expect(streamText).toHaveBeenCalledTimes(2);
  });

  it('throws bad_json after a single failed repair', async () => {
    const streamText = vi.fn(async () => 'still not json');
    const generateJson = createGenerateJson(streamText);
    await expect(generateJson({ messages: [] })).rejects.toMatchObject({ code: 'bad_json' });
    expect(streamText).toHaveBeenCalledTimes(2);
  });
});

describe('cost caps', () => {
  it('exports per-task defaults', () => {
    expect(MAX_TOKENS).toEqual({ lesson: 8000, json: 4000, chat: 2000 });
  });
});

describe('configuration prechecks', () => {
  it('flags missing required config per provider', () => {
    expect(configIssue({ provider: 'anthropic', anthropic: { apiKey: '' } }).code).toBe('auth');
    expect(configIssue({ provider: 'openai', openai: { baseUrl: '' } }).code).toBe('auth');
    expect(configIssue({ provider: 'bridge', bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: '' } }).code).toBe('auth');
    expect(configIssue({ provider: 'bridge', bridge: { bridgeUrl: '', bridgeToken: 't' } }).code).toBe('auth');
  });

  it('passes when config is present (key optional for local servers)', () => {
    expect(isConfigured({ provider: 'anthropic', anthropic: { apiKey: 'sk-ant-x' } })).toBe(true);
    expect(isConfigured({ provider: 'openai', openai: { baseUrl: 'https://api.openai.com/v1' } })).toBe(true);
    expect(isConfigured({ provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434/v1' } })).toBe(true);
    expect(isConfigured({ provider: 'bridge', bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: 't' } })).toBe(true);
  });

  it('getProvider rejects with auth before loading an adapter when config is missing', async () => {
    await expect(getProvider({ provider: 'anthropic', anthropic: { apiKey: '' } })).rejects.toMatchObject({
      code: 'auth',
      message: expect.stringMatching(/API key/i),
    });
    await expect(getProvider({ provider: 'openai', openai: { baseUrl: '' } })).rejects.toMatchObject({ code: 'auth' });
    await expect(
      getProvider({ provider: 'bridge', bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: '' } })
    ).rejects.toMatchObject({ code: 'auth' });
  });

  it('getProvider builds a configured provider', async () => {
    const provider = await getProvider({ provider: 'ollama', ollama: { baseUrl: 'http://localhost:11434/v1' }, model: 'x' });
    expect(typeof provider.streamText).toBe('function');
    expect(typeof provider.generateJson).toBe('function');
  });
});

describe('Anthropic SDK error mapping', () => {
  it('maps the missing-key SDK message to auth', () => {
    const err = mapAnthropicError(new Error('Could not resolve authentication method. Expected either apiKey to be set.'));
    expect(err.code).toBe('auth');
    expect(err).toBeInstanceOf(ProviderError);
  });

  it('maps statuses', () => {
    expect(mapAnthropicError({ status: 401, message: 'no' }).code).toBe('auth');
    expect(mapAnthropicError({ status: 429, message: 'slow' }).code).toBe('rate_limit');
    expect(mapAnthropicError({ status: 500, message: 'boom' }).code).toBe('network');
  });
});
