/**
 * Regression test for the bridge SSE error branch (brief §13): `bridge.js` used `new ProviderError`
 * with only a re-export in scope, which threw a ReferenceError instead of a ProviderError.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createBridgeProvider } from '../src/lib/ai/bridge.js';
import { ProviderError } from '../src/lib/ai/errors.js';

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
});
