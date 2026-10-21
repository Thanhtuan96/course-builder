/**
 * studio-api.js — Express Router mounted at `/api/studio` (AI-06, DATA-04, DEPLOY-04).
 *
 * Three concerns, deliberately small:
 *
 *   1. Bridge (`/health`, `/complete`) — lets Studio stream from the learner's OWN local agent
 *      (Claude Code / OpenCode / Cursor CLI) or Ollama with no API key. See `studio-api/bridge.js`.
 *   2. Database (`/db/health`, `/db`) — see `studio-api/db.js`.
 *   3. Safety — composed Host/Origin/token/JSON guards on every route. See `studio-api/guards.js`.
 *
 * Importing this module has no side effects: it opens no database, writes no token and prints
 * nothing. `createStudioRouter` resolves a token only when neither `token` nor `getToken` is
 * supplied, and even then the quiet file-backed getter is lazy (D-04, D-06).
 *
 * Mount (see web/server.js):  `app.use('/api/studio', studioRouter);`
 */
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createStudioDb } from './studio-db.js';
import { createRunnerRouter } from './studio-runner.js';
import { installGuards, parseOrigins } from './studio-api/guards.js';
import { registerBridgeRoutes } from './studio-api/bridge.js';
import { registerDbRoutes } from './studio-api/db.js';
import { detectAgents, listAgentModels } from './studio-api/health.js';
import { defaultAgentRunners } from './studio-api/agents.js';
import * as security from './security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

export const VERSION = '1';
export const STUDIO_URL_HINT = 'http://localhost:5180';

/**
 * @deprecated Use `security.tokenFilePath(process.env)`. Kept only for the Phase 1 re-export
 * surface; this no longer points at the legacy `web/.studio-token`.
 */
export const TOKEN_FILE = security.tokenFilePath(process.env);

function flagEnabled(value) {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * Build the Studio Express Router.
 *
 * @param {object} [options]
 * @param {string} [options.token]          pairing token (test/back-compat)
 * @param {() => string} [options.getToken] pairing-token getter (preferred; observes rotation)
 * @param {Set<string>|string} [options.origins] allowed origins (default: STUDIO_ORIGINS)
 * @param {object} [options.db]             an existing studio-db instance (default: open ~/.professor)
 * @param {Record<string, Function>} [options.runners] agent runners (default: real CLI spawns)
 * @param {boolean} [options.allowNonLoopback] permit non-loopback clients (default: false)
 * @param {string[]} [options.extraHosts]   explicitly opted-in non-loopback hosts
 * @param {() => object} [options.capabilities] installer probe (default: detectAgents)
 * @param {(agent: string, deps: object) => Promise<object>} [options.listAgentModels] models resolver
 * @param {boolean} [options.probeReachable] probe Ollama reachability on /health (default: true)
 * @param {Map} [options.modelCache] session model cache (default: fresh per router)
 * @param {object} [options.runner] options forwarded to the Phase 29 runner router (studio-runner.js)
 * @param {(...a:any[])=>void} [options.log] logger (default: silent)
 * @returns {import('express').Router}
 */
export function createStudioRouter(options = {}) {
  const log = options.log || (() => {});
  const env = process.env;

  const db = options.db || createStudioDb({ log: (...a) => log('  [studio-db]', ...a) });

  const suppliedToken =
    typeof options.token === 'string' && options.token.length > 0 ? options.token : null;
  const suppliedGetter = typeof options.getToken === 'function' ? options.getToken : null;
  // Never generate or write a token during construction when one is supplied (D-04).
  const getToken =
    suppliedGetter ||
    (suppliedToken
      ? () => suppliedToken
      : security.createTokenGetter({ env, legacyFile: security.legacyTokenPath(REPO_ROOT) }));

  const origins =
    options.origins instanceof Set
      ? options.origins
      : parseOrigins(options.origins ?? env.STUDIO_ORIGINS);
  const runners = options.runners || defaultAgentRunners();
  const capabilities = options.capabilities || detectAgents;
  const listAgentModelsFn = options.listAgentModels || listAgentModels;
  const probeReachable = options.probeReachable !== false;
  const modelCache = options.modelCache || new Map();
  const allowNonLoopback =
    options.allowNonLoopback ?? flagEnabled(env.STUDIO_ALLOW_NON_LOOPBACK);
  const extraHosts =
    options.extraHosts ?? security.resolveExtraHosts({ env, host: env.HOST });

  const router = express.Router();

  // Guards: Host -> Origin/preflight -> token -> JSON content-type -> parser -> error mapper.
  installGuards(router, { getToken, origins, allowNonLoopback, extraHosts });

  /* -------------------------------------------------- local runner (Phase 29) */

  // Mounted INSIDE the guards above, so the runner inherits auth for free (HANDOFF-29 §1).
  router.use('/run', createRunnerRouter(options.runner));

  /* -------------------------------------------------- bridge */

  registerBridgeRoutes(router, {
    capabilities,
    probeReachable,
    env,
    runners,
    modelCache,
    listAgentModelsFn,
    log,
    version: VERSION,
  });

  /* -------------------------------------------------- database */

  registerDbRoutes(router, { db });

  router.__studio = { db, getToken, token: suppliedToken ?? undefined, origins };
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

let defaultRouter = null;
let defaultInitError = null;

/**
 * Default export: a fully silent, lazy request handler so `app.use('/api/studio', studioRouter)`
 * keeps working. No banner, no eager DB open and no token write at import time.
 */
export default function studioRouter(req, res, next) {
  if (defaultInitError) {
    res.status(503).json({
      ok: false,
      error: `Studio server failed to start: ${defaultInitError.message}`,
      code: 'server',
    });
    return;
  }
  if (!defaultRouter) {
    try {
      defaultRouter = createStudioRouter();
    } catch (err) {
      defaultInitError = err;
      res.status(503).json({
        ok: false,
        error: `Studio server failed to start: ${err.message}`,
        code: 'server',
      });
      return;
    }
  }
  return defaultRouter(req, res, next);
}

export { createStudioDb };

/* ------------------------------------------------------------------ re-exports */
/* Preserve the original public surface so importers need zero changes (Phase 1 D-01). */

export { DEFAULT_ORIGINS, parseOrigins } from './studio-api/guards.js';

export {
  AGENT_BINARIES,
  AGENT_PRIORITY,
  AGENT_LABELS,
  AGENT_MODEL_SUPPORT,
  AGENT_CURATED_MODELS,
  detectAgentLogin,
  detectAgents,
  probeOllama,
  parseOpencodeModels,
  parseAntigravityModels,
  parseCursorModels,
  curatedAgentModels,
  listAgentModels,
  firstMeaningfulStderr,
  diagnoseAgentFailure,
  describeNoOutput,
} from './studio-api/health.js';

export { flattenConversation, clampMessages } from './studio-api/bridge.js';

export {
  extractClaudeText,
  extractOpencodeText,
  extractGeminiText,
  extractAntigravityText,
  antigravityStep,
  antigravityErrorText,
  antigravityArgs,
  opencodeErrorText,
  claudeErrorText,
  geminiErrorText,
  defaultAgentRunners,
} from './studio-api/agents.js';
