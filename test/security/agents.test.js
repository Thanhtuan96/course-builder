/**
 * Plan 02-04 — bridge agent invocation contract.
 *
 * Runs the real `defaultAgentRunners()` against fake binaries on PATH. The fakes append
 * `{ agent, argv, env, cwd }` to `PROFESSOR_CAPTURE_FILE`, which is injected only through the
 * test-only `defaultAgentRunners({ extraEnv })` option, so the production allowlist stays closed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chmodSync,
  existsSync,
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
  buildAgentArgs,
  defaultAgentRunners,
  resolveAgentCommand,
} from '../../web/studio-api/agents.js';
import { listAgentModels } from '../../web/studio-api/health.js';
import { assertSafeAgentInvocation } from '../../web/security.js';
import { isolateEnv, restoreEnv } from './helpers/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'fake-agents');
const ORIGINAL_PATH = process.env.PATH || '';

const CREDENTIALS = {
  claude: ['ANTHROPIC_API_KEY', 'sk-ant-test'],
  cursor: ['CURSOR_API_KEY', 'cursor-test'],
  opencode: ['OPENCODE_MODEL', 'test/model'],
  gemini: ['GEMINI_API_KEY', 'gemini-test'],
  antigravity: ['GOOGLE_API_KEY', 'google-test'],
};

const EXPECTED_TEXT = {
  claude: 'ok-claude',
  cursor: 'ok-cursor',
  opencode: 'ok-opencode',
  gemini: 'ok-gemini',
  antigravity: 'ok-agy',
};

let captureSeq = 0;

function nextCapturePath() {
  captureSeq += 1;
  return join(tmpdir(), `professor-capture-${process.pid}-${captureSeq}.jsonl`);
}

/**
 * Run one agent through the fake fixture and resolve once `onDone` fires.
 * @returns {Promise<{ capture: object|null, text: string, error: object|null }>}
 */
