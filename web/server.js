/**
 * web/server.js — side-effect-free application factory plus the process entry point.
 *
 * Importing this module binds no port, creates no directory, spawns nothing and logs nothing.
 * `createApp({ legacy })` builds the Express app; `startServer()` resolves the token, derives the
 * configuration and calls `listen`. Studio-only is the default; legacy mode is the single explicit
 * opt-in and requires `web/legacy-server.js` (Plan 03).
 */
import express from 'express';
import { createServer } from 'http';
import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createStudioRouter } from './studio-api.js';
import { buildOriginSet } from './studio-api/guards.js';
import { createStaticHandler } from '../bin/static-server.js';
import * as security from './security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const STUDIO_BUILD_MESSAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Professor Studio</title></head>
<body>
  <h1>Professor Studio build not found</h1>
  <p>Run <code>course-professor studio</code> or build Studio with <code>npm run build:studio</code>.</p>
</body></html>`;

const LEGACY_BUILD_MESSAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Professor Web UI</title></head>
<body>
  <h1>Legacy web build not found</h1>
  <p>Run <code>npm run build</code> from the repository root, or use Professor Studio.</p>
</body></html>`;

function defaultCoursesDir() {
  return process.env.COURSES_DIR || './courses';
}

function defaultStudioDist() {
  return process.env.STUDIO_DIST || join(REPO_ROOT, 'studio', 'dist');
}

/* ------------------------------------------------------------------ UI mounting */

function mountStaticUi(app, { root, buildMessage, log }) {
  const indexPath = join(root, 'index.html');
  const handler = createStaticHandler({ root, spaFallback: true, log });

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (!existsSync(indexPath)) {
      res.status(503).type('html').send(buildMessage);
      return;
    }
    handler(req, res, next);
  });
}

/* ------------------------------------------------------------------ app factory */

/**
 * Build the Express application. Never binds a port, resolves a token, spawns a process or creates
 * a directory; tests inject a temp DB, courses dir and Studio dist.
 *
 * Exactly one UI is served at `/` (D-24):
 *   - Studio-only: `studio/dist` (503 build message when missing)
 *   - legacy production: `legacyDist` (default `web/client/dist`)
 *   - legacy dev: no UI on this port (Vite on 5173 owns it)
 *
 * @param {object} [options]
 * @param {boolean} [options.legacy] serve the legacy API/UI (requires web/legacy-server.js)
 * @param {string} [options.nodeEnv]
 * @param {string} [options.token] static pairing token
 * @param {() => string} [options.getToken] pairing-token getter
 * @param {Set<string>|string} [options.origins]
 * @param {object} [options.db]
 * @param {string} [options.coursesDir]
 * @param {string} [options.studioDist]
 * @param {string} [options.legacyDist]
 * @param {(...a:any[])=>void} [options.log]
 * @param {Record<string, Function>} [options.runners]
 * @param {Record<string, Function>} [options.legacyRunners] legacy chat agent runners
 * @param {() => object} [options.capabilities]
 * @param {object} [options.capabilityCache] legacy capability TTL cache (tests)
 * @param {boolean} [options.useCli] result of the one-time Claude CLI probe
 * @param {Function} [options.spawnImpl]
 * @param {boolean} [options.allowNonLoopback]
 * @param {string[]} [options.extraHosts]
 * @returns {Promise<import('express').Express>}
 */
