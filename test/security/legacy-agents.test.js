/**
 * 02-03 — legacy agent safety and Vite startup.
 *
 * Legacy chat must reuse Plan 04's hardened runners: shell-less, temp cwd, allowlisted env and no
 * bypass flag/env. The fake-agent fixtures capture every invocation without a real CLI.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  createLegacyAgentRunners,
  startLegacyDevServer,
} from '../../web/legacy-server.js';
import { startServer } from '../../web/server.js';
import { createStudioDb } from '../../web/studio-db.js';
import { getFreePort } from './helpers/free-port.js';
import { isolateEnv, restoreEnv } from './helpers/env.js';
import {
  LEGACY_TOKEN,
  boot,
  buildLegacyApp,
  createSpawnSpy,
} from './helpers/legacy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'fake-agents');
const ORIGINAL_PATH = process.env.PATH || '';
const WEB_CLIENT = join(__dirname, '..', '..', 'web', 'client');

const DENY_TOKENS = [
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
  '--trust',
  '--force',
  '--yolo',
  '--auto',
];

const CREDENTIALS = {
  claude: ['ANTHROPIC_API_KEY', 'sk-ant-test'],
  cursor: ['CURSOR_API_KEY', 'cursor-test'],
  opencode: ['OPENCODE_MODEL', 'test/model'],
  gemini: ['GEMINI_API_KEY', 'gemini-test'],
  antigravity: ['GOOGLE_API_KEY', 'google-test'],
};

let captureSeq = 0;
function nextCapturePath() {
  captureSeq += 1;
  return join(tmpdir(), `professor-legacy-capture-${process.pid}-${captureSeq}.jsonl`);
}

function runFake(runners, agent, ctx = {}, capturePath = nextCapturePath()) {
  const withCapture = runners[agent];
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${agent} fake agent timed out`)), 10_000);
    let text = '';
    let error = null;
    withCapture({
      system: 'be a tutor',
      prompt: 'hello tutor',
      messages: [{ role: 'user', content: 'hi' }],
      log: () => {},
      ...ctx,
      onText: (chunk) => {
        text += chunk;
      },
      onError: (err) => {
        error = err;
      },
      onDone: () => {
        clearTimeout(timer);
        let capture = null;
        if (existsSync(capturePath)) {
          const line = readFileSync(capturePath, 'utf-8').trim().split('\n')[0];
          if (line) capture = JSON.parse(line);
          rmSync(capturePath, { force: true });
        }
        resolve({ capture, text, error });
      },
    });
  });
}

beforeEach(() => {
  isolateEnv();
  process.env.PATH = `${FIXTURES}:${ORIGINAL_PATH}`;
  for (const [key, value] of Object.values(CREDENTIALS)) process.env[key] = value;
  process.env.NODE_OPTIONS = '--require ./evil.js';
  process.env.LD_PRELOAD = '/tmp/evil.so';
  process.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS = '1';
  process.env.CLAUDECODE = '1';
  process.env.OPENCODE_PERMISSION = '{"edit":"allow"}';
});

afterEach(() => {
  restoreEnv();
});

describe('legacy agent runners reuse the hardened bridge contract', () => {
  for (const agent of ['claude', 'cursor', 'opencode', 'gemini', 'antigravity']) {
    it(`spawns ${agent} with no bypass flag/env, a temp cwd and a scrubbed env`, async () => {
      const capturePath = nextCapturePath();
      const runners = createLegacyAgentRunners({
        extraEnv: { PROFESSOR_CAPTURE_FILE: capturePath },
      });

      const { capture, text, error } = await runFake(
        runners,
        agent,
        { model: agent === 'claude' ? undefined : 'test-model' },
        capturePath
      );

      expect(error).toBeNull();
      expect(text.length).toBeGreaterThan(0);
      expect(capture).not.toBeNull();
      expect(capture.agent).toBe(agent === 'cursor' ? 'agent' : agent === 'antigravity' ? 'agy' : agent);

      for (const token of DENY_TOKENS) {
        expect(capture.argv).not.toContain(token);
        expect(capture.argv.join(' ')).not.toContain(token);
      }
      expect(capture.argv.join(' ')).not.toMatch(/--permission-mode=(bypassPermissions|acceptEdits|auto)/);
      expect(capture.argv.join(' ')).not.toMatch(/--approval-mode=(yolo|auto_edit|default)/);

      expect(
        capture.cwd.startsWith(tmpdir()) ||
          capture.cwd.startsWith(realpathSync(tmpdir()))
      ).toBe(true);
      expect(capture.cwd.split(/[\\/]/).pop()).toMatch(/^professor-/);
      expect(existsSync(capture.cwd)).toBe(false);

      expect(capture.env.NODE_OPTIONS).toBeUndefined();
      expect(capture.env.LD_PRELOAD).toBeUndefined();
      expect(capture.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS).toBeUndefined();
      expect(capture.env.CLAUDECODE).toBeUndefined();
      expect(capture.env.OPENCODE_PERMISSION).toBeUndefined();

      const credential = CREDENTIALS[agent]?.[0];
      if (credential) expect(capture.env[credential]).toBe(CREDENTIALS[agent][1]);

      if (agent === 'opencode') {
        const profile = JSON.parse(capture.env.OPENCODE_CONFIG_CONTENT || '{}');
        expect(profile.permission).toMatchObject({
          edit: 'deny',
          bash: 'deny',
          webfetch: 'deny',
          websearch: 'deny',
          task: 'deny',
        });
      }
    });
  }

  it('never forwards the test-only capture variable in production', async () => {
    const capturePath = nextCapturePath();
    process.env.PROFESSOR_CAPTURE_FILE = capturePath;
    const runners = createLegacyAgentRunners();

    await runFake(runners, 'claude', {}, capturePath);

    expect(existsSync(capturePath)).toBe(false);
  });
});

describe('legacy /api/chat SSE', () => {
  it('keeps the legacy {content} SSE shape while using the safe runner', async () => {
    const capturePath = nextCapturePath();
    const runners = createLegacyAgentRunners({
      extraEnv: { PROFESSOR_CAPTURE_FILE: capturePath },
    });
    const built = await buildLegacyApp({
      capabilities: () => ({ claude: { installed: true } }),
      legacyRunners: runners,
    });
    const server = await boot(built.app);
    try {
      const res = await fetch(`${server.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Token': LEGACY_TOKEN },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'hello' }],
          courseSlug: 'demo',
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.text();

      expect(body).toContain('"provider":"claude"');
      expect(body).toContain('"content":"ok-claude"');
      expect(body).toContain('data: [DONE]');

      const capture = JSON.parse(readFileSync(capturePath, 'utf-8').trim().split('\n')[0]);
      for (const token of DENY_TOKENS) expect(capture.argv).not.toContain(token);
      expect(
        capture.cwd.startsWith(tmpdir()) ||
          capture.cwd.startsWith(realpathSync(tmpdir()))
      ).toBe(true);
      expect(capture.cwd.split(/[\\/]/).pop()).toMatch(/^professor-/);
    } finally {
      await server.close();
      built.cleanup();
      rmSync(capturePath, { force: true });
    }
  });

  it('does not spawn when the legacy chat request is unauthenticated', async () => {
    const spawnSpy = createSpawnSpy();
    const built = await buildLegacyApp({ spawnImpl: spawnSpy });
    const server = await boot(built.app);
    try {
      const res = await fetch(`${server.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
      });
      expect(res.status).toBe(401);
      expect(spawnSpy.calls).toHaveLength(0);
    } finally {
      await server.close();
      built.cleanup();
    }
  });
});

describe('legacy Vite dev startup', () => {
  it('spawns npm run dev without a shell in the client dir', () => {
    const spawnSpy = createSpawnSpy();
    const handle = startLegacyDevServer({
      clientDir: WEB_CLIENT,
      spawnImpl: spawnSpy,
      platform: 'linux',
      log: () => {},
    });

    expect(handle.error).toBeNull();
    expect(spawnSpy.calls).toHaveLength(1);
    const [command, args, options] = spawnSpy.calls[0];
    expect(command).toMatch(/npm$/);
    expect(args).toEqual(['run', 'dev']);
    expect(options.cwd).toBe(WEB_CLIENT);
    expect(options.shell).toBe(false);
    handle.kill();
  });

  it('returns the structured Windows shim error without spawning', () => {
    const spawnSpy = createSpawnSpy();
    const handle = startLegacyDevServer({
      clientDir: WEB_CLIENT,
      spawnImpl: spawnSpy,
      platform: 'win32',
      log: () => {},
    });

    expect(handle.error?.code).toBe('unsupported_windows_shim');
    expect(handle.error?.message).toMatch(/unsupported|WSL/i);
    expect(spawnSpy.calls).toHaveLength(0);
  });
});

describe('startServer legacy-dev UI URL', () => {
  async function bootServer({ legacy }) {
    const tempDir = mkdtempSync(join(tmpdir(), 'professor-start-legacy-'));
    const coursesDir = join(tempDir, 'courses');
    const studioDist = join(tempDir, 'studio-dist');
    mkdirSync(coursesDir, { recursive: true });
    mkdirSync(studioDist, { recursive: true });
    writeFileSync(join(studioDist, 'index.html'), '<title>Studio</title>');

    isolateEnv({
      PROFESSOR_HOME: tempDir,
      STUDIO_DB: join(tempDir, 'professor.db'),
      COURSES_DIR: coursesDir,
      STUDIO_DIST: studioDist,
      NODE_ENV: 'development',
    });

    const db = createStudioDb({ dbPath: join(tempDir, 'professor.db') });
    const spawnSpy = createSpawnSpy();
    const port = await getFreePort();
    const result = await startServer({
      legacy,
      port,
      host: '127.0.0.1',
      env: process.env,
      token: LEGACY_TOKEN,
      getToken: () => LEGACY_TOKEN,
      db,
      coursesDir,
      studioDist,
      spawnImpl: spawnSpy,
      platform: 'linux',
      logBanner: false,
      log: () => {},
    });

    return {
      result,
      spawnSpy,
      port,
      async cleanup() {
        await result.close();
        try {
          db.close();
        } catch {
          /* ignore */
        }
        rmSync(tempDir, { recursive: true, force: true });
      },
    };
  }

  it('reports uiUrl 5173 and spawns Vite only in legacy dev', async () => {
    const { result, spawnSpy, cleanup } = await bootServer({ legacy: true });
    try {
      expect(result.uiUrl).toBe('http://localhost:5173');
      expect(spawnSpy.calls).toHaveLength(1);
      const [, args, options] = spawnSpy.calls[0];
      expect(args).toEqual(['run', 'dev']);
      expect(options.shell).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('Studio-only reports the server URL and never spawns Vite', async () => {
    const { result, spawnSpy, port, cleanup } = await bootServer({ legacy: false });
    try {
      expect(result.uiUrl).toBe(`http://localhost:${port}`);
      expect(spawnSpy.calls).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });
});
