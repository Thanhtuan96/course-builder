/**
 * Regression test for the bridge SSE error branch (brief §13): `bridge.js` used `new ProviderError`
 * with only a re-export in scope, which threw a ReferenceError instead of a ProviderError.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBridgeProvider } from '../src/lib/ai/bridge.js';
import { ProviderError, ERROR_HINTS } from '../src/lib/ai/errors.js';

function sseResponse(lines) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bridge provider SSE errors', () => {
  it('throws a ProviderError (not a ReferenceError) with the server code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"error":"boom","code":"server"}'])));
    const provider = createBridgeProvider({ bridgeUrl: 'http://localhost:3000', bridgeToken: 't' });

    const err = await provider
      .streamText({ system: 's', messages: [{ role: 'user', content: 'hi' }] })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ProviderError);
    expect(err.name).toBe('ProviderError');
    expect(err.code).toBe('server');
    expect(err.message).toBe('boom');
    expect(err.hint).toBeTruthy();
  });

  it('defaults the code when the bridge omits it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"error":"nope"}'])));
    const provider = createBridgeProvider({ bridgeUrl: 'http://localhost:3000', bridgeToken: 't' });

    const err = await provider
      .streamText({ system: 's', messages: [{ role: 'user', content: 'hi' }] })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe('unknown');
  });

  // RON-208: the bridge runs in Node with English-only copy; a `localize` frame means the UI should
  // render its own catalog text for the code (LANG-02) instead of the server string.
  it('uses the catalog copy for a localizable model_not_found frame', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(['data: {"error":"Ollama has no model \\"x\\"","code":"model_not_found","localize":true}']))
    );
    const provider = createBridgeProvider({ bridgeUrl: 'http://localhost:3000', bridgeToken: 't' });

    const err = await provider
      .streamText({ system: 's', messages: [{ role: 'user', content: 'hi' }] })
      .catch((e) => e);

    expect(err.code).toBe('model_not_found');
    expect(err.message).toBe(ERROR_HINTS.model_not_found);
    expect(err.hint).toBe(ERROR_HINTS.model_not_found);
  });

  it('keeps the bridge hint when the frame is not marked localizable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['data: {"error":"Agent x is not installed.","code":"config","hint":"Install it."}'])));
    const provider = createBridgeProvider({ bridgeUrl: 'http://localhost:3000', bridgeToken: 't' });

    const err = await provider
      .streamText({ system: 's', messages: [{ role: 'user', content: 'hi' }] })
      .catch((e) => e);

    expect(err.code).toBe('config');
    expect(err.message).toBe('Agent x is not installed.');
    expect(err.hint).toBe('Install it.');
  });
});
