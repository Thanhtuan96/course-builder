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
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

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
  switch (language) {
    case 'javascript':
      return [{ cmd: 'node', args: [entry] }];
    case 'python':
      return [{ cmd: 'python3', args: [entry] }];
    case 'go':
      return [{ cmd: 'go', args: ['run', entry] }];
    case 'java': {
      const sources = Object.keys(files).filter((f) => f.endsWith('.java'));
      const list = sources.length ? sources : [entry];
      const className = entry.replace(/\.java$/i, '');
      return [
        { cmd: 'javac', args: list },
        { cmd: 'java', args: [className] },
      ];
    }
    case 'rust': {
      const bin = `./${entry.replace(/\.rs$/i, '')}`;
      return [
        { cmd: 'rustc', args: [entry, '-o', entry.replace(/\.rs$/i, '')] },
        { cmd: bin, args: [] },
      ];
    }
    case 'bash':
      if (!allowBash) throw new Error('Bash is not enabled on this server (set PROFESSOR_ALLOW_BASH=1 to allow it).');
      return [{ cmd: 'bash', args: [entry] }];
    default:
      throw new Error(`No local toolchain for "${language}". Supported locally: node, python3, go, javac/java, rustc${allowBash ? ', bash' : ''}.`);
  }
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
 * @param {{ workspacesRoot?: string, allowBash?: boolean }} [options]
 * @returns {import('express').Router}
 */
export function createRunnerRouter(options = {}) {
  const workspacesRoot = options.workspacesRoot || defaultWorkspacesRoot();
  const allowBash = options.allowBash ?? process.env.PROFESSOR_ALLOW_BASH === '1';
  const router = express.Router();
  router.use(express.json({ limit: '4mb' }));

  router.get('/toolchains', (_req, res) => {
    const result = {};
    for (const cmd of ['node', 'python3', 'go', 'javac', 'java', 'rustc', 'bash']) {
      result[cmd] = commandExists(cmd);
    }
    res.json(result);
  });

  const runHandler = (req, res) => handleRun(req, res, { workspacesRoot, allowBash });
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
 * @param {{ workspacesRoot: string, allowBash: boolean }} opts
 */
async function handleRun(req, res, { workspacesRoot, allowBash }) {
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
    if (!isSafeRelPath(file.path)) {
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
  if (!isSafeRelPath(entryPath) || !files.some((f) => f.path === entryPath)) {
    res.status(400).json({ error: `Entry file is missing or unsafe: ${entryPath}` });
    return;
  }

  const courseDir = join(workspacesRoot, courseSlug);
  try {
    await mkdir(workspacesRoot, { recursive: true });
    await mkdir(courseDir, { recursive: true });
    for (const file of files) {
      const target = resolve(courseDir, file.path);
      if (target !== courseDir && !target.startsWith(courseDir + sep)) {
        res.status(400).json({ error: `Refusing to write outside the workspace: ${file.path}` });
        return;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
  } catch (err) {
    res.status(500).json({ error: `Could not prepare workspace: ${err.message}` });
    return;
  }

  let pipeline;
  try {
    pipeline = buildPipeline(language, entryPath, Object.fromEntries(files.map((f) => [f.path, f.content])), { allowBash });
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  startStream(res);
  streamPipeline(pipeline, { cwd: courseDir, timeoutMs, res });
}

/**
 * @param {Array<{cmd:string,args:string[]}>} pipeline
 * @param {{ cwd: string, timeoutMs: number, res: import('express').Response }} ctx
 */
async function streamPipeline(pipeline, { cwd, timeoutMs, res }) {
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
    const code = await runStep(step, { cwd, capture, out: children, send });
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
 * @param {{ cwd: string, capture: Function, out: any[], send: Function }} ctx
 * @returns {Promise<number>}
 */
function runStep(step, { cwd, capture, out, send }) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn(step.cmd, step.args, {
        cwd,
        shell: false,
        detached: process.platform !== 'win32',
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
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
