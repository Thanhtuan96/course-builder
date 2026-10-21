import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkToolchains, runLocal, runnerBase } from '../src/lib/runner/local.js';
import { run } from '../src/lib/runner/index.js';

/** Build a Response whose body is an SSE stream. */
function sse(events) {
  const body = events.map((e) => (e === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(e)}\n\n`)).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const SETTINGS = { bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: 'tok' } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local runner client (CODE-04)', () => {
  it('builds the runner base from settings', () => {
    expect(runnerBase(SETTINGS)).toBe('http://localhost:3000/api/studio/run');
  });

  it('reports toolchains from the server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ node: true, go: false }), { status: 200 })));
    await expect(checkToolchains(SETTINGS)).resolves.toEqual({ node: true, go: false });
  });

  it('streams stdout/stderr and the exit code', async () => {
    const fetchMock = vi.fn(async () =>
      sse([{ stdout: 'hello\n' }, { stderr: 'oops\n' }, { exit: 0 }, '[DONE]'])
    );
    vi.stubGlobal('fetch', fetchMock);
    const chunks = [];
    const result = await runLocal({
      settings: SETTINGS,
      courseSlug: 'demo',
      language: 'javascript',
      files: { 'main.js': 'console.log("hello")' },
      entry: 'main.js',
      onOutput: (c) => chunks.push(c),
    });
    expect(result.runner).toBe('local');
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('oops\n');
    expect(result.exitCode).toBe(0);
    expect(chunks.some((c) => c.stream === 'stdout')).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.courseSlug).toBe('demo');
    expect(body.files['main.js']).toContain('hello');
    expect(fetchMock.mock.calls[0][1].headers['X-Studio-Token']).toBe('tok');
  });

  it('routes a toolchain language to the local runner through run()', async () => {
    const fetchMock = vi.fn(async (url, opts = {}) => {
      if (String(url).endsWith('/toolchains')) return new Response(JSON.stringify({ go: true }), { status: 200 });
      return sse([{ stdout: 'Go!\n' }, { exit: 0 }, '[DONE]']);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await run({
      language: 'go',
      files: { 'main.go': 'package main' },
      entry: 'main.go',
      settings: SETTINGS,
      courseSlug: 'go-course',
    });
    expect(result.runner).toBe('local');
    expect(result.stdout).toContain('Go!');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.endsWith('/toolchains'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/api/studio/run'))).toBe(true);
  });
});

describe('runner loopback guard (SEC-12)', () => {
  it('refuses a non-loopback runner URL before any fetch', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => runnerBase({ bridge: { bridgeUrl: 'http://192.168.1.5:3000', bridgeToken: 'tok' } })).toThrow(
      expect.objectContaining({ code: 'loopback_required' })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still attaches the pairing token to a loopback runner', async () => {
    const fetchMock = vi.fn(async () => sse([{ stdout: 'ok\n' }, { exit: 0 }, '[DONE]']));
    vi.stubGlobal('fetch', fetchMock);
    await runLocal({
      settings: { bridge: { bridgeUrl: 'http://127.0.0.1:3000', bridgeToken: 'tok' } },
      language: 'javascript',
      files: { 'main.js': 'console.log(1)' },
    });
    expect(fetchMock.mock.calls[0][1].headers['X-Studio-Token']).toBe('tok');
  });
});
