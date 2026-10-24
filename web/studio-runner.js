/**
 * Studio local runner (CODE-04) — an Express Router that writes the learner's workspace files to
 * disk and runs their installed toolchain, streaming output back over SSE.
 *
 * Mounted by `web/studio-api.js` (Phase 26) as:
 *     router.use('/run', createRunnerRouter({ workspacesRoot }))
 * so it inherits the parent router's pairing token + CORS allowlist — this file does NOT add CORS
 * or auth of its own (never call it from a public origin without the parent guard).
 *
 * Safety model:
 *   - files are confined to `${workspacesRoot}/<courseSlug>/` (slug + relative-path validation)
 *   - only an allowlist of commands runs; `spawn` with `shell: false` (no shell interpolation)
 *   - hard 20 s timeout, 200 KB output cap, and the whole process tree is killed on timeout or
 *     when the client disconnects
 *
 * Endpoints:
 *   POST {mount}/          and  POST {mount}/run   -> SSE stdout/stderr/exit
 *   GET  {mount}/toolchains -> { node: true, python3: false, … }
 *
 * Exported standalone (no dependency on studio/) so it can be unit-tested and reused.
 */
import express from 'express';
import { spawn, spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import * as security from './security.js';

export const DEFAULT_TIMEOUT_MS = 20_000;
export const MAX_TIMEOUT_MS = 30_000;
export const MAX_OUTPUT_BYTES = 200_000;
export const MAX_TOTAL_FILES_BYTES = 2_000_000;

/** Commands the runner is allowed to execute, per language. */
export const COMMANDS = {
  javascript: "node",
  python: "python3",
  go: "go",
  java: "javac",
  rust: "rustc",
  bash: "bash",
};

/**
 * Commands that must never become reachable through this runner, even if a future language mapping
 * is added. Checked by `buildPipeline` and again in `runStep` (defense in depth).
 */
export const COMMAND_DENYLIST = new Set([
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'playwright',
  'sh',
  'bash',
  'zsh',
  'fish',
  'cmd',
  'powershell',
]);

/**
 * Executable shim extensions a package manager or tool can be wrapped in (Windows `.cmd`/`.ps1`,
 * npm's `.cmd` shims, Cygwin's `.exe`, …). They are stripped from the end of a command name before
 * the allow/deny checks so `npx.cmd` and `NPM.EXE` cannot bypass `COMMAND_DENYLIST`.
 */
export const COMMAND_SHIM_EXTENSIONS = Object.freeze(['.exe', '.cmd', '.bat', '.com', '.ps1']);

/**
 * Reduce any spelling of a command to the bare executable name the lists are written against:
 * the last path segment (POSIX `/` or Windows `\`), lowercased, with any trailing shim extension
 * removed repeatedly (so `npm.cmd.exe` → `npm`).
 * @param {unknown} command
 * @returns {string} the normalized command name (empty string when nothing usable was supplied)
 */
export function normalizeCommandName(command) {
  let name = String(command ?? '')
    .trim()
    .split(/[\\/]/)
    .pop()
    .toLowerCase();
  for (;;) {
    const ext = COMMAND_SHIM_EXTENSIONS.find((candidate) => name.endsWith(candidate));
    if (!ext) return name;
    name = name.slice(0, -ext.length);
  }
}

/**
 * Reject a deny-listed command. Bash is the single exception and only for the explicit `bash`
 * language with `allowBash` true.
 * @param {string} command
 * @param {{ allowBash?: boolean }} [opts]
 * @returns {true}
 */
export function assertCommandAllowed(command, { allowBash = false } = {}) {
  const name = normalizeCommandName(command);
  if (!name) {
    const err = new Error('No command supplied.');
    err.code = 'command_denied';
    throw err;
  }
  if (name === 'bash' && allowBash) return true;
  if (COMMAND_DENYLIST.has(name)) {
    const err = new Error(`Command "${name}" is not allowed by the local runner.`);
    err.code = 'command_denied';
    throw err;
  }
  return true;
}

/**
 * Pure concurrency counter. `tryAcquire` returns false when saturated; `release` never drops below
 * zero, so an extra release from a close/error handler is harmless.
 * @param {{ max?: number }} [opts]
 * @returns {{ tryAcquire: () => boolean, release: () => void, readonly size: number, readonly max: number }}
 */
export function createRunLimiter({ max = 2 } = {}) {
  const limit = Math.min(8, Math.max(1, Math.trunc(Number(max) || 1)));
  let active = 0;
  return {
    tryAcquire() {
      if (active >= limit) return false;
      active += 1;
      return true;
    },
    release() {
      if (active > 0) active -= 1;
    },
    get size() {
      return active;
    },
    get max() {
      return limit;
    },
  };
}

/** Clamp PROFESSOR_MAX_RUNS / options.maxRuns to 1-8, defaulting to 2. */
function resolveMaxRuns(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(8, n);
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * @param {unknown} path
 * @returns {boolean}
 */
export function isSafeRelPath(path) {
  if (typeof path !== 'string') return false;
  const value = path.trim();
  if (!value || value.length > 512) return false;
  if (CONTROL_CHARS.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('~')) return false;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return false;
  if (value.includes('\\')) return false;
  if (value.endsWith('/')) return false;
  return value.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** @param {unknown} slug @returns {boolean} */
export function isSafeSlug(slug) {
  if (typeof slug !== 'string') return false;
  const value = slug.trim();
  if (!value || value.length > 120) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) return false;
  return value !== '.' && value !== '..';
}

/** @returns {string} */
export function defaultWorkspacesRoot() {
  const home = process.env.PROFESSOR_HOME || join(homedir(), '.professor');
  return join(home, 'workspaces');
}

/**
 * Build the run pipeline (ordered commands) for a language + entry file.
 * @param {string} language
 * @param {string} entry
 * @param {Record<string,string>} files
 * @param {{ allowBash?: boolean }} [opts]
 * @returns {Array<{ cmd: string, args: string[] }>}
 */
export function buildPipeline(language, entry, files, { allowBash = false } = {}) {
  let steps;
  switch (language) {
    case 'javascript':
      steps = [{ cmd: 'node', args: [entry] }];
      break;
    case 'python':
      steps = [{ cmd: 'python3', args: [entry] }];
      break;
    case 'go':
      steps = [{ cmd: 'go', args: ['run', entry] }];
      break;
    case 'java': {
      const sources = Object.keys(files).filter((f) => f.endsWith('.java'));
      const list = sources.length ? sources : [entry];
      const className = entry.replace(/\.java$/i, '');
      steps = [
        { cmd: 'javac', args: list },
        { cmd: 'java', args: [className] },
      ];
      break;
    }
    case 'rust': {
      const bin = `./${entry.replace(/\.rs$/i, '')}`;
      steps = [
        { cmd: 'rustc', args: [entry, '-o', entry.replace(/\.rs$/i, '')] },
        { cmd: bin, args: [] },
      ];
      break;
    }
    case 'bash':
      if (!allowBash) throw new Error('Bash is not enabled on this server (set PROFESSOR_ALLOW_BASH=1 to allow it).');
      steps = [{ cmd: 'bash', args: [entry] }];
      break;
    default:
      throw new Error(`No local toolchain for "${language}". Supported locally: node, python3, go, javac/java, rustc${allowBash ? ', bash' : ''}.`);
  }
  for (const step of steps) assertCommandAllowed(step.cmd, { allowBash });
  return steps;
}

/**
 * Probe for an executable on PATH. Never passes a `cwd`: on a fresh machine the workspaces root
 * may not exist yet, and `spawnSync` with a missing `cwd` fails with ENOENT (which would report
 * every toolchain as absent).
 * @param {string} cmd
 * @returns {boolean}
 */
export function commandExists(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const res = spawnSync(finder, [cmd], { stdio: 'ignore' });
    return res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Kill a spawned process tree (SIGKILL on POSIX, taskkill /T on Windows).
 * @param {import('node:child_process').ChildProcess} child
 */
export function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/**
 * @param {{ workspacesRoot?: string, allowBash?: boolean,
 *           spawnImpl?: typeof spawn, maxRuns?: number,
 *           mintLimiter?: (max: number) => ReturnType<typeof createRunLimiter> }} [options]
 * @returns {import('express').Router}
 */
export function createRunnerRouter(options = {}) {
  const workspacesRoot = options.workspacesRoot || defaultWorkspacesRoot();
  const allowBash = options.allowBash ?? process.env.PROFESSOR_ALLOW_BASH === '1';
  const maxRuns = resolveMaxRuns(options.maxRuns ?? process.env.PROFESSOR_MAX_RUNS);
  const spawnImpl = options.spawnImpl || spawn;
  const mintLimiter = options.mintLimiter || ((max) => createRunLimiter({ max }));
  const limiter = mintLimiter(maxRuns);
  const router = express.Router();
  router.use(express.json({ limit: '4mb' }));
  router.runLimiter = limiter;

  router.get('/toolchains', (_req, res) => {
    const result = {};
    for (const cmd of ['node', 'python3', 'go', 'javac', 'java', 'rustc', 'bash']) {
      result[cmd] = commandExists(cmd);
    }
    res.json(result);
  });

  const runHandler = (req, res) =>
    handleRun(req, res, { workspacesRoot, allowBash, spawnImpl, limiter });
  router.post('/', runHandler);
  router.post('/run', runHandler);

  router.use((err, _req, res, _next) => {
    res.status(400).json({ error: err?.message || 'Runner request failed' });
  });

  return router;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ workspacesRoot: string, allowBash: boolean, spawnImpl: typeof spawn,
 *           limiter: ReturnType<typeof createRunLimiter> }} opts
 */
async function handleRun(req, res, { workspacesRoot, allowBash, spawnImpl, limiter }) {
  const body = req.body || {};
  const courseSlug = String(body.courseSlug || 'workspace');
  const language = String(body.language || '').toLowerCase();
  const entry = String(body.entry || '');
  const files = normalizeFiles(body.files);
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000), MAX_TIMEOUT_MS);

  if (!isSafeSlug(courseSlug)) {
    res.status(400).json({ error: `Unsafe course slug: ${courseSlug}` });
    return;
  }
  if (!files.length) {
    res.status(400).json({ error: 'No files supplied' });
    return;
  }
  for (const file of files) {
    if (!isSafeRelPath(file.path) || !security.isSafeWorkspaceRelPath(file.path)) {
      res.status(400).json({ error: `Unsafe file path: ${file.path}` });
      return;
    }
  }
  const totalBytes = files.reduce((n, f) => n + Buffer.byteLength(f.content, 'utf8'), 0);
  if (totalBytes > MAX_TOTAL_FILES_BYTES) {
    res.status(400).json({ error: 'Workspace files are too large to run.' });
    return;
  }
  const entryPath = entry || files[0].path;
  if (
    !isSafeRelPath(entryPath) ||
    !security.isSafeWorkspaceRelPath(entryPath) ||
    !files.some((f) => f.path === entryPath)
  ) {
    res.status(400).json({ error: `Entry file is missing or unsafe: ${entryPath}` });
    return;
  }

  let pipeline;
  try {
    pipeline = buildPipeline(language, entryPath, Object.fromEntries(files.map((f) => [f.path, f.content])), { allowBash });
  } catch (err) {
    res.status(400).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }

  // Realpath containment is validated before the limiter and before any filesystem side effect.
  let courseDir;
  const targets = [];
  try {
    courseDir = security.resolveInside(workspacesRoot, courseSlug);
    for (const file of files) {
      targets.push({
        file,
        target: security.resolveInside(workspacesRoot, courseSlug, ...file.path.split('/')),
      });
    }
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'unsafe_path' });
    return;
  }

  if (!limiter.tryAcquire()) {
    res.setHeader('Retry-After', '1');
    res.status(429).json({ error: 'Too many concurrent runs', code: 'busy' });
    return;
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    limiter.release();
  };
  res.on('close', release);

  const learnerEnv = {
    ...security.buildLearnerEnv(process.env),
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
  };

  try {
    try {
      await mkdir(workspacesRoot, { recursive: true });
      await mkdir(courseDir, { recursive: true });
      const flags =
        fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_TRUNC |
        (fsConstants.O_NOFOLLOW || 0);
      for (const { file, target } of targets) {
        await mkdir(dirname(target), { recursive: true });
        const handle = await open(target, flags, 0o600);
        try {
          await handle.writeFile(file.content, 'utf8');
        } finally {
          await handle.close();
        }
      }
    } catch (err) {
      res.status(500).json({ error: `Could not prepare workspace: ${err.message}` });
      return;
    }

    startStream(res);
    await streamPipeline(pipeline, {
      cwd: courseDir,
      timeoutMs,
      res,
      spawnImpl,
      allowBash,
      env: learnerEnv,
    });
  } finally {
    release();
  }
}

