/**
 * RON-297 — Studio auto-start at login on macOS (LaunchAgent), fixed ports, `--status` and `--stop`.
 *
 * Everything launchd- or process-shaped is injected: `launchctl`, `ps`, the signal call, the clock of
 * the health probe and `fetch`. No test loads a real LaunchAgent, lists a real process or signals one.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABEL,
  assertStableInstall,
  buildLaunchAgentPlist,
  disableAutostart,
  enableAutostart,
  formatStatus,
  isStudioCommand,
  launchAgentPath,
  stopStudio,
} from '../bin/commands/studio-autostart.js';
import {
  isPidAlive,
  probeStudioHealth,
  readState,
  removeState,
  stateFilePath,
  writeState,
} from '../bin/commands/studio-state.js';
import {
  STUDIO_USAGE,
  buildPairingUrl,
  parseStudioArgs,
  resolveStudioPorts,
  run,
} from '../bin/commands/studio.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678abcdef01';

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) {
    try {
      rmSync(tempDirs.pop(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function mkTemp(prefix = 'ron-297-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A fake `execFileSync` that records every (file, argv) pair and can answer per call. */
function recordingExec(answer = () => '') {
  const calls = [];
  const exec = (file, args, opts) => {
    calls.push({ file, args, opts });
    return answer(file, args, calls);
  };
  exec.calls = calls;
  return exec;
}

/** An install path that looks stable (exists, absolute, no npx cache). */
function stableInstallPath(root) {
  const file = join(root, 'lib', 'node_modules', 'ronin-skillforce', 'bin', 'cli.js');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '#!/usr/bin/env node\n');
  return file;
}

/** A real free loopback port, so the fake run can bind instead of racing another app. */
function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** Run the CLI entry point with captured console output. */
async function captureRun(ctx) {
  const out = [];
  const err = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => out.push(args.join(' ')));
  const errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...args) => err.push(args.join(' ')));
  try {
    const code = await run(ctx);
    return { code, out: out.join('\n'), err: err.join('\n') };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

/* ------------------------------------------------------------------ 1. state file */

describe('RON-297 background state file', () => {
  it('writes, reads and removes ${PROFESSOR_HOME}/studio.json', () => {
    const home = mkTemp();
    const env = { PROFESSOR_HOME: home };
    expect(stateFilePath({ env })).toBe(join(home, 'studio.json'));

    const state = {
      pid: 4242,
      port: 5180,
      apiPort: 3000,
      studioUrl: 'http://127.0.0.1:5180',
      apiUrl: 'http://127.0.0.1:3000',
      startedAt: '2026-11-15T09:12:44.101Z',
    };
    writeState(state, { env });
    expect(existsSync(join(home, 'studio.json'))).toBe(true);
    expect(readState({ env })).toEqual(state);

    expect(removeState({ env })).toBe(true);
    expect(existsSync(join(home, 'studio.json'))).toBe(false);
    expect(readState({ env })).toBeNull();
  });

  it('treats a malformed or pid-less state file as absent', () => {
    const home = mkTemp();
    const env = { PROFESSOR_HOME: home };
    writeFileSync(join(home, 'studio.json'), '{not json');
    expect(readState({ env })).toBeNull();
    writeFileSync(join(home, 'studio.json'), JSON.stringify({ port: 5180 }));
    expect(readState({ env })).toBeNull();
  });

  it('detects a live pid, a gone pid and EPERM', () => {
    expect(isPidAlive(4242, { kill: () => {} })).toBe(true);
    const gone = (pid, signal) => {
      if (signal === 0) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    };
    expect(isPidAlive(4242, { kill: gone })).toBe(false);
    const foreign = (pid, signal) => {
      if (signal === 0) throw Object.assign(new Error('denied'), { code: 'EPERM' });
    };
    expect(isPidAlive(4242, { kill: foreign })).toBe(true);
    expect(isPidAlive(Number.NaN, { kill: () => {} })).toBe(false);
  });

  it('accepts only a Studio health payload as a running bridge', async () => {
    const ok = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, version: '1' }) });
    expect(await probeStudioHealth({ apiUrl: 'http://127.0.0.1:3000', token: 't', fetchImpl: ok }))
      .toBe(true);

    const foreign = async () => ({ ok: true, status: 200, json: async () => ({ wxt: true }) });
    expect(await probeStudioHealth({ apiUrl: 'http://127.0.0.1:3000', token: 't', fetchImpl: foreign }))
      .toBe(false);

    const refused = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    expect(await probeStudioHealth({ apiUrl: 'http://127.0.0.1:3000', token: 't', fetchImpl: refused }))
      .toBe(false);

    const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
    expect(await probeStudioHealth({ apiUrl: 'http://127.0.0.1:3000', token: 't', fetchImpl: notFound }))
      .toBe(false);
  });
});

