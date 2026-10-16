/**
 * studio-api/bridge.js — the agent bridge routes: `/health`, `/agents/:agent/models`, `/complete`.
 *
 * Extracted verbatim from `web/studio-api.js` (Phase 1 seam split). The SSE shape MUST match
 * `studio/src/lib/ai/bridge.js` exactly:
 *     data: {"text":"…"}            (per token)
 *     data: {"error":"…","code":"…"} (on failure, then end)
 *     data: [DONE]
 */
import { AGENT_BINARIES, AGENT_PRIORITY, AGENT_LABELS, probeOllama } from './health.js';

const MAX_MESSAGES = 60;
const MAX_CHARS = 200_000;
// Keep the SSE socket warm while a coding-agent CLI boots (Claude ≈11 s, OpenCode ≈28 s).
const HEARTBEAT_MS = 15_000;

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

/**
 * Register the bridge routes on a router already protected by `guards.js`.
 *
 * @param {import('express').Router} router
 * @param {{
 *   capabilities: () => object,
 *   probeReachable: boolean,
 *   env: NodeJS.ProcessEnv,
 *   runners: Record<string, Function>,
 *   modelCache: Map,
 *   listAgentModelsFn: Function,
 *   log: (...a:any[]) => void,
 *   version: string,
 * }} ctx
 */
export function registerBridgeRoutes(router, { capabilities, probeReachable, env, runners, modelCache, listAgentModelsFn, log, version }) {
  router.get('/health', async (req, res) => {
    const agents = { ...capabilities() };
    // Probe Ollama reachability on demand — only when the binary exists and callers didn't supply
    // their own capability map (tests inject a static map).
    if (probeReachable && agents.ollama?.installed && agents.ollama.reachable === undefined) {
      agents.ollama = { ...agents.ollama, reachable: await probeOllama(env) };
    }
    res.json({ ok: true, version, agents });
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
}
