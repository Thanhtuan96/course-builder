/**
 * Ollama provider — OpenAI-compatible streaming against the local daemon, plus `GET /api/tags`
 * for the installed-model dropdown.
 *
 * CORS: Ollama allows loopback origins by default; a deployed https origin must be added via
 * `OLLAMA_ORIGINS` and Ollama restarted. Local sources work best when Studio itself runs locally.
 */
import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { providerError, isAbortError } from './errors.js';
import { createGenerateJson } from './provider-utils.js';
import { localFetch, classifyNetworkError, mapHttpError, isPageLocal } from './fetch-local.js';

export const DEFAULT_BASE_URL = 'http://localhost:11434/v1';
/**
 * "Default" is resolved at run time from `GET /api/tags` (RON-208); there is deliberately no
 * hard-coded model here — naming one that is not installed makes every request fail with 404.
 * Kept as an export because callers import it as the "no explicit model" sentinel.
 */
export const DEFAULT_MODEL = '';

const CORS_HINT =
  'If this is the deployed site, tell Ollama to allow it: `OLLAMA_ORIGINS=<studio-origin> ollama serve` ' +
  '(or set the env var and restart the Ollama app), then retry. Local sources work best with `npm run dev`.';

/** Browser counterpart of the bridge's `OLLAMA_MODEL` (set `VITE_OLLAMA_MODEL` to pin one). */
function envModel() {
  const value = import.meta.env?.VITE_OLLAMA_MODEL;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The first installed model, preferring locally pulled ones: a `:cloud` entry can be retired by
 * Ollama's registry and then answers 410, while a pulled model always runs.
 * @param {string[]} names
 * @returns {string} the model name, or '' when nothing is installed
 */
export function pickFirstInstalledModel(names = []) {
  const installed = (Array.isArray(names) ? names : [])
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);
  return installed.find((name) => !/:cloud$/i.test(name)) || installed[0] || '';
}

/**
 * Map a non-OK Ollama HTTP response (RON-208). 404 means the model is not installed, 410 means
 * Ollama retired it; everything else keeps the shared mapping. The daemon's body is never surfaced
 * — it names internal registry state, and the UI shows localized copy for the code instead.
 * @param {Response} res
 * @param {{ what?: string }} [opts]
 */
export async function mapOllamaHttpError(res, { what = 'Ollama' } = {}) {
  if (res.status !== 404 && res.status !== 410) return mapHttpError(res, { what });
  try {
    await res.text();
  } catch {
    /* the body is intentionally discarded */
  }
  return providerError(res.status === 410 ? 'model_retired' : 'model_not_found');
}

/**
 * @param {{ baseUrl?: string, model?: string }} config
 */
export function createOllamaProvider({ baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL } = {}) {
  const nativeRoot = String(baseUrl || DEFAULT_BASE_URL).replace(/\/v1\/?$/, '');
  const configured = String(model || '').trim();
  let resolvedModel = configured || envModel();

  async function listModels() {
    const url = `${nativeRoot}/api/tags`;
    let res;
    try {
      res = await localFetch(url);
    } catch (err) {
      if (isAbortError(err)) throw providerError('aborted', 'Stopped');
      const mapped = classifyNetworkError(err, {
        url,
        what: 'Ollama',
        notRunningHint: 'Ollama is not running. Start it with `ollama serve`.',
      });
      if (mapped.code === 'cors' || mapped.code === 'local_network_blocked') mapped.hint = CORS_HINT;
      throw mapped;
    }
    if (!res.ok) throw await mapHttpError(res, { what: 'Ollama' });
    const json = await res.json().catch(() => ({}));
    return (json.models || []).map((m) => m.name).filter(Boolean);
  }

  /**
   * Explicit model → `VITE_OLLAMA_MODEL` → first installed. Cached after the first successful
   * listing so a long chat does not re-list on every turn.
   * @returns {Promise<string>}
   */
  async function resolveModel() {
    if (resolvedModel) return resolvedModel;
    const names = await listModels();
    const picked = pickFirstInstalledModel(names);
    if (!picked) throw providerError('model_not_found');
    resolvedModel = picked;
    return picked;
  }

  async function streamText(opts = {}) {
    const chosen = await resolveModel();
    const inner = createOpenAICompatibleProvider({
      baseUrl,
      apiKey: 'ollama',
      model: chosen,
      httpError: mapOllamaHttpError,
    });
    try {
      return await inner.streamText(opts);
    } catch (err) {
      // Surface a CORS-specific hint when we can't reach Ollama from a non-local page.
      if (err?.code === 'cors' || (err?.code === 'not_running' && !isPageLocal())) {
        throw providerError(
          isPageLocal() ? 'not_running' : 'cors',
          err.message,
          isPageLocal() ? 'Ollama is not running. Start it with `ollama serve`.' : CORS_HINT
        );
      }
      throw err;
    }
  }

  return {
    streamText,
    generateJson: createGenerateJson((opts) => streamText(opts)),
    label: 'Ollama',
    listModels,
    /** The model "Default" currently resolves to, or '' before the first listing. */
    get model() {
      return resolvedModel;
    },
  };
}
