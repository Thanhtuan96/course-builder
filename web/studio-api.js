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
import { spawn, execSync, execFileSync } from 'child_process';
import { randomBytes, timingSafeEqual } from 'crypto';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir, homedir } from 'os';
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
// How long a model-list command or Ollama probe may take before we give up.
const MODEL_PROBE_TIMEOUT_MS = 8000;
const OLLAMA_PROBE_TIMEOUT_MS = 700;

/**
 * The six local agents the bridge can drive. `binaries` lists every executable name accepted for
 * the agent (Cursor renamed `cursor-agent` → `agent`). Kept here (not imported from studio/src) so
 * the published `web/` package stays self-contained.
 */
export const AGENT_BINARIES = {
  claude: ['claude'],
  opencode: ['opencode'],
  cursor: ['agent', 'cursor-agent'],
  gemini: ['gemini'],
  antigravity: ['agy'],
  ollama: ['ollama'],
};

/** Order tried when the request does not name an agent. */
export const AGENT_PRIORITY = ['claude', 'opencode', 'cursor', 'gemini', 'antigravity', 'ollama'];

export const AGENT_LABELS = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  cursor: 'Cursor CLI',
  gemini: 'Gemini CLI',
  antigravity: 'Antigravity',
  ollama: 'Ollama',
};

/** Agents whose CLIs accept a `--model` flag. Claude Code (print mode) does not in this bridge. */
export const AGENT_MODEL_SUPPORT = {
  claude: false,
  opencode: true,
  cursor: true,
  gemini: true,
  antigravity: true,
  ollama: true,
};

