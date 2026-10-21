/**
 * `course-professor studio` (CLI-05) — one command that brings the whole local platform up:
 *
 *   1. installs `web/` and `studio/` deps if missing, builds `studio/dist` if missing/stale
 *   2. starts the local server (`web/server.js`, production, on `--api-port`) with a pairing token
 *   3. serves `studio/dist` on `--port` (tiny static server, loopback only)
 *   4. waits for `/api/studio/health`, then opens
 *      `http://localhost:<port>/#token=…` (plus `&bridge=…` for a non-default API port)
 *      (unless `--no-open`)
 *
 * Inherited `CLAUDECODE` / `CLAUDE_CODE_*` env vars are stripped from the child so a nested agent
 * CLI (spawned by the bridge) behaves like a normal terminal.
 */
import { spawn, execSync } from 'child_process';
import { createServer } from 'http';
import { existsSync, statSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createStaticHandler } from '../static-server.js';
import { requireStudioNode } from '../node-version.js';
import * as security from '../../web/security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');

export const DEFAULT_PORT = 5180;
export const DEFAULT_API_PORT = 3000;
export const HEALTH_PATH = '/api/studio/health';

/**
 * Parse `--port`, `--api-port`, `--no-open` (both `--flag value` and `--flag=value` forms).
 * @param {string[]} [args]
 * @returns {{ port: number, apiPort: number, open: boolean, rotateToken: boolean }}
 */
export function parseStudioArgs(args = []) {
  const valueOf = (name, fallback) => {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const i = args.indexOf(name);
    if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
    return fallback;
  };
  const asPort = (raw, fallback) => {
    const n = Number.parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
  };
  return {
    port: asPort(valueOf('--port', String(DEFAULT_PORT)), DEFAULT_PORT),
    apiPort: asPort(valueOf('--api-port', String(DEFAULT_API_PORT)), DEFAULT_API_PORT),
    open: !args.includes('--no-open'),
    rotateToken: args.includes('--rotate-token'),
  };
}

/** Newest mtime (ms) of any file under `dir` (recursive), or 0 when it does not exist. */
export function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        try {
          const m = statSync(full).mtimeMs;
          if (m > newest) newest = m;
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

/**
 * True when `dist/index.html` is missing or older than any source/config file.
 * @param {string} studioDir
 * @returns {boolean}
 */
export function isBuildStale(studioDir) {
  const indexHtml = join(studioDir, 'dist', 'index.html');
  if (!existsSync(indexHtml)) return true;
  let builtAt;
  try {
    builtAt = statSync(indexHtml).mtimeMs;
  } catch {
    return true;
  }
  const inputs = [
    newestMtime(join(studioDir, 'src')),
    ...['package.json', 'package-lock.json', 'vite.config.js', 'index.html'].map((f) => {
      const p = join(studioDir, f);
      try {
        return existsSync(p) ? statSync(p).mtimeMs : 0;
      } catch {
        return 0;
      }
    }),
  ];
  return inputs.some((m) => m > builtAt);
}

/**
 * Copy `env`, dropping `CLAUDECODE` and every `CLAUDE_CODE_*` variable.
 * @param {Record<string,string|undefined>} [env]
 * @returns {Record<string,string|undefined>}
 */
export function stripAgentEnv(env = process.env) {
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === 'CLAUDECODE') continue;
    if (key.startsWith('CLAUDE_CODE_')) continue;
    out[key] = value;
  }
  return out;
}