/* ------------------------------------------------------------------ 2. strict ports */

describe('RON-297 strict ports', () => {
  it('never auto-picks when strict: a busy default port fails with the flag hint', async () => {
    await expect(
      resolveStudioPorts({ port: 5180, apiPort: 3000, strict: true, isBusy: async () => true })
    ).rejects.toThrow(/already in use/);
    await expect(
      resolveStudioPorts({ port: 5180, apiPort: 3000, strict: true, isBusy: async () => true })
    ).rejects.toThrow(/--api-port <free port>/);
  });

  it('keeps strict ports untouched when they are free and stays quiet', async () => {
    const resolved = await resolveStudioPorts({
      port: 5180,
      apiPort: 3000,
      strict: true,
      isBusy: async () => false,
    });
    expect(resolved).toEqual({ port: 5180, apiPort: 3000, notices: [] });
  });

  it('still auto-picks without --strict-port', async () => {
    const resolved = await resolveStudioPorts({
      port: 5180,
      apiPort: 3000,
      isBusy: async () => true,
      findFree: async (from) => from,
    });
    expect(resolved.apiPort).toBe(3001);
    expect(resolved.port).toBe(5181);
    expect(resolved.notices).toHaveLength(2);
  });

  it('parses --strict-port, --status, --stop and --autostart on|off', () => {
    const parsed = parseStudioArgs(['--autostart', 'on', '--strict-port']);
    expect(parsed.autostart).toBe('on');
    expect(parsed.strictPort).toBe(true);
    expect(parseStudioArgs(['--autostart=off']).autostart).toBe('off');
    expect(parseStudioArgs(['--status']).status).toBe(true);
    expect(parseStudioArgs(['--stop']).stop).toBe(true);
    expect(parseStudioArgs(['--autostart']).autostart).toBe('invalid');
    expect(parseStudioArgs(['--autostart', 'sometimes']).autostart).toBe('invalid');
    expect(parseStudioArgs([]).autostart).toBeNull();
  });

  it('fails a --strict-port run instead of moving the port', async () => {
    const repoRoot = mkTemp();
    mkdirSync(join(repoRoot, 'web'), { recursive: true });
    writeFileSync(join(repoRoot, 'web', 'server.js'), '');
    const { code, err } = await captureRun({
      args: ['--strict-port', '--no-open'],
      repoRoot,
      nodeVersion: process.version,
      isPortBusy: async () => true,
      findFreePort: async (from) => from,
    }).catch((error) => ({ code: 1, err: error.message }));
    expect(code).toBe(1);
    expect(err).toMatch(/Port 3000 is already in use/);
  });
});

/* ------------------------------------------------------------------ 3. LaunchAgent */