/** Curated fallback models shown when a CLI can't enumerate its own list. */
export const AGENT_CURATED_MODELS = {
  claude: [],
  opencode: [],
  cursor: [
    { id: 'gpt-5', label: 'gpt-5' },
    { id: 'sonnet-4-thinking', label: 'sonnet-4-thinking' },
    { id: 'sonnet-4', label: 'sonnet-4' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  ],
  antigravity: [
    { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { id: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
    { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
    { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ],
  ollama: [],
};

const DEFAULT_MODEL_ENTRY = { id: '', label: 'Default' };

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

function homeFile(...parts) {
  try {
    return existsSync(join(homedir(), ...parts));
  } catch {
    return false;
  }
}

/**
 * Best-effort "is this agent signed in" signal. Only file/env heuristics — no network, no prompts.
 * Returns `undefined` when we genuinely cannot tell (e.g. Cursor stores auth server-side).
 * @param {string} agent
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean|undefined}
 */
export function detectAgentLogin(agent, env = process.env) {
  switch (agent) {
    case 'claude':
      return homeFile('.claude', '.credentials.json') || Boolean(env.ANTHROPIC_API_KEY);
    case 'opencode':
      return homeFile('.local', 'share', 'opencode', 'auth.json') || homeFile('.config', 'opencode', 'auth.json');
    case 'cursor':
      return env.CURSOR_API_KEY || env.CURSOR_AUTH_TOKEN ? true : undefined;
    case 'gemini':
      return homeFile('.gemini', 'oauth_creds.json') || Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
    case 'antigravity':
      return homeFile('.gemini', 'antigravity-cli') ? true : undefined;
    case 'ollama':
      return undefined;
    default:
      return undefined;
  }
}

/** getAgentCapabilities-like summary for all six bridge agents (installed + loggedIn where known). */
export function detectAgents(env = process.env) {
  const out = {};
  for (const [agent, binaries] of Object.entries(AGENT_BINARIES)) {
    const binary = binaries.find((b) => commandExists(b)) || null;
    const entry = {
      installed: Boolean(binary),
      binary,
      supportsStreaming: true,
      supportsModelSelection: AGENT_MODEL_SUPPORT[agent] !== false,
    };
    const loggedIn = detectAgentLogin(agent, env);
    if (loggedIn !== undefined) entry.loggedIn = loggedIn;
    out[agent] = entry;
  }
  return out;
}

/** Probe the local Ollama daemon (short timeout). Returns whether `/api/tags` answers. */
export async function probeOllama(env = process.env) {
  const base = String(env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ model lists */

/** Run a CLI command synchronously with a timeout; never throws. */
function runCommand(command, args, { timeout = MODEL_PROBE_TIMEOUT_MS, env } = {}) {
  try {
    const stdout = execFileSync(command, args, {
      encoding: 'utf-8',
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env || process.env,
    });
    return { ok: true, stdout: String(stdout), stderr: '' };
  } catch (err) {
    return { ok: false, stdout: String(err.stdout || ''), stderr: String(err.stderr || err.message || '') };
  }
}

/** OpenCode prints `provider/model` one per line. */
export function parseOpencodeModels(stdout = '') {
  return String(stdout)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.includes('/'))
    .map((id) => ({ id, label: id }));
}

/** Antigravity prints `id<TAB>Label` lines, preceded by a "Fetching available models…" notice. */
export function parseAntigravityModels(stdout = '') {
  const out = [];
  for (const raw of String(stdout).split('\n')) {
    const line = raw.trim();
    if (!line || /^fetching/i.test(line)) continue;
    const [id, label] = line.split('\t');
    if (!id) continue;
    out.push({ id: id.trim(), label: (label || id).trim() });
  }
  return out;
}

/** Cursor may emit JSON (`{ models: [...] }` / `/models` style) or one id per line. */
export function parseCursorModels(stdout = '') {
  const text = String(stdout).trim();
  if (!text) return [];
  try {
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json : json.models || json.data || [];
    return list
      .map((m) => (typeof m === 'string' ? { id: m, label: m } : { id: m.id || m.model || m.name, label: m.label || m.id || m.model || m.name }))
      .filter((m) => m.id);
  } catch {
    /* fall through to line parsing */
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/:\s*$/.test(line) && !/^no models/i.test(line))
    .map((id) => ({ id, label: id }));
}

/** Prepend the "Default" entry (omit `--model`) when the agent supports model selection. */
function withDefault(agent, models) {
  const list = Array.isArray(models) ? models.filter((m) => m && m.id) : [];
  if (AGENT_MODEL_SUPPORT[agent] === false) return AGENT_CURATED_MODELS.claude;
  return [DEFAULT_MODEL_ENTRY, ...list];
}

/** Curated list for an agent (always available, no subprocess). */
export function curatedAgentModels(agent) {
  return withDefault(agent, AGENT_CURATED_MODELS[agent] || []);
}

async function listOllamaModels(env = process.env) {
  const base = String(env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const json = await res.json().catch(() => ({}));
    return (json.models || []).map((m) => ({ id: m.name || m.model, label: m.name || m.model })).filter((m) => m.id);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the model list for one agent. Tries the agent's own command where it exists, then falls
 * back to the curated list. Never throws — the route always answers 200 with a `source`/`hint`.
 *
 * @param {string} agent
 * @param {{ env?: NodeJS.ProcessEnv, installed?: boolean, run?: typeof runCommand }} [deps]
 * @returns {Promise<{ ok: true, agent: string, models: {id:string,label:string}[], source: string, hint?: string }>}
 */
export async function listAgentModels(agent, { env = process.env, installed = true, run = runCommand } = {}) {
  if (!AGENT_BINARIES[agent]) {
    const err = new Error(`Unsupported agent: ${agent}`);
    err.code = 'config';
    throw err;
  }
  const curated = curatedAgentModels(agent);

  if (agent === 'claude') return { ok: true, agent, models: curated, source: 'curated' };

  if (agent === 'ollama') {
    try {
      const models = await listOllamaModels(env);
      return { ok: true, agent, models: withDefault(agent, models), source: 'ollama' };
    } catch {
      return {
        ok: true,
        agent,
        models: curated,
        source: 'curated',
        hint: 'Ollama is not reachable. Start the Ollama app or run `ollama serve`.',
      };
    }
  }

  if (!installed) {
    return { ok: true, agent, models: curated, source: 'curated', hint: `${AGENT_LABELS[agent]} is not installed on this machine.` };
  }

  if (agent === 'opencode') {
    const res = run('opencode', ['models'], { env });
    const models = parseOpencodeModels(res.stdout);
    if (models.length) return { ok: true, agent, models: withDefault(agent, models), source: 'opencode' };
    return { ok: true, agent, models: curated, source: 'curated' };
  }

  if (agent === 'cursor') {
    for (const bin of AGENT_BINARIES.cursor) {
      const res = run(bin, ['models'], { env });
      const models = parseCursorModels(res.stdout);
      if (models.length) return { ok: true, agent, models: withDefault(agent, models), source: bin };
    }
    return { ok: true, agent, models: curated, source: 'curated' };
  }

  if (agent === 'antigravity') {
    const res = run('agy', ['models'], { env });
    const models = parseAntigravityModels(res.stdout);
    if (models.length) return { ok: true, agent, models: withDefault(agent, models), source: 'agy' };
    return { ok: true, agent, models: curated, source: 'curated' };
  }

  return { ok: true, agent, models: curated, source: 'curated' };
}

/* ------------------------------------------------------------------ error diagnosis */

const STDERR_NOISE = [
  /keychain initialization/i,
  /require stack/i,
  /^at\s/,
  /^-\s*\//,
  /loaded cached credentials/i,
  /using filekeychain/i,
  /^\s*$/,
];

/** The first stderr line that is not runtime noise (keychain warnings, stack frames…). */
export function firstMeaningfulStderr(stderr = '') {
  const lines = String(stderr)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => !STDERR_NOISE.some((re) => re.test(line))) || lines[0] || '';
}

/**
 * Turn a non-zero agent exit into `{ message, code, hint }` with an actionable fix. Used when the
 * child produced no text at all, so the stream is never silently empty.
 *
 * @param {string} agent
 * @param {{ stderr?: string, exitCode?: number|null }} info
 * @returns {{ message: string, code: string, hint?: string }}
 */
export function diagnoseAgentFailure(agent, { stderr = '', exitCode } = {}) {
  const label = AGENT_LABELS[agent] || agent;
  const first = firstMeaningfulStderr(stderr);
  const lower = `${first}\n${stderr}`.toLowerCase();
  const message = first ? `${label} exited with code ${exitCode}: ${first}` : `${label} exited with code ${exitCode}`;

  if (/model.{0,20}(not found|unknown|invalid|does not exist)/.test(lower) || /unknown model|invalid model/.test(lower)) {
    return { message, code: 'model_not_found', hint: 'Pick a model in Settings.' };
  }
  if (agent === 'cursor' && /(auth|login|api key|cursor_api_key|cursor_auth_token)/.test(lower)) {
    return { message, code: 'auth', hint: 'Run `agent login` (or set CURSOR_API_KEY), then retry.' };
  }
  if (agent === 'gemini' && /(auth|sign in|credentials|ineligible|login)/.test(lower)) {
    return { message, code: 'auth', hint: 'Run `gemini` once to sign in, then retry.' };
  }
  if (agent === 'antigravity' && /(auth|sign in|credentials|login)/.test(lower)) {
    return { message, code: 'auth', hint: 'Open Antigravity and sign in, then retry.' };
  }
  if (agent === 'ollama' && /(not reachable|not running|connect|refused)/.test(lower)) {
    return { message, code: 'not_running', hint: 'Start the Ollama app or run `ollama serve`.' };
  }
  if (/(auth|login|api key|authentication)/.test(lower)) {
    return { message, code: 'auth' };
  }
  return { message, code: 'server' };
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
 *             onText: (t:string)=>void, onError: (e:{message:string,code:string}) => void,
 *             onDone: ()=>void, log: (...a:any[])=>void }} RunContext
 */

/** Wire stdout (JSON lines) and stderr (diagnostic lines) readers; returns a flusher for the tail. */
function attachStreams(proc, { onLine, onStderr, log }) {
  let buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) onLine(line);
  });
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    for (const part of text.split('\n')) {
      const trimmed = part.trim();
      if (trimmed) onStderr?.(trimmed);
    }
    log('[studio agent stderr]', text.slice(0, 300));
  });
  return {
    flush() {
      const tail = buffer.trim();
      buffer = '';
      if (tail) onLine(tail);
    },
  };
}

/**
 * Shared runner for CLI agents that emit newline-delimited JSON. Handles the temp cwd, stderr
 * capture, the "streamed nothing" fallback and the actionable diagnosis on a non-zero exit.
 */
function runJsonCli(ctx, spec) {
  const { onText, onError, onDone, log } = ctx;
  const args = spec.args(ctx);
  const cwd = spec.tempCwd === false ? undefined : makeTempCwd(log);
  let proc;
  try {
    proc = spawn(spec.command, args, {
      cwd: cwd || spec.cwd || __dirname,
      env: spec.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    cleanupTempCwd(cwd, log);
    onError({ message: `${spec.label} failed to start: ${err.message}`, code: 'server' });
    onDone();
    return { kill() {} };
  }

  let streamed = false;
  let resultText = '';
  const stderrLines = [];
  const errorLines = [];
  let finished = false;
  const finish = (err) => {
    if (finished) return;
    finished = true;
    if (err) onError(err);
    cleanupTempCwd(cwd, log);
    onDone();
  };

  const io = attachStreams(proc, {
    log,
    onStderr: (line) => stderrLines.push(line),
    onLine: (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        if (spec.textOnNonJson) {
          streamed = true;
          onText(`${line.trim()}\n`);
        } else {
          log('[studio agent non-json]', line.slice(0, 200));
        }
        return;
      }
      const text = spec.extract?.(event);
      if (text) {
        streamed = true;
        onText(text);
      }
      const final = spec.finalText?.(event);
      if (typeof final === 'string' && final) resultText = final;
      // Some agents report failures as a structured event on stdout (OpenCode `type:"error"`),
      // not stderr — capture it so a non-zero exit is never reported without a reason.
      const errText = spec.errorText?.(event);
      if (errText) errorLines.push(errText);
    },
  });

  proc.on('error', (err) => finish({ message: `${spec.label} failed to start: ${err.message}`, code: 'server' }));
  proc.on('close', (code) => {
    io.flush();
    if (!streamed && resultText) onText(resultText);
    if (code !== 0 && !streamed && !resultText) {
      const stderr = [...errorLines, ...stderrLines].join('\n');
      const diag = diagnoseAgentFailure(spec.agent, { stderr, exitCode: code });
      // A named model that fails opaquely is most often the culprit — point the user at the picker.
      if (!diag.hint && ctx.model) diag.hint = 'If you picked a model, try another (or Default) in Settings.';
      return finish(diag);
    }
    finish();
  });
  return { kill: () => proc.kill('SIGTERM') };
}

/* -- per-agent stream-json extractors (fixture-tested in studio/test/agent-parsers.test.js) -- */

/** Claude Code `--include-partial-messages`: text arrives as `stream_event` `text_delta`s. */
export function extractClaudeText(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'stream_event') {
    const text = event.event?.delta?.text;
    return typeof text === 'string' && text ? text : null;
  }
  return null;
}

/** OpenCode `run --format json` emits `{"type":"text","part":{"type":"text","text":"…"}}`. */
export function extractOpencodeText(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'text' && event.part?.type === 'text' && typeof event.part.text === 'string') {
    return event.part.text;
  }
  return null;
}

