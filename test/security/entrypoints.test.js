/**
 * 02-02 Task 4/5 — entry-point parity and exact-one-UI (Studio half).
 *
 * Subprocess tests drive the real `node web/server.js` entry so Studio-only 404s, the Host guard,
 * the deprecation warning and the config refusal are proved end to end. In-process rejection tests
 * additionally prove no filesystem write and no child process.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import net from 'net';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { isolateEnv, restoreEnv } from './helpers/env.js';
import { getFreePort } from './helpers/free-port.js';
import { TEST_TOKEN, buildTestApp, bootTestServer, requestWithHost } from './helpers/app.js';
import { assertUnchanged, snapshotTree } from './helpers/snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, '..', '..', 'web', 'server.js');

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'professor-entry-'));
  const courses = join(root, 'courses');
  const dist = join(root, 'studio-dist');
  const legacyDist = join(root, 'legacy-dist');
  mkdirSync(courses, { recursive: true });
  mkdirSync(dist, { recursive: true });
  mkdirSync(legacyDist, { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Studio Entry Test</title>');
  writeFileSync(
    join(legacyDist, 'index.html'),
    '<!doctype html><title>Legacy Entry Test</title>'
  );
  return { root, courses, dist, legacyDist };
}

/** A fake `npm` so the legacy-dev entry can prove the 5173 contract without starting Vite. */
function makeFakeNpm(root) {
  const binDir = join(root, 'fake-bin');
  mkdirSync(binDir, { recursive: true });
  const npmPath = join(binDir, 'npm');
  writeFileSync(npmPath, '#!/bin/sh\nexit 0\n');
  chmodSync(npmPath, 0o755);
  return binDir;
}

function childEnv({ root, courses, dist, port, ...overrides }) {
  return {
    ...process.env,
    PROFESSOR_HOME: root,
    STUDIO_DB: join(root, 'professor.db'),
    COURSES_DIR: courses,
    STUDIO_DIST: dist,
    PORT: String(port),
    HOST: '127.0.0.1',
    STUDIO_BRIDGE_TOKEN: TEST_TOKEN,
    NODE_ENV: 'development',
    ...overrides,
  };
}

function startChild({ env, args = [] }) {
  const child = spawn(process.execPath, [SERVER_ENTRY, ...args], {
    cwd: join(__dirname, '..', '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const exited = new Promise((resolveExit) => {
    child.on('exit', (code, signal) => resolveExit({ code, signal }));
  });
  return {
    child,
    exited,
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      }
    },
  };
}

async function waitForHealth(baseUrl, { timeoutMs = 5000, getStderr = () => '' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/studio/health`, {
        headers: { 'X-Studio-Token': TEST_TOKEN },
      });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(100);
  }
  throw new Error(`server did not become healthy (${lastError}); stderr=${getStderr()}`);
}

async function portIsClosed(port) {
  return new Promise((resolveClosed) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = (closed) => {
      socket.destroy();
      resolveClosed(closed);
    };
    socket.once('connect', () => done(false));
    socket.once('error', () => done(true));
    setTimeout(() => done(true), 1000);
  });
}

beforeAll(() => {
  isolateEnv({});
});

afterAll(() => {
  restoreEnv();
});

describe('node web/server.js defaults to Studio-only', () => {
  it('serves Studio at / and /index.html, and 404s every legacy surface', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = startChild({
      env: childEnv({ ...temp, port }),
    });
    try {
      await waitForHealth(baseUrl, { getStderr: () => server.stderr });

      const root = await fetch(`${baseUrl}/`);
      expect(root.status).toBe(200);
      expect(await root.text()).toContain('Studio Entry Test');

      const index = await fetch(`${baseUrl}/index.html`);
      expect(index.status).toBe(200);
      expect(await index.text()).toContain('Studio Entry Test');

      for (const path of [
        '/api/chat',
        '/api/courses',
        '/api/courses/x/COURSE.md',
        '/api/agents/capabilities',
        '/api/notify',
      ]) {
        const res = await fetch(`${baseUrl}${path}`);
        expect(res.status, path).toBe(404);
        expect(res.headers.get('content-type')).toMatch(/application\/json/);
        expect((await res.json()).code).toBe('not_found');
      }

      const legacyAsset = await fetch(`${baseUrl}/src/main.jsx`);
      expect(legacyAsset.status).toBe(404);

      // A spoofed Host is rejected on the UI route too.
      const spoofed = await requestWithHost({
        url: `${baseUrl}/`,
        headers: { Host: 'evil.example' },
      });
      expect(spoofed.status).toBe(403);
      expect(spoofed.body).not.toContain('Studio Entry Test');
      expect(JSON.parse(spoofed.body).code).toBe('forbidden_host');
    } finally {
      await server.stop();
      rmSync(temp.root, { recursive: true, force: true });
    }
  });

  it('returns the build instruction instead of the legacy client when studio/dist is missing', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const missingDist = join(temp.root, 'missing-studio-dist');
    const server = startChild({
      env: childEnv({ ...temp, dist: missingDist, port }),
    });
    try {
      await waitForHealth(baseUrl, { getStderr: () => server.stderr });
      for (const path of ['/', '/index.html', '/settings']) {
        const res = await fetch(`${baseUrl}${path}`);
        expect(res.status, path).toBe(503);
        expect(await res.text()).toMatch(/build/i);
      }
    } finally {
      await server.stop();
      rmSync(temp.root, { recursive: true, force: true });
    }
  });

  it('warns on stderr but starts when STUDIO_ORIGINS=* is the only escape hatch', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = startChild({
      env: childEnv({ ...temp, port, STUDIO_ORIGINS: '*' }),
    });
    try {
      await waitForHealth(baseUrl, { getStderr: () => server.stderr });
      expect(server.stderr).toMatch(/STUDIO_ORIGINS/);
      const res = await fetch(`${baseUrl}/api/studio/health`, {
        headers: { 'X-Studio-Token': TEST_TOKEN, Origin: 'http://evil.example' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://evil.example');
    } finally {
      await server.stop();
      rmSync(temp.root, { recursive: true, force: true });
    }
  });
});

describe('legacy is opt-in and fully mounted', () => {
  for (const mode of ['--legacy', 'PROFESSOR_LEGACY=1']) {
    it(`warns on stderr and serves legacy production at / (${mode})`, async () => {
      const temp = makeTempRoot();
      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${port}`;
      const env =
        mode === 'PROFESSOR_LEGACY=1'
          ? childEnv({
              ...temp,
              port,
              NODE_ENV: 'production',
              LEGACY_DIST: temp.legacyDist,
              PROFESSOR_LEGACY: '1',
            })
          : childEnv({
              ...temp,
              port,
              NODE_ENV: 'production',
              LEGACY_DIST: temp.legacyDist,
            });
      const args = mode === '--legacy' ? ['--legacy'] : [];
      const server = startChild({ env, args });
      try {
        await waitForHealth(baseUrl, { getStderr: () => server.stderr });
        expect(server.stderr).toMatch(/\[deprecated\]/);
        expect(server.stderr).not.toMatch(/legacy_unavailable|Legacy mode requires/i);

        const root = await fetch(`${baseUrl}/`);
        expect(root.status).toBe(200);
        expect(await root.text()).toContain('Legacy Entry Test');

        const courses = await fetch(`${baseUrl}/api/courses`, {
          headers: { 'X-Studio-Token': TEST_TOKEN },
        });
        expect(courses.status).toBe(200);
        expect(await courses.json()).toEqual([]);
      } finally {
        await server.stop();
        rmSync(temp.root, { recursive: true, force: true });
      }
    });
  }

  it('serves no Studio index on 3000 in legacy dev and reports Vite on 5173', async () => {
    const temp = makeTempRoot();
    const fakeBin = makeFakeNpm(temp.root);
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = startChild({
      env: childEnv({
        ...temp,
        port,
        NODE_ENV: 'development',
        LEGACY_DIST: temp.legacyDist,
        PATH: `${fakeBin}:${process.env.PATH || ''}`,
      }),
      args: ['--legacy'],
    });
    try {
      await waitForHealth(baseUrl, { getStderr: () => server.stderr });
      expect(server.stderr).toMatch(/\[deprecated\]/);

      const root = await fetch(`${baseUrl}/`);
      expect(root.status).toBe(200);
      const text = await root.text();
      expect(text).toContain('http://localhost:5173');
      expect(text).not.toContain('Studio Entry Test');

      expect(server.stdout).toMatch(/http:\/\/localhost:5173/);
    } finally {
      await server.stop();
      rmSync(temp.root, { recursive: true, force: true });
    }
  });
});

