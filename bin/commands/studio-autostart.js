/**
 * `skillforce studio --autostart on|off`, `--status` and `--stop` (RON-297).
 *
 * Every launchd, process-list and signal call below uses an argument array and is injectable, so
 * tests never load a real LaunchAgent, never list a real process and never signal one.
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, isAbsolute, join } from 'path';
import { maskToken, readTokenFile, tokenFilePath } from '../../web/security.js';
import {
  isPidAlive,
  logFilePath,
  probeStudioHealth,
  readState,
  removeState,
} from './studio-state.js';

export const LABEL = 'com.ronin-skillforce.studio';
export const LAUNCH_AGENT_FILE = `${LABEL}.plist`;
export const UNSUPPORTED_PLATFORM = 'Studio auto-start is only supported on macOS yet.';
export const STABLE_INSTALL_HINT = 'Install it globally first: npm i -g ronin-skillforce';

/**
 * Absolute plist path. launchd only reads `~/Library/LaunchAgents`, so this uses the OS home and
 * never `PROFESSOR_HOME`.
 * @param {{ home?: string }} [opts]
 * @returns {string}
 */
export function launchAgentPath({ home = homedir() } = {}) {
  return join(home, 'Library', 'LaunchAgents', LAUNCH_AGENT_FILE);
}

/** Escape the five XML entities; a home directory may legitimately contain `&`. */
function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Show a path under the user's home with `~` so status output stays short. */
export function displayPath(file, { home = homedir() } = {}) {
  const prefix = `${home}/`;
  return file.startsWith(prefix) ? `~/${file.slice(prefix.length)}` : file;
}

/**
 * Build the LaunchAgent plist. `ProgramArguments` point at the absolute Node executable and the
 * absolute CLI entry, never at `npx`: launchd has no shell PATH, no network and no version pinning.
 *
 * @param {{ nodePath: string, cliPath: string, port: number, apiPort: number,
 *           professorHome?: string, pathEnv?: string, logPath: string }} opts
 * @returns {string}
 */
