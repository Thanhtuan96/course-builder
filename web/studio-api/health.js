/**
 * studio-api/health.js — agent facts, capability detection and model listing.
 *
 * Pure helpers extracted from `web/studio-api.js` (Phase 1 seam split). No Express here: the HTTP
 * routes live in `bridge.js`. Everything that shells out (`which`, model probes) is best-effort and
 * never throws.
 */
import { execSync, execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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

// How long a model-list command or Ollama probe may take before we give up.
const MODEL_PROBE_TIMEOUT_MS = 8000;
const OLLAMA_PROBE_TIMEOUT_MS = 700;

/* ------------------------------------------------------------------ helpers */

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

/**
 * Diagnosis for a run that produced no assistant text at all. A non-zero exit is diagnosed by
 * `diagnoseAgentFailure`; an exit-0-without-text run (an agent that burned the turn on a denied
 * tool, or returned an empty reply) is reported with the last observed step so it is never silent.
 *
 * @param {string} agent
 * @param {{ stderr?: string, exitCode?: number|null, lastStep?: string }} info
 * @returns {{ message: string, code: string, hint?: string }}
 */
export function describeNoOutput(agent, { stderr = '', exitCode, lastStep = '' } = {}) {
  const label = AGENT_LABELS[agent] || agent;
  const reason = firstMeaningfulStderr(stderr);
  const diag = diagnoseAgentFailure(agent, { stderr, exitCode });
  if (exitCode === 0) {
    // Exit 0 but no text: override the misleading "exited with code 0" wording.
    diag.message = reason
      ? `${label} produced no text: ${reason}`
      : `${label} finished without producing any text${lastStep ? ` (last step: ${lastStep})` : ''}.`;
    if (!diag.hint) {
      diag.code = 'server';
      diag.hint = 'The agent stopped before answering — retry, or pick another agent in Settings.';
    }
  } else if (!reason && lastStep) {
    diag.message = `${diag.message} (last step: ${lastStep})`;
  }
  return diag;
}
