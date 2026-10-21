/**
 * 02-05 — the full rejection matrix is side-effect free.
 *
 * Both `child_process` module ids are mocked for the whole file; the composed app is also given an
 * explicit spawn spy. Every rejected request must leave the temp data/courses/workspaces tree
 * byte-identical and call neither spy.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

import { TEST_TOKEN, buildTestApp, bootTestServer, requestWithHost } from './helpers/app.js';
import { LEGACY_TOKEN, buildLegacyApp } from './helpers/legacy.js';
import { assertUnchanged, snapshotTree } from './helpers/snapshot.js';
import { restoreEnv } from './helpers/env.js';

const processMocks = vi.hoisted(() => {
  const calls = [];
  const make = (name) =>
    function mockedChildProcess(...args) {
      calls.push({ name, args });
      throw new Error(`child process ${name} must not run for a rejected request`);
    };
  const mock = {
    spawn: make('spawn'),
    spawnSync: make('spawnSync'),
    exec: make('exec'),
    execSync: make('execSync'),
    execFile: make('execFile'),
    execFileSync: make('execFileSync'),
  };
  mock.default = mock;
  return { calls, mock };
});

vi.mock('child_process', () => processMocks.mock);
vi.mock('node:child_process', () => processMocks.mock);

const auth = (token) => ({ 'X-Studio-Token': token });
const jsonAuth = (token) => ({ ...auth(token), 'Content-Type': 'application/json' });

const servers = [];
const cleanups = [];

afterEach(async () => {
  while (servers.length) {
    try {
      await servers.pop().close();
    } catch {
      /* ignore */
    }
  }
  while (cleanups.length) {
    try {
      cleanups.pop()();
    } catch {
      /* ignore */
    }
  }
  restoreEnv();
});

beforeEach(() => {
  processMocks.calls.length = 0;
});

async function boot(app) {
  const server = await bootTestServer(app);
  servers.push(server);
  return server;
}

function tracked(built) {
  cleanups.push(built.cleanup);
  return built;
}

async function runStudioRejections(server, token) {
  const json = jsonAuth(token);

  const noToken = await fetch(`${server.url}/api/studio/db/health`);
  expect(noToken.status).toBe(401);

  const wrongToken = await fetch(`${server.url}/api/studio/db/health`, {
    headers: auth('wrong-token'),
  });
  expect(wrongToken.status).toBe(401);

  const badOrigin = await fetch(`${server.url}/api/studio/health`, {
    headers: { ...auth(token), Origin: 'http://evil.example' },
  });
  expect(badOrigin.status).toBe(403);

  const nullOrigin = await fetch(`${server.url}/api/studio/health`, {
    headers: { ...auth(token), Origin: 'null' },
  });
  expect(nullOrigin.status).toBe(403);

  const spoofedHost = await requestWithHost({
    url: `${server.url}/api/studio/health`,
    headers: { ...auth(token), Host: 'evil.example' },
  });
  expect(spoofedHost.status).toBe(403);

  const nonJson = await fetch(`${server.url}/api/studio/db`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'text/plain' },
    body: 'not json',
  });
  expect(nonJson.status).toBe(415);

  const malformedJson = await fetch(`${server.url}/api/studio/db`, {
    method: 'POST',
    headers: json,
    body: '{"broken":',
  });
  expect(malformedJson.status).toBe(400);

  const traversalRun = await fetch(`${server.url}/api/studio/run`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({
      courseSlug: '../../escape',
      language: 'javascript',
      entry: 'main.js',
      files: [{ path: 'main.js', content: 'console.log(1)' }],
    }),
  });
  expect(traversalRun.status).toBe(400);

  const traversalFile = await fetch(`${server.url}/api/studio/run`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({
      courseSlug: 'safe-course',
      language: 'javascript',
      entry: '../main.js',
      files: [{ path: '../main.js', content: 'console.log(1)' }],
    }),
  });
  expect([400, 403]).toContain(traversalFile.status);
}