/** Gemini CLI `-o stream-json` emits `{"type":"message","role":"assistant","content":"…","delta":true}`. */
export function extractGeminiText(event) {
  if (!event || typeof event !== 'object') return null;
  if (event.type === 'message' && event.role === 'assistant' && event.delta !== false) {
    return typeof event.content === 'string' && event.content ? event.content : null;
  }
  return null;
}

/** Antigravity `--output-format stream-json` emits `step_update.text_delta` for agent responses. */
export function extractAntigravityText(event) {
  if (!event || typeof event !== 'object') return null;
  const su = event.event === 'step_update' ? event.step_update : null;
  if (su && su.step_type === 'agent_response' && typeof su.text_delta === 'string' && su.text_delta) {
    return su.text_delta;
  }
  return null;
}

/** Claude/Cursor emit a final `{"type":"result","result":"…"}` with the whole reply. */
function resultText(event) {
  return event?.type === 'result' && typeof event.result === 'string' ? event.result : null;
}

/** Antigravity's final `{"event":"result","result":{"response":"…"}}`. */
function antigravityResultText(event) {
  return event?.event === 'result' && typeof event.result?.response === 'string' ? event.result.response : null;
}

/** OpenCode reports failures as `{"type":"error","error":{"data":{"message":"…"}}}` on stdout. */
export function opencodeErrorText(event) {
  if (event?.type !== 'error') return null;
  return event.error?.data?.message || event.error?.message || 'OpenCode reported an error';
}

