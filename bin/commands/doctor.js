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
import { nodeSupportsSqlite } from '../node-version.js';
import * as security from '../../web/security.js';
import { AGENT_BINARIES } from '../../web/studio-api/health.js';

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

function httpGet(url, timeoutMs = 2000, headers = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    let req;
    try {
      req = http.get(url, { headers }, (res) => {
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

/**
 * Pure security-posture checks (D-16, D-26). Exported so tests can assert the whole posture without
 * a live server or the real home directory.
 *
 * @param {object} [opts]
 * @param {Record<string,string|undefined>} [opts.env]
 * @param {string} [opts.platform]
 * @param {typeof statSync} [opts.statImpl]
 * @param {(cmd: string, opts?: object) => string|null} [opts.resolveExecutableImpl]
 * @returns {object[]}
 */
export function buildPostureChecks({
  env = process.env,
  platform = process.platform,
  statImpl = statSync,
  resolveExecutableImpl = security.resolveExecutable,
} = {}) {
  const checks = [];
  const add = (name, status, detail, hint) => checks.push({ name, status, detail, hint });

  const legacy = env.PROFESSOR_LEGACY === '1';
  add(
    'Security · legacy web',
    legacy ? 'fail' : 'ok',
    legacy ? 'legacy routes/UI are mounted' : 'Studio-only (legacy disabled)',
    legacy
      ? 'Stop using --legacy/PROFESSOR_LEGACY and use Professor Studio at http://localhost:5180.'
      : undefined
  );

  const host = env.HOST;
  const loopbackHosts = new Set(['', '127.0.0.1', 'localhost', '::1', '[::1]']);
  if (host && !loopbackHosts.has(host)) {
    add(
      'Security · bind address',
      'warn',
      `${host} (not loopback)`,
      'Bind 127.0.0.1 (default) unless you explicitly need LAN access.'
    );
  } else {
    add('Security · bind address', 'ok', host || '127.0.0.1 (default loopback)');
  }

  const tokenFile = security.tokenFilePath(env);
  let mode = null;
  try {
    mode = statImpl(tokenFile).mode & 0o777;
  } catch {
    mode = null;
  }
  if (mode === null) {
    add('Security · token file', 'warn', 'not created yet', 'Created by `course-professor studio`.');
  } else if (mode === 0o600) {
    add('Security · token file', 'ok', `${tokenFile} (0600)`);
  } else {
    add(
      'Security · token file',
      'fail',
      `${tokenFile} (0${mode.toString(8)})`,
      `Run: chmod 600 ${tokenFile}`
    );
  }

  add(
    'Security · bash runner',
    env.PROFESSOR_ALLOW_BASH === '1' ? 'warn' : 'ok',
    env.PROFESSOR_ALLOW_BASH === '1' ? 'Bash runs are allowed' : 'Bash disabled (default)',
    env.PROFESSOR_ALLOW_BASH === '1'
      ? 'Unset PROFESSOR_ALLOW_BASH unless a course explicitly needs shell exercises.'
      : undefined
  );

  const wildcardOrigins = security.isWildcardOrigins(env.STUDIO_ORIGINS || '');
  const relaxedHosts = security.isNonLoopbackOptIn(env);
  if (wildcardOrigins && relaxedHosts) {
    add(
      'Security · relaxed env',
      'fail',
      'STUDIO_ORIGINS=* with STUDIO_ALLOW_NON_LOOPBACK',
      'The server refuses this combination. Unset one of them.'
    );
  } else if (wildcardOrigins) {
    add(
      'Security · relaxed env',
      'warn',
      'STUDIO_ORIGINS=*',
      'Any non-null Origin is echoed. Use only while paired on a trusted machine.'
    );
  } else if (relaxedHosts) {
    add(
      'Security · relaxed env',
      'warn',
      'STUDIO_ALLOW_NON_LOOPBACK is set',
      'Non-loopback clients and hosts are allowed. Use only on a trusted network.'
    );
  } else {
    add('Security · relaxed env', 'ok', 'default exact-origin allowlist');
  }

  if (platform !== 'win32') {
    add('Windows agent shims', 'ok', 'not applicable');
  } else {
    const unsupported = [];
    for (const [agent, binaries] of Object.entries(AGENT_BINARIES)) {
      for (const binary of binaries) {
        const resolved = resolveExecutableImpl(binary, { platform });
        if (resolved && security.isWindowsCommandShim(resolved, platform)) {
          unsupported.push({ agent, resolved });
        }
      }
    }
    if (unsupported.length) {
      add(
        'Windows agent shims',
        'fail',
        unsupported.map((entry) => `${entry.agent} → ${entry.resolved}`).join(', '),
        security.unsupportedWindowsShimMessage('Agent CLI', unsupported[0].resolved)
      );
    } else {
      add('Windows agent shims', 'ok', 'native binaries only');
    }
  }

  return checks;
}

/**
 * Token-aware health probe (D-26). Never creates a token: an absent file means the request is sent
 * without `X-Studio-Token`, and a 401 is reported as "reachable but unpaired" rather than "down".
 *
 * @param {{ env?: Record<string,string|undefined>, port?: number, timeoutMs?: number,
 *           httpGetImpl?: typeof httpGet, portOpenImpl?: typeof portOpen }} [opts]
 * @returns {Promise<object>}
 */
export async function buildStudioHealthCheck({
  env = process.env,
  port = 3000,
  timeoutMs = 1000,
  httpGetImpl = httpGet,
  portOpenImpl = portOpen,
} = {}) {
  const name = `Studio server (:${port})`;
  const token = security.readTokenFile(security.tokenFilePath(env));
  const headers = token ? { 'X-Studio-Token': token } : {};
  const health = await httpGetImpl(`http://127.0.0.1:${port}/api/studio/health`, timeoutMs, headers);

  if (health.ok) {
    return { name, status: 'ok', detail: 'health endpoint responding' };
  }
  if (health.status === 401) {
    return {
      name,
      status: 'warn',
      detail: 'server reachable but unpaired',
      hint: 'Open the pairing URL printed by `course-professor studio`.',
    };
  }
  const open = await portOpenImpl(port);
  if (!open) return { name, status: 'ok', detail: `port ${port} free` };
  return {
    name,
    status: 'warn',
    detail: 'port in use but no health endpoint',
    hint: `Something else is on ${port}. Stop it or start the server with \`npx course-professor web\`.`,
  };
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
export async function runChecks({
  cwd = process.cwd(),
  nodeVersion = process.version,
  env = process.env,
  platform = process.platform,
} = {}) {
  const checks = [];
  const add = (name, status, detail, hint) => checks.push({ name, status, detail, hint });

  const node = evaluateNodeVersion(nodeVersion);
  add('Node.js >= 18', node.status, node.detail, node.hint);

  const studioReady = nodeSupportsSqlite(nodeVersion);
  add(
    'Node.js 22.5+ (Studio)',
    studioReady ? 'ok' : 'warn',
    studioReady ? nodeVersion : `${nodeVersion} (Studio needs >= 22.5)`,
    studioReady
      ? undefined
      : 'Studio, review and import use node:sqlite. Update Node from https://nodejs.org'
  );

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

  const studioCheck = await buildStudioHealthCheck({ env });
  add(studioCheck.name, studioCheck.status, studioCheck.detail, studioCheck.hint);

  const professorHome = env.PROFESSOR_HOME || join(os.homedir(), '.professor');
  const dbPath = join(professorHome, 'professor.db');
  if (existsSync(dbPath)) add('Professor DB', 'ok', dbPath);
  else add('Professor DB', 'warn', 'not created yet', 'Created when the local server runs.');

  const toolchains = ['python3', 'go'].filter((cmd) => whichPath(cmd));
  const missing = ['python3', 'go'].filter((cmd) => !whichPath(cmd));
  if (missing.length === 0) add('Check toolchains', 'ok', toolchains.join(', '));
  else add('Check toolchains', 'warn', `missing: ${missing.join(', ')}`,
    'Optional — needed only to run those exercise file types with `course-professor check`.');

  checks.push(...buildPostureChecks({ env, platform }));

  return { checks };
}

/**
 * @param {{ cwd?: string, nodeVersion?: string }} ctx
 */
export async function run({ cwd = process.cwd(), env = process.env } = {}) {
  const { checks } = await runChecks({ cwd, env });

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