function runFake(agent, ctx = {}, { extraEnv = {} } = {}) {
  const capturePath = nextCapturePath();
  const runners = defaultAgentRunners({
    extraEnv: { PROFESSOR_CAPTURE_FILE: capturePath, ...extraEnv },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${agent} fake agent timed out`)), 10_000);
    let text = '';
    let error = null;
    runners[agent]({
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
});

afterEach(() => {
  restoreEnv();
});

describe('agent argv', () => {
  it('builds the exact non-bypass argv for every agent', () => {
    const base = { system: 'be a tutor', prompt: 'hello tutor' };

    expect(buildAgentArgs('claude', base)).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--system-prompt',
      'be a tutor',
      'hello tutor',
    ]);
    expect(buildAgentArgs('cursor', { prompt: 'hi', model: 'm' })).toEqual([
      '--print',
      '--output-format',
      'stream-json',
      '--stream-partial-output',
      '--model',
      'm',
      'hi',
    ]);
    expect(buildAgentArgs('opencode', { prompt: 'hi', model: 'm' })).toEqual([
      'run',
      '--format',
      'json',
      '--model',
      'm',
      'hi',
    ]);
    expect(buildAgentArgs('gemini', { prompt: 'hi', model: 'm' })).toEqual([
      '-p',
      'hi',
      '-o',
      'stream-json',
      '--approval-mode',
      'plan',
      '-m',
      'm',
    ]);
    expect(buildAgentArgs('antigravity', { prompt: 'hi', model: 'm' })).toEqual([
      '-p',
      'hi\n\nRespond in plain text only. Do not use any tools.',
      '--output-format',
      'stream-json',
      '--mode',
      'plan',
      '--model',
      'm',
    ]);
  });

  it('accepts every real argv and rejects each deny token/form', () => {
    const real = {
      claude: buildAgentArgs('claude', { system: 's', prompt: 'p' }),
      cursor: buildAgentArgs('cursor', { prompt: 'p' }),
      opencode: buildAgentArgs('opencode', { prompt: 'p' }),
      gemini: buildAgentArgs('gemini', { prompt: 'p' }),
      antigravity: buildAgentArgs('antigravity', { prompt: 'p' }),
    };
    for (const [agent, argv] of Object.entries(real)) {
      expect(assertSafeAgentInvocation(agent, argv, {})).toBe(true);
    }

    const denied = {
      claude: ['--dangerously-skip-permissions', '--permission-mode=bypassPermissions'],
      cursor: ['--force', '--yolo', '--trust', '--sandbox=disabled'],
      opencode: ['--auto', '--dangerously-skip-permissions'],
      gemini: ['--yolo', '-y', '--approval-mode=yolo'],
      antigravity: ['--dangerously-skip-permissions', '--mode=default', '--agent'],
    };
    for (const [agent, flags] of Object.entries(denied)) {
      for (const flag of flags) {
        expect(() => assertSafeAgentInvocation(agent, ['--print', flag, 'p'], {})).toThrow(
          /Unsafe/
        );
        try {
          assertSafeAgentInvocation(agent, ['--print', flag, 'p'], {});
        } catch (err) {
          expect(err.code).toBe('unsafe_invocation');
          expect(err.offending).toBeTruthy();
        }
      }
    }

    expect(() => assertSafeAgentInvocation('claude', ['-p', 'x'], { NODE_OPTIONS: '--require x' })).toThrow(
      /Unsafe environment variable/
    );
    expect(() =>
      assertSafeAgentInvocation('claude', ['-p', 'x'], { LD_PRELOAD: '/tmp/x.so' })
    ).toThrow(/Unsafe environment variable/);
  });

  it('maps a Windows .cmd shim to a structured unsupported_windows_shim error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'professor-shim-'));
    try {
      const shim = join(dir, 'claude.cmd');
      writeFileSync(shim, '@echo off\r\n');
      chmodSync(shim, 0o755);

      let error = null;
      try {
        resolveAgentCommand('claude', { platform: 'win32', pathValue: dir });
      } catch (err) {
        error = err;
      }
      expect(error).toBeTruthy();
      expect(error.code).toBe('unsupported_windows_shim');
      expect(error.path.toLowerCase()).toContain('claude.cmd');
      expect(error.message).toMatch(/Windows batch shim/);
      expect(error.message).toMatch(/unsupported in this beta/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('agent cwd and env', () => {
  const agents = ['claude', 'cursor', 'opencode', 'gemini', 'antigravity'];

  for (const agent of agents) {
    it(`runs ${agent} in a professor-* temp cwd with a scrubbed allowlisted env`, async () => {
      const { capture, text, error } = await runFake(agent);
      expect(error).toBeNull();
      expect(text).toContain(EXPECTED_TEXT[agent]);
      expect(capture).toBeTruthy();
      expect(capture.argv).toEqual(buildAgentArgs(agent, { system: 'be a tutor', prompt: 'hello tutor' }));

      expect(capture.cwd.startsWith(realpathSync(tmpdir()))).toBe(true);
      expect(capture.cwd.split('/').pop()).toMatch(/^professor-/);
      expect(existsSync(capture.cwd)).toBe(false);

      expect(capture.env.NODE_OPTIONS).toBeUndefined();
      expect(capture.env.LD_PRELOAD).toBeUndefined();
      expect(capture.env.CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS).toBeUndefined();
      expect(capture.env.CLAUDECODE).toBeUndefined();
      expect(capture.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();

      const [credential, value] = CREDENTIALS[agent];
      expect(capture.env[credential]).toBe(value);
      expect(capture.env.PATH).toContain(FIXTURES);
      expect(capture.env.PROFESSOR_CAPTURE_FILE).toBeTruthy();

      if (agent === 'opencode') {
        const config = JSON.parse(capture.env.OPENCODE_CONFIG_CONTENT);
        expect(config.permission).toMatchObject({
          edit: 'deny',
          bash: 'deny',
          webfetch: 'deny',
          websearch: 'deny',
          task: 'deny',
        });
      }
    });
  }

  it('runs model probes in a temp cwd with a scrubbed env', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'professor-model-probe-'));
    const capture = join(dir, 'capture.json');
    const bin = join(dir, 'opencode');
    writeFileSync(
      bin,
      `#!/bin/sh\nnode -e 'const fs=require("fs");fs.writeFileSync(process.argv[1], JSON.stringify({cwd:process.cwd(),env:process.env}))' '${capture}'\necho 'fake/model'\n`
    );
    chmodSync(bin, 0o755);
    try {
      const env = {
        ...process.env,
        PATH: `${dir}:${ORIGINAL_PATH}`,
        NODE_OPTIONS: '--require /tmp/evil.js',
        LD_PRELOAD: '/tmp/evil.so',
        OPENCODE_PERMISSION: '{"edit":"allow"}',
      };
      const result = await listAgentModels('opencode', { env, installed: true });
      expect(result.models.some((model) => model.id === 'fake/model')).toBe(true);

      const seen = JSON.parse(readFileSync(capture, 'utf-8'));
      expect(seen.cwd.split('/').pop()).toMatch(/^professor-/);
      expect(seen.env.NODE_OPTIONS).toBeUndefined();
      expect(seen.env.LD_PRELOAD).toBeUndefined();
      expect(seen.env.OPENCODE_PERMISSION).toBeUndefined();
      expect(seen.env.PATH).toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never passes PROFESSOR_CAPTURE_FILE through production defaultAgentRunners()', async () => {
    const ambient = nextCapturePath();
    process.env.PROFESSOR_CAPTURE_FILE = ambient;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('production runner timed out')), 10_000);
        defaultAgentRunners().claude({
          system: 's',
          prompt: 'p',
          messages: [],
          log: () => {},
          onText: () => {},
          onError: () => {},
          onDone: () => {
            clearTimeout(timer);
            resolve();
          },
        });
      });
      expect(existsSync(ambient)).toBe(false);
    } finally {
      rmSync(ambient, { force: true });
    }
  });

  it('refuses a non-loopback OLLAMA_HOST unless explicitly opted in', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    process.env.OLLAMA_HOST = 'http://example.com:11434';
    try {
      const result = await new Promise((resolve) => {
        let error = null;
        defaultAgentRunners().ollama({
          system: 's',
          prompt: 'p',
          messages: [{ role: 'user', content: 'hi' }],
          log: () => {},
          onText: () => {},
          onError: (err) => {
            error = err;
          },
          onDone: () => resolve({ error }),
        });
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.error).toMatchObject({ code: 'config' });
      expect(result.error.hint).toMatch(/PROFESSOR_ALLOW_NON_LOOPBACK_OLLAMA/);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
