/**
 * RON-208 — browser-direct Ollama provider: "Default" resolves to the first installed model
 * (`GET /api/tags`) instead of the retired `llama3.2` fallback, and 404/410 map to
 * `model_not_found`/`model_retired` without leaking the daemon's body.
 *
 * `fetch` is mocked; no real Ollama is required.
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createOllamaProvider,
  mapOllamaHttpError,
  pickFirstInstalledModel,
  DEFAULT_MODEL,
} from '../src/lib/ai/ollama.js';
import { ERROR_HINTS } from '../src/lib/ai/errors.js';
import { translate } from '../src/lib/i18n/index.js';

const BASE = 'http://localhost:11434/v1';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function tagsResponse(names) {
  return new Response(JSON.stringify({ models: names.map((name) => ({ name })) }), { status: 200 });
}

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

const chatBody = (call) => JSON.parse(call[1].body);

describe('RON-208 pickFirstInstalledModel', () => {
  it('takes the first installed model, preferring a pulled one over :cloud', () => {
    expect(pickFirstInstalledModel(['qwen3.5:latest', 'gemma3:latest'])).toBe('qwen3.5:latest');
    expect(pickFirstInstalledModel(['minimax-m2:cloud', 'qwen3.5:latest'])).toBe('qwen3.5:latest');
    expect(pickFirstInstalledModel([])).toBe('');
  });
});

describe('RON-208 createOllamaProvider default resolution', () => {
  it('exports no hard-coded default model', () => {
    expect(DEFAULT_MODEL).toBe('');
  });

  it('uses an explicitly chosen model without listing installed models', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: {"choices":[{"delta":{"content":"hi"}}]}', 'data: [DONE]']));
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOllamaProvider({ baseUrl: BASE, model: 'gemma3:latest' });
    await expect(provider.streamText({ messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe('hi');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chatBody(fetchMock.mock.calls[0]).model).toBe('gemma3:latest');
  });

  it('resolves "Default" to the first installed model from /api/tags', async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/api/tags')
        ? tagsResponse(['qwen3.5:latest', 'gemma3:latest'])
        : sseResponse(['data: {"choices":[{"delta":{"content":"hello"}}]}', 'data: [DONE]'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOllamaProvider({ baseUrl: BASE, model: '' });
    await expect(provider.streamText({ messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe('hello');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
    const chat = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/chat/completions'));
    expect(chatBody(chat).model).toBe('qwen3.5:latest');
    expect(provider.model).toBe('qwen3.5:latest');
  });

  it('honours VITE_OLLAMA_MODEL before listing installed models', async () => {
    vi.stubEnv('VITE_OLLAMA_MODEL', 'gemma3:latest');
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]']));
    vi.stubGlobal('fetch', fetchMock);

    await createOllamaProvider({ baseUrl: BASE }).streamText({ messages: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chatBody(fetchMock.mock.calls[0]).model).toBe('gemma3:latest');
  });

  it('fails with model_not_found (no request sent) when nothing is installed', async () => {
    const fetchMock = vi.fn(async () => tagsResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const err = await createOllamaProvider({ baseUrl: BASE }).streamText({ messages: [] }).catch((e) => e);
    expect(err.code).toBe('model_not_found');
    expect(err.hint).toMatch(/ollama pull/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
  });

  it('caches the resolved model across turns', async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/api/tags') ? tagsResponse(['qwen3.5:latest']) : sseResponse(['data: [DONE]'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = createOllamaProvider({ baseUrl: BASE });
    await provider.streamText({ messages: [] });
    await provider.streamText({ messages: [] });

    const tagCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/tags'));
    expect(tagCalls).toHaveLength(1);
  });
});

describe('RON-208 createOllamaProvider error mapping', () => {
  const providerFor = (status, body) => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/api/tags') ? tagsResponse(['qwen3.5:latest']) : new Response(body, { status })
    );
    vi.stubGlobal('fetch', fetchMock);
    return createOllamaProvider({ baseUrl: BASE });
  };

  it('maps 404 to model_not_found and drops the daemon body', async () => {
    const err = await providerFor(404, '{"error":"model not found, try pulling it first"}')
      .streamText({ messages: [] })
      .catch((e) => e);
    expect(err.code).toBe('model_not_found');
    expect(err.message).toBe(ERROR_HINTS.model_not_found);
    expect(err.message).not.toMatch(/try pulling it first/);
  });

  it('maps 410 to model_retired and drops the daemon body', async () => {
    const err = await providerFor(410, '{"error":"model minimax-m2:cloud is retired"}')
      .streamText({ messages: [] })
      .catch((e) => e);
    expect(err.code).toBe('model_retired');
    expect(err.message).toBe(ERROR_HINTS.model_retired);
    expect(err.message).not.toMatch(/retired\}/);
  });

  it('keeps the shared mapping for other statuses', async () => {
    const err = await providerFor(401, 'no key').streamText({ messages: [] }).catch((e) => e);
    expect(err.code).toBe('auth');
  });

  it('maps 404/410 through mapOllamaHttpError directly', async () => {
    expect((await mapOllamaHttpError(new Response('', { status: 404 }))).code).toBe('model_not_found');
    expect((await mapOllamaHttpError(new Response('', { status: 410 }))).code).toBe('model_retired');
    expect((await mapOllamaHttpError(new Response('', { status: 429 }))).code).toBe('rate_limit');
  });
});

describe('RON-208 localized copy', () => {
  it('ships en + vi text for both model codes', () => {
    expect(translate('en', 'errors.model_not_found')).toBe(ERROR_HINTS.model_not_found);
    expect(translate('en', 'errors.model_retired')).toBe(ERROR_HINTS.model_retired);
    expect(translate('vi', 'errors.model_not_found')).toMatch(/ollama pull/);
    expect(translate('vi', 'errors.model_retired')).not.toBe(translate('en', 'errors.model_retired'));
  });
});