export async function createApp({
  legacy = false,
  nodeEnv = process.env.NODE_ENV || 'development',
  token,
  getToken,
  origins,
  db,
  coursesDir = defaultCoursesDir(),
  studioDist = defaultStudioDist(),
  legacyDist = join(__dirname, 'client', 'dist'),
  log = console.log,
  runners,
  legacyRunners,
  capabilities,
  capabilityCache,
  useCli = false,
  spawnImpl,
  allowNonLoopback = false,
  extraHosts,
} = {}) {
  const resolvedExtraHosts =
    extraHosts ?? security.resolveExtraHosts({ env: process.env, host: process.env.HOST });

  const app = express();

  // Global Host guard (covers static assets too). Token/Origin/JSON stay on the API routers.
  app.use((req, res, next) => {
    if (!security.isAllowedHost(req.headers?.host, { extraHosts: resolvedExtraHosts })) {
      res.status(403).json({ ok: false, error: 'Forbidden host', code: 'forbidden_host' });
      return;
    }
    if (!allowNonLoopback && !security.isLoopbackAddress(req.socket?.remoteAddress)) {
      res.status(403).json({
        ok: false,
        error: 'Studio bridge accepts loopback clients only',
        code: 'forbidden_client',
      });
      return;
    }
    next();
  });

  app.use(
    '/api/studio',
    createStudioRouter({
      token,
      getToken,
      origins,
      allowNonLoopback,
      extraHosts: resolvedExtraHosts,
      db,
      runners,
      capabilities,
      log,
    })
  );

  if (legacy) {
    let legacyModule;
    try {
      legacyModule = await import('./legacy-server.js');
    } catch (cause) {
      const err = new Error(
        'Legacy mode requires web/legacy-server.js. ' +
          'Install the full package or run without --legacy.'
      );
      err.code = 'legacy_unavailable';
      err.cause = cause;
      throw err;
    }
    if (typeof legacyModule.createLegacyRouter !== 'function') {
      const err = new Error('web/legacy-server.js does not export createLegacyRouter.');
      err.code = 'legacy_unavailable';
      throw err;
    }
    const legacyGetToken =
      typeof getToken === 'function'
        ? getToken
        : typeof token === 'string'
          ? () => token
          : undefined;

    app.use(
      legacyModule.createLegacyRouter({
        coursesDir,
        token,
        getToken: legacyGetToken,
        origins,
        allowNonLoopback,
        extraHosts: resolvedExtraHosts,
        spawnImpl,
        capabilities,
        capabilityCache,
        useCli,
        runners: legacyRunners,
        log,
      })
    );
  }

  // API 404 before any UI fallback so `/api/*` can never return HTML.
  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: 'Not found', code: 'not_found' });
  });

  if (!legacy) {
    mountStaticUi(app, { root: studioDist, buildMessage: STUDIO_BUILD_MESSAGE, log });
  } else if (nodeEnv === 'production') {
    mountStaticUi(app, { root: legacyDist, buildMessage: LEGACY_BUILD_MESSAGE, log });
  } else {
    // Legacy dev: Vite owns the UI on 5173. Never serve Studio's index on this port.
    app.get('/', (req, res) => {
      res
        .status(200)
        .type('html')
        .send(
          '<!doctype html><html><body><h1>Legacy UI runs on Vite</h1>' +
            '<p>Open <a href="http://localhost:5173">http://localhost:5173</a>.</p></body></html>'
        );
    });
  }

  return app;
}

/* ------------------------------------------------------------------ entry point */

/**
 * Resolve configuration, build the app and bind the server.
 *
 * @param {object} [options]
 * @param {number|string} [options.port]
 * @param {string} [options.host]
 * @param {boolean} [options.legacy]
 * @param {Record<string,string|undefined>} [options.env]
 * @param {string[]} [options.argv]
 * @param {boolean} [options.logBanner]
 * @returns {Promise<{ app: import('express').Express, server: import('http').Server,
 *                     token: string, origins: Set<string>, uiUrl: string,
 *                     close: () => Promise<void> }>}
 */
