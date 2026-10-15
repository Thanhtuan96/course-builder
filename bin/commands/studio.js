/**
 * `course-professor studio` (CLI-05) — one command that brings the whole local platform up:
 *
 *   1. installs `web/` and `studio/` deps if missing, builds `studio/dist` if missing/stale
 *   2. starts the local server (`web/server.js`, production, on `--api-port`) with a pairing token
 *   3. serves `studio/dist` on `--port` (tiny static server, loopback only)
 *   4. waits for `/api/studio/health`, then opens
 *      `http://localhost:<port>/#/settings?bridge=…&token=…` (unless `--no-open`)
 *
 * Inherited `CLAUDECODE` / `CLAUDE_CODE_*` env vars are stripped from the child so a nested agent
 * CLI (spawned by the bridge) behaves like a normal terminal.
 */
import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { startStaticServer } from '../static-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');

export const DEFAULT_PORT = 5180;
export const DEFAULT_API_PORT = 3000;
export const HEALTH_PATH = '/api/studio/health';

/**
 * Parse `--port`, `--api-port`, `--no-open` (both `--flag value` and `--flag=value` forms).
 * @param {string[]} [args]
 * @returns {{ port: number, apiPort: number, open: boolean }}
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
 * @param {{ studioPort: number, apiPort: number, token: string }} opts
 * @returns {{ apiUrl: string, studioUrl: string, pairingUrl: string }}
 */
export function buildPairingUrl({ studioPort, apiPort, token }) {
  const apiUrl = `http://localhost:${apiPort}`;
  const studioUrl = `http://localhost:${studioPort}`;
  const query = `bridge=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;
  return { apiUrl, studioUrl, pairingUrl: `${studioUrl}/#/settings?${query}` };
}

/** Token: env override → persisted `web/.studio-token` → freshly generated (hex). */
export function resolveStudioToken({ repoRoot = REPO_ROOT, env = process.env } = {}) {
  if (env.STUDIO_BRIDGE_TOKEN) return env.STUDIO_BRIDGE_TOKEN;
  const tokenFile = join(repoRoot, 'web', '.studio-token');
  try {
    if (existsSync(tokenFile)) {
      const token = readFileSync(tokenFile, 'utf-8').trim();
      if (token) return token;
    }
  } catch {
    /* fall through */
  }
  return randomBytes(24).toString('hex');
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

function ensureDeps({ dir, label, spinner }) {
  if (existsSync(join(dir, 'node_modules'))) return false;
  spinner.start(`Installing ${label} dependencies…`);
  try {
    execSync('npm install', { cwd: dir, stdio: 'pipe' });
    spinner.succeed(`${label} dependencies installed.`);
    return true;
  } catch (err) {
    spinner.fail(`${label} dependencies failed.`);
    throw new Error(`npm install failed in ${dir}: ${err.message}`);
  }
}

function ensureBuild({ studioDir, spinner }) {
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
 *           openImpl?: typeof openBrowser }} [ctx]
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

  const ora = ctx.ora || (await import('ora')).default;
  const { port, apiPort, open } = parseStudioArgs(args);

  const webDir = join(repoRoot, 'web');
  const studioDir = join(repoRoot, 'studio');
  const serverEntry = join(webDir, 'server.js');
  const distDir = join(studioDir, 'dist');

  if (!existsSync(serverEntry)) {
    throw new Error(`Local server not found at ${serverEntry}. Is the package installed fully?`);
  }

  console.log('');
  const setupSpinner = ora('Preparing local platform…');
  ensureDeps({ dir: webDir, label: 'web', spinner: setupSpinner });
  ensureDeps({ dir: studioDir, label: 'studio', spinner: setupSpinner });
  ensureBuild({ studioDir, spinner: setupSpinner });
  setupSpinner.stop();

  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`Studio build missing at ${distDir}. Run: cd ${studioDir} && npm run build`);
  }

  const token = resolveStudioToken({ repoRoot });
  const { apiUrl, studioUrl, pairingUrl } = buildPairingUrl({ studioPort: port, apiPort, token });

  const env = stripAgentEnv(process.env);
  env.NODE_ENV = 'production';
  env.PORT = String(apiPort);
  env.STUDIO_BRIDGE_TOKEN = token;
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

  try {
    staticServer = await startStaticServer({ root: distDir, port });
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