/**
 * @param {Array<{cmd:string,args:string[]}>} pipeline
 * @param {{ cwd: string, timeoutMs: number, res: import('express').Response,
 *           spawnImpl: typeof spawn, allowBash: boolean, env: Record<string,string> }} ctx
 */
async function streamPipeline(pipeline, { cwd, timeoutMs, res, spawnImpl, allowBash, env }) {
  let outputBytes = 0;
  let truncated = false;
  let killed = false;
  let finished = false;

  const send = (obj) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  const finish = (code) => {
    if (finished) return;
    finished = true;
    if (truncated) send({ stderr: '\n… (output truncated)\n' });
    send({ exit: typeof code === 'number' ? code : 0 });
    if (res.writableEnded) return;
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const killAll = () => {
    killed = true;
    for (const child of children) killTree(child);
  };

  /** @type {import('node:child_process').ChildProcess[]} */
  const children = [];
  res.on('close', killAll);
  const timer = setTimeout(() => {
    send({ stderr: `\nTimed out after ${Math.round(timeoutMs / 1000)}s — the process was stopped.\n` });
    killAll();
    finish(124);
  }, timeoutMs);

  const capture = (child) => {
    const onChunk = (stream, chunk) => {
      if (truncated) return;
      const text = chunk.toString('utf8');
      const remaining = MAX_OUTPUT_BYTES - outputBytes;
      if (remaining <= 0) {
        truncated = true;
        killAll();
        return;
      }
      if (text.length > remaining) {
        send({ [stream]: text.slice(0, remaining) });
        outputBytes = MAX_OUTPUT_BYTES;
        truncated = true;
        killAll();
        return;
      }
      outputBytes += Buffer.byteLength(text, 'utf8');
      send({ [stream]: text });
    };
    child.stdout?.on('data', (c) => onChunk('stdout', c));
    child.stderr?.on('data', (c) => onChunk('stderr', c));
  };

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    if (killed) break;
    const code = await runStep(step, { cwd, capture, out: children, send, spawnImpl, allowBash, env });
    if (killed) {
      clearTimeout(timer);
      finish(truncated ? 1 : 124);
      return;
    }
    if (code !== 0) {
      clearTimeout(timer);
      finish(code);
      return;
    }
  }

  clearTimeout(timer);
  finish(0);
}

