/**
 * Runner interface (CODE-02, CODE-04) — the single entry point the Workspace UI calls.
 *
 *   run({ language, files, entry, tests, signal, onOutput }) -> RunResult
 *
 * Backend selection is deliberate and boring:
 *   1. browser  — when the language is supported with no install (JS/TS, Python, SQL, HTML/CSS)
 *   2. local    — otherwise, if the learner's local server answers `/toolchains`
 *   3. error    — with an actionable hint telling them how to get the toolchain
 *
 * `onOutput` streams `{ stream: 'stdout'|'stderr'|'status', text }` as the run progresses.
 * Nothing here ever writes, reveals or generates a solution — it only executes the learner's code.
 */
import { languageForPath, normalizeLanguage, isBrowserLanguage, isLocalLanguage, getLanguage } from './languages.js';
import { runBrowser, DEFAULT_TIMEOUT_MS, MAX_OUTPUT_BYTES, RunnerError } from './browser.js';
import { runLocal, checkToolchains, runnerBase } from './local.js';
import { loadSettings } from '../settings.js';

export { DEFAULT_TIMEOUT_MS, MAX_OUTPUT_BYTES };
export { isBrowserLanguage, isLocalLanguage };

/**
 * @typedef {import('./browser.js').RunResult} RunResult
 */

/** @returns {boolean} whether a Web Worker can be constructed in this environment */
export function canUseWorkers() {
  return typeof Worker !== 'undefined';
}

/**
 * Pure backend choice — exported so it can be unit-tested without a browser.
 * @param {{ language: string, browserUsable?: boolean, localAvailable?: boolean, preferLocal?: boolean }} input
 * @returns {'browser'|'local'|null}
 */
export function selectRunner({ language, browserUsable = true, localAvailable = false, preferLocal = false }) {
  const browser = isBrowserLanguage(language);
  if (preferLocal && localAvailable) return 'local';
  if (browser && browserUsable) return 'browser';
  if (isLocalLanguage(language) && localAvailable) return 'local';
  if (browser && !browserUsable && localAvailable) return 'local';
  return null;
}

/**
 * The runner the UI should advertise for a language (no network).
 * @param {string|null|undefined} language
 * @param {{ toolchains?: Record<string, boolean>|null }} [opts]
 */
export function describeRunner(language, { toolchains = null } = {}) {
  const lang = normalizeLanguage(language);
  const spec = getLanguage(lang);
  if (!spec) return { id: null, label: 'Unknown', kind: null, ready: false };
  const browser = spec.backend === 'browser';
  if (browser) return { id: lang, label: 'Browser', kind: 'browser', ready: true };
  const command = spec.command;
  const ready = Boolean(toolchains && command && toolchains[command]);
  return { id: lang, label: 'Local server', kind: 'local', ready, command };
}

/**
 * @param {object} input
 * @param {string} input.language
 * @param {Record<string,string>|Array<{path:string,content:string}>} input.files
 * @param {string|null} [input.entry]
 * @param {any} [input.tests]
 * @param {AbortSignal} [input.signal]
 * @param {(chunk:{stream:string,text:string})=>void} [input.onOutput]
 * @param {string} [input.courseSlug]
 * @param {object} [input.settings]
 * @param {number} [input.timeoutMs]
 * @param {number} [input.maxOutputBytes]
 * @param {boolean} [input.preferLocal]
 * @returns {Promise<RunResult>}
 */
export async function run(input) {
  const {
    language,
    files = {},
    entry = null,
    tests = null,
    signal,
    onOutput,
    courseSlug = 'workspace',
    settings = null,
    timeoutMs,
    maxOutputBytes,
    preferLocal = false,
  } = input || {};

  const resolvedSettings = settings || safeSettings();
  const lang = normalizeLanguage(language) || languageForPath(entry) || normalizeLanguage(Object.keys(files)[0]) || 'javascript';

  const browserUsable = canUseWorkers();
  const browserPath = { language: lang, files: fileMap(files), entry, tests, signal, onOutput, timeoutMs, maxOutputBytes };

  if (isBrowserLanguage(lang) && browserUsable && !preferLocal) {
    return runBrowser(browserPath);
  }

  // Local (or browser-as-fallback when a browser language but no workers, or preferLocal).
  let localAvailable = false;
  let localError = null;
  if (!isBrowserLanguage(lang) || preferLocal) {
    try {
      const toolchains = await checkToolchains(resolvedSettings, { signal });
      localAvailable = true;
      const spec = getLanguage(lang);
      if (spec?.command && toolchains && toolchains[spec.command] === false) {
        throw localToolchainError(lang, spec.command);
      }
    } catch (err) {
      localError = err;
      localAvailable = false;
    }
  }

  const choice = selectRunner({ language: lang, browserUsable, localAvailable, preferLocal });
  if (choice === 'local') {
    return runLocal({ settings: resolvedSettings, courseSlug, language: lang, files: fileMap(files), entry, signal, onOutput, timeoutMs });
  }
  if (choice === 'browser') {
    return runBrowser(browserPath);
  }

  // No backend works — surface the most useful error.
  if (localError) throw localError;
  if (browserUsable && isBrowserLanguage(lang)) return runBrowser(browserPath);
  if (!browserUsable && isBrowserLanguage(lang)) {
    const err = new RunnerError('unavailable', `The ${lang} runner needs Web Workers, which this browser does not expose.`);
    err.hint = 'Try a modern browser, or start the local server and use the local runner.';
    throw err;
  }
  throw localToolchainError(lang, getLanguage(lang)?.command);
}

/**
 * @param {string} language
 * @param {string|undefined} command
 */
function localToolchainError(language, command) {
  const label = getLanguage(language)?.label || language;
  const err = new RunnerError(
    'unavailable',
    `${label} needs its toolchain installed and the local server running.`
  );
  err.hint = `Start the local server (\`npx course-professor web\`)${command ? ` and make sure \`${command}\` is on your PATH` : ''}. The local runner writes files to ~/.professor/workspaces/ so you can also open them in your editor. You can still write and save code without running it.`;
  return err;
}

/** @param {Record<string,string>|Array<{path:string,content:string}>} files */
function fileMap(files) {
  if (!files) return {};
  return Array.isArray(files)
    ? Object.fromEntries(files.map((f) => [f.path, String(f.content ?? '')]))
    : Object.fromEntries(Object.entries(files).map(([k, v]) => [k, String(v ?? '')]));
}

/** Settings without throwing when localStorage is unavailable (worker/node/tests). */
function safeSettings() {
  try {
    return loadSettings();
  } catch {
    return {};
  }
}

export { checkToolchains, runnerBase };
