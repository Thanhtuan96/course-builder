/**
 * Local runner client (CODE-04) — talks to `web/studio-runner.js` through the existing local
 * agent bridge (`web/server.js` → `web/studio-api.js`), reusing the same token + CORS + LNA
 * handling as the AI bridge (see ../ai/fetch-local.js).
 *
 * Endpoints (mounted by studio-api.js as `router.use('/run', createRunnerRouter(...))`):
 *   GET  {bridge}/api/studio/run/toolchains  -> { node: true, python3: true, go: false, … }
 *   POST {bridge}/api/studio/run             -> SSE: {"stdout"}, {"stderr"}, {"exit"}, [DONE]
 *
 * Files are written server-side to `${PROFESSOR_HOME:-~/.professor}/workspaces/<courseSlug>/` so
 * the learner can open the same folder in a real editor.
 */
import { parseSSE } from '../ai/sse.js';
import { localFetch, classifyNetworkError, mapHttpError } from '../ai/fetch-local.js';
import { isAbortError, providerError } from '../ai/errors.js';
import { DEFAULT_BRIDGE_URL } from '../ai/bridge.js';
import { assertLoopbackBridgeUrl } from '../settings.js';

const RUN_HINT = 'Start the local server (`npx course-professor web` or `npm start`), then retry. Or pick a language that runs in the browser.';

/**
 * @param {object} settings
 * @returns {string} the runner API root (no trailing slash)
 */
export function runnerBase(settings = {}) {
  const root = String(settings.bridge?.bridgeUrl || settings.bridgeUrl || DEFAULT_BRIDGE_URL).replace(/\/$/, '');
  assertLoopbackBridgeUrl(root);
  return `${root}/api/studio/run`;
}

/**
 * @param {object} settings
 * @returns {{ 'Content-Type': string, 'X-Studio-Token'?: string }}
 */
function headersFor(settings = {}) {
  const token = settings.bridge?.bridgeToken || settings.bridgeToken;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-Studio-Token': token } : {}),
  };
}

/**
 * Which toolchains are installed on the server.
 * @param {object} settings
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<Record<string, boolean>>}
 */
export async function checkToolchains(settings = {}, { signal } = {}) {
  const url = `${runnerBase(settings)}/toolchains`;
  let res;
  try {
    res = await localFetch(url, { headers: headersFor(settings), signal });
  } catch (err) {
    if (isAbortError(err)) throw providerError('aborted', 'Stopped');
    const mapped = classifyNetworkError(err, { url, what: 'the local runner', notRunningHint: RUN_HINT });
    if (mapped.code === 'not_running') mapped.hint = RUN_HINT;
    throw mapped;
  }
  if (!res.ok) throw await mapHttpError(res, { what: 'the local runner' });
  return res.json();
}

/**
 * @param {object} input
 * @param {object} input.settings
 * @param {string} [input.courseSlug]
 * @param {string} input.language
 * @param {Record<string,string>} input.files
 * @param {string|null} [input.entry]
 * @param {AbortSignal} [input.signal]
 * @param {(chunk:{stream:'stdout'|'stderr',text:string})=>void} [input.onOutput]
 * @param {number} [input.timeoutMs]
 * @returns {Promise<import('./browser.js').RunResult>}
 */
export async function runLocal({
  settings = {},
  courseSlug = 'workspace',
  language,
  files = {},
  entry = null,
  signal,
  onOutput,
  timeoutMs,
} = {}) {
  const url = runnerBase(settings);
  const started = Date.now();
  let res;
  try {
    res = await localFetch(url, {
      method: 'POST',
      headers: headersFor(settings),
      body: JSON.stringify({ courseSlug, language, files, entry, timeoutMs }),
      signal,
    });
  } catch (err) {
    if (isAbortError(err)) throw providerError('aborted', 'Stopped');
    const mapped = classifyNetworkError(err, { url, what: 'the local runner', notRunningHint: RUN_HINT });
    if (mapped.code === 'not_running') mapped.hint = RUN_HINT;
    throw mapped;
  }
  if (!res.ok) throw await mapHttpError(res, { what: 'the local runner' });
  if (!res.body) throw providerError('unknown', 'The local runner returned no stream');

  let stdout = '';
  let stderr = '';
  let exitCode = null;
  try {
    for await (const data of parseSSE(res)) {
      if (data === '[DONE]') break;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (typeof json.stdout === 'string') {
        stdout += json.stdout;
        onOutput?.({ stream: 'stdout', text: json.stdout });
      }
      if (typeof json.stderr === 'string') {
        stderr += json.stderr;
        onOutput?.({ stream: 'stderr', text: json.stderr });
      }
      if (json.error) {
        stderr += `${json.error}\n`;
        onOutput?.({ stream: 'stderr', text: `${json.error}\n` });
      }
      if (typeof json.exit === 'number') exitCode = json.exit;
    }
  } catch (err) {
    if (isAbortError(err)) {
      return { stdout, stderr, exitCode, checks: [], durationMs: Date.now() - started, runner: 'local', aborted: true };
    }
    throw err;
  }

  return { stdout, stderr, exitCode: exitCode ?? 0, checks: [], durationMs: Date.now() - started, runner: 'local' };
}
