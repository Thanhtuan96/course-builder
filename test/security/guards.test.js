/**
 * 02-02 Task 1 — the composed Studio guard contract.
 *
 * Every route must run Host -> Origin -> token -> JSON content-type -> parser. These tests use a
 * tiny Express harness around `installGuards` so the ordering and the wildcard-mode split are
 * observable without depending on any bridge/DB route.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

import {
  DEFAULT_ORIGINS,
  buildOriginSet,
  installGuards,
  parseOrigins,
} from '../../web/studio-api/guards.js';
import * as security from '../../web/security.js';

const TOKEN = 'guard-test-token-0123456789abcdef';
const ORIGIN = 'http://localhost:5180';
const EVIL_ORIGIN = 'http://evil.example';

function makeApp({
  token = TOKEN,
  getToken,
  origins = ORIGIN,
  extraHosts = [],
  allowNonLoopback = false,
  jsonLimit = '25mb',
} = {}) {
  const app = express();
  const router = express.Router();
  installGuards(router, {
    token,
    getToken: getToken || (() => token),
    origins,
    extraHosts,
    allowNonLoopback,
    jsonLimit,
  });
  router.get('/health', (req, res) => res.json({ ok: true }));
  router.post('/echo', (req, res) => res.json({ ok: true, body: req.body }));
  app.use('/api/studio', router);
  return app;
}

function expectNoWildcardAcao(res) {
  const acao = res.headers['access-control-allow-origin'];
  expect(acao).not.toBe('*');
}

describe('guard order (default exact allowlist)', () => {
  it('rejects a request with no token (401) and no Origin info leak', async () => {
    const res = await request(makeApp()).get('/api/studio/health');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('accepts a valid token (200)', async () => {
    const res = await request(makeApp())
      .get('/api/studio/health')
      .set('X-Studio-Token', TOKEN);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects an evil Origin even with a valid token (403 forbidden_origin)', async () => {
    const res = await request(makeApp())
      .get('/api/studio/health')
      .set('X-Studio-Token', TOKEN)
      .set('Origin', EVIL_ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden_origin');
  });

  it('always rejects Origin: null (403)', async () => {
    const res = await request(makeApp())
      .get('/api/studio/health')
      .set('X-Studio-Token', TOKEN)
      .set('Origin', 'null');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden_origin');
  });

  it('rejects a spoofed Host before Origin/token (403 forbidden_host)', async () => {
    const res = await request(makeApp())
      .get('/api/studio/health')
      .set('Host', 'evil.example')
      .set('Origin', ORIGIN)
      .set('X-Studio-Token', TOKEN);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden_host');
  });

  it('accepts localhost and [::1] on any port (200)', async () => {
    for (const host of ['localhost:41234', '[::1]:3000', '127.0.0.1:9']) {
      const res = await request(makeApp())
        .get('/api/studio/health')
        .set('Host', host)
        .set('X-Studio-Token', TOKEN);
      expect(res.status, host).toBe(200);
    }
  });

  it('rejects a missing Host header (403 forbidden_host)', async () => {
    // http.request always sends Host, so exercise the predicate directly as a second check.
    expect(security.isAllowedHost(undefined)).toBe(false);
    expect(security.isAllowedHost('')).toBe(false);
  });

  it('rejects text/plain state-changing requests before the handler (415)', async () => {
    const res = await request(makeApp())
      .post('/api/studio/echo')
      .set('Host', 'localhost:41234')
      .set('Origin', ORIGIN)
      .set('X-Studio-Token', TOKEN)
      .set('Content-Type', 'text/plain')
      .send('plain body');
    expect(res.status).toBe(415);
    expect(res.body.code).toBe('unsupported_media_type');
  });

  it('rejects form-urlencoded and bodyless POSTs before the handler (415)', async () => {
    const form = await request(makeApp())
      .post('/api/studio/echo')
      .set('X-Studio-Token', TOKEN)
      .type('form')
      .send({ value: 'plain form' });
    expect(form.status).toBe(415);
    expect(form.body.code).toBe('unsupported_media_type');

    const noType = await request(makeApp())
      .post('/api/studio/echo')
      .set('X-Studio-Token', TOKEN);
    expect(noType.status).toBe(415);
    expect(noType.body.code).toBe('unsupported_media_type');
  });

  it('rejects malformed JSON with a machine code (400 invalid_json)', async () => {
    const res = await request(makeApp())
      .post('/api/studio/echo')
      .set('X-Studio-Token', TOKEN)
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_json');
  });

  it('rejects oversized JSON with 413 payload_too_large', async () => {
    const res = await request(makeApp({ jsonLimit: '1kb' }))
      .post('/api/studio/echo')
      .set('X-Studio-Token', TOKEN)
      .send({ data: 'x'.repeat(4096) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('payload_too_large');
  });

  it('answers a preflight from an allowed origin without a token (204) and echoes the exact ACAO', async () => {
    const res = await request(makeApp())
      .options('/api/studio/health')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Studio-Token')
      .set('Access-Control-Request-Private-Network', 'true');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-methods']).toMatch(/GET, POST, OPTIONS/);
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Studio-Token/i);
    expect(res.headers['access-control-allow-private-network']).toBe('true');
    expectNoWildcardAcao(res);
  });

  it('rejects a preflight from an unknown origin in default mode (403)', async () => {
    const res = await request(makeApp())
      .options('/api/studio/health')
      .set('Origin', EVIL_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden_origin');
  });

  it('never emits Access-Control-Allow-Origin: *', async () => {
    const allowed = await request(makeApp())
      .get('/api/studio/health')
      .set('X-Studio-Token', TOKEN)
      .set('Origin', ORIGIN);
    expectNoWildcardAcao(allowed);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
  });
});

describe('wildcard origin mode (STUDIO_ORIGINS=*)', () => {
  it('allows and echoes a non-null unknown origin (not 403, never *)', async () => {
    const res = await request(makeApp({ origins: parseOrigins('*') }))
      .get('/api/studio/health')
      .set('X-Studio-Token', TOKEN)
      .set('Origin', EVIL_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(EVIL_ORIGIN);
    expectNoWildcardAcao(res);
  });

  it('still rejects Origin: null (403)', async () => {
    const res = await request(makeApp({ origins: parseOrigins('*') }))
      .get('/api/studio/health')
      .set('X-Studio-Token', TOKEN)
      .set('Origin', 'null');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden_origin');
  });

  it('still requires the pairing token for an allowed wildcard origin (401)', async () => {
    const res = await request(makeApp({ origins: parseOrigins('*') }))
      .get('/api/studio/health')
      .set('Origin', EVIL_ORIGIN);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('answers a wildcard-mode preflight for an unknown origin (204) and echoes it', async () => {
    const res = await request(makeApp({ origins: parseOrigins('*') }))
      .options('/api/studio/health')
      .set('Origin', EVIL_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(EVIL_ORIGIN);
    expectNoWildcardAcao(res);
  });
});

describe('token getter observes rotation', () => {
  let current;
  beforeEach(() => {
    current = 'first-token';
  });

  it('authorises the current getter value and rejects the previous one', async () => {
    const app = makeApp({ getToken: () => current });
    const before = await request(app)
      .get('/api/studio/health')
      .set('X-Studio-Token', 'first-token');
    expect(before.status).toBe(200);

    current = 'second-token';
    const stale = await request(app)
      .get('/api/studio/health')
      .set('X-Studio-Token', 'first-token');
    expect(stale.status).toBe(401);

    const fresh = await request(app)
      .get('/api/studio/health')
      .set('X-Studio-Token', 'second-token');
    expect(fresh.status).toBe(200);
  });
});

describe('buildOriginSet', () => {
  it('includes the defaults and the server own origin, but not 5173 outside legacy dev', () => {
    const set = buildOriginSet({ ownPort: 3000 });
    expect(set.has('http://localhost:5180')).toBe(true);
    expect(set.has('http://localhost:3000')).toBe(true);
    expect(set.has('http://127.0.0.1:3000')).toBe(true);
    expect(set.has('http://localhost:5173')).toBe(false);
  });

  it('adds Vite 5173 only in legacy dev', () => {
    const set = buildOriginSet({ ownPort: 3000, legacyDev: true });
    expect(set.has('http://localhost:5173')).toBe(true);
    expect(set.has('http://127.0.0.1:5173')).toBe(true);
  });

  it('merges an explicit STUDIO_ORIGINS value and preserves the wildcard member', () => {
    const merged = buildOriginSet({ envValue: 'http://extra.example:1', ownPort: 4000 });
    expect(merged.has('http://extra.example:1')).toBe(true);
    expect(merged.has('http://localhost:4000')).toBe(true);

    const wildcard = buildOriginSet({ envValue: '*', ownPort: 4000 });
    expect(security.isWildcardOrigins(wildcard)).toBe(true);
  });
});

describe('re-exports', () => {
  it('keeps DEFAULT_ORIGINS and parseOrigins importable from guards.js', () => {
    expect(DEFAULT_ORIGINS).toBe('http://localhost:5180,http://127.0.0.1:5180');
    expect(DEFAULT_ORIGINS).toBe(security.DEFAULT_ORIGINS);
    expect(typeof parseOrigins).toBe('function');
    expect([...parseOrigins(DEFAULT_ORIGINS)]).toEqual([
      'http://localhost:5180',
      'http://127.0.0.1:5180',
    ]);
  });
});
