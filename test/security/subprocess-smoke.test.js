/**
 * 02-05 — real entry-point smoke tests.
 *
 * This file intentionally has NO `child_process` mocks: it spawns the actual server/CLI so the
 * release-gate contract is proved end to end. Rejections are asserted by status/body/stderr only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { getFreePort } from './helpers/free-port.js';
import { assertUnchanged, snapshotTree } from './helpers/snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SERVER_ENTRY = join(REPO_ROOT, 'web', 'server.js');
const CLI_ENTRY = join(REPO_ROOT, 'bin', 'cli.js');
const TOKEN = 'smoke-token-0123456789abcdef0123456789abcdef';

const children = [];
const tempRoots = [];

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

afterEach(async () => {
  while (children.length) {
    const child = children.pop();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolveExit) => child.once('exit', resolveExit)),
        sleep(3000),
      ]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }
  while (tempRoots.length) {
    try {
      rmSync(tempRoots.pop(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function makeTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'professor-smoke-'));
  tempRoots.push(root);
  const courses = join(root, 'courses');
  const studioDist = join(root, 'studio-dist');
  const legacyDist = join(root, 'legacy-dist');
  for (const dir of [courses, studioDist, legacyDist]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(studioDist, 'index.html'), '<!doctype html><title>Studio Smoke</title>');
  writeFileSync(join(legacyDist, 'index.html'), '<!doctype html><title>Legacy Smoke</title>');
  return { root, courses, studioDist, legacyDist };
}

function childEnv(root, courses, extra = {}) {
  const base = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('PROFESSOR_') || key.startsWith('STUDIO_')) continue;
    if (['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'COURSES_DIR', 'NODE_ENV'].includes(key)) {
      continue;
    }
    base[key] = value;
  }
  return {
    ...base,
    PROFESSOR_HOME: root,
    STUDIO_DB: join(root, 'professor.db'),
    COURSES_DIR: courses,
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    ...extra,
  };
}

function start({ args, env }) {
  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const exited = new Promise((resolveExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
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
  };
}

async function waitForHealth(baseUrl, getStderr) {
  const deadline = Date.now() + 8000;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/studio/health`, {
        headers: { 'X-Studio-Token': TOKEN },
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

describe('node web/server.js entry', () => {
  it('defaults to Studio-only, 404s legacy routes, and writes nothing on rejection', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = start({
      args: [SERVER_ENTRY],
      env: childEnv(temp.root, temp.courses, {
        PORT: String(port),
        STUDIO_DIST: temp.studioDist,
        STUDIO_BRIDGE_TOKEN: TOKEN,
      }),
    });
    try {
      await waitForHealth(baseUrl, () => server.stderr);
      const before = snapshotTree(temp.root);

      const root = await fetch(`${baseUrl}/`);
      expect(root.status).toBe(200);
      expect(await root.text()).toContain('Studio Smoke');

      for (const path of ['/api/chat', '/api/courses', '/api/agents/capabilities', '/api/notify']) {
        const res = await fetch(`${baseUrl}${path}`, {
          method: path === '/api/chat' || path === '/api/notify' ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: path === '/api/chat' || path === '/api/notify' ? '{}' : undefined,
        });
        expect(res.status, path).toBe(404);
      }

      const wrongToken = await fetch(`${baseUrl}/api/studio/db/health`, {
        headers: { 'X-Studio-Token': 'wrong' },
      });
      expect(wrongToken.status).toBe(401);

      const after = snapshotTree(temp.root);
      assertUnchanged(before, after, 'a rejected subprocess request changed the data root');
    } finally {
      server.child.kill('SIGTERM');
      await server.exited;
    }
  });
});

describe('node bin/cli.js web entry', () => {
  it('starts Studio-only without prompting and serves the Studio UI', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = start({
      args: [CLI_ENTRY, 'web', String(port)],
      env: childEnv(temp.root, temp.courses, {
        STUDIO_DIST: temp.studioDist,
        STUDIO_BRIDGE_TOKEN: TOKEN,
      }),
    });
    try {
      await waitForHealth(baseUrl, () => server.stderr);
      expect(server.stdout).toMatch(/#token=/);
      expect(server.stdout).not.toMatch(/\?token=/);
      expect(server.stderr).not.toMatch(/No Anthropic API key|Paste your API key/);

      const chat = await fetch(`${baseUrl}/api/chat`, { method: 'POST' });
      expect(chat.status).toBe(404);
    } finally {
      server.child.kill('SIGTERM');
      await server.exited;
    }
  });

  it('warns on stderr when PROFESSOR_LEGACY=1 enables legacy mode', async () => {
    const temp = makeTempRoot();
    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const server = start({
      args: [CLI_ENTRY, 'web', String(port)],
      env: childEnv(temp.root, temp.courses, {
        NODE_ENV: 'production',
        LEGACY_DIST: temp.legacyDist,
        PROFESSOR_LEGACY: '1',
        STUDIO_BRIDGE_TOKEN: TOKEN,
        ANTHROPIC_API_KEY: 'sk-ant-smoke-test',
      }),
    });
    try {
      await waitForHealth(baseUrl, () => server.stderr);
      expect(server.stderr).toMatch(/\[deprecated\]/);
      expect(server.stderr).toMatch(/http:\/\/localhost:5180/);

      const root = await fetch(`${baseUrl}/`);
      expect(root.status).toBe(200);
      expect(await root.text()).toContain('Legacy Smoke');
    } finally {
      server.child.kill('SIGTERM');
      await server.exited;
    }
  }, 20000);
});

describe('npm start script target', () => {
  it('resolves to node web/server.js (Phase 4 owns any script change)', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.start).toMatch(/web/);
    expect(pkg.scripts.start).toMatch(/node\s+server\.js/);
  });
});
