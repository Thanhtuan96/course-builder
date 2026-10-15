/**
 * Phase 26c — per-provider model isolation.
 *
 * The global `settings.model` leak meant an Anthropic model id reached the OpenCode bridge (and
 * could reach OpenAI/Ollama). `resolveProviderModel` and `getProvider` must only ever read a
 * provider's own slot, and the bridge must scope the model to the selected agent.
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getProvider, resolveProviderModel } from '../src/lib/ai/index.js';

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

describe('resolveProviderModel', () => {
  it('never returns the legacy top-level model', () => {
    const settings = { model: 'claude-opus-5-5', provider: 'bridge', bridge: { agent: 'opencode' }, anthropic: { model: 'claude-opus-5-5' } };
    expect(resolveProviderModel(settings, 'bridge')).toBeUndefined();
  });

  it('reads the bridge model from the selected agent only', () => {
    const settings = {
      provider: 'bridge',
      bridge: { agent: 'opencode', models: { opencode: 'opencode-go/deepseek-v4.1-flash', cursor: 'gpt-5' } },
    };
    expect(resolveProviderModel(settings, 'bridge')).toBe('opencode-go/deepseek-v4.1-flash');
    expect(resolveProviderModel(settings, 'bridge', 'cursor')).toBe('gpt-5');
    expect(resolveProviderModel(settings, 'bridge', 'claude')).toBeUndefined();
  });

  it('reads each API provider from its own slot', () => {
    expect(resolveProviderModel({ anthropic: { model: 'claude-opus-5-5' } }, 'anthropic')).toBe('claude-opus-5-5');
    expect(resolveProviderModel({ openai: { model: 'gpt-4o-mini' } }, 'openai')).toBe('gpt-4o-mini');
    expect(resolveProviderModel({ ollama: { model: 'llama3.2' } }, 'ollama')).toBe('llama3.2');
  });
});

describe('getProvider bridge isolation', () => {
  it('omits model entirely when only an Anthropic model is stored', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]']));
    vi.stubGlobal('fetch', fetchMock);

    const provider = await getProvider({
      provider: 'bridge',
      bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: 't', agent: 'opencode' },
      anthropic: { model: 'claude-opus-5-5' },
    });
    await provider.streamText({ system: 's', messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.agent).toBe('opencode');
    expect(body.model).toBeUndefined();
  });

  it('sends the selected agent model when one is stored', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]']));
    vi.stubGlobal('fetch', fetchMock);

    const provider = await getProvider({
      provider: 'bridge',
      bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: 't', agent: 'opencode', models: { opencode: 'opencode-go/deepseek-v4.1-flash' } },
      anthropic: { model: 'claude-opus-5-5' },
    });
    await provider.streamText({ system: 's', messages: [{ role: 'user', content: 'hi' }] });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('opencode-go/deepseek-v4.1-flash');
  });
});
