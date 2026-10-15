/**
 * Root-level tests for the Studio local runner (CODE-04).
 *
 * `web/studio-runner.js` is a standalone Express Router (it imports express from `web/`'s own
 * node_modules), so this test resolves express relative to `web/` via createRequire — the root
 * package.json is intentionally left untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunnerRouter, isSafeRelPath, isSafeSlug, buildPipeline } from '../web/studio-runner.js';

const requireFromWeb = createRequire(new URL('../web/package.json', import.meta.url));
const express = requireFromWeb('express');

let server;
let baseUrl;
let workspacesRoot;

beforeAll(async () => {
  workspacesRoot = await mkdtemp(join(tmpdir(), 'professor-runner-'));
  const app = express();
  app.use('/run', createRunnerRouter({ workspacesRoot }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(workspacesRoot, { recursive: true, force: true });
});

/** @param {object} body @param {string} [path] */
async function postRun(body, path = '/run') {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

describe('local runner router: validation helpers', () => {
  it('rejects unsafe paths and slugs', () => {
    expect(isSafeRelPath('../x.js')).toBe(false);
    expect(isSafeRelPath('/etc/passwd')).toBe(false);
    expect(isSafeRelPath('src/main.py')).toBe(true);
    expect(isSafeSlug('../evil')).toBe(false);
    expect(isSafeSlug('go-course')).toBe(true);
  });

  it('only allows known toolchains (bash gated)', () => {
    expect(buildPipeline('javascript', 'main.js', {})).toEqual([{ cmd: 'node', args: ['main.js'] }]);
    expect(() => buildPipeline('bash', 'main.sh', {})).toThrow(/Bash is not enabled/);
    expect(buildPipeline('bash', 'main.sh', {}, { allowBash: true })).toEqual([{ cmd: 'bash', args: ['main.sh'] }]);
    expect(() => buildPipeline('cobol', 'main.cob', {})).toThrow(/No local toolchain/);
  });
});

describe('local runner router: GET /toolchains', () => {
  it('reports which commands exist', async () => {
    const res = await fetch(`${baseUrl}/run/toolchains`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.node).toBe('boolean');
    expect(json.node).toBe(true);
    expect(json).toHaveProperty('python3');
  });
});

describe('local runner router: POST /run', () => {
  it('runs node hello world and streams stdout + exit', async () => {
    const res = await postRun({
      courseSlug: 'demo-course',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log("hello world");' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('hello world');
    expect(text).toContain('"exit":0');
    expect(text).toContain('[DONE]');

    const written = await readFile(join(workspacesRoot, 'demo-course', 'main.js'), 'utf8');
    expect(written).toContain('hello world');
  });

  it('rejects a traversing course slug', async () => {
    const res = await postRun({
      courseSlug: '../evil',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log(1)' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unsafe course slug/);
  });

  it('rejects a traversing file path and refuses to write outside the workspace', async () => {
    const res = await postRun({
      courseSlug: 'demo-course',
      language: 'javascript',
      entry: '../escape.js',
      files: { '../escape.js': 'console.log(1)' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unsafe/);
    await expect(stat(join(workspacesRoot, '..', 'escape.js'))).rejects.toThrow();
  });

  it('kills a busy loop on timeout', async () => {
    const res = await postRun({
      courseSlug: 'timeout-course',
      language: 'javascript',
      entry: 'main.js',
      timeoutMs: 1200,
      files: { 'main.js': 'while (true) {}' },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/Timed out/);
    expect(text).toContain('"exit":124');
    expect(text).toContain('[DONE]');
  }, 15_000);

  it('reports a non-zero exit for failing code', async () => {
    const res = await postRun({
      courseSlug: 'fail-course',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.error("boom"); process.exit(3);' },
    });
    const text = await res.text();
    expect(text).toContain('boom');
    expect(text).toContain('"exit":3');
  });

  it('rejects a language with no local toolchain on the allowlist', async () => {
    const res = await postRun({
      courseSlug: 'demo-course',
      language: 'html',
      entry: 'index.html',
      files: { 'index.html': '<h1>hi</h1>' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No local toolchain/);
  });
});
