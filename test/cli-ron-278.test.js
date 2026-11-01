/**
 * RON-278 — CLI resilience and honesty labels.
 *
 * Black-box where it matters: the real `bin/cli.js` runs in a throwaway HOME/cwd so the owner's
 * `~/.claude/skills` is never touched. The shared skills-directory scan is also unit-tested
 * directly, because `update --all` fetches the registry before it scans and tests run offline.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSkillDirs } from '../bin/registry-helpers.js';
import { STUDIO_USAGE, parseStudioArgs } from '../bin/commands/studio.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const CLI = join(REPO_ROOT, 'bin', 'cli.js');
const ANSI = /\u001B\[[0-9;]*m/g;
const BETA_NOTICE = '[beta] Registry commands are in beta';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp(prefix = 'professor-ron278-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Spawn the real CLI with an absolute entry point and de-coloured output. */
function runCli(args, { cwd = REPO_ROOT, home, env, timeout = 30_000 } = {}) {
  const childEnv = { ...process.env, ...env };
  if (home) childEnv.HOME = home;
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: childEnv,
    encoding: 'utf8',
    timeout,
  });
  return {
    status: result.status,
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    stdout: (result.stdout ?? '').replace(ANSI, ''),
    stderr: (result.stderr ?? '').replace(ANSI, ''),
    text: `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(ANSI, ''),
  };
}

/** A temp HOME whose global skills dir holds one healthy skill plus a dangling symlink. */
function tempHomeWithBrokenSkill() {
  const home = mkTemp();
  const skills = join(home, '.claude', 'skills');
  const healthy = join(skills, 'good-skill');
  mkdirSync(healthy, { recursive: true });
  writeFileSync(join(healthy, 'SKILL.md'), '# Good\n', 'utf8');
  writeFileSync(join(healthy, 'meta.json'), JSON.stringify({ title: 'Good Skill', version: 'v1.0.0' }), 'utf8');
  symlinkSync(join(home, 'deleted-npx-cache', 'paperclip'), join(skills, 'paperclip'));
  return { home, skills, healthy };
}

/** Ask the OS for a free port, then release it. */
function ephemeralPort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** True when nothing accepts a connection on `port`. */
function portIsClosed(port) {
  return new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const finish = (closed) => {
      socket.destroy();
      done(closed);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => finish(false));
    socket.once('error', () => finish(true));
    socket.once('timeout', () => finish(true));
  });
}

describe('RON-278 installed survives a dangling skill symlink', () => {
  it('lists the healthy skill, warns once and exits 0', () => {
    const { home } = tempHomeWithBrokenSkill();
    const cwd = mkTemp();

    const { status, stdout, stderr } = runCli(['installed'], { cwd, home });

    expect(status).toBe(0);
    expect(stdout).toContain('good-skill');
    expect(stdout).toContain('Good Skill');
    expect(stdout).not.toContain('paperclip');
    expect(stderr).toContain('skipped paperclip: broken link');
    expect(`${stdout}${stderr}`).not.toMatch(/ENOENT|no such file or directory/);
  });

  it('keeps exit 0 when every entry in the skills dir is broken', () => {
    const home = mkTemp();
    const skills = join(home, '.claude', 'skills');
    mkdirSync(skills, { recursive: true });
    symlinkSync(join(home, 'gone-a'), join(skills, 'broken-a'));
    symlinkSync(join(home, 'gone-b'), join(skills, 'broken-b'));
    const cwd = mkTemp();

    const { status, text } = runCli(['installed'], { cwd, home });

    expect(status).toBe(0);
    expect(text).toContain('skipped broken-a: broken link');
    expect(text).toContain('skipped broken-b: broken link');
    expect(text).not.toMatch(/ENOENT/);
  });
});

describe('RON-278 skills scan shared by installed and update --all', () => {
  it('skips a dangling symlink instead of throwing', () => {
    const { skills, healthy } = tempHomeWithBrokenSkill();
    const skipped = [];

    const found = scanSkillDirs(skills, { onSkip: (name) => skipped.push(name) });

    expect(found).toEqual([healthy]);
    expect(skipped).toEqual(['paperclip']);
  });

  it('ignores plain files, dirs without SKILL.md and a missing skills dir', () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'not-a-skill'), { recursive: true });
    writeFileSync(join(dir, 'stray.txt'), 'x', 'utf8');

    expect(scanSkillDirs(dir)).toEqual([]);
    expect(scanSkillDirs(join(dir, 'does-not-exist'))).toEqual([]);
  });

  it('guards both the update --all loop and the installed loop with that scan', () => {
    const source = readFileSync(join(REPO_ROOT, 'bin', 'cli.js'), 'utf8');
    const guarded = source.match(/scanSkillDirs\(dir, \{ onSkip: warnBrokenLink \}\)/g) ?? [];
    expect(guarded).toHaveLength(2);
  });
});

describe('RON-278 studio --help and web --help print usage and start nothing', () => {
  it('studio --help exits 0, prints its flags and binds no port', async () => {
    const studioPort = await ephemeralPort();
    const apiPort = await ephemeralPort();

    const { status, stdout, timedOut } = runCli([
      'studio', '--help', '--port', String(studioPort), '--api-port', String(apiPort),
    ]);

    expect(timedOut).toBe(false);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage: course-professor studio/);
    for (const flag of ['--port', '--api-port', '--no-open', '--rotate-token']) {
      expect(stdout).toContain(flag);
    }
    expect(stdout).not.toMatch(/Pairing URL|is running at/);
    expect(await portIsClosed(studioPort)).toBe(true);
    expect(await portIsClosed(apiPort)).toBe(true);
  });

  it('studio -h behaves the same as --help', () => {
    const { status, stdout } = runCli(['studio', '-h']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage: course-professor studio/);
  });

  it('web --help exits 0, prints its flags and binds no port', async () => {
    const port = await ephemeralPort();

    const { status, stdout, timedOut } = runCli(['web', '--help', String(port)]);

    expect(timedOut).toBe(false);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage: course-professor web/);
    expect(stdout).toContain('--production');
    expect(stdout).toContain('--rotate-token');
    expect(stdout).not.toMatch(/Pairing URL|Starting Professor Web UI/);
    expect(await portIsClosed(port)).toBe(true);
  });

  it('web -h behaves the same as --help', () => {
    const { status, stdout } = runCli(['web', '-h']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Usage: course-professor web/);
  });
});

describe('RON-278 studio usage documents only flags studio handles', () => {
  it('keeps --rotate-token because studio really rotates a token and exits', () => {
    const professorHome = mkTemp();

    const { status, stdout, timedOut } = runCli(['studio', '--rotate-token'], {
      env: { PROFESSOR_HOME: professorHome, STUDIO_BRIDGE_TOKEN: '' },
    });

    expect(timedOut).toBe(false);
    expect(status).toBe(0);
    expect(stdout).toContain('Pairing URL:');
    expect(stdout).not.toMatch(/Preparing local platform|Starting local server/);
    expect(existsSync(join(professorHome, 'studio-token'))).toBe(true);
    expect(parseStudioArgs(['--rotate-token']).rotateToken).toBe(true);
    expect(STUDIO_USAGE).toContain('--rotate-token');
  });

  it('lists no flag that parseStudioArgs would ignore', () => {
    const flags = [...new Set(STUDIO_USAGE.match(/--[a-z][a-z-]*/g) ?? [])].sort();
    expect(flags).toEqual(['--api-port', '--help', '--no-open', '--port', '--rotate-token']);
  });
});

describe('RON-278 main help documents install flags', () => {
  it('lists --no-import with its install wording under FLAGS', () => {
    const { status, text } = runCli(['help']);

    expect(status).toBe(0);
    const line = text.split('\n').find((entry) => /^\s+--no-import\s/.test(entry));
    expect(line, 'help documents --no-import').toBeDefined();
    expect(line).toContain('install <course>');
    expect(line).toMatch(/skip the automatic import into Studio/i);
  });

  it('says --rotate-token covers web and studio, since studio handles it', () => {
    const { text } = runCli(['help']);
    const line = text.split('\n').find((entry) => /^\s+--rotate-token\s/.test(entry));
    expect(line).toBeDefined();
    expect(line).toContain('web/studio');
  });
});

describe('RON-278 registry commands are labelled Beta', () => {
  const BETA_COMMANDS = ['courses', 'search', 'install', 'update', 'installed', 'remove', 'publish'];

  it('help groups the registry commands under a Beta heading', () => {
    const { status, text } = runCli(['help']);

    expect(status).toBe(0);
    expect(text).toContain('REGISTRY (BETA)');

    const section = text.slice(text.indexOf('REGISTRY (BETA)'), text.indexOf('\nFLAGS'));
    expect(section.length).toBeGreaterThan(0);
    for (const command of BETA_COMMANDS) {
      expect(section, `${command} listed under REGISTRY (BETA)`).toContain(command);
    }
    expect(section).toMatch(/beta/i);
  });

  it('prints the beta notice on stderr for search', () => {
    const { stdout, stderr } = runCli(['search'], { cwd: mkTemp() });

    expect(stderr).toContain(BETA_NOTICE);
    expect(stdout).not.toContain('[beta]');
  });

  it('prints the beta notice for install without touching the registry', () => {
    const { status, stderr } = runCli(['install'], { cwd: mkTemp() });

    expect(status).toBe(1);
    expect(stderr).toContain(BETA_NOTICE);
  });

  it('does not print the beta notice for a non-registry command', () => {
    const { status, text } = runCli(['status'], { cwd: mkTemp() });

    expect(status).toBe(0);
    expect(text).not.toContain('[beta]');
  });
});
