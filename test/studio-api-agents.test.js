/**
 * Phase 26c — multi-agent bridge: /health, per-agent model lists, and never-silent errors.
 *
 * Boots the Studio router with injected capability/runner/model providers so nothing shells out,
 * then asserts the HTTP contract for the six agents, the config error for unknown agents, and that
 * failures carry an actionable `hint`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createStudioApp, listAgentModels, AGENT_BINARIES, defaultAgentRunners } from '../web/studio-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { createStudioDb } from '../web/studio-db.js';

const TOKEN = `agents-token-${Math.random().toString(36).slice(2)}`;
const ORIGIN = 'http://localhost:5180';
const HEADERS = { 'Content-Type': 'application/json', 'X-Studio-Token': TOKEN };

const SIX = {
  claude: { installed: true, loggedIn: true },
  opencode: { installed: true, loggedIn: true },
  cursor: { installed: true },
  gemini: { installed: true, loggedIn: true },
  antigravity: { installed: true, loggedIn: true },
  ollama: { installed: true, reachable: false },
};

let db;
let server;
let baseUrl;

async function start(options = {}) {
  const app = createStudioApp({ db, token: TOKEN, origins: ORIGIN, log: () => {}, ...options });
  const srv = createServer(app);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return { srv, url: `http://127.0.0.1:${srv.address().port}` };
}

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'studio-agents-'));
  db = createStudioDb({ dbPath: join(dir, 'professor.db') });
});

afterAll(() => db?.close());

describe('GET /health lists all six agents', () => {
  it('reports installed + loggedIn/reachable where detectable', async () => {
    const { srv, url } = await start({ capabilities: () => SIX, probeReachable: false });
    try {
      const res = await fetch(`${url}/api/studio/health`, { headers: { 'X-Studio-Token': TOKEN } });
      const body = await res.json();
      expect(Object.keys(body.agents).sort()).toEqual(['antigravity', 'claude', 'cursor', 'gemini', 'ollama', 'opencode']);
      expect(body.agents.claude.loggedIn).toBe(true);
      expect(body.agents.ollama.reachable).toBe(false);
    } finally {
      srv.close();
    }
  });
});

describe('GET /agents/:agent/models', () => {
  const stubModels = (agent) => ({ ok: true, agent, models: [{ id: '', label: 'Default' }, { id: 'x/y', label: 'x/y' }], source: 'stub' });

  it('returns a curated list for claude with no model selection', async () => {
    const { srv, url } = await start({ capabilities: () => SIX, probeReachable: false });
    try {
      const res = await fetch(`${url}/api/studio/agents/claude/models`, { headers: { 'X-Studio-Token': TOKEN } });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.models).toEqual([]);
    } finally {
      srv.close();
    }
  });

  it('rejects an unknown agent with a config error', async () => {
    const { srv, url } = await start({ capabilities: () => SIX, probeReachable: false });
    try {
      const res = await fetch(`${url}/api/studio/agents/bogus/models`, { headers: { 'X-Studio-Token': TOKEN } });
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('config');
    } finally {
      srv.close();
    }
  });

  it('uses the injected resolver and caches per session', async () => {
    let calls = 0;
    const { srv, url } = await start({
      capabilities: () => SIX,
      probeReachable: false,
      listAgentModels: async (agent) => {
        calls += 1;
        return stubModels(agent);
      },
    });
    try {
      const first = await (await fetch(`${url}/api/studio/agents/opencode/models`, { headers: { 'X-Studio-Token': TOKEN } })).json();
      const second = await (await fetch(`${url}/api/studio/agents/opencode/models`, { headers: { 'X-Studio-Token': TOKEN } })).json();
      expect(first.models).toHaveLength(2);
      expect(first.cached).toBeUndefined();
      expect(second.cached).toBe(true);
      expect(calls).toBe(1);
    } finally {
      srv.close();
    }
  });
});

describe('POST /complete never fails silently', () => {
  const body = (extra = {}) => ({ system: 'be nice', messages: [{ role: 'user', content: 'hi' }], ...extra });

  it('rejects an unknown agent with a config error and a hint', async () => {
    const { srv, url } = await start({ capabilities: () => SIX, probeReachable: false, runners: {} });
    try {
      const res = await fetch(`${url}/api/studio/complete`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body({ agent: 'gemini-cli' })) });
      const text = await res.text();
      expect(text).toContain('"code":"config"');
      expect(text).toContain('"hint"');
      expect(text).toContain('Unknown agent');
    } finally {
      srv.close();
    }
  });

  it('supports gemini and antigravity runners and forwards their hint on failure', async () => {
    const { srv, url } = await start({
      capabilities: () => SIX,
      probeReachable: false,
      runners: {
        antigravity: (ctx) => {
          ctx.onError({ message: 'Open Antigravity and sign in', code: 'auth', hint: 'Open Antigravity and sign in, then retry.' });
          ctx.onDone();
          return { kill() {} };
        },
      },
    });
    try {
      const res = await fetch(`${url}/api/studio/complete`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body({ agent: 'antigravity' })) });
      const text = await res.text();
      expect(text).toContain('"code":"auth"');
      expect(text).toContain('"hint":"Open Antigravity and sign in, then retry."');
      expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
    } finally {
      srv.close();
    }
  });

  it('passes the bridge model through to the chosen runner', async () => {
    let received;
    const { srv, url } = await start({
      capabilities: () => SIX,
      probeReachable: false,
      runners: {
        opencode: (ctx) => {
          received = ctx.model;
          ctx.onText('ok');
          ctx.onDone();
          return { kill() {} };
        },
      },
    });
    try {
      await fetch(`${url}/api/studio/complete`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body({ agent: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' })),
      });
      expect(received).toBe('opencode-go/deepseek-v4.1-flash');
    } finally {
      srv.close();
    }
  });
});

describe('listAgentModels direct', () => {
  it('throws a config error for an unsupported agent', async () => {
    await expect(listAgentModels('nope')).rejects.toMatchObject({ code: 'config' });
  });

  it('covers all six agents', () => {
    expect(Object.keys(AGENT_BINARIES)).toHaveLength(6);
  });
});

describe('antigravity runner reports a no-output run instead of ending silently', () => {
  it('emits an error with a hint when agy exits 0 but streamed no text', async () => {
    const fixture = readFileSync(join(__dirname, '..', 'studio', 'test', 'fixtures', 'agents', 'antigravity-tool-denied.jsonl'), 'utf-8');
    const bin = mkdtempSync(join(tmpdir(), 'fake-agy-'));
    const script = join(bin, 'agy');
    writeFileSync(script, `#!/bin/sh\ncat <<'EOF'\n${fixture}EOF\necho 'jetski: no output produced — a tool required the "command" permission that headless mode cannot auto-approve.' 1>&2\nexit 0\n`);
    chmodSync(script, 0o755);

    const origPath = process.env.PATH;
    process.env.PATH = `${bin}:${origPath}`;
    try {
      const ctx = { system: 's', prompt: '[System]\ns\n\nUSER: hi', messages: [], onText: () => {}, onError: () => {}, onDone: () => {}, log: () => {} };
      let text = '';
      let error = null;
      await new Promise((resolve) => {
        ctx.onText = (t) => {
          text += t;
        };
        ctx.onError = (e) => {
          error = e;
        };
        ctx.onDone = resolve;
        defaultAgentRunners().antigravity(ctx);
      });
      expect(text).toBe('');
      expect(error).toBeTruthy();
      expect(error.hint).toBeTruthy();
      expect(error.message).toMatch(/no text|denied permission/);
    } finally {
      process.env.PATH = origPath;
    }
  });
});
