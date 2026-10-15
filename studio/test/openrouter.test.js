/**
 * Phase 26c — OpenRouter preset (browser, OpenAI-compatible).
 *
 * Verifies the request shape (endpoint, bearer auth, streaming, model id, attribution headers),
 * that OpenRouter's `: OPENROUTER PROCESSING` SSE comment lines are tolerated, and that 401/402/429
 * map to actionable auth/billing/rate_limit hints.
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOpenAICompatibleProvider, OPENROUTER_DEFAULT_MODEL } from '../src/lib/ai/openai-compatible.js';
import { ProviderError } from '../src/lib/ai/errors.js';

const OPENROUTER = 'https://openrouter.ai/api/v1';

function sseResponse(lines, status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenRouter request shape', () => {
  it('posts to /chat/completions with bearer auth, stream:true and the default model', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([': OPENROUTER PROCESSING', 'data: {"choices":[{"delta":{"content":"hi"}}]}', 'data: [DONE]'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({ baseUrl: OPENROUTER, apiKey: 'sk-or-test', preset: 'openrouter' });
    const text = await provider.streamText({ system: 'be nice', messages: [{ role: 'user', content: 'hello' }] });

    expect(text).toBe('hi');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${OPENROUTER}/chat/completions`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-or-test');
    expect(init.headers['HTTP-Referer']).toBeTruthy();
    expect(init.headers['X-Title']).toBe('Professor Studio');
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(true);
    expect(body.model).toBe(OPENROUTER_DEFAULT_MODEL);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'be nice' });
  });

  it('sends a named OpenRouter model instead of the default', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]']));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({ baseUrl: OPENROUTER, apiKey: 'k', preset: 'openrouter', model: 'anthropic/claude-3.5-sonnet' });
    await provider.streamText({ messages: [{ role: 'user', content: 'hi' }] });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('anthropic/claude-3.5-sonnet');
  });

  it('does not add OpenRouter headers for other endpoints', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]']));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOpenAICompatibleProvider({ baseUrl: 'https://api.openai.com/v1', apiKey: 'k2', preset: 'openai', model: 'gpt-4o-mini' });
    await provider.streamText({ messages: [{ role: 'user', content: 'hi' }] });

    expect(fetchMock.mock.calls[0][1].headers['HTTP-Referer']).toBeUndefined();
  });
});

describe('OpenRouter error mapping', () => {
  const withStatus = (status, body = '') => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));
  };

  it('maps 401 to auth', async () => {
    withStatus(401, 'no key');
    const provider = createOpenAICompatibleProvider({ baseUrl: OPENROUTER, apiKey: 'bad', preset: 'openrouter' });
    const err = await provider.streamText({ messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('auth');
  });

  it('maps 402 to billing with a top-up hint', async () => {
    withStatus(402, 'insufficient credits');
    const provider = createOpenAICompatibleProvider({ baseUrl: OPENROUTER, apiKey: 'k', preset: 'openrouter' });
    const err = await provider.streamText({ messages: [] }).catch((e) => e);
    expect(err.code).toBe('billing');
    expect(err.hint).toMatch(/credit/i);
  });

  it('maps 429 to rate_limit', async () => {
    withStatus(429, 'slow down');
    const provider = createOpenAICompatibleProvider({ baseUrl: OPENROUTER, apiKey: 'k', preset: 'openrouter' });
    const err = await provider.streamText({ messages: [] }).catch((e) => e);
    expect(err.code).toBe('rate_limit');
  });
});
