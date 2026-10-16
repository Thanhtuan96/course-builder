/**
 * studio-api/agents.js — local agent runners for the bridge.
 *
 * Owns the process-isolation and per-CLI stream-json parsing for every bridge agent. Extracted
 * verbatim from `web/studio-api.js` (Phase 1 seam split). Phase 2 will extend this module with the
 * permission-flag denylist (`buildAgentArgs`).
 */
import { spawn, execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { AGENT_BINARIES, describeNoOutput } from './health.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// agent CLIs run in the web/ directory (the historical cwd), not web/studio-api/.
const WEB_DIR = join(__dirname, '..');

// Permission map injected into OpenCode so the tutor cannot read/edit the learner's files.
const OPENCODE_PERMISSION_DENY = { edit: 'deny', bash: 'deny', webfetch: 'deny' };

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
      cwd: cwd || spec.cwd || WEB_DIR,
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
  let lastStep = '';
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
      const step = spec.step?.(event);
      if (step) lastStep = step;
    },
  });

  proc.on('error', (err) => finish({ message: `${spec.label} failed to start: ${err.message}`, code: 'server' }));
  proc.on('close', (code) => {
    io.flush();
    if (!streamed && resultText) onText(resultText);
    // Any run that ends without text is a failure — even exit 0 (an agent that looped on denied
    // tools, or returned an empty reply). Never leave the client with a silent empty stream.
    if (!streamed && !resultText) {
      const stderr = [...errorLines, ...stderrLines].join('\n');
      const diag = describeNoOutput(spec.agent, { stderr, exitCode: code, lastStep });
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

/** Short "step_type state" label for the last Antigravity step (used in no-output diagnostics). */
export function antigravityStep(event) {
  const su = event?.event === 'step_update' ? event.step_update : null;
  if (!su) return null;
  return [su.step_type, su.state].filter(Boolean).join(' ') || null;
}

/** Antigravity reports a failed tool step (e.g. a headless permission denial) on that step. */
export function antigravityErrorText(event) {
  const su = event?.event === 'step_update' ? event.step_update : null;
  if (!su || su.state !== 'ERROR') return null;
  const tool = su.tool_info?.error?.message || su.tool_info?.error?.type;
  return tool || su.error?.message || `${su.step_type || 'step'} failed`;
}

/**
 * Antigravity prompt guard. With a flattened `[System]…USER:…` prompt, `--mode plan` makes agy try
 * a command tool that headless mode auto-denies, so it exits 0 with NO text. The explicit
 * plain-text instruction reliably suppresses tool use while `--mode plan` keeps the run read-only.
 * @param {{ prompt: string, model?: string }} ctx
 */
export function antigravityArgs({ prompt, model }) {
  const guarded = `${prompt}\n\nRespond in plain text only. Do not use any tools.`;
  const args = ['-p', guarded, '--output-format', 'stream-json', '--mode', 'plan'];
  if (model) args.push('--model', model);
  return args;
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

// `which`-style presence check (kept local so agents.js stays self-contained).
function commandExists(command) {
  try {
    execSync(`which ${command}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
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
    cwd: WEB_DIR,
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
  // `--mode plan` keeps the run read-only; `antigravityArgs` also appends the plain-text instruction
  // that stops agy from burning the turn on a tool headless mode would auto-deny (see below).
  // `--disable-slash-commands` cancels plan mode and `--sandbox` made no difference, so neither is used.
  return runJsonCli(ctx, {
    agent: 'antigravity',
    label: 'Antigravity',
    command: 'agy',
    args: () => antigravityArgs(ctx),
    tempCwd: true,
    extract: extractAntigravityText,
    finalText: antigravityResultText,
    errorText: antigravityErrorText,
    step: antigravityStep,
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
