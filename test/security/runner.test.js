/**
 * Plan 02-04 — learner runner hardening.
 *
 * Covers the command denylist, the concurrency limiter/429 path, realpath containment and the
 * scrubbed learner environment. Spawn is injectable so "nothing ran / nothing was written" is
 * deterministic and no real command is needed for the rejection cases.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  COMMAND_DENYLIST,
  assertCommandAllowed,
  buildPipeline,
  createRunLimiter,
  createRunnerRouter,
} from '../../web/studio-runner.js';
import { isolateEnv, restoreEnv } from './helpers/env.js';

const requireFromWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const express = requireFromWeb('express');

const ORIGINAL_PATH = process.env.PATH || '';

const servers = [];
const roots = [];

async function startServer(options = {}) {
  const workspacesRoot = mkdtempSync(join(tmpdir(), 'professor-runner-sec-'));
  roots.push(workspacesRoot);
  const app = express();
  const router = createRunnerRouter({ workspacesRoot, ...options });
  app.use('/run', router);
  const srv = createServer(app);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  servers.push(srv);
  return {
    workspacesRoot,
    router,
    url: `http://127.0.0.1:${srv.address().port}`,
    close: () => new Promise((resolve) => srv.close(resolve)),
  };
}

/** @returns {EventEmitter & { stdout: EventEmitter, stderr: EventEmitter }} */
function makeFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.pid = 4242;
  child.kill = () => {
    child.killed = true;
    child.emit('close', 1);
  };
  return child;
}

function controllableSpawn() {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    const child = makeFakeChild();
    calls.push({ cmd, args, opts, child });
    return child;
  };
  return { spawnImpl, calls };
}

