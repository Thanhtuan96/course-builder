/**
 * `skillforce studio` (CLI-05) — one command that brings the whole local platform up:
 *
 *   1. installs `web/` and `studio/` deps if missing, builds `studio/dist` if missing/stale
 *   2. starts the local server (`web/server.js`, production, on `--api-port`) with a pairing token
 *   3. serves `studio/dist` on `--port` (tiny static server, loopback only)
 *   4. waits for `/api/studio/health`, then opens
 *      `http://127.0.0.1:<port>/#token=…` (plus `&bridge=…` for a non-default API port)
 *      (unless `--no-open`)
 *
 * Every URL this command polls or prints uses `127.0.0.1`, matching the server bind: `localhost`
 * resolves to `::1` first on macOS, where another app may already be listening.
 *
 * Inherited `CLAUDECODE` / `CLAUDE_CODE_*` env vars are stripped from the child so a nested agent
 * CLI (spawned by the bridge) behaves like a normal terminal.
 */
import { spawn, execSync, execFileSync } from 'child_process';
import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import { existsSync, statSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createStaticHandler } from '../static-server.js';
import { requireStudioNode } from '../node-version.js';
import * as security from '../../web/security.js';
import {
  isStudioHealthPayload,
  removeState,
  writeState,
} from './studio-state.js';
import {
  LABEL,
  UNSUPPORTED_PLATFORM,
  collectStatus,
  disableAutostart,
  displayPath,
  enableAutostart,
  formatStatus,
  stopStudio,
} from './studio-autostart.js';

export { isStudioHealthPayload };

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');

export const DEFAULT_PORT = 5180;
export const DEFAULT_API_PORT = 3000;
export const HEALTH_PATH = '/api/studio/health';

/** Hosts probed for a busy port: the `127.0.0.1` bind plus the IPv6 loopback `localhost` may use. */
export const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

/** Base URL the CLI polls and prints — the IPv4 literal, never `localhost`. */
export function loopbackUrl(port) {
  return `http://127.0.0.1:${port}`;
}

/** Rewrite an `http://localhost…` URL to the IPv4 loopback literal. */
export function toLoopbackUrl(url) {
  return String(url).replace(/^http:\/\/localhost(?=[:/]|$)/, 'http://127.0.0.1');
}

/**
 * Usage text for `studio --help`. Kept as a plain string so the CLI can print it without starting
 * or binding anything.
 */
export const STUDIO_USAGE = `
Usage: skillforce studio [options]

Start the local bridge server and Professor Studio, then open the browser (Node 22.5+).

Options:
  --port <n>        Studio port (default ${DEFAULT_PORT})
  --api-port <n>    Local bridge server port (default ${DEFAULT_API_PORT})
  --no-open         Do not open the browser
  --strict-port     Fail instead of picking another port when one is busy
  --autostart on    Start Studio at login (macOS, global install only)
  --autostart off   Remove the login item and stop starting Studio at login
  --status          Show whether Studio is running, its URLs, autostart and log path
  --stop            Stop the running Studio (never another app's process)
  --rotate-token    Generate a new pairing token and exit
  -h, --help        Show this help and exit
`.trim();

/** True when `-h` or `--help` is present. */
export function wantsHelp(args = []) {
  return args.includes('--help') || args.includes('-h');
}


/**
 * Parse `--port`, `--api-port`, `--no-open`, `--strict-port`, `--status`, `--stop` and
 * `--autostart on|off` (both `--flag value` and `--flag=value` forms).
 * `portExplicit` / `apiPortExplicit` say whether the value came from a valid flag, which decides
 * whether a busy port is an error or an auto-pick.
 * `autostart` is `'on'`, `'off'` or `'invalid'` when the flag was given without a usable value;
 * `null` means the flag was not used.
 *
 * @param {string[]} [args]
 * @returns {{ port: number, apiPort: number, portExplicit: boolean, apiPortExplicit: boolean,
 *             open: boolean, rotateToken: boolean, strictPort: boolean, status: boolean,
 *             stop: boolean, autostart: 'on'|'off'|'invalid'|null }}
 */
