/**
 * Ollama provider — OpenAI-compatible streaming against the local daemon, plus `GET /api/tags`
 * for the installed-model dropdown.
 *
 * CORS: Ollama allows loopback origins by default; a deployed https origin must be added via
 * `OLLAMA_ORIGINS` and Ollama restarted. Local sources work best when Studio itself runs locally.
 */
import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { providerError, isAbortError } from './errors.js';
import { localFetch, classifyNetworkError, mapHttpError, isPageLocal } from './fetch-local.js';

export const DEFAULT_BASE_URL = 'http://localhost:11434/v1';
export const DEFAULT_MODEL = 'llama3.2';

const CORS_HINT =
  'If this is the deployed site, tell Ollama to allow it: `OLLAMA_ORIGINS=<studio-origin> ollama serve` ' +
  '(or set the env var and restart the Ollama app), then retry. Local sources work best with `npm run dev`.';

/**
 * @param {{ baseUrl?: string, model?: string }} config
 */
export function createOllamaProvider({ baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL } = {}) {
  const inner = createOpenAICompatibleProvider({ baseUrl, apiKey: 'ollama', model });
  const nativeRoot = String(baseUrl || DEFAULT_BASE_URL).replace(/\/v1\/?$/, '');

  async function streamText(opts) {
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
    generateJson: inner.generateJson,
    label: 'Ollama',
    async listModels() {
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
    },
  };
}