/**
 * @param {{ cmd: string, args: string[] }} step
 * @param {{ cwd: string, capture: Function, out: any[], send: Function,
 *           spawnImpl: typeof spawn, allowBash: boolean, env: Record<string,string> }} ctx
 * @returns {Promise<number>}
 */
function runStep(step, { cwd, capture, out, send, spawnImpl, allowBash, env }) {
  try {
    assertCommandAllowed(step.cmd, { allowBash });
  } catch (err) {
    send({ stderr: `Refusing to run ${step.cmd}: ${err.message}\n` });
    return Promise.resolve(126);
  }
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawnImpl(step.cmd, step.args, {
        cwd,
        shell: false,
        detached: process.platform !== 'win32',
        env,
      });
    } catch (err) {
      send({ stderr: `Failed to start ${step.cmd}: ${err.message}\n` });
      return resolvePromise(127);
    }
    out.push(child);
    capture(child);
    child.on('error', (err) => {
      send({ stderr: `Failed to start ${step.cmd}: ${err.message}\n` });
      resolvePromise(127);
    });
    child.on('close', (code) => resolvePromise(typeof code === 'number' ? code : 1));
  });
}

/** @param {import('express').Response} res */
function startStream(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

/** @param {any} files @returns {Array<{path:string,content:string}>} */
function normalizeFiles(files) {
  if (!files) return [];
  const rows = Array.isArray(files)
    ? files.map((f) => ({ path: f?.path ?? f?.name, content: f?.content ?? '' }))
    : Object.entries(files).map(([path, content]) => ({ path, content }));
  return rows
    .filter((f) => typeof f.path === 'string' && f.path)
    .map((f) => ({ path: f.path, content: String(f.content ?? '') }));
}
