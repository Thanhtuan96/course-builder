/**
 * 02-03 — legacy mount matrix, traversal/symlink containment, LLM write scoping and the shared
 * capability TTL cache.
 *
 * Every rejected request is checked against a snapshot of the temp courses root and its parent
 * (catches a `probe/` written outside the root) and against a spawn spy (SEC-13).
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import {
  createCapabilityCache,
  createLegacyRouter,
  saveFilesFromResponse,
} from '../../web/legacy-server.js';
import { requestWithHost } from './helpers/app.js';
import { assertUnchanged, snapshotTree } from './helpers/snapshot.js';
import {
  LEGACY_TOKEN,
  boot,
  buildLegacyApp,
} from './helpers/legacy.js';

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
});

function authHeaders(extra = {}) {
  return { 'X-Studio-Token': LEGACY_TOKEN, ...extra };
}

async function startLegacyApp(options = {}) {
  const built = await buildLegacyApp(options);
  cleanups.push(built.cleanup);
  const server = await boot(built.app);
  servers.push(server);
  return { ...built, server };
}

async function get(server, path, headers = authHeaders()) {
  return fetch(`${server.url}${path}`, { headers });
}

async function postJson(server, path, body, headers = authHeaders()) {
  return fetch(`${server.url}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function raw(server, path, { method = 'GET', headers = {}, body } = {}) {
  return requestWithHost({
    url: `${server.url}${path}`,
    method,
    headers: authHeaders(headers),
    body,
  });
}

describe('legacy mount matrix (SEC-01)', () => {
  it('returns 404 for every legacy surface when legacy is off', async () => {
    const { server, spawnSpy } = await startLegacyApp({ legacy: false });
    const paths = [
      '/api/chat',
      '/api/courses',
      '/api/courses/demo/COURSE.md',
      '/api/courses/demo/exercises',
      '/api/agents/capabilities',
      '/api/agents/models',
      '/api/notify',
    ];
    for (const path of paths) {
      const res = await fetch(`${server.url}${path}`, {
        method: path === '/api/chat' || path === '/api/notify' ? 'POST' : 'GET',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body:
          path === '/api/chat' || path === '/api/notify'
            ? JSON.stringify({ messages: [], courseSlug: 'demo' })
            : undefined,
      });
      expect(res.status, path).toBe(404);
      expect((await res.json()).code, path).toBe('not_found');
    }
    expect(spawnSpy.calls).toHaveLength(0);
  });

  it('mounts the legacy API and UI in legacy production', async () => {
    const { server, spawnSpy } = await startLegacyApp({ nodeEnv: 'production' });

    const ui = await get(server, '/');
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain('Legacy Dist Marker');
    expect(await (await get(server, '/')).text()).not.toContain('Studio Dist Marker');

    const courses = await get(server, '/api/courses');
    expect(courses.status).toBe(200);
    expect((await courses.json()).map((course) => course.slug)).toContain('demo');

    const notify = await postJson(server, '/api/notify', { courseSlug: 'demo' });
    expect(notify.status).toBe(200);
    expect(await notify.json()).toEqual({ success: true, message: 'Notification sent' });

    expect(spawnSpy.calls).toHaveLength(0);
  });

  it('serves no Studio index on 3000 in legacy dev (Vite on 5173)', async () => {
    const { server } = await startLegacyApp({ nodeEnv: 'development' });
    const res = await get(server, '/');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('http://localhost:5173');
    expect(text).not.toContain('Studio Dist Marker');
  });

  it('enforces the same Host/Origin/token/JSON guards as Studio', async () => {
    const { server } = await startLegacyApp({ nodeEnv: 'production' });

    const noToken = await fetch(`${server.url}/api/courses`);
    expect(noToken.status).toBe(401);
    expect((await noToken.json()).code).toBe('unauthorized');

    const badOrigin = await get(server, '/api/courses', authHeaders({ Origin: 'http://evil.example' }));
    expect(badOrigin.status).toBe(403);
    expect((await badOrigin.json()).code).toBe('forbidden_origin');

    const nullOrigin = await get(server, '/api/courses', authHeaders({ Origin: 'null' }));
    expect(nullOrigin.status).toBe(403);

    const badHost = await requestWithHost({
      url: `${server.url}/api/courses`,
      headers: authHeaders({ Host: 'evil.example' }),
    });
    expect(badHost.status).toBe(403);
    expect(JSON.parse(badHost.body).code).toBe('forbidden_host');

    const wrongType = await fetch(`${server.url}/api/courses/demo/COURSE.md`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'text/plain' }),
      body: 'x',
    });
    expect(wrongType.status).toBe(415);
    expect((await wrongType.json()).code).toBe('unsupported_media_type');

    const badJson = await fetch(`${server.url}/api/courses/demo/COURSE.md`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{"broken":',
    });
    expect(badJson.status).toBe(400);
    expect((await badJson.json()).code).toBe('invalid_json');
  });
});

describe('legacy traversal and symlink containment (SEC-08)', () => {
  it('rejects encoded, backslash, absolute and drive-letter vectors on read and write', async () => {
    const { server, coursesDir, tempDir, spawnSpy } = await startLegacyApp();
    const before = snapshotTree(tempDir);
    const vectors = [
      '/api/courses/../COURSE.md',
      '/api/courses/..%2F..%2Fprobe/COURSE.md',
      '/api/courses/%2e%2e/COURSE.md',
      '/api/courses/%252e%252e/COURSE.md',
      '/api/courses/%2e%2e%2f%2e%2e%2fprobe/COURSE.md',
      '/api/courses/..%5C..%5Cprobe/COURSE.md',
      '/api/courses/%5C%5Cserver%5Cshare/COURSE.md',
      '/api/courses/C:%5Cx/COURSE.md',
      '/api/courses/%2Fetc/COURSE.md',
      '/api/courses/demo/exercises/..%2F..%2F..%2Fprobe.md',
      '/api/courses/demo/exercises/x%2F..%2F..%2Fprobe.md',
    ];

    for (const vector of vectors) {
      const res = await raw(server, vector);
      expect([400, 403, 404], vector).toContain(res.status);
      expect(res.body, vector).not.toContain('root:');
    }

    for (const vector of [
      '/api/courses/..%2F..%2Fprobe/COURSE.md',
      '/api/courses/%2e%2e/COURSE.md',
      '/api/courses/%252e%252e/COURSE.md',
      '/api/courses/..%5C..%5Cprobe/COURSE.md',
      '/api/courses/C:%5Cx/COURSE.md',
      '/api/courses/demo/exercises/x%2F..%2F..%2Fprobe.md',
    ]) {
      const res = await raw(server, vector, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# pwned' }),
      });
      expect([400, 403, 404], vector).toContain(res.status);
    }

    const after = snapshotTree(tempDir);
    assertUnchanged(before, after, 'a rejected traversal changed the filesystem');
    expect(spawnSpy.calls).toHaveLength(0);
    expect(resolve(coursesDir).startsWith(tmpdir())).toBe(true);
  });

  it('never reads a symlinked course directory or symlinked COURSE.md', async () => {
    const { server, coursesDir, tempDir } = await startLegacyApp();
    const outside = join(tempDir, 'outside-course');
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'COURSE.md'), '# Course: Outside\n\nOUTSIDE-SECRET\n');

    const linkDir = join(coursesDir, 'link');
    symlinkSync(outside, linkDir, 'dir');

    mkdirSync(join(coursesDir, 'demo2'), { recursive: true });
    symlinkSync(join(outside, 'COURSE.md'), join(coursesDir, 'demo2', 'COURSE.md'), 'file');

    const list = await get(server, '/api/courses');
    const listed = await list.json();
    expect(listed.map((course) => course.slug)).not.toContain('link');
    const demo2 = listed.find((course) => course.slug === 'demo2');
    expect(demo2?.name).toBe('demo2');
    expect(JSON.stringify(listed)).not.toContain('OUTSIDE-SECRET');

    const viaLink = await raw(server, '/api/courses/link/COURSE.md');
    expect([400, 403, 404]).toContain(viaLink.status);
    expect(viaLink.body).not.toContain('OUTSIDE-SECRET');

    const viaFile = await raw(server, '/api/courses/demo2/COURSE.md');
    expect([400, 403, 404]).toContain(viaFile.status);
    expect(viaFile.body).not.toContain('OUTSIDE-SECRET');

    const before = snapshotTree(tempDir);
    const write = await postJson(server, '/api/courses/link/COURSE.md', {
      content: '# overwritten\n',
    });
    expect([400, 403]).toContain(write.status);
    assertUnchanged(before, snapshotTree(tempDir), 'a symlinked course write changed the tree');
  });

  it('skips symlinked exercise files and a symlinked exercises directory', async () => {
    const { server, coursesDir, tempDir } = await startLegacyApp();
    const outsideFile = join(tempDir, 'outside-exercise.md');
    writeFileSync(outsideFile, '# OUTSIDE-EXERCISE\n');
    symlinkSync(outsideFile, join(coursesDir, 'demo', 'exercises', '02-link.md'), 'file');

    const outsideDir = join(tempDir, 'outside-exercises');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, '01.md'), '# OUTSIDE-DIR\n');
    mkdirSync(join(coursesDir, 'symex'), { recursive: true });
    symlinkSync(outsideDir, join(coursesDir, 'symex', 'exercises'), 'dir');

    const demo = await get(server, '/api/courses/demo/exercises');
    const demoJson = await demo.json();
    expect(demoJson.exercises.map((exercise) => exercise.filename)).not.toContain('02-link.md');
    expect(JSON.stringify(demoJson)).not.toContain('OUTSIDE-EXERCISE');

    const direct = await raw(server, '/api/courses/demo/exercises/02-link.md');
    expect([400, 403, 404]).toContain(direct.status);
    expect(direct.body).not.toContain('OUTSIDE-EXERCISE');

    const symex = await get(server, '/api/courses/symex/exercises');
    expect((await symex.json()).exercises).toEqual([]);
  });

  it('rejects a symlinked lectures directory before archiving', async () => {
    const { server, coursesDir, tempDir } = await startLegacyApp();
    const outside = join(tempDir, 'outside-lectures');
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(coursesDir, 'demo', 'lectures'), 'dir');

    const lecturePath = join(coursesDir, 'demo', 'LECTURE.md');
    const originalLecture = readFileSync(lecturePath, 'utf-8');
    const before = snapshotTree(tempDir);

    const res = await postJson(server, '/api/courses/demo/LECTURE.md', {
      content: '# Section 2: New Section\n\nNew lecture\n',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('unsafe_path');

    expect(readFileSync(lecturePath, 'utf-8')).toBe(originalLecture);
    assertUnchanged(before, snapshotTree(tempDir), 'a symlinked lectures write changed the tree');
  });

  it('accepts a valid course and exercise write', async () => {
    const { server, coursesDir } = await startLegacyApp();
    const course = await postJson(server, '/api/courses/demo/COURSE.md', {
      content: '# Course: Demo\n\nUpdated\n',
    });
    expect(course.status).toBe(200);
    expect(readFileSync(join(coursesDir, 'demo', 'COURSE.md'), 'utf-8')).toContain('Updated');

    const exercise = await postJson(server, '/api/courses/demo/exercises/02-valid.md', {
      content: '# Exercise 2\n',
    });
    expect(exercise.status).toBe(200);
    expect(readFileSync(join(coursesDir, 'demo', 'exercises', '02-valid.md'), 'utf-8')).toContain(
      'Exercise 2'
    );
  });
});

describe('LLM file writes are scoped to the current course (D-25)', () => {
  it('ignores another course while chatting in demo', async () => {
    const { coursesDir, tempDir, cleanup } = await buildLegacyApp();
    cleanups.push(cleanup);

    const saved = saveFilesFromResponse(
      [
        '<file path="courses/other/COURSE.md"># PWNED</file>',
        '<file path="courses/demo/COURSE.md"># Course: Demo\n\nScoped</file>',
        '<file path="LECTURE.md"># Section 1: Intro\n\nScoped lecture</file>',
        '<file path="courses/other/NOTES.md"># PWNED</file>',
      ].join('\n'),
      'demo',
      { coursesDir, log: () => {} }
    );

    expect(saved).toEqual([
      { slug: 'demo', file: 'COURSE.md' },
      { slug: 'demo', file: 'LECTURE.md' },
    ]);
    expect(readFileSync(join(coursesDir, 'demo', 'COURSE.md'), 'utf-8')).toContain('Scoped');
    expect(readFileSync(join(coursesDir, 'other', 'COURSE.md'), 'utf-8')).toContain('Other');
    expect(readFileSync(join(coursesDir, 'other', 'COURSE.md'), 'utf-8')).not.toContain('PWNED');
    expect(() => readFileSync(join(coursesDir, 'other', 'NOTES.md'))).toThrow();
    expect(tempDir.startsWith(tmpdir())).toBe(true);
  });

  it('adopts exactly one new slug when there is no current course', async () => {
    const { coursesDir, tempDir, cleanup } = await buildLegacyApp();
    cleanups.push(cleanup);

    const saved = saveFilesFromResponse(
      [
        '<file path="courses/brand-new/COURSE.md"># Course: Brand New</file>',
        '<file path="CAPSTONE.md"># Capstone</file>',
        '<file path="courses/second-slug/COURSE.md"># Second</file>',
        '<file path="courses/other/COURSE.md"># PWNED</file>',
        '<file path="../evil.md"># PWNED</file>',
        '<file path="courses/brand-new/evil.txt"># PWNED</file>',
      ].join('\n'),
      '',
      { coursesDir, log: () => {} }
    );

    expect(saved).toEqual([
      { slug: 'brand-new', file: 'COURSE.md' },
      { slug: 'brand-new', file: 'CAPSTONE.md' },
    ]);
    expect(readFileSync(join(coursesDir, 'brand-new', 'COURSE.md'), 'utf-8')).toContain('Brand New');
    expect(readFileSync(join(coursesDir, 'brand-new', 'CAPSTONE.md'), 'utf-8')).toContain('Capstone');
    expect(() => readFileSync(join(coursesDir, 'second-slug', 'COURSE.md'))).toThrow();
    expect(readFileSync(join(coursesDir, 'other', 'COURSE.md'), 'utf-8')).not.toContain('PWNED');
    expect(tempDir.startsWith(tmpdir())).toBe(true);
  });

  it('never creates a course slug that already exists when no current slug is set', async () => {
    const { coursesDir, cleanup } = await buildLegacyApp();
    cleanups.push(cleanup);

    const saved = saveFilesFromResponse(
      '<file path="courses/other/COURSE.md"># PWNED</file>',
      '',
      { coursesDir, log: () => {} }
    );

    expect(saved).toEqual([]);
    expect(readFileSync(join(coursesDir, 'other', 'COURSE.md'), 'utf-8')).toContain('Other');
    expect(readFileSync(join(coursesDir, 'other', 'COURSE.md'), 'utf-8')).not.toContain('PWNED');
  });
});

describe('capability/model TTL cache (CONCERNS #6)', () => {
  async function cacheApp({ probe, now = () => 1000 }) {
    const coursesDir = mkdtempSync(join(tmpdir(), 'professor-cache-courses-'));
    cleanups.push(() => rmSync(coursesDir, { recursive: true, force: true }));
    const cache = createCapabilityCache({ ttlMs: 30000, now, probe });
    const router = createLegacyRouter({
      coursesDir,
      getToken: () => LEGACY_TOKEN,
      capabilityCache: cache,
      log: () => {},
    });
    const app = express();
    app.use(router);
    const server = await boot(app);
    servers.push(server);
    return { server, cache };
  }

  it('probes once inside the 30s TTL and again after it expires', async () => {
    let calls = 0;
    let clock = 1000;
    const { server } = await cacheApp({
      now: () => clock,
      probe: async (key) => {
        calls += 1;
        if (key === 'capabilities') return { claude: { installed: true } };
        return { models: [{ id: 'cached-model' }] };
      },
    });

    const headers = authHeaders();
    expect((await fetch(`${server.url}/api/agents/capabilities`, { headers })).status).toBe(200);
    expect((await fetch(`${server.url}/api/agents/capabilities`, { headers })).status).toBe(200);
    expect(calls).toBe(1);

    clock += 30001;
    expect((await fetch(`${server.url}/api/agents/capabilities`, { headers })).status).toBe(200);
    expect(calls).toBe(2);
  });

  it('shares the same TTL store for per-provider model lists', async () => {
    const keys = [];
    let clock = 5000;
    const { server } = await cacheApp({
      now: () => clock,
      probe: async (key) => {
        keys.push(key);
        if (key === 'capabilities') {
          return { cursor: { installed: true }, claude: { installed: false } };
        }
        return { models: [{ id: 'cursor-fast' }] };
      },
    });

    const headers = authHeaders();
    const first = await fetch(`${server.url}/api/agents/models?provider=cursor`, { headers });
    expect(first.status).toBe(200);
    expect((await first.json()).models).toEqual(['cursor-fast']);

    const second = await fetch(`${server.url}/api/agents/models?provider=cursor`, { headers });
    expect((await second.json()).models).toEqual(['cursor-fast']);
    expect(keys.filter((key) => key === 'models:cursor')).toHaveLength(1);

    clock += 30001;
    await fetch(`${server.url}/api/agents/models?provider=cursor`, { headers });
    expect(keys.filter((key) => key === 'models:cursor')).toHaveLength(2);
  });

  it('uses the shared shell-less probe (no execSync in legacy or health)', () => {
    const legacy = readFileSync(new URL('../../web/legacy-server.js', import.meta.url), 'utf-8');
    const health = readFileSync(
      new URL('../../web/studio-api/health.js', import.meta.url),
      'utf-8'
    );
    expect(legacy).not.toMatch(/\bexecSync\s*\(/);
    expect(health).not.toMatch(/\bexecSync\s*\(/);
    expect(legacy).toContain('detectAgents');
    expect(legacy).toContain('listAgentModels');
  });
});
