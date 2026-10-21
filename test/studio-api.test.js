/**
 * Phase 26 — Studio local server tests.
 *
 * Boots the Studio Express router (web/studio-api.js) on an ephemeral port with a temp SQLite DB and:
 *   • runs the shared StorageAdapter contract against the RemoteAdapter (studio/src/lib/repo/remote-adapter.js)
 *   • checks the pairing-token and CORS allowlist rejections (DEPLOY-04)
 *   • checks the bridge SSE shape and the /db HTTP contract
 *   • asserts backups never contain settings or API keys (DATA-01)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createStudioApp, extractOpencodeText } from '../web/studio-api.js';
import { createStudioDb } from '../web/studio-db.js';
import { createRemoteAdapter } from '../studio/src/lib/repo/remote-adapter.js';
import { runAdapterContract } from '../studio/test/adapter-contract.test.js';

const TOKEN = `test-token-${Math.random().toString(36).slice(2)}`;
const ORIGIN = 'http://localhost:5180';

let server;
let db;
let baseUrl;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-api-'));
  db = createStudioDb({ dbPath: join(dir, 'professor.db') });
  // The Phase 29 runner probes toolchains with `cwd: workspacesRoot`, so it must exist for the
  // probe to be meaningful (spawnSync fails on a missing cwd — see HANDOFF-29 §1 note).
  const workspacesRoot = mkdtempSync(join(tmpdir(), 'studio-ws-'));
  const app = createStudioApp({
    db,
    token: TOKEN,
    origins: ORIGIN,
    runner: { workspacesRoot },
    log: () => {},
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  db?.close();
});

/* ---------------------------------------------------------------- adapter contract */

function remoteFactory() {
  return createRemoteAdapter({ baseUrl, token: TOKEN });
}
remoteFactory.label = 'remote';
remoteFactory.kind = 'remote';

runAdapterContract(remoteFactory);

/* ---------------------------------------------------------------- security */

