/**
 * `course-professor doctor` — environment checklist with fix hints.
 */
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import http from 'http';
import net from 'net';
import os from 'os';
import chalk from 'chalk';

const AGENT_CLIS = ['claude', 'opencode', 'cursor-agent', 'gemini'];
const PLATFORMS = ['claude', 'gemini', 'opencode', 'cursor'];

/** Look for an executable on PATH without spawning a shell. */
export function whichPath(cmd, pathValue = process.env.PATH || '') {
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of pathValue.split(sep)) {
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      try { if (statSync(full).isFile()) return full; } catch {}
    }
  }
  return null;
}

/**
 * Evaluate the Node.js version string against the >= 18 requirement.
 * @param {string} version e.g. "v20.11.0"
 * @returns {{ status: 'ok'|'fail', detail: string, hint?: string }}
 */
export function evaluateNodeVersion(version) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0]);
  if (Number.isFinite(major) && major >= 18) {
    return { status: 'ok', detail: String(version) };
  }
  return {
    status: 'fail',
    detail: `${version} (need >= 18)`,
    hint: 'Install Node.js 18+ from https://nodejs.org',
  };
}

/** Reuse per-platform detection from `bin/platforms/*`. */
export async function detectAgents() {
  const found = [];
  for (const name of PLATFORMS) {
    try {
      const mod = await import(`../platforms/${name}.js`);
      if (mod.detect()) found.push(name);
    } catch {}
  }
  return found;
}

function professorInstalledFor(cwd) {
  const home = os.homedir();
  const markers = {
    claude: [
      join(home, '.claude', 'commands', 'professor'),
      join(cwd, '.claude', 'commands', 'professor'),
    ],
    gemini: [join(home, '.gemini')],
    opencode: [join(home, '.config', 'opencode', 'command'), join(cwd, '.opencode')],
    cursor: [join(cwd, '.cursor', 'rules', 'professor.mdc')],
  };
  return Object.entries(markers)
    .filter(([, paths]) => paths.some((p) => existsSync(p)))
    .map(([name]) => name);
}

function httpGet(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    let req;
    try {
      req = http.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          done({ ok, status: res.statusCode, body });
        });
      });
    } catch { done({ ok: false }); return; }
    req.on('error', () => done({ ok: false }));
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(); } catch {}
      done({ ok: false, timeout: true });
    });
  });
}

function portOpen(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let settled = false;
    const done = (open) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
  });
}

/** Count checks by status (for a footer line). */
export function summarizeChecks(checks) {
  return checks.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, { ok: 0, warn: 0, fail: 0 });
}

/**
 * Run every environment check.
 * @param {{ cwd?: string, nodeVersion?: string, home?: string }} [deps]
 * @returns {Promise<{ checks: object[] }>}
 */
export async function runChecks({ cwd = process.cwd(), nodeVersion = process.version } = {}) {
  const checks = [];
  const add = (name, status, detail, hint) => checks.push({ name, status, detail, hint });

  const node = evaluateNodeVersion(nodeVersion);
  add('Node.js >= 18', node.status, node.detail, node.hint);

  if (!whichPath('git')) {
    add('git', 'fail', 'not found on PATH', 'Install git from https://git-scm.com');
  } else {
    const args = ['rev-parse', '--is-inside-work-tree'];
    const res = spawnSync('git', args, { cwd, encoding: 'utf-8' });
    const inRepo = res.status === 0 && res.stdout.trim() === 'true';
    if (inRepo) add('git repository', 'ok', 'inside a git work tree');
    else add('git repository', 'warn', 'not inside a git repository',
      'Only programming courses need git. Run `git init` in your project root.');
  }

  const foundClis = AGENT_CLIS.filter((cmd) => whichPath(cmd));
  if (foundClis.length) add('Agent CLIs', 'ok', foundClis.join(', '));
  else add('Agent CLIs', 'warn', 'none found on PATH',
    'Install one: claude, opencode, cursor-agent or gemini');

  const platforms = await detectAgents();
  const installed = professorInstalledFor(cwd);
  if (platforms.length) add('Agent detected', 'ok', platforms.join(', '));
  else add('Agent detected', 'warn', 'no agent home directory found',
    'Run: npx course-professor init');
  if (installed.length) add('Professor installed', 'ok', installed.join(', '));
  else add('Professor installed', 'warn', 'no installation marker found',
    'Run: npx course-professor setup <agent>');

  const ollama = await httpGet('http://127.0.0.1:11434/api/tags');
  if (ollama.ok) add('Ollama (:11434)', 'ok', 'reachable');
  else add('Ollama (:11434)', 'warn', 'not reachable',
    'Optional. Start Ollama, or set OLLAMA_ORIGINS for browser use.');

  const studioHealth = await httpGet('http://127.0.0.1:3000/api/studio/health', 1000);
  const port3000 = await portOpen(3000);
  if (studioHealth.ok) add('Studio server (:3000)', 'ok', 'health endpoint responding');
  else if (!port3000) add('Studio server (:3000)', 'ok', 'port 3000 free');
  else add('Studio server (:3000)', 'warn', 'port in use but no health endpoint',
    'Something else is on 3000. Stop it or start the server with `npx course-professor web`.');

  const dbPath = join(os.homedir(), '.professor', 'professor.db');
  if (existsSync(dbPath)) add('Professor DB', 'ok', dbPath);
  else add('Professor DB', 'warn', 'not created yet', 'Created when the local server runs.');

  const toolchains = ['python3', 'go'].filter((cmd) => whichPath(cmd));
  const missing = ['python3', 'go'].filter((cmd) => !whichPath(cmd));
  if (missing.length === 0) add('Check toolchains', 'ok', toolchains.join(', '));
  else add('Check toolchains', 'warn', `missing: ${missing.join(', ')}`,
    'Optional — needed only to run those exercise file types with `course-professor check`.');

  return { checks };
}

/**
 * @param {{ cwd?: string, nodeVersion?: string }} ctx
 */
export async function run({ cwd = process.cwd() } = {}) {
  const { checks } = await runChecks({ cwd });

  const mark = { ok: '✓', warn: '⚠', fail: '✗' };

  console.log('');
  console.log('Professor doctor');
  console.log('');
  for (const check of checks) {
    const badge = `${mark[check.status]} ${check.name}`;
    const line = `${badge.padEnd(26)} ${check.detail}`;
    if (check.status === 'ok') console.log(`  ${line}`);
    else if (check.status === 'warn') console.log(`  ${chalk.yellow(line)}`);
    else console.log(`  ${chalk.red(line)}`);
    if (check.hint && check.status !== 'ok') {
      console.log(chalk.dim(`  ${' '.repeat(26)}   → ${check.hint}`));
    }
  }

  const counts = summarizeChecks(checks);
  console.log('');
  console.log(`  ${counts.ok} ok · ${counts.warn} warnings · ${counts.fail} failures`);
  console.log('');
}