describe('RON-297 LaunchAgent plist', () => {
  const logPath = '/Users/learner/.professor/logs/studio.log';
  const plist = buildLaunchAgentPlist({
    nodePath: '/usr/local/bin/node',
    cliPath: '/usr/local/lib/node_modules/ronin-skillforce/bin/cli.js',
    port: 5180,
    apiPort: 3000,
    professorHome: '/Users/learner/.professor',
    pathEnv: '/usr/local/bin:/usr/bin:/bin',
    logPath,
  });

  it('names the agent, runs at load and restarts only on an unsuccessful exit', () => {
    expect(plist).toContain(`<string>${LABEL}</string>`);
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>');
    expect(plist).toMatch(/KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/);
  });

  it('writes stdout and stderr to the PROFESSOR_HOME log', () => {
    expect((plist.match(new RegExp(`<string>${logPath}</string>`, 'g')) || []).length).toBe(2);
    expect(plist).toContain('<key>StandardOutPath</key>');
    expect(plist).toContain('<key>StandardErrorPath</key>');
  });

  it('runs node + cli.js directly with fixed ports, --no-open and --strict-port', () => {
    const args = ['/usr/local/bin/node', '/usr/local/lib/node_modules/ronin-skillforce/bin/cli.js',
      'studio', '--no-open', '--strict-port', '--port', '5180', '--api-port', '3000'];
    for (const arg of args) expect(plist).toContain(`<string>${arg}</string>`);
    expect(plist).not.toContain('npx');
  });

  it('passes PROFESSOR_HOME through and never writes an empty environment block', () => {
    expect(plist).toContain('<key>PROFESSOR_HOME</key>');
    expect(plist).toContain('<string>/Users/learner/.professor</string>');
    const bare = buildLaunchAgentPlist({
      nodePath: '/usr/local/bin/node',
      cliPath: '/x/bin/cli.js',
      port: 5180,
      apiPort: 3000,
      logPath,
    });
    expect(bare).not.toContain('<key>EnvironmentVariables</key>');
  });

  it('escapes XML entities in paths', () => {
    const escaped = buildLaunchAgentPlist({
      nodePath: '/usr/local/bin/node',
      cliPath: '/x/bin/cli.js',
      port: 5180,
      apiPort: 3000,
      professorHome: '/Users/a&b/.professor',
      logPath: '/Users/a&b/.professor/logs/studio.log',
    });
    expect(escaped).toContain('/Users/a&amp;b/.professor');
    expect(escaped).not.toContain('/Users/a&b/');
  });
});

