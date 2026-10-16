/**
 * studio-api/guards.js — request guards for the Studio bridge.
 *
 * Installs, in the exact historical order: the JSON body parser, the loopback-only guard, the CORS
 * allowlist + preflight handler, and the `X-Studio-Token` pairing guard. Extracted from
 * `web/studio-api.js` (Phase 1 seam split) with no behavior change.
 */
import express from 'express';
import { timingSafeEqual } from 'crypto';

export const DEFAULT_ORIGINS = 'http://localhost:5180,http://127.0.0.1:5180';

/** @param {string} value @returns {Set<string>} */
export function parseOrigins(value = DEFAULT_ORIGINS) {
  const set = new Set(
    String(value)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.size ? set : new Set(DEFAULT_ORIGINS.split(','));
}

function isLoopback(addr) {
  if (!addr) return false;
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1' ||
    addr.startsWith('127.') ||
    addr.startsWith('::ffff:127.')
  );
}

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Install the four request guards on a router, in order.
 *
 * @param {import('express').Router} router
 * @param {{ token: string, origins: Set<string>, allowNonLoopback?: boolean }} opts
 */
export function installGuards(router, { token, origins, allowNonLoopback = false }) {
  // Body parser (mounted before the server's global one for this path).
  router.use(express.json({ limit: '25mb' }));

  // Loopback-only unless explicitly opened up.
  router.use((req, res, next) => {
    if (allowNonLoopback || isLoopback(req.socket?.remoteAddress)) return next();
    res.status(403).json({ ok: false, error: 'Studio bridge accepts loopback clients only', code: 'forbidden_client' });
  });

  // CORS allowlist + preflight.
  router.use((req, res, next) => {
    const origin = req.get('Origin');
    const allowAll = origins.has('*');
    if (origin && !allowAll && !origins.has(origin)) {
      res.status(403).json({ ok: false, error: `Origin not allowed: ${origin}`, code: 'forbidden_origin' });
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Token');
    res.setHeader('Access-Control-Max-Age', '600');
    if (String(req.get('Access-Control-Request-Private-Network')).toLowerCase() === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Pairing token on every route.
  router.use((req, res, next) => {
    if (tokenMatches(req.get('X-Studio-Token'), token)) return next();
    res
      .status(401)
      .json({ ok: false, error: 'Missing or invalid X-Studio-Token', code: 'unauthorized' });
  });
}
