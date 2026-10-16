/**
 * studio-api.js — Express Router mounted at `/api/studio` (AI-06, DATA-04, DEPLOY-04).
 *
 * Three concerns, deliberately small:
 *
 *   1. Bridge (`/health`, `/complete`) — lets Studio stream from the learner's OWN local agent
 *      (Claude Code / OpenCode / Cursor CLI) or Ollama with no API key. See `studio-api/bridge.js`.
 *   2. Database (`/db/health`, `/db`) — see `studio-api/db.js`.
 *   3. Safety — origin allowlist (STUDIO_ORIGINS) + `X-Studio-Token` pairing token on every route.
 *      See `studio-api/guards.js`.
 *
 * Phase 1 split the original monolith into focused modules; this file is now a thin composition that
 * re-exports every symbol it used to export, so `web/server.js` and the test suites are unchanged.
 *
 * Mount (see web/server.js):  `app.use('/api/studio', studioRouter);`
 */
import express from 'express';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createStudioDb } from './studio-db.js';
import { createRunnerRouter } from './studio-runner.js';
import { installGuards, parseOrigins } from './studio-api/guards.js';
import { registerBridgeRoutes } from './studio-api/bridge.js';
import { registerDbRoutes } from './studio-api/db.js';
import { detectAgents, listAgentModels } from './studio-api/health.js';
import { defaultAgentRunners } from './studio-api/agents.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const VERSION = '1';
export const STUDIO_URL_HINT = 'http://localhost:5180';
export const TOKEN_FILE = join(__dirname, '.studio-token');

/* ------------------------------------------------------------------ router */

function resolveToken(env, log) {
  if (env.STUDIO_BRIDGE_TOKEN) return env.STUDIO_BRIDGE_TOKEN;
  const token = randomBytes(24).toString('hex');
  try {
    writeFileSync(TOKEN_FILE, `${token}\n`, { mode: 0o600 });
  } catch (err) {
    log(`⚠️  Could not write ${TOKEN_FILE}: ${err.message}`);
  }
  return token;
}

function printBanner(token, origins, log) {
  log(
    [
      '',
      '┌─ Studio bridge ──────────────────────────────────────────────',
      `│ Studio URL:     ${STUDIO_URL_HINT}`,
      `│ Pairing token:  ${token}`,
      `│ Token file:     ${TOKEN_FILE}`,
      `│ Allowed origins: ${[...origins].join(', ')}`,
      '└──────────────────────────────────────────────────────────────',
      '  Paste the pairing token into Studio → Settings → My local agent.',
      '',
    ].join('\n')
  );
}

/**
 * Build the Studio Express Router.
 *
 * @param {object} [options]
 * @param {string} [options.token]          pairing token (default: env or generated + persisted)
 * @param {Set<string>|string} [options.origins] allowed origins (default: STUDIO_ORIGINS)
 * @param {object} [options.db]             an existing studio-db instance (default: open ~/.professor)
 * @param {Record<string, Function>} [options.runners] agent runners (default: real CLI spawns)
 * @param {boolean} [options.announce]      write token file + print banner (default: false)
 * @param {boolean} [options.allowNonLoopback] permit non-loopback clients (default: false)
 * @param {() => object} [options.capabilities] installer probe (default: detectAgents)
 * @param {(agent: string, deps: object) => Promise<object>} [options.listAgentModels] models resolver
 * @param {boolean} [options.probeReachable] probe Ollama reachability on /health (default: true)
 * @param {Map} [options.modelCache] session model cache (default: fresh per router)
 * @param {object} [options.runner] options forwarded to the Phase 29 runner router (studio-runner.js)
 * @param {(...a:any[])=>void} [options.log] logger
 * @returns {import('express').Router}
 */
export function createStudioRouter(options = {}) {
  const log = options.log || ((...a) => console.log(...a));
  const env = process.env;

  const db = options.db || createStudioDb({ log: (...a) => log('  [studio-db]', ...a) });
  const token = options.token || resolveToken(env, log);
  const origins = options.origins instanceof Set ? options.origins : parseOrigins(options.origins ?? env.STUDIO_ORIGINS);
  const runners = options.runners || defaultAgentRunners();
  const capabilities = options.capabilities || detectAgents;
  const listAgentModelsFn = options.listAgentModels || listAgentModels;
  const probeReachable = options.probeReachable !== false;
  const modelCache = options.modelCache || new Map();
  const allowNonLoopback = options.allowNonLoopback ?? Boolean(env.STUDIO_ALLOW_NON_LOOPBACK);

  if (options.announce) printBanner(token, origins, log);

  const router = express.Router();

  // Guards: JSON body parser → loopback → CORS/preflight → pairing token (exact order preserved).
  installGuards(router, { token, origins, allowNonLoopback });

  /* -------------------------------------------------- local runner (Phase 29) */

  // Mounted INSIDE the token/CORS guard above, so the runner inherits auth for free (HANDOFF-29 §1).
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

  router.__studio = { db, token, origins };
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

const IS_TEST = Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
let defaultRouter = null;
let defaultInitError = null;

// Eagerly open the DB + print the pairing-token banner at server startup (never during tests).
if (!IS_TEST) {
  try {
    defaultRouter = createStudioRouter({ announce: true });
  } catch (err) {
    defaultInitError = err;
  }
}

/** Default export: a request handler so `app.use('/api/studio', studioRouter)` needs no change. */
export default function studioRouter(req, res, next) {
  if (defaultInitError) {
    res.status(503).json({ ok: false, error: `Studio server failed to start: ${defaultInitError.message}`, code: 'server' });
    return;
  }
  if (!defaultRouter) {
    try {
      defaultRouter = createStudioRouter({ announce: true });
    } catch (err) {
      defaultInitError = err;
      res.status(503).json({ ok: false, error: `Studio server failed to start: ${err.message}`, code: 'server' });
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