export async function startServer({
  port,
  host,
  legacy,
  env = process.env,
  argv = process.argv,
  logBanner,
  spawnImpl,
  platform,
  ...appOptions
} = {}) {
  const legacyEnabled =
    legacy === true || env.PROFESSOR_LEGACY === '1' || argv.includes('--legacy');
  const nodeEnv = appOptions.nodeEnv ?? env.NODE_ENV ?? 'development';
  const resolvedPort = port ?? env.PORT ?? 3000;
  const resolvedHost = host ?? env.HOST ?? '127.0.0.1';

  if (['0.0.0.0', '::', '*', '[::]'].includes(String(resolvedHost))) {
    const err = new Error(`Refusing to bind a wildcard host: ${resolvedHost}`);
    err.code = 'insecure_config';
    throw err;
  }

  const extraHosts = security.resolveExtraHosts({ env, host: resolvedHost });
  const optIn = security.isNonLoopbackOptIn(env);
  const legacyFile = security.legacyTokenPath(REPO_ROOT);

  const { token: explicitToken, getToken: explicitGetter, origins: explicitOrigins, ...rest } =
    appOptions;

  const token = explicitToken ?? security.ensureStudioToken({ env, legacyFile });
  const getToken = explicitGetter ?? security.createTokenGetter({ env, legacyFile });
  const origins =
    explicitOrigins ??
    buildOriginSet({
      envValue: env.STUDIO_ORIGINS,
      ownPort: resolvedPort,
      legacyDev: legacyEnabled && nodeEnv !== 'production',
      studioPort: env.STUDIO_STATIC_PORT,
    });

  if (security.isWildcardOrigins(origins) && optIn) {
    const err = new Error(
      'STUDIO_ORIGINS=* cannot be combined with STUDIO_ALLOW_NON_LOOPBACK; refusing to start.'
    );
    err.code = 'insecure_config';
    throw err;
  }
  if (optIn) {
    console.error(
      '[security] STUDIO_ALLOW_NON_LOOPBACK is enabled: non-loopback clients/hosts are allowed. ' +
        'Only do this on a trusted network.'
    );
  } else if (security.isWildcardOrigins(origins)) {
    console.error(
      '[security] STUDIO_ORIGINS=* is enabled: any non-null Origin is echoed (never `*`). ' +
        'Only do this while paired on a trusted machine.'
    );
  }

  let legacyModule = null;
  let useCli = appOptions.useCli;
  if (legacyEnabled) {
    console.error(
      '[deprecated] Legacy web UI is enabled. Use Professor Studio at http://localhost:5180.'
    );
    legacyModule = await import('./legacy-server.js');
    if (useCli === undefined) useCli = legacyModule.claudeCLIAvailable({ platform });
  }

  const app = await createApp({
    ...rest,
    legacy: legacyEnabled,
    nodeEnv,
    token,
    getToken,
    origins,
    coursesDir: rest.coursesDir ?? env.COURSES_DIR ?? './courses',
    studioDist: rest.studioDist ?? env.STUDIO_DIST ?? join(REPO_ROOT, 'studio', 'dist'),
    legacyDist:
      rest.legacyDist ?? env.LEGACY_DIST ?? join(REPO_ROOT, 'web', 'client', 'dist'),
    useCli,
    spawnImpl,
    extraHosts,
    allowNonLoopback: rest.allowNonLoopback ?? (optIn || extraHosts.length > 0),
  });

  const server = createServer(app);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(resolvedPort, resolvedHost, () => {
      server.removeListener('error', reject);
      resolveListen();
    });
  });

  const uiUrl =
    legacyEnabled && nodeEnv !== 'production'
      ? 'http://localhost:5173'
      : `http://localhost:${resolvedPort}`;

  let legacyDev = null;
  if (legacyEnabled && nodeEnv !== 'production') {
    legacyDev = legacyModule.startLegacyDevServer({
      clientDir: join(REPO_ROOT, 'web', 'client'),
      spawnImpl,
      platform,
      log: appOptions.log ?? console.log,
    });
  }

  let pairingUrl = `${uiUrl}/#token=${encodeURIComponent(token)}`;
  if (Number(resolvedPort) !== 3000) {
    pairingUrl += `&bridge=${encodeURIComponent(`http://localhost:${resolvedPort}`)}`;
  }

  if (logBanner !== false) {
    const output = [
      '',
      '┌─ Professor Studio ───────────────────────────────────────────',
      `│ UI:              ${uiUrl}`,
      `│ Pairing token:   ${security.maskToken(token)}`,
      `│ Pairing URL:     ${pairingUrl}`,
      `│ Allowed origins: ${[...origins].join(', ')}`,
      '└──────────────────────────────────────────────────────────────',
      '',
    ].join('\n');
    (appOptions.log ?? console.log)(output);
  }

  const close = () =>
    new Promise((resolveClose) => {
      legacyDev?.kill?.();
      if (!server.listening) {
        resolveClose();
        return;
      }
      server.close(() => resolveClose());
    });

  return { app, server, token, origins, uiUrl, close };
}

/* ------------------------------------------------------------------ process entry */

const entryPath = process.argv[1];
const isEntryPoint =
  Boolean(entryPath) && pathToFileURL(resolve(entryPath)).href === import.meta.url;

if (isEntryPoint) {
  startServer().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}