describe('insecure escape hatches are refused before bind', () => {
  it('exits non-zero without binding when STUDIO_ORIGINS=* meets STUDIO_ALLOW_NON_LOOPBACK', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const server = startChild({
      env: childEnv({
        ...temp,
        port,
        STUDIO_ORIGINS: '*',
        STUDIO_ALLOW_NON_LOOPBACK: '1',
      }),
    });
    try {
      const { code } = await server.exited;
      expect(code).not.toBe(0);
      expect(server.stderr).toMatch(/STUDIO_ORIGINS|cannot be combined|insecure/i);
      expect(await portIsClosed(port)).toBe(true);
    } finally {
      await server.stop();
      rmSync(temp.root, { recursive: true, force: true });
    }
  });

  it('refuses a wildcard bind host', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const server = startChild({
      env: childEnv({ ...temp, port, HOST: '0.0.0.0', STUDIO_ALLOW_NON_LOOPBACK: '1' }),
    });
    try {
      const { code } = await server.exited;
      expect(code).not.toBe(0);
      expect(server.stderr).toMatch(/wildcard host|0\.0\.0\.0/i);
      expect(await portIsClosed(port)).toBe(true);
    } finally {
      await server.stop();
      rmSync(temp.root, { recursive: true, force: true });
    }
  });
});

describe('in-process rejections write nothing and spawn nothing', () => {
  it('leaves the data dir byte-identical for 401/403/404/415', async () => {
    const { app, tempDir, spawnSpy, cleanup } = await buildTestApp();
    const server = await bootTestServer(app);
    const before = snapshotTree(tempDir);
    try {
      const jsonHeaders = { 'Content-Type': 'application/json' };

      const unauthorized = await fetch(`${server.url}/api/studio/db/health`);
      expect(unauthorized.status).toBe(401);

      const badOrigin = await fetch(`${server.url}/api/studio/health`, {
        headers: { 'X-Studio-Token': TEST_TOKEN, Origin: 'null' },
      });
      expect(badOrigin.status).toBe(403);

      const badHost = await requestWithHost({
        url: `${server.url}/api/studio/health`,
        headers: { Host: 'evil.example', 'X-Studio-Token': TEST_TOKEN },
      });
      expect(badHost.status).toBe(403);

      const legacyRoute = await fetch(`${server.url}/api/chat`, { headers: jsonHeaders });
      expect(legacyRoute.status).toBe(404);

      const wrongType = await fetch(`${server.url}/api/studio/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'X-Studio-Token': TEST_TOKEN },
        body: 'not json',
      });
      expect(wrongType.status).toBe(415);
    } finally {
      await server.close();
    }

    try {
      const after = snapshotTree(tempDir);
      assertUnchanged(before, after, 'a rejected request changed the data directory');
      expect(spawnSpy.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });
});