/** Merge the Studio origins we will serve into any pre-existing `STUDIO_ORIGINS`. */
export function mergeOrigins(existing, port) {
  const set = new Set(
    String(existing || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  set.add(`http://localhost:${port}`);
  set.add(`http://127.0.0.1:${port}`);
  return [...set].join(',');
}

/**
 * Build the fragment pairing URL (D-03):
 *   <studio-url>/#token=<encoded token>[&bridge=<encoded apiUrl>]
 * The bridge parameter is only present when the API port is not the default 3000. Ports are
 * compared numerically because `parseWebArgs().port` is a string such as `'3000'`.
 *
 * @param {{ studioPort: number|string, apiPort: number|string, token: string }} opts
 * @returns {{ apiUrl: string, studioUrl: string, pairingUrl: string }}
 */
export function buildPairingUrl({ studioPort, apiPort, token }) {
  const apiUrl = `http://localhost:${apiPort}`;
  const studioUrl = `http://localhost:${studioPort}`;
  let pairingUrl = `${studioUrl}/#token=${encodeURIComponent(token)}`;
  if (Number(apiPort) !== DEFAULT_API_PORT) {
    pairingUrl += `&bridge=${encodeURIComponent(apiUrl)}`;
  }
  return { apiUrl, studioUrl, pairingUrl };
}

/**
 * Resolve the pairing token through the shared helper (D-01/D-02). `repoRoot` is still accepted for
 * tests but only supplies the one-time legacy `web/.studio-token` migration path; the token itself
 * always lives under `PROFESSOR_HOME`.
 *
 * @param {{ repoRoot?: string, env?: Record<string,string|undefined>, home?: string }} [opts]
 * @returns {string}
 */
export function resolveStudioToken({ repoRoot = REPO_ROOT, env = process.env, home } = {}) {
  return security.ensureStudioToken({
    env,
    home: home || env.PROFESSOR_HOME,
    legacyFile: security.legacyTokenPath(repoRoot),
  });
}

/**
 * Poll `/api/studio/health` until it answers 200 with the pairing token.
 * @param {{ url: string, token: string, timeoutMs?: number, intervalMs?: number, fetchImpl?: typeof fetch }} opts
 */
export async function waitForHealth({
  url,
  token,
  timeoutMs = 20000,
  intervalMs = 250,
  fetchImpl = globalThis.fetch,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(url, { headers: { 'X-Studio-Token': token } });
      if (res.ok) return await res.json().catch(() => ({ ok: true }));
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Studio server did not become healthy at ${url} (${lastError})`);
}

/**
 * Host-validating Studio static server. `bin/static-server.js` itself is not owned by Phase 2, so
 * this thin wrapper rejects a spoofed/missing Host before delegating to its static handler (SEC-03).
 *
 * @param {{ root: string, host?: string, port?: number, extraHosts?: string[] }} opts
 * @returns {Promise<{ server: import('http').Server, url: string, port: number,
 *                     close: () => Promise<void> }>}
 */
export async function createStudioStaticServer({
  root,
  host = '127.0.0.1',
  port = 0,
  extraHosts = [],
} = {}) {
  const handler = createStaticHandler({ root, spaFallback: true });
  const server = createServer((req, res) => {
    if (!security.isAllowedHost(req.headers?.host, { extraHosts })) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Forbidden host', code: 'forbidden_host' }));
      return;
    }
    handler(req, res);
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server,
    port: actualPort,
    url: `http://localhost:${actualPort}`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

/** Open a URL in the OS browser. Never throws. */
export function openBrowser(url, { platform = process.platform, spawnImpl = spawn } = {}) {
  try {
    const child =
      platform === 'darwin'
        ? spawnImpl('open', [url], { stdio: 'ignore', detached: true })
        : platform === 'win32'
          ? spawnImpl('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true })
          : spawnImpl('xdg-open', [url], { stdio: 'ignore', detached: true });
    child.on?.('error', () => {});
    child.unref?.();
    return true;
  } catch {
    return false;
  }
}

/** True when `pkg` can be resolved from `dir` (or any ancestor `node_modules`, e.g. the root). */
function canResolveFrom(dir, pkg) {
  try {
    createRequire(join(dir, 'index.js')).resolve(pkg);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a package's deps only when they are genuinely missing. `probe` short-circuits the install
 * when the dependency already resolves from an ancestor (the root package's own `node_modules`) —
 * which is the case for the web server once `express`/`cors` are root dependencies.
 */
function ensureDeps({ dir, label, spinner, probe }) {
  if (probe && canResolveFrom(dir, probe)) return false;
  if (existsSync(join(dir, 'node_modules'))) return false;
  if (!existsSync(join(dir, 'package.json'))) return false;
  spinner.start(`Installing ${label} dependencies…`);
  try {
    execSync('npm install', { cwd: dir, stdio: 'pipe' });
    spinner.succeed(`${label} dependencies installed.`);
    return true;
  } catch (err) {
    spinner.fail(`${label} dependencies failed.`);
    const message = String(err?.message || err);
    if (err?.code === 'EACCES' || /EACCES|permission denied|read-only/i.test(message)) {
      throw new Error(
        `Cannot install ${label} dependencies in ${dir} (permission denied). ` +
          'This happens when the package runs from the read-only npx cache. ' +
          `Install the package globally instead (\`npm i -g course-professor\`) or re-run with a writable cache.`
      );
    }
    throw new Error(`npm install failed in ${dir}: ${message}`);
  }
}

/**
 * Build `studio/dist` from source — but only from a git checkout. An installed package ships a
 * prebuilt `studio/dist` and has no `studio/src`, so we never attempt a build there.
 */
function ensureBuild({ studioDir, spinner }) {
  if (!existsSync(join(studioDir, 'src'))) return false;
  if (!isBuildStale(studioDir)) return false;
  spinner.start('Building Studio (studio/dist)…');
  try {
    execSync('npm run build', { cwd: studioDir, stdio: 'pipe' });
    spinner.succeed('Studio built.');
    return true;
  } catch (err) {
    spinner.fail('Studio build failed.');
    throw new Error(`npm run build failed in ${studioDir}: ${err.message}`);
  }
}

/**
 * @param {{ args?: string[], cwd?: string, chalk?: object, style?: Function, repoRoot?: string,
 *           ora?: Function, spawnImpl?: typeof spawn, fetchImpl?: typeof fetch,
 *           openImpl?: typeof openBrowser, nodeVersion?: string }} [ctx]
 */
export async function run(ctx = {}) {
  const {
    args = [],
    chalk,
    style = (t, m) => m,
    repoRoot = REPO_ROOT,
    spawnImpl = spawn,
    fetchImpl = globalThis.fetch,
    openImpl = openBrowser,
  } = ctx;

  requireStudioNode(ctx.nodeVersion);

  const ora = ctx.ora || (await import('ora')).default;
  const { port, apiPort, open, rotateToken } = parseStudioArgs(args);

  const hasStartRequest = args.some((arg) => arg !== '--rotate-token');
  let rotatedToken = null;
  if (rotateToken) {
    try {
      rotatedToken = security.rotateStudioToken({ env: process.env });
    } catch (err) {
      if (err.code === 'env_token_immutable') {
        console.error(style('error', err.message));
      } else {
        console.error(style('error', `Could not rotate token: ${err.message}`));
      }
      throw err;
    }
    const { pairingUrl } = buildPairingUrl({ studioPort: port, apiPort, token: rotatedToken });
    console.log('');
    console.log(`  Pairing token: ${security.maskToken(rotatedToken)}`);
    console.log(`  Pairing URL:   ${pairingUrl}`);
    console.log('');
    if (!hasStartRequest) return 0;
  }

  const webDir = join(repoRoot, 'web');
  const studioDir = join(repoRoot, 'studio');
  const serverEntry = join(webDir, 'server.js');
  const distDir = join(studioDir, 'dist');
  const studioHasSource = existsSync(join(studioDir, 'src'));

  if (!existsSync(serverEntry)) {
    throw new Error(`Local server not found at ${serverEntry}. Is the package installed fully?`);
  }

  console.log('');
  const setupSpinner = ora('Preparing local platform…');
  // `express`/`cors` are root dependencies, so the web server runs without a nested install. This
  // stays as a fallback for a checkout that has `web/package.json` but no resolvable deps.
  ensureDeps({ dir: webDir, label: 'web', spinner: setupSpinner, probe: 'express' });
  if (studioHasSource) {
    ensureDeps({ dir: studioDir, label: 'studio', spinner: setupSpinner });
  }
  ensureBuild({ studioDir, spinner: setupSpinner });
  setupSpinner.stop();

  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`Studio build missing at ${distDir}. Run: cd ${studioDir} && npm run build`);
  }

  const token = rotatedToken || resolveStudioToken({ repoRoot });
  const { apiUrl, studioUrl, pairingUrl } = buildPairingUrl({ studioPort: port, apiPort, token });

  const env = stripAgentEnv(process.env);
  env.NODE_ENV = 'production';
  env.PORT = String(apiPort);
  if (process.env.STUDIO_BRIDGE_TOKEN) {
    env.STUDIO_BRIDGE_TOKEN = process.env.STUDIO_BRIDGE_TOKEN;
  }
  env.STUDIO_ORIGINS = mergeOrigins(process.env.STUDIO_ORIGINS, port);

  const serverSpinner = ora(`Starting local server on ${apiUrl}…`).start();
  const apiChild = spawnImpl(process.execPath, [serverEntry], {
    cwd: webDir,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  let staticServer = null;
  let shuttingDown = false;
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { apiChild.kill('SIGTERM'); } catch { /* already gone */ }
    if (staticServer) {
      try { await staticServer.close(); } catch { /* ignore */ }
    }
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    resolveDone(code);
  };
  const onSignal = () => {
    console.log('');
    console.log(style('info', 'Stopping Professor Studio…'));
    shutdown(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  apiChild.on('error', (err) => {
    serverSpinner.fail('Local server failed to start.');
    console.error(style('error', `Could not start the local server: ${err.message}`));
    shutdown(1);
  });
  apiChild.on('exit', (code) => {
    if (!shuttingDown) {
      serverSpinner.fail(`Local server exited (code ${code ?? 0}).`);
      shutdown(code ?? 1);
    }
  });

  const extraHosts = security.resolveExtraHosts({ env: process.env, host: process.env.HOST });
  try {
    staticServer = await createStudioStaticServer({ root: distDir, port, extraHosts });
  } catch (err) {
    serverSpinner.fail('Could not serve Studio.');
    console.error(style('error', `Static server failed on port ${port}: ${err.message}`));
    await shutdown(1);
    return done;
  }

  try {
    await waitForHealth({ url: `${apiUrl}${HEALTH_PATH}`, token, fetchImpl });
    serverSpinner.succeed(`Local server ready at ${apiUrl}`);
  } catch (err) {
    serverSpinner.fail('Local server did not become healthy.');
    console.error(style('error', err.message));
    await shutdown(1);
    return done;
  }

  console.log('');
  console.log(style('success', `Professor Studio is running at ${studioUrl}`));
  console.log(`  Pairing URL: ${pairingUrl}`);
  console.log(style('info', 'Press Ctrl+C to stop'));
  console.log('');

  if (open) openImpl(pairingUrl);

  return done;
}