/** Claude/Cursor mark failures with `{"type":"result","is_error":true,"result":"…"}`. */
export function claudeErrorText(event) {
  if (event?.type !== 'result' || !event.is_error) return null;
  return typeof event.result === 'string' && event.result ? event.result : event.subtype || 'Agent reported an error';
}

/** Gemini reports failures as `{"type":"error","message":"…"}`. */
export function geminiErrorText(event) {
  if (event?.type !== 'error') return null;
  return event.message || 'Gemini reported an error';
}

function cursorBinary() {
  return AGENT_BINARIES.cursor.find((b) => commandExists(b)) || 'agent';
}

function spawnClaude(ctx) {
  const { system, prompt } = ctx;
  const args = ['--print', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'];
  if (system) args.push('--system-prompt', system);
  args.push(prompt);
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return runJsonCli(ctx, {
    agent: 'claude',
    label: 'Claude Code CLI',
    command: 'claude',
    args: () => args,
    env,
    cwd: __dirname,
    tempCwd: false,
    extract: extractClaudeText,
    finalText: resultText,
    errorText: claudeErrorText,
  });
}

function spawnCursor(ctx) {
  const { prompt, model } = ctx;
  const args = ['--print', '--output-format', 'stream-json', '--stream-partial-output'];
  if (model) args.push('--model', model);
  args.push(prompt);

  // Cursor streams deltas like Claude; if it only sends a cumulative `assistant` message, emit the
  // delta once. Prefer deltas, and never double-emit.
  let sawStream = false;
  let lastAssistant = '';
  const extract = (event) => {
    if (event?.type === 'stream_event') {
      const text = event.event?.delta?.text;
      if (text) {
        sawStream = true;
        return text;
      }
      return null;
    }
    if (event?.type === 'assistant' && !sawStream) {
      const text = (event.message?.content || [])
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('');
      if (!text) return null;
      if (text.startsWith(lastAssistant)) {
        const delta = text.slice(lastAssistant.length);
        lastAssistant = text;
        return delta || null;
      }
      lastAssistant = text;
      return text;
    }
    return null;
  };

  return runJsonCli(ctx, {
    agent: 'cursor',
    label: 'Cursor CLI',
    command: cursorBinary(),
    args: () => args,
    tempCwd: true,
    extract,
    finalText: resultText,
    errorText: claudeErrorText,
  });
}

function spawnOpencode(ctx) {
  const { prompt, model } = ctx;
  const args = ['run', '--format', 'json'];
  if (model) args.push('--model', model);
  args.push(prompt);
  return runJsonCli(ctx, {
    agent: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    args: () => args,
    env: opencodeEnv(),
    tempCwd: true,
    textOnNonJson: true,
    extract: extractOpencodeText,
    errorText: opencodeErrorText,
  });
}

function spawnGemini(ctx) {
  const { prompt, model } = ctx;
  const args = ['-p', prompt, '-o', 'stream-json', '--approval-mode', 'plan'];
  if (model) args.push('-m', model);
  return runJsonCli(ctx, {
    agent: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    args: () => args,
    tempCwd: true,
    extract: extractGeminiText,
    errorText: geminiErrorText,
  });
}

function spawnAntigravity(ctx) {
  const { prompt, model } = ctx;
  // `--mode plan` is read-only. `--disable-slash-commands` cancels plan mode and `--sandbox`
  // auto-denies the tools the model then tries to call, so neither is used.
  const args = ['-p', prompt, '--output-format', 'stream-json', '--mode', 'plan'];
  if (model) args.push('--model', model);
  return runJsonCli(ctx, {
    agent: 'antigravity',
    label: 'Antigravity',
    command: 'agy',
    args: () => args,
    tempCwd: true,
    extract: extractAntigravityText,
    finalText: antigravityResultText,
  });
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
        if (response.status === 404) {
          onError({ message: `Ollama has no model "${selected}"`, code: 'model_not_found', hint: 'Pick a model in Settings.' });
        } else {
          onError({ message: `Ollama error ${response.status}: ${text.slice(0, 200)}`, code: 'server' });
        }
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
      onError({
        message: `Ollama is not reachable at ${base}.`,
        code: 'not_running',
        hint: 'Start the Ollama app or run `ollama serve`.',
      });
      onDone();
    }
  })();
  return { kill: () => controller.abort() };
}