export function buildLaunchAgentPlist({
  nodePath,
  cliPath,
  port,
  apiPort,
  professorHome,
  pathEnv,
  logPath,
} = {}) {
  for (const [name, value] of Object.entries({ nodePath, cliPath, logPath })) {
    if (typeof value !== 'string' || value === '') {
      throw new Error(`Cannot build the LaunchAgent plist: ${name} is missing.`);
    }
  }
  for (const [name, value] of Object.entries({ port, apiPort })) {
    if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
      throw new Error(`Cannot build the LaunchAgent plist: ${name} is not a port.`);
    }
  }

  const args = [
    nodePath,
    cliPath,
    'studio',
    '--no-open',
    '--strict-port',
    '--port',
    String(port),
    '--api-port',
    String(apiPort),
  ];
  const env = [];
  if (professorHome) {
    env.push(`    <key>PROFESSOR_HOME</key>`, `    <string>${xmlEscape(professorHome)}</string>`);
  }
  if (pathEnv) {
    env.push(`    <key>PATH</key>`, `    <string>${xmlEscape(pathEnv)}</string>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ' +
      '"http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${LABEL}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...args.map((arg) => `    <string>${xmlEscape(arg)}</string>`),
    '  </array>',
    ...(env.length
      ? ['  <key>EnvironmentVariables</key>', '  <dict>', ...env, '  </dict>']
      : []),
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <dict>',
    '    <key>SuccessfulExit</key>',
    '    <false/>',
    '  </dict>',
    '  <key>ThrottleInterval</key>',
    '  <integer>30</integer>',
    '  <key>StandardOutPath</key>',
    `  <string>${xmlEscape(logPath)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${xmlEscape(logPath)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/**
 * Refuse to install an agent that points into a throwaway path. A npx cache entry is deleted
 * whenever npm feels like it, which would leave a LaunchAgent that fails at every login.
 *
 * @param {{ cliPath: string, execPath?: string }} opts
 * @returns {{ cliPath: string, nodePath: string }}
 */
export function assertStableInstall({ cliPath, execPath = process.execPath } = {}) {
  if (typeof cliPath !== 'string' || !isAbsolute(cliPath) || !existsSync(cliPath)) {
    throw new Error(
      `Studio auto-start needs a stable install: the CLI entry point (${cliPath || 'unknown'}) ` +
        `was not found. ${STABLE_INSTALL_HINT}`
    );
  }
  const unstable = [cliPath, execPath].find((value) => String(value).includes('/_npx/'));
  if (unstable) {
    throw new Error(
      `Studio auto-start needs a stable install: this copy runs from the npx cache ` +
        `(${unstable}), which can be deleted at any time. ${STABLE_INSTALL_HINT}`
    );
  }
  return { cliPath, nodePath: execPath };
}

/**
 * The three launchctl calls this feature needs, with argv arrays and no shell.
 * @param {{ exec?: Function, uid?: number, platform?: string }} [opts]
 * @returns {{ bootstrap: (plistPath: string) => object, bootout: () => object,
 *             kill: (signal?: string) => object }}
 */
export function createLaunchctl({
  exec = execFileSync,
  uid = typeof process.getuid === 'function' ? process.getuid() : null,
  platform = process.platform,
} = {}) {
  const run = (args) => {
    try {
      const stdout = exec('launchctl', args, { stdio: 'pipe', encoding: 'utf8' });
      return { ok: true, stdout: String(stdout || ''), stderr: '' };
    } catch (err) {
      return {
        ok: false,
        stdout: String(err?.stdout || ''),
        stderr: String(err?.stderr || err?.message || ''),
      };
    }
  };
  const domain = `gui/${uid}`;
  return {
    domain,
    bootstrap: (plistPath) => run(['bootstrap', domain, plistPath]),
    bootout: () => run(['bootout', `${domain}/${LABEL}`]),
    kill: (signal = 'SIGTERM') => run(['kill', signal, `${domain}/${LABEL}`]),
  };
}

/** True for the "already loaded" answers `launchctl bootstrap` gives on a re-install. */
function isAlreadyLoaded(result) {
  const text = `${result.stderr} ${result.stdout}`;
  return /already|Bootstrap failed: 5|Input\/output error/i.test(text);
}

/**
 * Install (or re-install) the LaunchAgent: log directory, plist, then `launchctl bootstrap`.
 * Re-running is idempotent — the previous registration is removed first and retried once.
 *
 * @param {{ port: number, apiPort: number, cliPath: string, execPath?: string,
 *           env?: Record<string,string|undefined>, userHome?: string, platform?: string,
 *           exec?: Function, uid?: number }} opts
 * @returns {{ plistPath: string, logPath: string }}
 */
export function enableAutostart({
  port,
  apiPort,
  cliPath,
  execPath = process.execPath,
  env = process.env,
  userHome = homedir(),
  platform = process.platform,
  exec = execFileSync,
  uid,
} = {}) {
  if (platform !== 'darwin') throw new Error(UNSUPPORTED_PLATFORM);

  const install = assertStableInstall({ cliPath, execPath });
  const plistPath = launchAgentPath({ home: userHome });
  const logPath = logFilePath({ env });
  mkdirSync(dirname(logPath), { recursive: true });
  mkdirSync(dirname(plistPath), { recursive: true });

  const plist = buildLaunchAgentPlist({
    nodePath: install.nodePath,
    cliPath: install.cliPath,
    port,
    apiPort,
    professorHome: env.PROFESSOR_HOME,
    pathEnv: env.PATH,
    logPath,
  });
  writeFileSync(plistPath, plist, { mode: 0o644 });

  const launchctl = createLaunchctl({ exec, uid, platform });
  launchctl.bootout();
  let result = launchctl.bootstrap(plistPath);
  if (!result.ok && isAlreadyLoaded(result)) {
    launchctl.bootout();
    result = launchctl.bootstrap(plistPath);
  }
  if (!result.ok) {
    throw new Error(
      `launchctl bootstrap failed for ${plistPath}: ${result.stderr.trim() || 'unknown error'}`
    );
  }
  return { plistPath, logPath };
}

/**
 * Remove the LaunchAgent and its plist. Safe to call when nothing was installed.
 * @param {{ userHome?: string, platform?: string, exec?: Function, uid?: number }} [opts]
 * @returns {{ plistPath: string, removed: boolean }}
 */
export function disableAutostart({
  userHome = homedir(),
  platform = process.platform,
  exec = execFileSync,
  uid,
} = {}) {
  if (platform !== 'darwin') throw new Error(UNSUPPORTED_PLATFORM);

  const plistPath = launchAgentPath({ home: userHome });
  createLaunchctl({ exec, uid, platform }).bootout();
  const removed = existsSync(plistPath);
  if (removed) rmSync(plistPath, { force: true });
  return { plistPath, removed };
}

/**
 * @param {{ userHome?: string }} [opts]
 * @returns {{ enabled: boolean, plistPath: string }}
 */
export function autostartInfo({ userHome = homedir() } = {}) {
  const plistPath = launchAgentPath({ home: userHome });
  return { enabled: existsSync(plistPath), plistPath };
}

/**
 * Collect what `--status` reports. Reads only: no file or token is created, nothing is started.
 *
 * @param {{ env?: Record<string,string|undefined>, userHome?: string, kill?: Function,
 *           fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ status: 'running'|'unhealthy'|'stopped', state: object|null,
 *                     token: string|null, autostart: { enabled: boolean, plistPath: string },
 *                     logPath: string }>}
 */
export async function collectStatus({
  env = process.env,
  userHome = homedir(),
  kill = process.kill,
  fetchImpl = globalThis.fetch,
} = {}) {
  const state = readState({ env });
  const token = readTokenFile(tokenFilePath(env));
  const alive = Boolean(state) && isPidAlive(state.pid, { kill });
  const answering =
    alive && (await probeStudioHealth({ apiUrl: state.apiUrl, token, fetchImpl }));
  const status = answering ? 'running' : alive ? 'unhealthy' : 'stopped';
  return {
    status,
    state,
    token,
    autostart: autostartInfo({ userHome }),
    logPath: logFilePath({ env }),
  };
}

/**
 * Render the `--status` report. The token appears in full only inside the pairing URL; the separate
 * token line is masked.
 *
 * @param {{ status: string, state: object|null, token: string|null, pairingUrl?: string|null,
 *           autostart: { enabled: boolean, plistPath: string }, logPath: string,
 *           userHome?: string }} report
 * @returns {string}
 */
export function formatStatus({
  status,
  state,
  token,
  pairingUrl,
  autostart,
  logPath,
  userHome = homedir(),
}) {
  const autostartLine = `  Autostart:   ${autostart.enabled ? `on (${LABEL})` : 'off'}`;
  const logLine = `  Log:         ${displayPath(logPath, { home: userHome })}`;

  if (status === 'running' && state) {
    return [
      `Professor Studio: running (pid ${state.pid})`,
      `  Studio URL:  ${state.studioUrl}`,
      pairingUrl
        ? `  Pairing URL: ${pairingUrl}`
        : '  Pairing URL: (no token yet — run: skillforce studio --rotate-token)',
      `  Token:       ${maskToken(token)}`,
      autostartLine,
      logLine,
    ].join('\n');
  }
  if (status === 'unhealthy' && state) {
    return [
      `Professor Studio: not answering (pid ${state.pid} from studio.json)`,
      `  Studio URL:  ${state.studioUrl}`,
      autostartLine,
      logLine,
    ].join('\n');
  }
  return ['Professor Studio: not running', autostartLine, logLine].join('\n');
}

/** The `ps -o command=` line for a pid, or `null` when the process is gone. */
function readCommandLine(pid, { exec = execFileSync } = {}) {
  try {
    const command = exec('ps', ['-o', 'command=', '-p', String(pid)], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return String(command || '').trim() || null;
  } catch {
    return null;
  }
}

/** A pid is ours only when its command line is a Studio CLI run. */
export function isStudioCommand(command) {
  if (!command) return false;
  return command.includes('cli.js') && command.includes('studio');
}

/**
 * Stop Studio: the LaunchAgent first when it is installed, otherwise the pid from `studio.json`.
 * A pid whose command line is not a Studio CLI run is never signalled.
 *
 * @param {{ env?: Record<string,string|undefined>, userHome?: string, platform?: string,
 *           exec?: Function, uid?: number, kill?: Function }} [opts]
 * @returns {Promise<{ stopped: boolean, via?: 'launchctl'|'pid', pid?: number|null,
 *                     reason?: 'not_running'|'stale', refused?: boolean, command?: string|null }>}
 */
export async function stopStudio({
  env = process.env,
  userHome = homedir(),
  platform = process.platform,
  exec = execFileSync,
  uid,
  kill = process.kill,
} = {}) {
  const state = readState({ env });
  const { plistPath } = autostartInfo({ userHome });

  if (existsSync(plistPath)) {
    const result = createLaunchctl({ exec, uid, platform }).kill('SIGTERM');
    if (result.ok) {
      removeState({ env });
      return { stopped: true, via: 'launchctl', pid: state?.pid ?? null };
    }
  }

  if (!state) return { stopped: false, reason: 'not_running' };
  if (!isPidAlive(state.pid, { kill })) {
    removeState({ env });
    return { stopped: false, reason: 'stale', pid: state.pid };
  }

  const command = readCommandLine(state.pid, { exec });
  if (!isStudioCommand(command)) {
    return { stopped: false, refused: true, pid: state.pid, command };
  }

  try {
    kill(state.pid, 'SIGTERM');
  } catch (err) {
    if (err?.code !== 'ESRCH') throw err;
  }
  removeState({ env });
  return { stopped: true, via: 'pid', pid: state.pid };
}