export function parseStudioArgs(args = []) {
  const valueOf = (name, fallback) => {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const i = args.indexOf(name);
    if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
    return fallback;
  };
  const readPort = (name, fallback) => {
    const raw = valueOf(name, null);
    const parsed = Number.parseInt(raw, 10);
    const valid = Number.isInteger(parsed) && parsed > 0 && parsed < 65536;
    return { value: valid ? parsed : fallback, explicit: raw !== null && valid };
  };
  const port = readPort('--port', DEFAULT_PORT);
  const apiPort = readPort('--api-port', DEFAULT_API_PORT);
  const wantsAutostart = args.some((a) => a === '--autostart' || a.startsWith('--autostart='));
  const autostartValue = valueOf('--autostart', null);
  const autostart = wantsAutostart
    ? autostartValue === 'on' || autostartValue === 'off'
      ? autostartValue
      : 'invalid'
    : null;
  return {
    port: port.value,
    apiPort: apiPort.value,
    portExplicit: port.explicit,
    apiPortExplicit: apiPort.explicit,
    open: !args.includes('--no-open'),
    rotateToken: args.includes('--rotate-token'),
    strictPort: args.includes('--strict-port'),
    status: args.includes('--status'),
    stop: args.includes('--stop'),
    autostart,
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
  const apiUrl = loopbackUrl(apiPort);
  const studioUrl = loopbackUrl(studioPort);
  let pairingUrl = `${studioUrl}/#token=${encodeURIComponent(token)}`;
  if (Number(apiPort) !== DEFAULT_API_PORT) {
    pairingUrl += `&bridge=${encodeURIComponent(apiUrl)}`;
  }
  return { apiUrl, studioUrl, pairingUrl };
}

/** `true` when `port` is busy on that family, `false` when free or the family is unavailable. */
function probeBind(port, host) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', (err) => resolve(err?.code === 'EADDRINUSE'));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(false));
    });
  });
}

/**
 * True when something already listens on `port` on any loopback family. An IPv4-only listener
 * leaves `::1:<port>` free and vice versa, so both families have to be probed.
 *
 * @param {number|string} port
 * @param {{ hosts?: string[], probe?: (port: number, host: string) => Promise<boolean> }} [opts]
 * @returns {Promise<boolean>}
 */
export async function isPortBusy(port, { hosts = LOOPBACK_HOSTS, probe = probeBind } = {}) {
  const states = await Promise.all(hosts.map((host) => probe(Number(port), host)));
  return states.some(Boolean);
}

/**
 * First port at or above `from` that is free on every loopback family.
 *
 * @param {number} from
 * @param {{ hosts?: string[], maxTries?: number,
 *           isBusy?: (port: number, opts?: object) => Promise<boolean> }} [opts]
 * @returns {Promise<number>}
 */
export async function findFreePort(
  from,
  { hosts = LOOPBACK_HOSTS, maxTries = 25, isBusy = isPortBusy } = {}
) {
  const start = Number(from);
  for (let port = start; port < start + maxTries && port < 65536; port += 1) {
    if (!(await isBusy(port, { hosts }))) return port;
  }
  throw new Error(`No free loopback port between ${start} and ${start + maxTries - 1}.`);
}

/**
 * Keep both ports usable before anything binds: a busy default port moves to the next free one,
 * while a busy port the user pinned with a flag is a hard error. `strict` removes the auto-pick
 * entirely, so a LaunchAgent start never changes the URL it was paired on.
 *
 * @param {{ port: number, apiPort: number, portExplicit?: boolean, apiPortExplicit?: boolean,
 *           strict?: boolean,
 *           isBusy?: (port: number) => Promise<boolean>,
 *           findFree?: (from: number) => Promise<number> }} opts
 * @returns {Promise<{ port: number, apiPort: number, notices: string[] }>}
 */