describe('RON-297 auto-start on/off', () => {
  it('installs the agent under ~/Library/LaunchAgents and bootstraps gui/<uid>', () => {
    const userHome = mkTemp();
    const professorHomeDir = mkTemp();
    const cliPath = stableInstallPath(userHome);
    const exec = recordingExec();

    const { plistPath, logPath } = enableAutostart({
      port: 5180,
      apiPort: 3000,
      cliPath,
      execPath: '/usr/local/bin/node',
      env: { PROFESSOR_HOME: professorHomeDir, PATH: '/usr/local/bin:/usr/bin:/bin' },
      userHome,
      platform: 'darwin',
      exec,
      uid: 501,
    });

    expect(plistPath).toBe(launchAgentPath({ home: userHome }));
    expect(plistPath).toBe(join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`));
    expect(existsSync(plistPath)).toBe(true);
    expect(logPath).toBe(join(professorHomeDir, 'logs', 'studio.log'));
    expect(existsSync(dirname(logPath))).toBe(true);

    expect(exec.calls.map((call) => call.args[0])).toEqual(['bootout', 'bootstrap']);
    expect(exec.calls[1].args).toEqual(['bootstrap', 'gui/501', plistPath]);
    expect(exec.calls.every((call) => call.file === 'launchctl')).toBe(true);

    const written = readFileSync(plistPath, 'utf8');
    expect(written).toContain(cliPath);
    expect(written).toContain(join(professorHomeDir, 'logs', 'studio.log'));
  });

  it('is idempotent: a second on replaces the same plist instead of failing', () => {
    const userHome = mkTemp();
    const professorHomeDir = mkTemp();
    const cliPath = stableInstallPath(userHome);
    const exec = recordingExec();
    const opts = {
      port: 5190,
      apiPort: 3005,
      cliPath,
      execPath: '/usr/local/bin/node',
      env: { PROFESSOR_HOME: professorHomeDir },
      userHome,
      platform: 'darwin',
      exec,
      uid: 501,
    };

    const first = enableAutostart(opts);
    const second = enableAutostart(opts);

    expect(second.plistPath).toBe(first.plistPath);
    const boots = exec.calls.filter((call) => call.args[0] === 'bootstrap');
    expect(boots).toHaveLength(2);
    expect(existsSync(first.plistPath)).toBe(true);
    expect(readFileSync(first.plistPath, 'utf8')).toContain('<string>5190</string>');
  });

  it('retries bootout + bootstrap once when launchd answers "already bootstrapped"', () => {
    const userHome = mkTemp();
    const professorHomeDir = mkTemp();
    const cliPath = stableInstallPath(userHome);
    let bootstrapCalls = 0;
    const exec = recordingExec((file, args) => {
      if (args[0] !== 'bootstrap') return '';
      bootstrapCalls += 1;
      if (bootstrapCalls === 1) {
        throw Object.assign(new Error('launchctl failed'), {
          stderr: 'Bootstrap failed: 5: Input/output error\nservice already bootstrapped',
        });
      }
      return '';
    });

    expect(() =>
      enableAutostart({
        port: 5180,
        apiPort: 3000,
        cliPath,
        execPath: '/usr/local/bin/node',
        env: { PROFESSOR_HOME: professorHomeDir },
        userHome,
        platform: 'darwin',
        exec,
        uid: 501,
      })
    ).not.toThrow();
    expect(exec.calls.map((call) => call.args[0])).toEqual([
      'bootout',
      'bootstrap',
      'bootout',
      'bootstrap',
    ]);
  });

  it('removes the agent and the plist, and says so when nothing was installed', () => {
    const userHome = mkTemp();
    const cliPath = stableInstallPath(userHome);
    const exec = recordingExec();
    enableAutostart({
      port: 5180,
      apiPort: 3000,
      cliPath,
      execPath: '/usr/local/bin/node',
      env: { PROFESSOR_HOME: mkTemp() },
      userHome,
      platform: 'darwin',
      exec,
      uid: 501,
    });

    const removed = disableAutostart({ userHome, platform: 'darwin', exec, uid: 501 });
    expect(removed).toEqual({ plistPath: launchAgentPath({ home: userHome }), removed: true });
    expect(existsSync(removed.plistPath)).toBe(false);

    const again = disableAutostart({ userHome, platform: 'darwin', exec, uid: 501 });
    expect(again.removed).toBe(false);
  });

  it('refuses a non-macOS platform and writes nothing', () => {
    const userHome = mkTemp();
    const cliPath = stableInstallPath(userHome);
    const exec = recordingExec();
    expect(() =>
      enableAutostart({
        port: 5180,
        apiPort: 3000,
        cliPath,
        env: { PROFESSOR_HOME: mkTemp() },
        userHome,
        platform: 'linux',
        exec,
        uid: 501,
      })
    ).toThrow(/only supported on macOS/);
    expect(existsSync(launchAgentPath({ home: userHome }))).toBe(false);
    expect(exec.calls).toHaveLength(0);
  });

  it('refuses an npx cache path before writing anything', () => {
    const userHome = mkTemp();
    const cliPath = join(
      userHome,
      '.npm',
      '_npx',
      'abc123',
      'node_modules',
      'ronin-skillforce',
      'bin',
      'cli.js'
    );
    mkdirSync(dirname(cliPath), { recursive: true });
    writeFileSync(cliPath, '');

    expect(() => assertStableInstall({ cliPath, execPath: '/usr/local/bin/node' })).toThrow(
      /npx cache/
    );
    expect(() => assertStableInstall({ cliPath, execPath: '/usr/local/bin/node' })).toThrow(
      /npm i -g ronin-skillforce/
    );

    const exec = recordingExec();
    expect(() =>
      enableAutostart({
        port: 5180,
        apiPort: 3000,
        cliPath,
        execPath: '/usr/local/bin/node',
        env: { PROFESSOR_HOME: mkTemp() },
        userHome,
        platform: 'darwin',
        exec,
        uid: 501,
      })
    ).toThrow(/npx cache/);
    expect(existsSync(launchAgentPath({ home: userHome }))).toBe(false);
    expect(exec.calls).toHaveLength(0);
  });

  it('refuses a missing CLI entry point', () => {
    expect(() =>
      assertStableInstall({ cliPath: join(mkTemp(), 'bin', 'cli.js') })
    ).toThrow(/was not found/);
  });

  it('fails --autostart on when a port it would pin is busy', async () => {
    const userHome = mkTemp();
    const professorHomeDir = mkTemp();
    const repoRoot = mkTemp();
    writeFileSync(join(repoRoot, 'package.json'), '{}');
    const exec = recordingExec();
    const { code, err } = await captureRun({
      args: ['--autostart', 'on'],
      repoRoot,
      userHome,
      env: { PROFESSOR_HOME: professorHomeDir, PATH: '/usr/bin:/bin' },
      platform: 'darwin',
      exec,
      uid: 501,
      isPortBusy: async () => true,
      findFreePort: async (from) => from,
    });
    expect(code).toBe(1);
    expect(err).toMatch(/already in use/);
    expect(err).toMatch(/--api-port <free port>/);
    expect(existsSync(launchAgentPath({ home: userHome }))).toBe(false);
    expect(exec.calls).toHaveLength(0);
  });

  it('pins the default ports when no port flags are given', async () => {
    const userHome = mkTemp();
    const repoRoot = mkTemp();
    mkdirSync(join(repoRoot, 'bin'), { recursive: true });
    writeFileSync(join(repoRoot, 'bin', 'cli.js'), '#!/usr/bin/env node\n');

    const { code } = await captureRun({
      args: ['--autostart', 'on'],
      repoRoot,
      userHome,
      env: { PROFESSOR_HOME: mkTemp(), PATH: '/usr/bin:/bin' },
      platform: 'darwin',
      exec: recordingExec(),
      execPath: '/usr/local/bin/node',
      uid: 501,
      isPortBusy: async () => false,
    });

    expect(code).toBe(0);
    const written = readFileSync(launchAgentPath({ home: userHome }), 'utf8');
    expect(written).toContain('<string>5180</string>');
    expect(written).toContain('<string>3000</string>');
  });

  it('pins explicit ports through the CLI and reports the URL and the log path', async () => {
    const userHome = mkTemp();
    const professorHomeDir = mkTemp();
    const repoRoot = mkTemp();
    mkdirSync(join(repoRoot, 'bin'), { recursive: true });
    writeFileSync(join(repoRoot, 'bin', 'cli.js'), '#!/usr/bin/env node\n');
    const exec = recordingExec();

    const { code, out } = await captureRun({
      args: ['--autostart', 'on', '--port', '5190', '--api-port', '3005'],
      repoRoot,
      userHome,
      env: { PROFESSOR_HOME: professorHomeDir, PATH: '/usr/bin:/bin' },
      platform: 'darwin',
      exec,
      execPath: '/usr/local/bin/node',
      uid: 501,
      isPortBusy: async () => false,
    });

    expect(code).toBe(0);
    expect(out).toContain(`com.ronin-skillforce.studio`);
    expect(out).toContain('http://127.0.0.1:5190');
    expect(out).toContain('logs/studio.log');
    const written = readFileSync(launchAgentPath({ home: userHome }), 'utf8');
    expect(written).toContain('<string>5190</string>');
    expect(written).toContain('<string>3005</string>');
  });

  it('refuses an npx cache install through the CLI', async () => {
    const root = mkTemp();
    const npxRoot = join(root, '_npx', 'abc123', 'node_modules', 'ronin-skillforce');
    mkdirSync(join(npxRoot, 'bin'), { recursive: true });
    writeFileSync(join(npxRoot, 'bin', 'cli.js'), '#!/usr/bin/env node\n');
    const userHome = mkTemp();
    const exec = recordingExec();

    const { code, err } = await captureRun({
      args: ['--autostart', 'on'],
      repoRoot: npxRoot,
      userHome,
      env: { PROFESSOR_HOME: mkTemp() },
      platform: 'darwin',
      exec,
      execPath: '/usr/local/bin/node',
      uid: 501,
      isPortBusy: async () => false,
    });

    expect(code).toBe(1);
    expect(err).toMatch(/npx cache/);
    expect(err).toMatch(/npm i -g ronin-skillforce/);
    expect(exec.calls).toHaveLength(0);
    expect(existsSync(launchAgentPath({ home: userHome }))).toBe(false);
  });

  it('reports "not supported yet" on Linux through the CLI', async () => {
    const userHome = mkTemp();
    const repoRoot = mkTemp();
    const { code, err } = await captureRun({
      args: ['--autostart', 'on'],
      repoRoot,
      userHome,
      env: { PROFESSOR_HOME: mkTemp() },
      platform: 'linux',
      exec: recordingExec(),
    });
    expect(code).toBe(1);
    expect(err).toMatch(/only supported on macOS/);
    expect(existsSync(launchAgentPath({ home: userHome }))).toBe(false);
  });

  it('turns auto-start off through the CLI', async () => {
    const userHome = mkTemp();
    const repoRoot = mkTemp();
    const { code, out } = await captureRun({
      args: ['--autostart', 'off'],
      repoRoot,
      userHome,
      env: { PROFESSOR_HOME: mkTemp() },
      platform: 'darwin',
      exec: recordingExec(),
      uid: 501,
    });
    expect(code).toBe(0);
    expect(out).toMatch(/already off/);
  });

  it('rejects --autostart without a value and combined with --status', async () => {
    const invalid = await captureRun({ args: ['--autostart'], repoRoot: mkTemp() });
    expect(invalid.code).toBe(1);
    expect(invalid.err).toMatch(/on or off/);

    const combined = await captureRun({ args: ['--autostart', 'on', '--status'], repoRoot: mkTemp() });
    expect(combined.code).toBe(1);
    expect(combined.err).toMatch(/one at a time/);
  });
});

/* ------------------------------------------------------------------ 4. status / stop */

function seedRunningState(home, overrides = {}) {
  const env = { PROFESSOR_HOME: home };
  const state = {
    pid: 4242,
    port: 5180,
    apiPort: 3000,
    studioUrl: 'http://127.0.0.1:5180',
    apiUrl: 'http://127.0.0.1:3000',
    startedAt: '2026-11-15T09:12:44.101Z',
    ...overrides,
  };
  writeState(state, { env });
  writeFileSync(join(home, 'studio-token'), `${TOKEN}\n`);
  return state;
}

describe('RON-297 --status', () => {
  it('reports a running Studio with URLs, a masked token, autostart and the log path', async () => {
    const home = mkTemp();
    const userHome = mkTemp();
    const state = seedRunningState(home);
    const healthy = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, version: '1' }),
    });

    const { code, out } = await captureRun({
      args: ['--status'],
      env: { PROFESSOR_HOME: home },
      userHome,
      kill: () => {},
      fetchImpl: healthy,
    });

    expect(code).toBe(0);
    expect(out).toContain(`running (pid ${state.pid})`);
    expect(out).toContain('http://127.0.0.1:5180');
    const pairing = buildPairingUrl({ studioPort: 5180, apiPort: 3000, token: TOKEN }).pairingUrl;
    expect(out).toContain(pairing);
    expect(out).toContain(`${TOKEN.slice(0, 4)}…${TOKEN.slice(-4)}`);
    expect(out).toMatch(/Autostart:\s+off/);
    expect(out).toContain('logs/studio.log');

    const tokenLines = out
      .split('\n')
      .filter((line) => line.includes(TOKEN) && !line.includes('Pairing URL'));
    expect(tokenLines).toEqual([]);
  });

  it('reports Studio as not running without a state file', async () => {
    const home = mkTemp();
    const userHome = mkTemp();
    mkdirSync(join(userHome, 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`), '<plist/>');

    const { code, out } = await captureRun({
      args: ['--status'],
      env: { PROFESSOR_HOME: home },
      userHome,
      kill: () => {},
      fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    });

    expect(code).toBe(1);
    expect(out).toContain('not running');
    expect(out).toMatch(/Autostart:\s+on/);
    expect(existsSync(join(home, 'studio.json'))).toBe(false);
  });

  it('says "not answering" for a live pid whose bridge does not answer', async () => {
    const home = mkTemp();
    seedRunningState(home);
    const { code, out } = await captureRun({
      args: ['--status'],
      env: { PROFESSOR_HOME: home },
      userHome: mkTemp(),
      kill: () => {},
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    expect(code).toBe(1);
    expect(out).toContain('not answering (pid 4242');
    expect(out).not.toContain('running (pid');
  });

  it('formats the stopped report without a URL', () => {
    const report = formatStatus({
      status: 'stopped',
      state: null,
      token: null,
      pairingUrl: null,
      autostart: { enabled: false, plistPath: '/x.plist' },
      logPath: '/Users/learner/.professor/logs/studio.log',
      userHome: '/Users/learner',
    });
    expect(report).toContain('Professor Studio: not running');
    expect(report).not.toContain('Studio URL');
  });
});

describe('RON-297 --stop', () => {
  it('stops through launchctl when the agent is installed', async () => {
    const home = mkTemp();
    const userHome = mkTemp();
    seedRunningState(home);
    mkdirSync(join(userHome, 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`), '<plist/>');
    const exec = recordingExec();
    const kill = vi.fn();

    const { code } = await captureRun({
      args: ['--stop'],
      env: { PROFESSOR_HOME: home },
      userHome,
      platform: 'darwin',
      exec,
      uid: 501,
      kill,
    });

    expect(code).toBe(0);
    expect(exec.calls.map((call) => call.args)).toEqual([
      ['kill', 'SIGTERM', `gui/501/${LABEL}`],
    ]);
    expect(kill).not.toHaveBeenCalled();
    expect(existsSync(join(home, 'studio.json'))).toBe(false);
  });

  it('SIGTERMs the recorded pid of a Studio CLI process', async () => {
    const home = mkTemp();
    seedRunningState(home);
    const exec = recordingExec(() => 'node /x/lib/node_modules/ronin-skillforce/bin/cli.js studio --port 5180');
    const kill = vi.fn();

    const { code, out } = await captureRun({
      args: ['--stop'],
      env: { PROFESSOR_HOME: home },
      userHome: mkTemp(),
      platform: 'darwin',
      exec,
      kill,
    });

    expect(code).toBe(0);
    expect(out).toContain('Stopped Studio (pid 4242)');
    expect(exec.calls[0].file).toBe('ps');
    expect(exec.calls[0].args).toEqual(['-o', 'command=', '-p', '4242']);
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(existsSync(join(home, 'studio.json'))).toBe(false);
  });

  it('refuses a foreign pid and keeps the state file', async () => {
    const home = mkTemp();
    seedRunningState(home);
    const exec = recordingExec(() => 'node /tmp/other-server.js --port 3999');
    const kill = vi.fn();

    const { code, err } = await captureRun({
      args: ['--stop'],
      env: { PROFESSOR_HOME: home },
      userHome: mkTemp(),
      platform: 'darwin',
      exec,
      kill,
    });

    expect(code).toBe(1);
    expect(err).toMatch(/Refusing to stop pid 4242/);
    expect(kill.mock.calls.filter(([, signal]) => signal === 'SIGTERM')).toHaveLength(0);
    expect(existsSync(join(home, 'studio.json'))).toBe(true);
  });

  it('succeeds quietly when Studio is not running', async () => {
    const home = mkTemp();
    const { code, out } = await captureRun({
      args: ['--stop'],
      env: { PROFESSOR_HOME: home },
      userHome: mkTemp(),
      platform: 'darwin',
      exec: recordingExec(),
      kill: vi.fn(),
    });
    expect(code).toBe(0);
    expect(out).toMatch(/not running/);
  });

  it('removes a stale state file for a dead pid', async () => {
    const home = mkTemp();
    seedRunningState(home);
    const dead = (pid, signal) => {
      if (signal === 0) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    };
    const { code, out } = await captureRun({
      args: ['--stop'],
      env: { PROFESSOR_HOME: home },
      userHome: mkTemp(),
      platform: 'darwin',
      exec: recordingExec(),
      kill: dead,
    });
    expect(code).toBe(0);
    expect(out).toMatch(/stale studio\.json/);
    expect(existsSync(join(home, 'studio.json'))).toBe(false);
  });

  it('only recognises a Studio CLI command line', () => {
    expect(isStudioCommand('node /x/bin/cli.js studio --no-open')).toBe(true);
    expect(isStudioCommand('node /tmp/server.js')).toBe(false);
    expect(isStudioCommand(null)).toBe(false);
  });

  it('falls back to the pid when launchctl kill fails', async () => {
    const home = mkTemp();
    const userHome = mkTemp();
    seedRunningState(home);
    mkdirSync(join(userHome, 'Library', 'LaunchAgents'), { recursive: true });
    writeFileSync(join(userHome, 'Library', 'LaunchAgents', `${LABEL}.plist`), '<plist/>');
    const exec = recordingExec((file, args) => {
      if (args[0] === 'kill') {
        throw Object.assign(new Error('launchctl failed'), { stderr: 'No such process' });
      }
      return 'node /x/bin/cli.js studio';
    });
    const kill = vi.fn();

    const result = await stopStudio({
      env: { PROFESSOR_HOME: home },
      userHome,
      platform: 'darwin',
      exec,
      uid: 501,
      kill,
    });
    expect(result).toMatchObject({ stopped: true, via: 'pid', pid: 4242 });
    expect(kill).toHaveBeenCalledWith(4242, 'SIGTERM');
  });
});

/* ------------------------------------------------------------------ 5. run wiring */

describe('RON-297 run wiring', () => {
  it('writes studio.json once healthy and removes it on a clean exit', async () => {
    const home = mkTemp();
    const repoRoot = mkTemp();
    mkdirSync(join(repoRoot, 'web'), { recursive: true });
    mkdirSync(join(repoRoot, 'studio', 'dist'), { recursive: true });
    writeFileSync(join(repoRoot, 'web', 'server.js'), '');
    writeFileSync(join(repoRoot, 'studio', 'dist', 'index.html'), '<html></html>');

    const port = await freePort();
    const spinner = { start() { return this; }, stop() {}, succeed() {}, fail() {} };
    const child = new EventEmitter();
    child.kill = vi.fn();
    const healthy = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, version: '1' }),
    });

    const saved = process.env.PROFESSOR_HOME;
    process.env.PROFESSOR_HOME = home;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const done = run({
        repoRoot,
        args: ['--no-open', '--strict-port', '--port', String(port)],
        nodeVersion: process.version,
        ora: () => spinner,
        spawnImpl: () => child,
        fetchImpl: healthy,
        openImpl: () => true,
        isPortBusy: async () => false,
      });

      const appeared = await waitFor(() => existsSync(join(home, 'studio.json')));
      expect(appeared).toBe(true);
      const state = readState({ env: { PROFESSOR_HOME: home } });
      expect(state).toMatchObject({ port, apiPort: 3000, studioUrl: `http://127.0.0.1:${port}` });

      child.emit('exit', 0);
      await done;
      expect(existsSync(join(home, 'studio.json'))).toBe(false);
    } finally {
      logSpy.mockRestore();
      if (saved === undefined) delete process.env.PROFESSOR_HOME;
      else process.env.PROFESSOR_HOME = saved;
    }
  });

  it('lists the new flags in `studio --help` and in the CLI FLAGS block', () => {
    for (const flag of ['--autostart on', '--autostart off', '--status', '--stop', '--strict-port']) {
      expect(STUDIO_USAGE).toContain(flag);
    }
    const help = spawnSync(process.execPath, [join(REPO_ROOT, 'bin', 'cli.js'), 'help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
    });
    const text = `${help.stdout ?? ''}${help.stderr ?? ''}`.replace(/\u001B\[[0-9;]*m/g, '');
    for (const flag of ['--autostart on|off', '--status', '--stop', '--strict-port']) {
      expect(text.split('\n').some((line) => line.trim().startsWith(flag))).toBe(true);
    }
  });
});
