/**
 * In-browser runner backends (CODE-02), all killable with a hard timeout and an output cap.
 *
 * Workers are created with Vite's `new Worker(new URL(...), { type: 'module' })` form so each
 * backend lands in its own lazy chunk — the CodeMirror/sql.js/Pyodide weight never enters the
 * main bundle. HTML/CSS runs in a sandboxed iframe (no worker) via an inline `srcdoc`.
 *
 * Every backend resolves to the same result shape the runner interface promises (see ./index.js).
 * A timeout is reported as exit code 124 (the shell convention); an abort resolves with
 * `aborted: true` so the UI can drop it silently.
 */
import { defaultEntry, languageForPath } from './languages.js';

export const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_OUTPUT_BYTES = 200_000;

/** @param {string} language @returns {Worker|null} */
function createWorker(language) {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return new Worker(new URL('../../workers/js.worker.js', import.meta.url), { type: 'module' });
    case 'python':
      return new Worker(new URL('../../workers/python.worker.js', import.meta.url), { type: 'module' });
    case 'sql':
      return new Worker(new URL('../../workers/sql.worker.js', import.meta.url), { type: 'module' });
    default:
      return null;
  }
}

/** @param {'timeout'|'aborted'|'unavailable'} code @param {string} message */
class RunnerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunnerError';
    this.code = code;
  }
}

/**
 * @typedef {object} RunResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number|null} exitCode
 * @property {Array<{name:string,passed:boolean,message?:string}>} checks
 * @property {number} durationMs
 * @property {'browser'|'local'} runner
 * @property {boolean} [timedOut]
 * @property {boolean} [aborted]
 * @property {boolean} [outputTruncated]
 * @property {{columns:string[], rows:any[]}} [rows]
 * @property {{html:string}} [preview]
 */

/**
 * @param {object} input
 * @param {string} input.language
 * @param {Record<string,string>} input.files
 * @param {string|null} [input.entry]
 * @param {AbortSignal} [input.signal]
 * @param {(chunk:{stream:'stdout'|'stderr',text:string})=>void} [input.onOutput]
 * @param {number} [input.timeoutMs]
 * @param {number} [input.maxOutputBytes]
 * @returns {Promise<RunResult>}
 */
export async function runBrowser({
  language,
  files = {},
  entry = null,
  signal,
  onOutput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputBytes = MAX_OUTPUT_BYTES,
} = {}) {
  if (language === 'html' || language === 'css') {
    return { stdout: '', stderr: '', exitCode: 0, checks: [], durationMs: 0, runner: 'browser', preview: { html: buildPreviewDocument(files, entry) } };
  }
  const worker = createWorker(language);
  if (!worker) throw new RunnerError('unavailable', `No browser runner for "${language}"`);
  return runWorker(worker, { type: 'run', language, files, entry: entry || defaultEntry(language) }, {
    signal,
    onOutput,
    timeoutMs,
    maxOutputBytes,
  });
}

/**
 * @param {Worker} worker
 * @param {object} payload
 * @param {{ signal?: AbortSignal, onOutput?: Function, timeoutMs: number, maxOutputBytes: number }} opts
 * @returns {Promise<RunResult>}
 */
function runWorker(worker, payload, { signal, onOutput, timeoutMs, maxOutputBytes }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let checks = [];
    let rows = null;
    let settled = false;
    let truncated = false;
    let statusText = '';

    const result = (extra = {}) => ({
      stdout,
      stderr,
      exitCode: null,
      checks,
      durationMs: Date.now() - started,
      runner: 'browser',
      outputTruncated: truncated || undefined,
      ...(rows ? { rows } : {}),
      ...extra,
    });

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      try {
        worker.terminate();
      } catch {
        /* already gone */
      }
    };
    const settle = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const append = (stream, text) => {
      const chunk = String(text ?? '');
      const current = stream === 'stdout' ? stdout : stderr;
      if (current.length + chunk.length > maxOutputBytes) {
        truncated = true;
        const room = Math.max(0, maxOutputBytes - current.length);
        const clipped = room > 0 ? chunk.slice(0, room) : '';
        if (stream === 'stdout') stdout = current + clipped + '\n… (output truncated)';
        else stderr = current + clipped + '\n… (output truncated)';
      } else if (stream === 'stdout') stdout = current + chunk;
      else stderr = current + chunk;
      onOutput?.({ stream, text: truncated && chunk ? '' : chunk });
    };

    const timer = setTimeout(() => {
      settle(result({ exitCode: 124, timedOut: true, stderr: `${stderr}${stderr ? '\n' : ''}Timed out after ${Math.round(timeoutMs / 1000)}s — the process was stopped.` }));
    }, timeoutMs);

    const onAbort = () => settle(result({ aborted: true, exitCode: null }));
    if (signal) {
      if (signal.aborted) {
        settle(result({ aborted: true, exitCode: null }));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    worker.onmessage = (event) => {
      const msg = event.data || {};
      switch (msg.type) {
        case 'stdout':
          append('stdout', msg.text);
          break;
        case 'stderr':
          append('stderr', msg.text);
          break;
        case 'status':
          statusText = String(msg.text || '');
          onOutput?.({ stream: 'status', text: statusText });
          break;
        case 'checks':
          checks = Array.isArray(msg.checks) ? msg.checks : [];
          break;
        case 'rows':
          rows = { columns: msg.columns || [], rows: msg.rows || [] };
          break;
        case 'done':
          settle(result({ exitCode: typeof msg.exitCode === 'number' ? msg.exitCode : 0 }));
          break;
        case 'error':
          append('stderr', `${msg.message || 'Runner error'}\n`);
          settle(result({ exitCode: 1 }));
          break;
        default:
          break;
      }
    };
    worker.onerror = (event) => {
      append('stderr', `${event?.message || 'The runner crashed.'}\n`);
      settle(result({ exitCode: 1 }));
    };

    try {
      worker.postMessage(payload);
    } catch (err) {
      append('stderr', `${err?.message || err}\n`);
      settle(result({ exitCode: 1 }));
    }
  });
}

/**
 * Build a self-contained HTML document from the workspace files, inlining local `<link>`/`<script>`
 * references so a sandboxed iframe (`allow-scripts`, no same-origin) can render it.
 * @param {Record<string,string>} files
 * @param {string|null} entry
 * @returns {string}
 */
export function buildPreviewDocument(files = {}, entry = null) {
  const entryPath = String(entry || Object.keys(files).find((p) => languageForPath(p) === 'html') || 'index.html');
  let html = files[entryPath];
  if (html === undefined) return '<!doctype html><meta charset="utf-8"><body>No HTML file to preview.</body>';

  html = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
    const target = resolveRef(entryPath, href, files);
    if (target === null) return tag;
    return `<style>\n${files[target]}\n</style>`;
  });
  html = html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    const target = resolveRef(entryPath, src, files);
    if (target === null) return tag;
    return `<script>\n${files[target]}\n</script>`;
  });
  return html;
}

/** @param {string} entryPath @param {string} ref @param {Record<string,string>} files */
function resolveRef(entryPath, ref, files) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) return null;
  const base = entryPath.split('/').slice(0, -1);
  const parts = [...base];
  for (const seg of ref.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const joined = parts.join('/');
  return Object.prototype.hasOwnProperty.call(files, joined) ? joined : null;
}

export { RunnerError };
