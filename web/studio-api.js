/**
 * studio-api.js — Express Router mounted at `/api/studio` (AI-06, DATA-04, DEPLOY-04).
 *
 * Three concerns, deliberately small:
 *
 *   1. Bridge (`/health`, `/complete`) — lets Studio stream from the learner's OWN local agent
 *      (Claude Code / OpenCode / Cursor CLI) or Ollama with no API key. The SSE shape MUST match
 *      `studio/src/lib/ai/bridge.js` exactly:
 *          data: {"text":"…"}            (per token)
 *          data: {"error":"…","code":"…"} (on failure, then end)
 *          data: [DONE]
 *      The CLI is invoked with a Professor system prompt and WITHOUT `--dangerously-skip-permissions`
 *      or auto-approved tools — the tutor only needs text.
 *
 *   2. Database (`/db/health`, `/db`) — the SAME HTTP contract the future Cloudflare Worker + D1
 *      backend will implement, so `RemoteAdapter` only changes base URL + token (see studio-db.js).
 *
 *   3. Safety — origin allowlist (STUDIO_ORIGINS) + `X-Studio-Token` pairing token on every route.
 *      CORS is not authentication, so both are required. Loopback clients only by default.
 *
 * Mount (see web/server.js):  `app.use('/api/studio', studioRouter);`
 */
import express from 'express';
import { spawn, execSync } from 'child_process';
import { randomBytes, timingSafeEqual } from 'crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createStudioDb, StudioDbError } from './studio-db.js';
import { createRunnerRouter } from './studio-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const VERSION = '1';
export const DEFAULT_ORIGINS = 'http://localhost:5180,http://127.0.0.1:5180';
export const STUDIO_URL_HINT = 'http://localhost:5180';
export const TOKEN_FILE = join(__dirname, '.studio-token');
const MAX_MESSAGES = 60;
const MAX_CHARS = 200_000;
// Keep the SSE socket warm while a coding-agent CLI boots (Claude ≈11 s, OpenCode ≈28 s).
const HEARTBEAT_MS = 15_000;
// Permission map injected into OpenCode so the tutor cannot read/edit the learner's files.
const OPENCODE_PERMISSION_DENY = { edit: 'deny', bash: 'deny', webfetch: 'deny' };

/* ------------------------------------------------------------------ helpers */

