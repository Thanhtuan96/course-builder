/**
 * RON-208 — Ollama "Default" model must never fall back to a hard-coded `llama3.2`.
 *
 * Bridge side: `resolveOllamaModel` (explicit → OLLAMA_MODEL → first installed from `/api/tags`),
 * the `runOllama` runner that uses it, and the 404/410 → `model_not_found`/`model_retired` mapping.
 * `fetch` is mocked, so no real Ollama is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  ollamaHttpFailure,
  pickOllamaDefaultModel,
  resolveOllamaModel,
  OLLAMA_NO_MODEL_HINT,
} from '../web/studio-api/health.js';
import { createStudioApp, defaultAgentRunners } from '../web/studio-api.js';
import { createStudioDb } from '../web/studio-db.js';

const ENV_KEYS = ['OLLAMA_HOST', 'OLLAMA_MODEL', 'PROFESSOR_ALLOW_NON_LOOPBACK_OLLAMA'];

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) delete process.env[key];
});

const tagsResponse = (names) => new Response(JSON.stringify({ models: names.map((name) => ({ name })) }), { status: 200 });

function ndjsonResponse(lines) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function runOllama(model) {
  return new Promise((resolve) => {
    const ctx = {
      system: 'be nice',
      prompt: '',
      messages: [{ role: 'user', content: 'hi' }],
      model,
      onText: (text) => {
        ctx.text += text;
      },
      onError: (err) => {
        ctx.error = err;
      },
      onDone: () => resolve({ text: ctx.text || '', error: ctx.error || null }),
      log: () => {},
      text: '',
      error: null,
    };
    defaultAgentRunners().ollama(ctx);
  });
}

describe('RON-208 pickOllamaDefaultModel', () => {
  it('takes the first installed model', () => {
    expect(pickOllamaDefaultModel(['qwen3.5:latest', 'gemma3:latest'])).toBe('qwen3.5:latest');
  });

  it('prefers a locally pulled model over a :cloud one', () => {
    expect(pickOllamaDefaultModel(['minimax-m2:cloud', 'qwen3.5:latest'])).toBe('qwen3.5:latest');
  });

  it('returns empty when nothing is installed', () => {
    expect(pickOllamaDefaultModel([])).toBe('');
    expect(pickOllamaDefaultModel(undefined)).toBe('');
  });
});

describe('RON-208 resolveOllamaModel', () => {
  it('uses an explicitly chosen model without asking Ollama', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveOllamaModel({ model: 'qwen3.5:latest', env: {} })).resolves.toMatchObject({
      ok: true,
      model: 'qwen3.5:latest',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to OLLAMA_MODEL when no model is chosen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveOllamaModel({ model: '', env: { OLLAMA_MODEL: 'gemma3:latest' } })).resolves.toMatchObject({
      ok: true,
      model: 'gemma3:latest',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the first installed model from /api/tags for "Default"', async () => {
    const fetchMock = vi.fn(async () => tagsResponse(['qwen3.5:latest', 'gemma3:latest']));
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await resolveOllamaModel({ model: '', env: {} });
    expect(resolved).toMatchObject({ ok: true, model: 'qwen3.5:latest' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags');
  });

  it('fails with model_not_found + a pull hint when nothing is installed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tagsResponse([])));

    const resolved = await resolveOllamaModel({ model: '', env: {} });
    expect(resolved.ok).toBe(false);
    expect(resolved.code).toBe('model_not_found');
    expect(resolved.hint).toBe(OLLAMA_NO_MODEL_HINT);
    expect(resolved.hint).toMatch(/ollama pull/);
  });

  it('fails with not_running when the daemon does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));

    const resolved = await resolveOllamaModel({ model: '', env: {} });
    expect(resolved).toMatchObject({ ok: false, code: 'not_running' });
    expect(resolved.hint).toMatch(/ollama serve/);
  });

  it('refuses a non-loopback OLLAMA_HOST', async () => {
    const resolved = await resolveOllamaModel({ model: '', env: { OLLAMA_HOST: 'http://10.0.0.4:11434' } });
    expect(resolved).toMatchObject({ ok: false, code: 'config' });
  });
});

describe('RON-208 runOllama (bridge runner)', () => {
  it('streams from the first installed model when the request says "Default"', async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/api/tags')
        ? tagsResponse(['qwen3.5:latest'])
        : ndjsonResponse(['{"message":{"content":"hello"}}', '{"message":{"content":" world"}}'])
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runOllama('');
    expect(result.error).toBeNull();
    expect(result.text).toBe('hello world');

    const chatCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/chat'));
    expect(JSON.parse(chatCall[1].body).model).toBe('qwen3.5:latest');
  });

  it('honours an explicitly chosen model', async () => {
    const fetchMock = vi.fn(async () => ndjsonResponse(['{"message":{"content":"ok"}}']));
    vi.stubGlobal('fetch', fetchMock);

    await runOllama('gemma3:latest');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gemma3:latest');
  });

  it('reports model_not_found (localized) instead of trying llama3.2 when nothing is installed', async () => {
    const fetchMock = vi.fn(async () => tagsResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runOllama('');
    expect(result.error).toMatchObject({ code: 'model_not_found', localize: true });
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/api/tags'))).toBe(true);
    expect(result.error.message).not.toMatch(/llama3\.2/);
  });

  it('maps a 404 from Ollama to model_not_found without the raw body', async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/api/tags')
        ? tagsResponse(['qwen3.5:latest'])
        : new Response('{"error":"model \'qwen3.5:latest\' not found, try pulling it first"}', { status: 404 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runOllama('');
    expect(result.error.code).toBe('model_not_found');
    expect(result.error.message).not.toMatch(/try pulling it first/);
  });

  it('maps a 410 from Ollama to model_retired without the raw body', async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).endsWith('/api/tags')
        ? tagsResponse(['minimax-m2:cloud'])
        : new Response('{"error":"model minimax-m2:cloud is retired and no longer available"}', { status: 410 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runOllama('');
    expect(result.error).toMatchObject({ code: 'model_retired', localize: true });
    expect(result.error.message).not.toMatch(/no longer available/);
  });
});

describe('RON-208 ollamaHttpFailure', () => {
  it('maps 404 and 410 to distinct codes and never echoes the body', () => {
    const missing = ollamaHttpFailure(404, { model: 'gemma3:latest', body: 'raw body' });
    expect(missing.code).toBe('model_not_found');
    expect(missing.localize).toBe(true);
    expect(missing.message).not.toMatch(/raw body/);
    expect(missing.hint).toMatch(/ollama pull/);

    const retired = ollamaHttpFailure(410, { model: 'minimax-m2:cloud', body: 'raw body' });
    expect(retired.code).toBe('model_retired');
    expect(retired.localize).toBe(true);
    expect(retired.message).not.toMatch(/raw body/);
  });

  it('keeps other statuses as a server error', () => {
    expect(ollamaHttpFailure(500, { body: 'boom' }).code).toBe('server');
  });
});

describe('RON-208 /complete with the Ollama agent (Settings "Test connection")', () => {
  const TOKEN = `ron-208-${Math.random().toString(36).slice(2)}`;
  const CAPS = {
    claude: { installed: false },
    opencode: { installed: false },
    cursor: { installed: false },
    gemini: { installed: false },
    antigravity: { installed: false },
    ollama: { installed: true },
  };

  async function withServer(run) {
    const dir = mkdtempSync(join(tmpdir(), 'ron-208-'));
    const db = createStudioDb({ dbPath: join(dir, 'professor.db') });
    const app = createStudioApp({ db, token: TOKEN, origins: 'http://localhost:5180', log: () => {}, capabilities: () => CAPS, probeReachable: false });
    const srv = createServer(app);
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    try {
      await run(`http://127.0.0.1:${srv.address().port}`);
    } finally {
      srv.close();
      db.close();
    }
  }

  /** Only Ollama's traffic is faked; the test's own HTTP call to the bridge passes through. */
  function stubOllamaFetch(handler) {
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => (String(url).includes(':11434') ? handler(String(url), init) : realFetch.call(globalThis, url, init)))
    );
  }

  const complete = (url, model) =>
    fetch(`${url}/api/studio/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN },
      body: JSON.stringify({ system: 'be nice', messages: [{ role: 'user', content: 'hi' }], agent: 'ollama', model }),
    });

  it('streams from an installed model when the model is "Default"', async () => {
    const chatBodies = [];
    stubOllamaFetch(async (url, init) => {
      if (url.endsWith('/api/tags')) return tagsResponse(['qwen3.5:latest']);
      chatBodies.push(JSON.parse(init.body));
      return ndjsonResponse(['{"message":{"content":"hello from qwen"}}']);
    });

    await withServer(async (url) => {
      const text = await (await complete(url, '')).text();
      expect(text).toContain('hello from qwen');
      expect(text).not.toContain('model_not_found');
      expect(chatBodies).toHaveLength(1);
      expect(chatBodies[0].model).toBe('qwen3.5:latest');
    });
  });

  it('reports a localizable model_not_found when no model is installed', async () => {
    const chatBodies = [];
    stubOllamaFetch(async (url, init) => {
      if (url.endsWith('/api/tags')) return tagsResponse([]);
      chatBodies.push(JSON.parse(init.body));
      return ndjsonResponse([]);
    });

    await withServer(async (url) => {
      const text = await (await complete(url, '')).text();
      expect(text).toContain('"code":"model_not_found"');
      expect(text).toContain('"localize":true');
      expect(text).not.toContain('llama3.2');
      expect(chatBodies).toHaveLength(0);
    });
  });
});