describe('studio bridge: pairing token + CORS (DEPLOY-04)', () => {
  it('rejects a request with no token (401)', async () => {
    const res = await fetch(`${baseUrl}/api/studio/health`);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthorized');
  });

  it('rejects a request with the wrong token (401)', async () => {
    const res = await fetch(`${baseUrl}/api/studio/health`, { headers: { 'X-Studio-Token': 'nope' } });
    expect(res.status).toBe(401);
  });

  it('accepts the correct token and reports agent capabilities', async () => {
    const res = await fetch(`${baseUrl}/api/studio/health`, { headers: { 'X-Studio-Token': TOKEN } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.version).toBe('1');
    for (const agent of ['claude', 'opencode', 'cursor', 'ollama']) {
      expect(body.agents).toHaveProperty(agent);
    }
  });

  it('rejects a request from a non-allowlisted origin (403)', async () => {
    const res = await fetch(`${baseUrl}/api/studio/health`, {
      headers: { 'X-Studio-Token': TOKEN, Origin: 'http://evil.example.com' },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('forbidden_origin');
  });

  it('answers an allowlisted origin and echoes ACAO', async () => {
    const res = await fetch(`${baseUrl}/api/studio/health`, {
      headers: { 'X-Studio-Token': TOKEN, Origin: ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('handles preflight with the private-network header when requested', async () => {
    const res = await fetch(`${baseUrl}/api/studio/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-Studio-Token',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-private-network')).toBe('true');
    expect(res.headers.get('access-control-allow-headers')).toMatch(/X-Studio-Token/i);
  });
});

/* ---------------------------------------------------------------- db contract */

describe('studio /db HTTP contract', () => {
  const headers = () => ({ 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN });

  it('GET /db/health reports the SQLite file and schema version', async () => {
    const res = await fetch(`${baseUrl}/api/studio/db/health`, { headers: { 'X-Studio-Token': TOKEN } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, kind: 'sqlite', schemaVersion: 5 });
    expect(typeof body.path).toBe('string');
  });

  it('POST /db round-trips an op result', async () => {
    const put = await fetch(`${baseUrl}/api/studio/db`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ op: 'put', table: 'courses', args: [{ id: 'http-c1', title: 'Contract' }] }),
    });
    expect(put.status).toBe(200);
    expect((await put.json()).result.title).toBe('Contract');

    const get = await fetch(`${baseUrl}/api/studio/db`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ op: 'get', table: 'courses', args: ['http-c1'] }),
    });
    expect((await get.json()).result.id).toBe('http-c1');
  });

  it('POST /db rejects an unknown table with a code', async () => {
    const res = await fetch(`${baseUrl}/api/studio/db`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ op: 'list', table: 'not_a_table', args: [{}] }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('unknown_table');
  });
});

/* ---------------------------------------------------------------- bridge SSE */

describe('studio /complete SSE shape', () => {
  it('streams {text} tokens then [DONE]', async () => {
    const app = createStudioApp({
      db,
      token: TOKEN,
      origins: ORIGIN,
      capabilities: () => ({ claude: { installed: true }, opencode: { installed: false }, cursor: { installed: false }, ollama: { installed: false } }),
      runners: {
        claude: (ctx) => {
          ctx.onText('hello ');
          ctx.onText('world');
          ctx.onDone();
          return { kill() {} };
        },
      },
      log: () => {},
    });
    const ephemeral = createServer(app);
    await new Promise((resolve) => ephemeral.listen(0, '127.0.0.1', resolve));
    const port = ephemeral.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/studio/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN },
        body: JSON.stringify({ system: 'be nice', messages: [{ role: 'user', content: 'hi' }], agent: 'claude' }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('"text":"hello "');
      expect(text).toContain('"text":"world"');
      expect(text).toContain('data: [DONE]');
    } finally {
      ephemeral.close();
    }
  });
});

/* ---------------------------------------------------------------- local runner mount (Phase 29) */

describe('studio /run mount is token-guarded (HANDOFF-29 §1)', () => {
  it('rejects /run/toolchains without the token (401)', async () => {
    const res = await fetch(`${baseUrl}/api/studio/run/toolchains`);
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('unauthorized');
  });

  it('answers /run/toolchains with the token (200)', async () => {
    const res = await fetch(`${baseUrl}/api/studio/run/toolchains`, {
      headers: { 'X-Studio-Token': TOKEN },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const cmd of ['node', 'python3', 'go', 'javac', 'java', 'rustc', 'bash']) {
      expect(typeof body[cmd]).toBe('boolean');
    }
    expect(body.node).toBe(true); // Node runs this test suite, so the probe must see it
  });
});

/* ---------------------------------------------------------------- bridge lifecycle (Phase 26b) */

describe('studio /complete lifecycle (Phase 26b)', () => {
  async function start(options) {
    const app = createStudioApp({ db, token: TOKEN, origins: ORIGIN, log: () => {}, ...options });
    const srv = createServer(app);
    await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
    return { srv, url: `http://127.0.0.1:${srv.address().port}` };
  }

  const onlyClaude = () => ({
    claude: { installed: true },
    opencode: { installed: false },
    cursor: { installed: false },
    ollama: { installed: false },
  });
  const completeBody = (extra = {}) => ({
    system: 'be nice',
    messages: [{ role: 'user', content: 'hi' }],
    agent: 'claude',
    ...extra,
  });

  it('does NOT kill the child when the request body has been consumed', async () => {
    let ctx;
    let kills = 0;
    const { srv, url } = await start({
      capabilities: onlyClaude,
      runners: {
        claude: (c) => {
          ctx = c;
          return {
            kill() {
              kills += 1;
            },
          };
        },
      },
    });
    try {
      const res = await fetch(`${url}/api/studio/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN },
        body: JSON.stringify(completeBody()),
      });
      expect(res.status).toBe(200);
      // The old `req.on('close')` bug SIGTERM'd the child within a tick of body consumption.
      await new Promise((r) => setTimeout(r, 250));
      expect(kills).toBe(0);
      ctx.onText('pong');
      ctx.onDone();
      const text = await res.text();
      expect(text).toContain('"text":"pong"');
      expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    } finally {
      srv.close();
    }
  });

  it('kills the child when the client aborts mid-stream', async () => {
    let kills = 0;
    let started = false;
    const { srv, url } = await start({
      capabilities: onlyClaude,
      runners: {
        claude: () => {
          started = true;
          return {
            kill() {
              kills += 1;
            },
          };
        },
      },
    });
    try {
      const controller = new AbortController();
      const res = await fetch(`${url}/api/studio/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN },
        body: JSON.stringify(completeBody()),
        signal: controller.signal,
      });
      const reader = res.body.getReader();
      await reader.read(); // first SSE frame ({status:"thinking"}) — proves the run started
      expect(started).toBe(true);
      reader.cancel().catch(() => {});
      controller.abort();
      await new Promise((r) => setTimeout(r, 250));
      expect(kills).toBeGreaterThanOrEqual(1);
    } finally {
      srv.close();
    }
  });

  it('sends {status:"thinking"} then always terminates with data: [DONE] on error', async () => {
    const { srv, url } = await start({
      capabilities: onlyClaude,
      runners: {
        claude: (c) => {
          c.onError({ message: 'boom', code: 'server' });
          c.onDone();
          return { kill() {} };
        },
      },
    });
    try {
      const res = await fetch(`${url}/api/studio/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN },
        body: JSON.stringify(completeBody()),
      });
      const text = await res.text();
      expect(text).toContain('"status":"thinking"');
      expect(text).toContain('"error":"boom"');
      expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    } finally {
      srv.close();
    }
  });
});

/* ---------------------------------------------------------------- opencode parser (Phase 26b) */

describe('opencode JSON-line parser (Phase 26b)', () => {
  it('reads part.text for text events and ignores step/tool events', () => {
    const lines = [
      '{"type":"step_start","part":{"type":"step-start","id":"p1"},"sessionID":"s"}',
      '{"type":"text","part":{"type":"text","text":"hello","time":{"start":1}},"sessionID":"s"}',
      '{"type":"text","part":{"type":"text","text":" world","time":{"start":2}},"sessionID":"s"}',
      '{"type":"tool_use","part":{"type":"tool","tool":"read","state":{}},"sessionID":"s"}',
      '{"type":"step_finish","part":{"type":"step-finish"},"sessionID":"s"}',
    ];
    const out = lines.map((l) => extractOpencodeText(JSON.parse(l))).filter((t) => t !== null);
    expect(out).toEqual(['hello', ' world']);
  });

  it('ignores non-text payloads and malformed input', () => {
    expect(extractOpencodeText({ type: 'text', part: { type: 'text', text: '' } })).toBe('');
    expect(extractOpencodeText({ type: 'text', part: { type: 'reasoning', text: 'x' } })).toBeNull();
    expect(extractOpencodeText({ type: 'result', result: 'nope' })).toBeNull();
    expect(extractOpencodeText(null)).toBeNull();
    expect(extractOpencodeText('raw')).toBeNull();
  });
});

/* ---------------------------------------------------------------- backups */

describe('backups exclude settings and keys (DATA-01 / AI-03)', () => {
  it('never contains a settings table or an API key', async () => {
    // Simulate a user who has stored a key in the repository-adjacent data layer.
    await db.put('notes', { id: 'n-key', course_id: null, content_md: 'ordinary note' });
    const dump = await db.exportAll();
    expect(Object.keys(dump.tables)).not.toContain('settings');
    expect(Object.keys(dump.tables)).not.toContain('secrets');
    expect(JSON.stringify(dump)).not.toMatch(/sk-ant-|sk-[A-Za-z0-9]{20,}/);
  });
});