/** @param {string} value @returns {Set<string>} */
export function parseOrigins(value = DEFAULT_ORIGINS) {
  const set = new Set(
    String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.size ? set : new Set(DEFAULT_ORIGINS.split(','));
}

function commandExists(command) {
  try {
    execSync(`which ${command}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

/** getAgentCapabilities-like summary for the four bridge agents. */
export function detectAgents() {
  const claude = commandExists('claude');
  const opencode = commandExists('opencode');
  const cursor = commandExists('cursor-agent');
  const ollama = commandExists('ollama');
  return {
    claude: { installed: claude, supportsStreaming: true, supportsModelSelection: false },
    opencode: { installed: opencode, supportsStreaming: true, supportsModelSelection: true },
    cursor: { installed: cursor, supportsStreaming: true, supportsModelSelection: true },
    ollama: { installed: ollama, supportsStreaming: true, supportsModelSelection: true },
  };
}

function isLoopback(addr) {
  if (!addr) return false;
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1' ||
    addr.startsWith('127.') ||
    addr.startsWith('::ffff:127.')
  );
}

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Flatten a system prompt + full conversation for a CLI that takes one prompt string
 * (ARCHITECTURE §2). The system prompt is passed via a dedicated flag for claude, so `includeSystem`
 * controls whether it is prepended here.
 */
export function flattenConversation(system, messages, includeSystem = true) {
  const parts = [];
  if (includeSystem && system) parts.push(`[System]\n${system}`);
  for (const m of messages || []) {
    const role = m.role === 'assistant' ? 'ASSISTANT' : 'USER';
    parts.push(`${role}: ${m.content}`);
  }
  return parts.join('\n\n');
}

/** Clamp the request to a sane size (bridge hardening). */
export function clampMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, MAX_CHARS) }));
}

/* ------------------------------------------------------------------ process isolation */

/**
 * Create a throwaway working directory for agent CLIs. OpenCode/Cursor are full coding agents:
 * run in the repo they would read project files and inflate the prompt (~37K input tokens for a
 * one-word reply). A fresh empty dir keeps the tutor text-only and cheap.
 * @param {(...a:any[])=>void} log
 * @returns {string|undefined}
 */
function makeTempCwd(log) {
  try {
    return mkdtempSync(join(tmpdir(), 'professor-'));
  } catch (err) {
    log('[studio agent] could not create temp cwd:', err.message);
    return undefined;
  }
}

/** Remove a temp cwd created by makeTempCwd (idempotent). */
function cleanupTempCwd(dir, log) {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    log('[studio agent] could not remove temp cwd:', err.message);
  }
}

/**
 * Environment for the OpenCode CLI: deny edit/bash/webfetch so the tutor cannot touch the learner's
 * files, merged with any OPENCODE_CONFIG_CONTENT the user already set.
 * @returns {NodeJS.ProcessEnv}
 */
function opencodeEnv() {
  const env = { ...process.env };
  let config = {};
  if (env.OPENCODE_CONFIG_CONTENT) {
    try {
      config = JSON.parse(env.OPENCODE_CONFIG_CONTENT) || {};
    } catch {
      config = {};
    }
  }
  config.permission = { ...(config.permission || {}), ...OPENCODE_PERMISSION_DENY };
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config);
  return env;
}

/* ------------------------------------------------------------------ agent runners */

/**
 * Each runner takes a context and returns `{ kill() }`, calling `onText`/`onError`/`onDone`.
 * @typedef {{ system: string, prompt: string, model?: string, messages: object[],
 *             onText: (t:string)=>void, onError: (e:{message:string,code:string})=>void,
 *             onDone: ()=>void, log: (...a:any[])=>void }} RunContext
 */

function parseJsonLines(proc, onLine, log) {
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) onLine(line);
    }
  });
  proc.stderr.on('data', (chunk) => log('[studio agent stderr]', chunk.toString().slice(0, 300)));
}

function spawnClaude(ctx) {
  const { system, prompt, onText, onError, onDone, log } = ctx;
  const args = ['--print', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (system) args.push('--system-prompt', system);
  args.push(prompt);

  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  const proc = spawn('claude', args, { env, cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
  let streamed = false;
  let resultText = '';
  let finished = false;
  const finish = (err) => {
    if (finished) return;
    finished = true;
    if (err) onError(err);
    onDone();
  };

  parseJsonLines(
    proc,
    (line) => {
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        return;
      }
      if (d.type === 'stream_event') {
        const text = d.event?.delta?.text;
        if (text) {
          streamed = true;
          onText(text);
        }
      } else if (d.type === 'result' && typeof d.result === 'string') {
        resultText = d.result;
      }
    },
    log
  );

  proc.on('error', (err) => finish({ message: `Claude Code CLI failed to start: ${err.message}`, code: 'server' }));
  proc.on('close', (code) => {
    if (!streamed && resultText) onText(resultText);
    if (code !== 0 && !streamed && !resultText) {
      return finish({ message: `claude CLI exited with code ${code}`, code: 'server' });
    }
    finish();
  });
  return { kill: () => proc.kill('SIGTERM') };
}

function spawnCursor(ctx) {
  const { prompt, model, onText, onError, onDone, log } = ctx;
  const args = ['--print', '--output-format', 'stream-json', '--stream-partial-output'];
  if (model) args.push('--model', model);
  args.push(prompt);

  const cwd = makeTempCwd(log);
  const proc = spawn('cursor-agent', args, { cwd: cwd || __dirname, stdio: ['ignore', 'pipe', 'pipe'] });
  let streamed = false;
  let lastAssistant = '';
  let resultText = '';
  let finished = false;
  const finish = (err) => {
    if (finished) return;
    finished = true;
    if (err) onError(err);
    onDone();
  };

  parseJsonLines(
    proc,
    (line) => {
      let d;
      try {
        d = JSON.parse(line);
      } catch {
        return;
      }
      if (d.type === 'stream_event') {
        const token = d.event?.delta?.text || '';
        if (token) {
          streamed = true;
          onText(token);
        }
      } else if (d.type === 'assistant') {
        const text = (d.message?.content || [])
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('');
        if (text && text.startsWith(lastAssistant)) {
          const delta = text.slice(lastAssistant.length);
          if (delta && !streamed) onText(delta);
        } else if (text && !streamed) {
          onText(text);
        }
        lastAssistant = text || lastAssistant;
      } else if (d.type === 'result' && typeof d.result === 'string') {
        resultText = d.result;
      }
    },
    log
  );

  proc.on('error', (err) => {
    cleanupTempCwd(cwd, log);
    finish({ message: `Cursor Agent failed to start: ${err.message}`, code: 'server' });
  });
  proc.on('close', (code) => {
    cleanupTempCwd(cwd, log);
    if (!streamed && resultText) onText(resultText);
    if (code !== 0 && !streamed && !resultText) {
      return finish({ message: `Cursor Agent exited with code ${code}`, code: 'server' });
    }
    finish();
  });
  return { kill: () => proc.kill('SIGTERM') };
}

/**
 * Extract assistant text from one OpenCode `run --format json` event.
 *
 * OpenCode emits JSON lines such as:
 *   {"type":"text","part":{"type":"text","text":"hello"}}
 *   {"type":"step_start",…} / {"type":"step_finish",…} / {"type":"tool_use",…}
 * Only `type === "text"` carries assistant output; everything else is ignored.
 *
 * @param {any} event
 * @returns {string|null}
 */
export function extractOpencodeText(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'text' && event.part?.type === 'text' && typeof event.part.text === 'string') {
    return event.part.text;
  }
  return null;
}

function spawnOpencode(ctx) {
  const { prompt, model, onText, onError, onDone, log } = ctx;
  const args = ['run', '--format', 'json'];
  if (model) args.push('--model', model);
  args.push(prompt);

  const cwd = makeTempCwd(log);
  const proc = spawn('opencode', args, { cwd: cwd || __dirname, env: opencodeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  let streamed = false;
  let finished = false;
  const finish = (err) => {
    if (finished) return;
    finished = true;
    if (err) onError(err);
    onDone();
  };

  const flushLine = (raw) => {
    const line = raw.trim();
    if (!line) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      streamed = true;
      onText(`${line}\n`);
      return;
    }
    const text = extractOpencodeText(event);
    if (text) {
      streamed = true;
      onText(text);
    }
  };

  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) flushLine(line);
  });
  proc.stderr.on('data', (chunk) => log('[studio agent stderr]', chunk.toString().slice(0, 300)));

  proc.on('error', (err) => {
    cleanupTempCwd(cwd, log);
    finish({ message: `OpenCode failed to start: ${err.message}`, code: 'server' });
  });
  proc.on('close', (code) => {
    cleanupTempCwd(cwd, log);
    if (buffer.trim()) flushLine(buffer);
    if (code !== 0 && !streamed) return finish({ message: `OpenCode exited with code ${code}`, code: 'server' });
    finish();
  });
  return { kill: () => proc.kill('SIGTERM') };
}

function runOllama(ctx) {
  const { messages, system, model, onText, onError, onDone, log } = ctx;
  const base = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const selected = model || process.env.OLLAMA_MODEL || 'llama3.2';
  const chatMessages = [];
  if (system) chatMessages.push({ role: 'system', content: system });
  for (const m of messages || []) chatMessages.push({ role: m.role, content: m.content });

  const controller = new AbortController();
  (async () => {
    try {
      const response = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selected, messages: chatMessages, stream: true }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const code = response.status === 404 ? 'model_not_found' : 'server';
        onError({ message: `Ollama error ${response.status}: ${text.slice(0, 200)}`, code });
        onDone();
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            const token = parsed.message?.content || '';
            if (token) onText(token);
          } catch {
            /* ignore malformed NDJSON line */
          }
        }
      }
      onDone();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      log('[studio ollama error]', err.message);
      onError({ message: `Ollama is not reachable at ${base}. Start it with: ollama serve`, code: 'not_running' });
      onDone();
    }
  })();
  return { kill: () => controller.abort() };
}

/** @returns {Record<string, (ctx: RunContext) => {kill:()=>void}|Promise<{kill:()=>void}>>} */
export function defaultAgentRunners() {
  return { claude: spawnClaude, cursor: spawnCursor, opencode: spawnOpencode, ollama: runOllama };
}

/* ------------------------------------------------------------------ router */

function resolveToken(env, log) {
  if (env.STUDIO_BRIDGE_TOKEN) return env.STUDIO_BRIDGE_TOKEN;
  const token = randomBytes(24).toString('hex');
  try {
    writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
  } catch (err) {
    log(`⚠️  Could not write ${TOKEN_FILE}: ${err.message}`);
  }
  return token;
}

function printBanner(token, origins, log) {
  log(
    [
      '',
      '┌─ Studio bridge ──────────────────────────────────────────────',
      `│ Studio URL:     ${STUDIO_URL_HINT}`,
      `│ Pairing token:  ${token}`,
      `│ Token file:     ${TOKEN_FILE}`,
      `│ Allowed origins: ${[...origins].join(', ')}`,
      '└──────────────────────────────────────────────────────────────',
      '  Paste the pairing token into Studio → Settings → My local agent.',
      '',
    ].join('\n')
  );
}

/**
 * Build the Studio Express Router.
 *
 * @param {object} [options]
 * @param {string} [options.token]          pairing token (default: env or generated + persisted)
 * @param {Set<string>|string} [options.origins] allowed origins (default: STUDIO_ORIGINS)
 * @param {object} [options.db]             an existing studio-db instance (default: open ~/.professor)
 * @param {Record<string, Function>} [options.runners] agent runners (default: real CLI spawns)
 * @param {boolean} [options.announce]      write token file + print banner (default: false)
 * @param {boolean} [options.allowNonLoopback] permit non-loopback clients (default: false)
 * @param {() => object} [options.capabilities] installer probe (default: detectAgents)
 * @param {object} [options.runner] options forwarded to the Phase 29 runner router (studio-runner.js)
 * @param {(...a:any[])=>void} [options.log] logger
 * @returns {import('express').Router}
 */
export function createStudioRouter(options = {}) {
  const log = options.log || ((...a) => console.log(...a));
  const env = process.env;

  const db = options.db || createStudioDb({ log: (...a) => log('  [studio-db]', ...a) });
  const token = options.token || resolveToken(env, log);
  const origins = options.origins instanceof Set ? options.origins : parseOrigins(options.origins ?? env.STUDIO_ORIGINS);
  const runners = options.runners || defaultAgentRunners();
  const capabilities = options.capabilities || detectAgents;
  const allowNonLoopback = options.allowNonLoopback ?? Boolean(env.STUDIO_ALLOW_NON_LOOPBACK);

  if (options.announce) printBanner(token, origins, log);

  const router = express.Router();

  // Body parser (mounted before the server's global one for this path).
  router.use(express.json({ limit: '25mb' }));

  // Loopback-only unless explicitly opened up.
  router.use((req, res, next) => {
    if (allowNonLoopback || isLoopback(req.socket?.remoteAddress)) return next();
    res.status(403).json({ ok: false, error: 'Studio bridge accepts loopback clients only', code: 'forbidden_client' });
  });

  // CORS allowlist + preflight.
  router.use((req, res, next) => {
    const origin = req.get('Origin');
    const allowAll = origins.has('*');
    if (origin && !allowAll && !origins.has(origin)) {
      res.status(403).json({ ok: false, error: `Origin not allowed: ${origin}`, code: 'forbidden_origin' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Token');
    res.setHeader('Access-Control-Max-Age', '600');
    if (String(req.get('Access-Control-Request-Private-Network')).toLowerCase() === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Pairing token on every route.
  router.use((req, res, next) => {
    if (tokenMatches(req.get('X-Studio-Token'), token)) return next();
    res
      .status(401)
      .json({ ok: false, error: 'Missing or invalid X-Studio-Token', code: 'unauthorized' });
  });

  /* -------------------------------------------------- local runner (Phase 29) */

  // Mounted INSIDE the token/CORS guard above, so the runner inherits auth for free (HANDOFF-29 §1).
  router.use('/run', createRunnerRouter(options.runner));

  /* -------------------------------------------------- bridge */

  router.get('/health', (req, res) => {
    res.json({ ok: true, version: VERSION, agents: capabilities() });
  });

  router.post('/complete', (req, res) => {
    const body = req.body || {};
    const messages = clampMessages(body.messages);
    const system = typeof body.system === 'string' ? body.system.slice(0, MAX_CHARS) : '';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let ended = false;
    let heartbeat = null;
    let firstToken = false;

    const clearHeartbeat = () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };
    const send = (obj) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    // `done()` must end the response exactly once, whatever order errors/close arrive in.
    const done = () => {
      if (ended) return;
      ended = true;
      clearHeartbeat();
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    };

    // Resolve which agent to use.
    const agents = capabilities();
    const requested = typeof body.agent === 'string' && body.agent ? body.agent : null;
    const priority = ['claude', 'opencode', 'cursor', 'ollama'];
    const chosen = requested
      ? agents[requested]?.installed
        ? requested
        : null
      : priority.find((a) => agents[a]?.installed) || null;

    if (!chosen) {
      send({
        error: requested
          ? `Agent "${requested}" is not installed on this machine.`
          : 'No local agent available. Install Claude Code, OpenCode, Cursor CLI, or Ollama.',
        code: 'config',
      });
      done();
      return;
    }

    const model = typeof body.model === 'string' && body.model ? body.model : undefined;
    const includeSystemInPrompt = chosen !== 'claude';
    const prompt = flattenConversation(system, messages, includeSystemInPrompt);

    let runner = null;
    const onError = ({ message, code }) => send({ error: message, code: code || 'server' });
    const onText = (text) => {
      if (typeof text === 'string' && text) {
        firstToken = true;
        send({ text });
      }
    };
    const onDone = () => done();

    // Kill the child process only when the CLIENT disconnects mid-stream.
    // PITFALLS §8 / Node ≥16: `req.on('close')` fires as soon as express.json() has consumed the
    // body — NOT on disconnect — so it SIGTERM'd every child immediately (exit code null) and left
    // the response un-ended. Detect the real disconnect via the response, which is only "closed
    // before we ended it" when the client went away.
    res.on('close', () => {
      clearHeartbeat();
      if (!res.writableEnded) {
        ended = true;
        runner?.kill?.();
      }
    });

    // Tell the client we accepted the request, then keep the socket warm while the agent boots
    // (Claude ≈11 s, OpenCode ≈28 s): proxies and the browser otherwise time out.
    send({ status: 'thinking' });
    heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearHeartbeat();
        return;
      }
      if (!firstToken) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    try {
      runner = runners[chosen]({ system, prompt, model, messages, onText, onError, onDone, log });
    } catch (err) {
      onError({ message: `Failed to start ${chosen}: ${err.message}`, code: 'server' });
      done();
    }
  });

  /* -------------------------------------------------- database */

  router.get('/db/health', (req, res) => {
    res.json({ ok: true, kind: 'sqlite', path: db.path, schemaVersion: db.schemaVersion });
  });

  router.post('/db', (req, res) => {
    const { op, table, args = [] } = req.body || {};
    if (typeof op !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing "op"', code: 'bad_request' });
      return;
    }
    try {
      let result;
      switch (op) {
        case 'get':
          result = db.get(table, args[0]);
          break;
        case 'put':
          result = db.put(table, args[0]);
          break;
        case 'putMany':
          result = db.putMany(table, args[0]);
          break;
        case 'list':
          result = db.list(table, args[0] || {});
          break;
        case 'softDelete':
          result = db.softDelete(table, args[0]);
          break;
        case 'exportAll':
          result = db.exportAll();
          break;
        case 'importAll':
          result = db.importAll(args[0]);
          break;
        case 'info':
          result = db.info();
          break;
        default:
          res.status(400).json({ ok: false, error: `Unknown op: ${op}`, code: 'unknown_op' });
          return;
      }
      res.json({ ok: true, result });
    } catch (err) {
      const code = err instanceof StudioDbError ? err.code : 'db_error';
      res.status(400).json({ ok: false, error: err.message, code });
    }
  });

  router.__studio = { db, token, origins };
  return router;
}

/**
 * Convenience: a bare Express app with the router already mounted at `/api/studio`.
 * Used by tests and by anyone running the Studio API standalone.
 * @param {Parameters<typeof createStudioRouter>[0]} [options]
 * @returns {import('express').Express}
 */
export function createStudioApp(options = {}) {
  const app = express();
  app.use('/api/studio', createStudioRouter(options));
  return app;
}

/* ------------------------------------------------------------------ default mount */

const IS_TEST = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
let defaultRouter = null;
let defaultInitError = null;

// Eagerly open the DB + print the pairing-token banner at server startup (never during tests).
if (!IS_TEST) {
  try {
    defaultRouter = createStudioRouter({ announce: true });
  } catch (err) {
    defaultInitError = err;
  }
}

/** Default export: a request handler so `app.use('/api/studio', studioRouter)` needs no change. */
export default function studioRouter(req, res, next) {
  if (defaultInitError) {
    res.status(503).json({ ok: false, error: `Studio server failed to start: ${defaultInitError.message}`, code: 'server' });
    return;
  }
  if (!defaultRouter) {
    try {
      defaultRouter = createStudioRouter({ announce: true });
    } catch (err) {
      defaultInitError = err;
      res.status(503).json({ ok: false, error: `Studio server failed to start: ${err.message}`, code: 'server' });
      return;
    }
  }
  return defaultRouter(req, res, next);
}

export { createStudioDb };