export async function resolveStudioPorts({
  port,
  apiPort,
  portExplicit = false,
  apiPortExplicit = false,
  strict = false,
  isBusy = (value) => isPortBusy(value),
  findFree = (from) => findFreePort(from),
} = {}) {
  const notices = [];
  const pick = async (value, explicit, flag, label) => {
    if (!(await isBusy(value))) return value;
    if (explicit || strict) {
      throw new Error(
        `Port ${value} is already in use on loopback (127.0.0.1 or ::1). ` +
          `Choose another port: --${flag} <free port>.`
      );
    }
    const next = await findFree(value + 1);
    notices.push(`Port ${value} is in use; using ${next} for ${label} instead.`);
    return next;
  };
  const resolvedApiPort = await pick(apiPort, apiPortExplicit, 'api-port', 'the local server');
  const resolvedPort = await pick(port, portExplicit, 'port', 'Studio');
  return { port: resolvedPort, apiPort: resolvedApiPort, notices };
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
 * A 404 or a JSON body that is not a Studio health payload means another app owns the port.
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
  let foreign = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetchImpl(url, { headers: { 'X-Studio-Token': token } });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (isStudioHealthPayload(body)) return body;
        foreign = true;
        lastError = 'an answer that is not Studio';
      } else {
        if (res.status === 404) foreign = true;
        lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastError = err.message;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const port = (() => {
    try {
      return new URL(url).port;
    } catch {
      return '';
    }
  })();
  const hint =
    foreign && port
      ? ` Another app is answering on port ${port}; start Studio with --api-port <free port>.`
      : '';
  throw new Error(`Studio server did not become healthy at ${url} (${lastError}).${hint}`);
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
    url: loopbackUrl(actualPort),
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
          `Install the package globally instead (\`npm i -g ronin-skillforce\`) or re-run with a writable cache.`
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
 * `--autostart on|off`, `--status` and `--stop`. None of them starts the Studio server, so they run
 * before the Node 22.5 gate and never import `ora`.
 *
 * @param {{ parsed: object, ctx?: object, style?: Function, repoRoot: string }} opts
 * @returns {Promise<number>} process exit code
 */
async function runBackground({ parsed, ctx = {}, style, repoRoot }) {
  const {
    env = process.env,
    userHome,
    platform = process.platform,
    exec = execFileSync,
    kill = process.kill,
    fetchImpl = globalThis.fetch,
  } = ctx;
  const log = (line) => console.log(line);
  const fail = (line) => console.error(style('error', line));
  const show = (file) => displayPath(file, { home: userHome || homedir() });

  if (parsed.autostart === 'invalid') {
    fail('--autostart needs a value: on or off.');
    return 1;
  }
  if (parsed.autostart && (parsed.status || parsed.stop)) {
    fail('Use --autostart, --status or --stop one at a time.');
    return 1;
  }
  if (parsed.autostart && platform !== 'darwin') {
    fail(UNSUPPORTED_PLATFORM);
    return 1;
  }

  if (parsed.autostart === 'on') {
    try {
      const ports = await resolveStudioPorts({
        port: parsed.port,
        apiPort: parsed.apiPort,
        portExplicit: parsed.portExplicit,
        apiPortExplicit: parsed.apiPortExplicit,
        strict: true,
        isBusy: ctx.isPortBusy,
        findFree: ctx.findFreePort,
      });
      const { logPath } = enableAutostart({
        port: ports.port,
        apiPort: ports.apiPort,
        cliPath: join(repoRoot, 'bin', 'cli.js'),
        execPath: ctx.execPath,
        env,
        userHome,
        platform,
        exec,
        uid: ctx.uid,
      });
      log(style('success', `Studio will start at login (${LABEL}).`));
      log(`  Studio URL:  ${loopbackUrl(ports.port)}`);
      log(`  Log:         ${show(logPath)}`);
      return 0;
    } catch (err) {
      fail(err.message);
      return 1;
    }
  }

  if (parsed.autostart === 'off') {
    try {
      const { plistPath, removed } = disableAutostart({ userHome, platform, exec, uid: ctx.uid });
      log(
        removed
          ? `Studio will no longer start at login (removed ${show(plistPath)}).`
          : 'Studio auto-start was already off.'
      );
      return 0;
    } catch (err) {
      fail(err.message);
      return 1;
    }
  }

  if (parsed.status) {
    const report = await collectStatus({ env, userHome, kill, fetchImpl });
    const pairingUrl =
      report.token && report.state?.port && report.state?.apiPort
        ? buildPairingUrl({
            studioPort: report.state.port,
            apiPort: report.state.apiPort,
            token: report.token,
          }).pairingUrl
        : null;
    log(formatStatus({ ...report, pairingUrl, userHome: userHome || homedir() }));
    return report.status === 'running' ? 0 : 1;
  }

  if (parsed.stop) {
    const result = await stopStudio({ env, userHome, platform, exec, uid: ctx.uid, kill });
    if (result.refused) {
      fail(`Refusing to stop pid ${result.pid}: it is not a Studio process.`);
      return 1;
    }
    if (result.stopped) {
      log(
        result.via === 'launchctl'
          ? 'Stopped Studio (launchd agent).'
          : `Stopped Studio (pid ${result.pid}).`
      );
      return 0;
    }
    if (result.reason === 'stale') {
      log(`Studio is not running (removed a stale studio.json for pid ${result.pid}).`);
    } else {
      log('Studio is not running.');
    }
    return 0;
  }

  return 1;
}

/**
 * @param {{ args?: string[], cwd?: string, chalk?: object, style?: Function, repoRoot?: string,
 *           ora?: Function, spawnImpl?: typeof spawn, fetchImpl?: typeof fetch,
 *           openImpl?: typeof openBrowser, nodeVersion?: string,
 *           isPortBusy?: (port: number) => Promise<boolean>,
 *           findFreePort?: (from: number) => Promise<number> }} [ctx]
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

  if (wantsHelp(args)) {
    console.log(STUDIO_USAGE);
    return 0;
  }

  const parsed = parseStudioArgs(args);
  if (parsed.autostart || parsed.status || parsed.stop) {
    return runBackground({ parsed, ctx, style, repoRoot });
  }

  requireStudioNode(ctx.nodeVersion);

  const ora = ctx.ora || (await import('ora')).default;
  const { open, rotateToken } = parsed;
  let { port, apiPort } = parsed;

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

  const portOptions = {
    port,
    apiPort,
    portExplicit: parsed.portExplicit,
    apiPortExplicit: parsed.apiPortExplicit,
    strict: parsed.strictPort,
    isBusy: ctx.isPortBusy,
    findFree: ctx.findFreePort,
  };
  let ports;
  try {
    ports = await resolveStudioPorts(portOptions);
  } catch (err) {
    // The LaunchAgent run has no terminal: one readable line in the log beats a stack trace.
    if (!parsed.strictPort) throw err;
    console.error(style('error', err.message));
    return 1;
  }
  port = ports.port;
  apiPort = ports.apiPort;
  for (const notice of ports.notices) {
    console.log(style('warning', notice));
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
    try { removeState(); } catch { /* best effort */ }
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

  try {
    writeState(
      {
        pid: process.pid,
        port,
        apiPort,
        studioUrl,
        apiUrl,
        startedAt: new Date().toISOString(),
      },
      { env: process.env }
    );
  } catch (err) {
    console.log(style('warning', `Could not record studio.json: ${err.message}`));
  }

  console.log('');
  console.log(style('success', `Professor Studio is running at ${studioUrl}`));
  console.log(`  Pairing URL: ${pairingUrl}`);
  console.log(style('info', 'Press Ctrl+C to stop'));
  console.log('');

  if (open) openImpl(pairingUrl);

  return done;
}
