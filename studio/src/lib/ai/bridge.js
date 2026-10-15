/**
 * Local agent bridge client (AI-06).
 *
 * Talks to the Studio routes added to `web/server.js` (Phase 26). No API key — the learner's own
 * Claude Code / OpenCode / Cursor subscription does the work.
 *
 * Contract (server side lands in Phase 26):
 *   GET  {bridgeUrl}/api/studio/health   header X-Studio-Token
 *        -> { ok, agents: { claude, opencode, cursor, ollama } }
 *   POST {bridgeUrl}/api/studio/complete body { system, messages, agent?, model? }
 *        -> SSE:  data: {"text":"…"} … data: {"error":"…","code":"…"} … data: [DONE]
 */
import { parseSSE } from './sse.js';
import { createGenerateJson, MAX_TOKENS } from './provider-utils.js';
import { providerError, isAbortError, ProviderError } from './errors.js';
import { localFetch, classifyNetworkError, mapHttpError } from './fetch-local.js';

export const DEFAULT_BRIDGE_URL = 'http://localhost:3000';
const RUN_HINT = 'Run `npx course-professor web` (or `npm start` in the repo), then retry.';

/**
 * @param {{ bridgeUrl?: string, bridgeToken?: string, agent?: string, model?: string }} config
 */
export function createBridgeProvider({ bridgeUrl = DEFAULT_BRIDGE_URL, bridgeToken, agent, model } = {}) {
  const root = String(bridgeUrl || '').replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
    ...(bridgeToken ? { 'X-Studio-Token': bridgeToken } : {}),
  };

  async function streamText({ system, messages = [], signal, onText, maxTokens } = {}) {
    const url = `${root}/api/studio/complete`;
    let res;
    try {
      res = await localFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ system, messages, agent: agent || undefined, model: model || undefined }),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw providerError('aborted', 'Stopped');
      const mapped = classifyNetworkError(err, { url, what: 'the local agent bridge', notRunningHint: RUN_HINT });
      if (mapped.code === 'not_running') mapped.hint = RUN_HINT;
      throw mapped;
    }
    if (!res.ok) {
      const err = await mapHttpError(res, { what: 'the bridge' });
      if (err.code === 'auth') err.hint = 'The pairing token is missing or wrong — copy it from the server output into Settings.';
      throw err;
    }
    if (!res.body) throw providerError('unknown', 'The bridge returned no stream');

    let full = '';
    for await (const data of parseSSE(res)) {
      if (data === '[DONE]') break;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) throw new ProviderError(String(json.code || 'unknown'), json.error, RUN_HINT);
      if (typeof json.text === 'string') {
        full += json.text;
        onText?.(json.text);
      }
    }
    return full;
  }

  return {
    streamText,
    generateJson: createGenerateJson(streamText),
    label: 'Local agent',
    /** @returns {Promise<{ ok: boolean, agents: Record<string, boolean> }>} */
    async health() {
      const url = `${root}/api/studio/health`;
      let res;
      try {
        res = await localFetch(url, { headers });
      } catch (err) {
        const mapped = classifyNetworkError(err, { url, what: 'the local agent bridge', notRunningHint: RUN_HINT });
        if (mapped.code === 'not_running') mapped.hint = RUN_HINT;
        throw mapped;
      }
      if (!res.ok) throw await mapHttpError(res, { what: 'the bridge' });
      return res.json();
    },
  };
}

// Re-export the error class so consumers of this module get one import for ProviderError too.
export { ProviderError } from './errors.js';
export { MAX_TOKENS };