/** @returns {Record<string, (ctx: RunContext) => {kill:()=>void}|Promise<{kill:()=>void}>>} */
export function defaultAgentRunners() {
  return {
    claude: spawnClaude,
    opencode: spawnOpencode,
    cursor: spawnCursor,
    gemini: spawnGemini,
    antigravity: spawnAntigravity,
    ollama: runOllama,
  };
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
 * @param {(agent: string, deps: object) => Promise<object>} [options.listAgentModels] models resolver
 * @param {boolean} [options.probeReachable] probe Ollama reachability on /health (default: true)
 * @param {Map} [options.modelCache] session model cache (default: fresh per router)
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
  const listAgentModelsFn = options.listAgentModels || listAgentModels;
  const probeReachable = options.probeReachable !== false;
  const modelCache = options.modelCache || new Map();
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

  router.get('/health', async (req, res) => {
    const agents = { ...capabilities() };
    // Probe Ollama reachability on demand — only when the binary exists and callers didn't supply
    // their own capability map (tests inject a static map).
    if (probeReachable && agents.ollama?.installed && agents.ollama.reachable === undefined) {
      agents.ollama = { ...agents.ollama, reachable: await probeOllama(env) };
    }
    res.json({ ok: true, version: VERSION, agents });
  });

  // Model picker source: per-agent list, cached for the life of the server session.
  router.get('/agents/:agent/models', async (req, res) => {
    const agent = String(req.params.agent || '');
    if (!AGENT_BINARIES[agent]) {
      res.status(400).json({ ok: false, error: `Unknown agent: ${agent}`, code: 'config' });
      return;
    }
    if (modelCache.has(agent)) {
      res.json({ ...modelCache.get(agent), cached: true });
      return;
    }
    try {
      const result = await listAgentModelsFn(agent, { env, installed: capabilities()[agent]?.installed !== false, log });
      modelCache.set(agent, result);
      res.json(result);
    } catch (err) {
      res.status(err.code === 'config' ? 400 : 500).json({ ok: false, error: err.message, code: err.code || 'server' });
    }
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

    // Resolve which agent to use. A named but unknown/unsupported agent is a hard config error —
    // never a silent empty stream.
    const agents = capabilities();
    const requested = typeof body.agent === 'string' && body.agent ? body.agent : null;
    const known = requested ? Boolean(AGENT_BINARIES[requested]) : false;
    const chosen = requested
      ? known && agents[requested]?.installed
        ? requested
        : null
      : AGENT_PRIORITY.find((a) => agents[a]?.installed) || null;

    if (!chosen) {
      let error;
      let hint;
      if (requested && !known) {
        error = `Unknown agent "${requested}".`;
        hint = `Supported agents: ${Object.keys(AGENT_BINARIES).join(', ')}.`;
      } else if (requested) {
        error = `Agent "${requested}" is not installed on this machine.`;
        hint = `Install ${AGENT_LABELS[requested]} or pick another agent in Settings.`;
      } else {
        error = 'No local agent available. Install Claude Code, OpenCode, Cursor, Gemini, Antigravity, or Ollama.';
        hint = 'Install one of the supported agents, or switch AI source in Settings.';
      }
      send({ error, code: 'config', hint });
      done();
      return;
    }

    const model = typeof body.model === 'string' && body.model ? body.model : undefined;
    const includeSystemInPrompt = chosen !== 'claude';
    const prompt = flattenConversation(system, messages, includeSystemInPrompt);

    let runner = null;
    const onError = ({ message, code, hint }) => send({ error: message, code: code || 'server', ...(hint ? { hint } : {}) });
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
        case 'clearAll':
          result = db.clearAll();
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