async function runLegacyRejections(server, token) {
  const json = jsonAuth(token);

  const noToken = await fetch(`${server.url}/api/courses`);
  expect(noToken.status).toBe(401);

  const wrongToken = await fetch(`${server.url}/api/courses`, {
    headers: auth('wrong-token'),
  });
  expect(wrongToken.status).toBe(401);

  const badOrigin = await fetch(`${server.url}/api/courses`, {
    headers: { ...auth(token), Origin: 'http://evil.example' },
  });
  expect(badOrigin.status).toBe(403);

  const nullOrigin = await fetch(`${server.url}/api/courses`, {
    headers: { ...auth(token), Origin: 'null' },
  });
  expect(nullOrigin.status).toBe(403);

  const spoofedHost = await requestWithHost({
    url: `${server.url}/api/courses`,
    headers: { ...auth(token), Host: 'evil.example' },
  });
  expect(spoofedHost.status).toBe(403);

  const nonJson = await fetch(`${server.url}/api/courses/demo/COURSE.md`, {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'text/plain' },
    body: 'x',
  });
  expect(nonJson.status).toBe(415);

  const malformedJson = await fetch(`${server.url}/api/courses/demo/COURSE.md`, {
    method: 'POST',
    headers: json,
    body: '{"broken":',
  });
  expect(malformedJson.status).toBe(400);

  for (const vector of [
    '/api/courses/..%2F..%2Fprobe/COURSE.md',
    '/api/courses/%2e%2e/COURSE.md',
    '/api/courses/..%5C..%5Cprobe/COURSE.md',
    '/api/courses/demo/exercises/..%2F..%2F..%2Fprobe.md',
  ]) {
    const get = await requestWithHost({
      url: `${server.url}${vector}`,
      headers: auth(token),
    });
    expect([400, 403, 404], vector).toContain(get.status);

    const post = await requestWithHost({
      url: `${server.url}${vector}`,
      method: 'POST',
      headers: json,
      body: JSON.stringify({ content: '# pwned' }),
    });
    expect([400, 403, 404], vector).toContain(post.status);
  }
}

describe('studio rejection matrix', () => {
  it('writes nothing and spawns nothing for every rejected request', async () => {
    const built = tracked(await buildTestApp());
    const server = await boot(built.app);
    const before = snapshotTree(built.tempDir);
    try {
      await runStudioRejections(server, TEST_TOKEN);
    } finally {
      const after = snapshotTree(built.tempDir);
      assertUnchanged(before, after, 'a rejected Studio request changed the filesystem');
      expect(built.spawnSpy.calls).toHaveLength(0);
      expect(processMocks.calls).toHaveLength(0);
    }
  });

  it('serves exactly the Studio UI and 404s /api/chat when legacy is off', async () => {
    const built = tracked(await buildTestApp({ legacy: false }));
    const server = await boot(built.app);

    const root = await fetch(`${server.url}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Studio Test');

    const chat = await fetch(`${server.url}/api/chat`, { method: 'POST' });
    expect(chat.status).toBe(404);
    expect((await chat.json()).code).toBe('not_found');
  });
});

describe('legacy rejection matrix', () => {
  it('writes to no course/workspace root and spawns nothing on rejection', async () => {
    const built = tracked(await buildLegacyApp({ nodeEnv: 'production' }));
    const server = await boot(built.app);
    const before = snapshotTree(built.tempDir);
    try {
      await runLegacyRejections(server, LEGACY_TOKEN);
    } finally {
      const after = snapshotTree(built.tempDir);
      assertUnchanged(before, after, 'a rejected legacy request changed the filesystem');
      expect(built.spawnSpy.calls).toHaveLength(0);
      expect(processMocks.calls).toHaveLength(0);
    }
  });

  it('serves exactly the legacy production UI and leaves workspaces untouched', async () => {
    const built = tracked(await buildLegacyApp({ nodeEnv: 'production' }));
    const server = await boot(built.app);

    const root = await fetch(`${server.url}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Legacy Dist Marker');
    expect(await (await fetch(`${server.url}/`)).text()).not.toContain('Studio Dist Marker');

    const chat = await fetch(`${server.url}/api/chat`, {
      method: 'POST',
      headers: jsonAuth(LEGACY_TOKEN),
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    expect(chat.status).toBe(200);
    expect(chat.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(await chat.text()).toMatch(/no_provider_available/);
    expect(built.spawnSpy.calls).toHaveLength(0);
    expect(processMocks.calls).toHaveLength(0);
    expect(existsSync(join(built.tempDir, 'workspaces'))).toBe(false);
  });

  it('serves no Studio index on 3000 in legacy dev', async () => {
    const built = tracked(await buildLegacyApp({ nodeEnv: 'development' }));
    const server = await boot(built.app);

    const root = await fetch(`${server.url}/`);
    expect(root.status).toBe(200);
    const text = await root.text();
    expect(text).toContain('http://localhost:5173');
    expect(text).not.toContain('Studio Dist Marker');
  });
});
