/**
 * studio-api/guards.js — the single composed request-guard contract for every Studio API route.
 *
 * Order is fixed (D-11): Host -> Origin/preflight -> pairing token -> JSON content-type ->
 * `express.json` -> body-parser error mapping. Every predicate comes from `web/security.js`; this
 * module only wires them into Express.
 *
 * `DEFAULT_ORIGINS` / `parseOrigins` are re-exported so existing importers keep working (D-14).
 */
import express from 'express';
import { timingSafeEqual } from 'crypto';
import {
  DEFAULT_ORIGINS,
  isAllowedHost,
  isLoopbackAddress,
  isNullOrigin,
  isWildcardOrigins,
  parseOrigins,
  requiresJsonContentType,
} from '../security.js';

export { DEFAULT_ORIGINS, parseOrigins };

function forbiddenHost(res) {
  res.status(403).json({ ok: false, error: 'Forbidden host', code: 'forbidden_host' });
}

function forbiddenClient(res) {
  res.status(403).json({
    ok: false,
    error: 'Studio bridge accepts loopback clients only',
    code: 'forbidden_client',
  });
}

function forbiddenOrigin(res, origin) {
  res
    .status(403)
    .json({ ok: false, error: `Origin not allowed: ${origin}`, code: 'forbidden_origin' });
}

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Build the exact origin allowlist for a server: the security defaults, the server's own origin,
 * the Studio static origin, and Vite's 5173 only while legacy dev mode is active (D-28). A
 * pre-existing `STUDIO_ORIGINS` value is merged in (including the literal `*` escape hatch).
 *
 * @param {{ envValue?: string, ownPort?: number|string, legacyDev?: boolean,
 *           studioPort?: number|string }} [opts]
 * @returns {Set<string>}
 */
export function buildOriginSet({ envValue, ownPort, legacyDev = false, studioPort } = {}) {
  const set = parseOrigins(envValue == null || envValue === '' ? DEFAULT_ORIGINS : envValue);
  const addPort = (value) => {
    if (value === undefined || value === null || value === '') return;
    set.add(`http://localhost:${value}`);
    set.add(`http://127.0.0.1:${value}`);
  };
  addPort(ownPort);
  addPort(studioPort);
  if (legacyDev) {
    set.add('http://localhost:5173');
    set.add('http://127.0.0.1:5173');
  }
  return set;
}

/**
 * Install the composed guard stack on a router.
 *
 * @param {import('express').Router} router
 * @param {object} [options]
 * @param {string} [options.token] pairing token (static, back-compat)
 * @param {() => string} [options.getToken] token getter (preferred; observes rotation)
 * @param {Set<string>|string|string[]} [options.origins] exact origin allowlist
 * @param {boolean} [options.allowNonLoopback] relax the loopback client-address check
 * @param {string[]} [options.extraHosts] explicitly opted-in non-loopback hosts
 * @param {string|number} [options.jsonLimit] body size limit (default 25mb)
 */
export function installGuards(
  router,
  {
    token,
    getToken,
    origins = parseOrigins(),
    allowNonLoopback = false,
    extraHosts = [],
    jsonLimit = '25mb',
  } = {}
) {
  const readToken = typeof getToken === 'function' ? getToken : () => token;
  const originSet = origins instanceof Set ? origins : parseOrigins(origins);
  const allowAll = isWildcardOrigins(originSet);

  // 1. Host guard (raw header) plus the loopback client-address check.
  router.use((req, res, next) => {
    if (!isAllowedHost(req.headers?.host, { extraHosts })) {
      forbiddenHost(res);
      return;
    }
    if (!allowNonLoopback && !isLoopbackAddress(req.socket?.remoteAddress)) {
      forbiddenClient(res);
      return;
    }
    next();
  });

  // 2. Origin allowlist + preflight. An absent Origin continues to the token guard (D-13).
  router.use((req, res, next) => {
    const origin = req.get('Origin');

    if (origin !== undefined) {
      if (isNullOrigin(origin)) {
        forbiddenOrigin(res, origin);
        return;
      }
      if (!allowAll && !originSet.has(origin)) {
        forbiddenOrigin(res, origin);
        return;
      }
      // Echo the exact origin. Never emit `*` (D-22).
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Token');
    res.setHeader('Access-Control-Max-Age', '600');
    if (String(req.get('Access-Control-Request-Private-Network')).toLowerCase() === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }

    if (req.method === 'OPTIONS') {
      // A successful preflight is Host + Origin only: no token, no JSON body.
      res.status(204).end();
      return;
    }
    next();
  });

  // 3. Pairing token on every remaining route (including requests with no Origin).
  router.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }
    if (tokenMatches(req.get('X-Studio-Token'), readToken())) {
      next();
      return;
    }
    res
      .status(401)
      .json({ ok: false, error: 'Missing or invalid X-Studio-Token', code: 'unauthorized' });
  });

  // 4. JSON content-type gate before any parsing.
  router.use((req, res, next) => {
    if (requiresJsonContentType(req.method, req)) {
      res.status(415).json({
        ok: false,
        error: 'Content-Type must be application/json',
        code: 'unsupported_media_type',
      });
      return;
    }
    next();
  });

  router.use(express.json({ limit: jsonLimit, strict: true }));

  // 5. Map body-parser errors to machine-readable JSON (never Express's HTML page).
  router.use((err, req, res, next) => {
    if (!err) {
      next();
      return;
    }
    const type = err.type || err.code;
    if (type === 'entity.too.large') {
      res
        .status(413)
        .json({ ok: false, error: 'Request body too large', code: 'payload_too_large' });
      return;
    }
    if (type === 'charset.unsupported' || type === 'encoding.unsupported') {
      res.status(415).json({
        ok: false,
        error: 'Unsupported request encoding',
        code: 'unsupported_media_type',
      });
      return;
    }
    res.status(400).json({ ok: false, error: 'Invalid JSON body', code: 'invalid_json' });
  });
}