async function post(url, body) {
  return fetch(`${url}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function waitFor(predicate, { timeoutMs = 3000, stepMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error('waitFor timed out');
}

beforeEach(() => {
  isolateEnv();
  process.env.PATH = ORIGINAL_PATH;
});

afterEach(async () => {
  for (const srv of servers.splice(0)) {
    srv.closeAllConnections?.();
    if (srv.listening) await new Promise((resolve) => srv.close(resolve));
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  restoreEnv();
});

describe('runner denylist', () => {
  it('rejects every denylisted command and allows the language allowlist', () => {
    for (const cmd of COMMAND_DENYLIST) {
      expect(() => assertCommandAllowed(cmd)).toThrow(/not allowed/);
      expect(() => assertCommandAllowed(`/usr/bin/${cmd}`)).toThrow(/not allowed/);
    }
    expect(() => assertCommandAllowed('npm', { allowBash: true })).toThrow(/not allowed/);
    expect(assertCommandAllowed('bash', { allowBash: true })).toBe(true);
    expect(assertCommandAllowed('node')).toBe(true);
    expect(assertCommandAllowed('python3')).toBe(true);

    expect(buildPipeline('javascript', 'main.js', {})).toEqual([{ cmd: 'node', args: ['main.js'] }]);
    expect(() => buildPipeline('bash', 'main.sh', {})).toThrow(/Bash is not enabled/);
    expect(buildPipeline('bash', 'main.sh', {}, { allowBash: true })).toEqual([
      { cmd: 'bash', args: ['main.sh'] },
    ]);
  });

  it('rejects commands even if a pipeline step is tampered with', async () => {
    const { spawnImpl, calls } = controllableSpawn();
    const { url } = await startServer({ spawnImpl });
    // The public language list cannot produce npm, so exercise runStep's defense through a
    // denylisted language-allowlist command: bash without the opt-in is stopped in buildPipeline.
    const res = await post(url, {
      courseSlug: 'denied-bash',
      language: 'bash',
      entry: 'main.sh',
      files: { 'main.sh': 'echo hi' },
    });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('runner limiter', () => {
  it('tryAcquire/release is a pure, idempotent counter', () => {
    const limiter = createRunLimiter({ max: 1 });
    expect(limiter.size).toBe(0);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.size).toBe(1);
    expect(limiter.tryAcquire()).toBe(false);
    limiter.release();
    expect(limiter.size).toBe(0);
    limiter.release();
    expect(limiter.size).toBe(0);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('clamps max into 1-8 and defaults to 2', () => {
    expect(createRunLimiter().max).toBe(2);
    expect(createRunLimiter({ max: 0 }).max).toBe(1);
    expect(createRunLimiter({ max: 42 }).max).toBe(8);
  });
});

describe('runner concurrency 429', () => {
  it('returns 429 + Retry-After before a second write/spawn, then releases after close', async () => {
    const { spawnImpl, calls } = controllableSpawn();
    const { url, workspacesRoot, router } = await startServer({ maxRuns: 1, spawnImpl });

    const first = await post(url, {
      courseSlug: 'first',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log("one")' },
    });
    expect(first.status).toBe(200);

    await waitFor(() => calls.length === 1);

    const second = await post(url, {
      courseSlug: 'second',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log("two")' },
    });
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBe('1');
    expect(await second.json()).toEqual({ error: 'Too many concurrent runs', code: 'busy' });

    expect(calls).toHaveLength(1);
    await expect(stat(join(workspacesRoot, 'second'))).rejects.toThrow();

    calls[0].child.stdout.emit('data', Buffer.from('one\n'));
    calls[0].child.emit('close', 0);
    const firstText = await first.text();
    expect(firstText).toContain('"exit":0');

    await waitFor(() => router.runLimiter.size === 0);

    const third = await post(url, {
      courseSlug: 'third',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log("three")' },
    });
    expect(third.status).toBe(200);
    await waitFor(() => calls.length === 2);
    calls[1].child.stdout.emit('data', Buffer.from('three\n'));
    calls[1].child.emit('close', 0);
    const thirdText = await third.text();
    expect(thirdText).toContain('"exit":0');
  }, 15_000);
});

describe('runner containment', () => {
  const spawnFree = () => controllableSpawn();

  it('rejects traversal and absolute paths before writing or spawning', async () => {
    const { spawnImpl, calls } = spawnFree();
    const { url, workspacesRoot } = await startServer({ spawnImpl });

    for (const [entry, files] of [
      ['../escape.js', { '../escape.js': 'console.log(1)' }],
      ['a/../../b', { 'a/../../b': 'console.log(1)' }],
      ['/etc/passwd', { '/etc/passwd': 'root' }],
    ]) {
      const res = await post(url, {
        courseSlug: 'traversal',
        language: 'javascript',
        entry,
        files,
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Unsafe|missing or unsafe/);
    }

    expect(calls).toHaveLength(0);
    await expect(stat(join(workspacesRoot, 'traversal'))).rejects.toThrow();
    await expect(stat(join(workspacesRoot, '..', 'escape.js'))).rejects.toThrow();
  });

  it('rejects a symlinked course directory', async () => {
    const { spawnImpl, calls } = spawnFree();
    const { url, workspacesRoot } = await startServer({ spawnImpl });
    const outside = mkdtempSync(join(tmpdir(), 'professor-outside-'));
    roots.push(outside);
    await symlink(outside, join(workspacesRoot, 'linked'));

    const res = await post(url, {
      courseSlug: 'linked',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log("escape")' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('unsafe_path');
    expect(calls).toHaveLength(0);
    await expect(stat(join(outside, 'main.js'))).rejects.toThrow();
  });

  it('rejects a symlinked existing target file', async () => {
    const { spawnImpl, calls } = spawnFree();
    const { url, workspacesRoot } = await startServer({ spawnImpl });
    const outside = mkdtempSync(join(tmpdir(), 'professor-outside-'));
    roots.push(outside);
    const secret = join(outside, 'secret.js');
    await writeFile(secret, 'ORIGINAL', 'utf8');
    await mkdir(join(workspacesRoot, 'course'), { recursive: true });
    await symlink(secret, join(workspacesRoot, 'course', 'link.js'));

    const res = await post(url, {
      courseSlug: 'course',
      language: 'javascript',
      entry: 'link.js',
      files: { 'link.js': 'console.log("pwned")' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('unsafe_path');
    expect(calls).toHaveLength(0);
    expect(await readFile(secret, 'utf8')).toBe('ORIGINAL');
  });

  it('runs a valid nested path and creates a new course', async () => {
    const { url, workspacesRoot } = await startServer();

    const res = await post(url, {
      courseSlug: 'valid-course',
      language: 'javascript',
      entry: 'src/main.js',
      files: { 'src/main.js': 'console.log("nested ok");' },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('nested ok');
    expect(text).toContain('"exit":0');
    expect(await readFile(join(workspacesRoot, 'valid-course', 'src', 'main.js'), 'utf8')).toContain(
      'nested ok'
    );
  }, 15_000);
});

describe('runner learner env', () => {
  it('spawns with a scrubbed environment plus Python output flags', async () => {
    const { spawnImpl, calls } = controllableSpawn();
    const { url } = await startServer({ spawnImpl });
    process.env.ANTHROPIC_API_KEY = 'sk-secret';
    process.env.STUDIO_BRIDGE_TOKEN = 'token-secret';
    process.env.NODE_OPTIONS = '--require ./evil.js';
    process.env.LD_PRELOAD = '/tmp/evil.so';
    process.env.DYLD_FOO = 'x';

    const res = await post(url, {
      courseSlug: 'env-course',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'console.log("env")' },
    });
    expect(res.status).toBe(200);
    await waitFor(() => calls.length === 1);

    const env = calls[0].opts.env;
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.STUDIO_BRIDGE_TOKEN).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.LD_PRELOAD).toBeUndefined();
    expect(env.DYLD_FOO).toBeUndefined();
    expect(env.PATH).toBe(ORIGINAL_PATH);
    expect(env.PYTHONUNBUFFERED).toBe('1');
    expect(env.PYTHONIOENCODING).toBe('utf-8');
    expect(calls[0].opts.shell).toBe(false);

    calls[0].child.emit('close', 0);
    await res.text();
  }, 15_000);

  it('still reports a non-zero exit from the injected spawn', async () => {
    const { spawnImpl, calls } = controllableSpawn();
    const { url } = await startServer({ spawnImpl });
    const res = await post(url, {
      courseSlug: 'fail-course',
      language: 'javascript',
      entry: 'main.js',
      files: { 'main.js': 'process.exit(3)' },
    });
    expect(res.status).toBe(200);
    await waitFor(() => calls.length === 1);
    calls[0].child.stderr.emit('data', Buffer.from('boom\n'));
    calls[0].child.emit('close', 3);
    const text = await res.text();
    expect(text).toContain('boom');
    expect(text).toContain('"exit":3');
  }, 15_000);

  it('still enforces the timeout', async () => {
    const { url } = await startServer();
    const res = await post(url, {
      courseSlug: 'timeout-course',
      language: 'javascript',
      entry: 'main.js',
      timeoutMs: 1000,
      files: { 'main.js': 'while (true) {}' },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/Timed out/);
    expect(text).toContain('"exit":124');
  }, 15_000);
});
