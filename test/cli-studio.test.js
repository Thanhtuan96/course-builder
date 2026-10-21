/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import {
  parseStudioArgs,
  isBuildStale,
  stripAgentEnv,
  mergeOrigins,
  buildPairingUrl,
  resolveStudioToken,
  waitForHealth,
  run,
} from '../bin/commands/studio.js';
import {
  contentTypeFor,
  resolveStaticPath,
  startStaticServer,
} from '../bin/static-server.js';
import { createStudioStore } from '../bin/studio-store.js';
import { runAdapterContract } from '../studio/test/adapter-contract.test.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp(prefix = 'cp-studio-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/* ------------------------------------------------------------------ helpers */

describe('parseStudioArgs', () => {
  it('reads defaults', () => {
    expect(parseStudioArgs([])).toEqual({ port: 5180, apiPort: 3000, open: true, rotateToken: false });
  });

  it('reads --port/--api-port in both forms and --no-open', () => {
    expect(parseStudioArgs(['--port', '6000', '--api-port=4000', '--no-open'])).toEqual({
      port: 6000,
      apiPort: 4000,
      open: false,
      rotateToken: false,
    });
    expect(parseStudioArgs(['--rotate-token']).rotateToken).toBe(true);
  });

  it('falls back on invalid ports', () => {
    expect(parseStudioArgs(['--port', 'abc']).port).toBe(5180);
    expect(parseStudioArgs(['--port', '70000']).port).toBe(5180);
  });
});

describe('isBuildStale', () => {
  it('is stale when dist/index.html is missing', () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'src'));
    expect(isBuildStale(dir)).toBe(true);
  });

  it('is fresh when dist is newer than src', () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'src', 'main.js'), 'x');
    writeFileSync(join(dir, 'dist', 'index.html'), '<html></html>');
    const now = Date.now() / 1000;
    utimesSync(join(dir, 'src', 'main.js'), now - 100, now - 100);
    utimesSync(join(dir, 'dist', 'index.html'), now, now);
    expect(isBuildStale(dir)).toBe(false);
  });

  it('is stale when a source file is newer than the build', () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'src', 'main.js'), 'x');
    writeFileSync(join(dir, 'dist', 'index.html'), '<html></html>');
    const now = Date.now() / 1000;
    utimesSync(join(dir, 'dist', 'index.html'), now - 100, now - 100);
    utimesSync(join(dir, 'src', 'main.js'), now, now);
    expect(isBuildStale(dir)).toBe(true);
  });
});

describe('stripAgentEnv', () => {
  it('drops CLAUDECODE and every CLAUDE_CODE_* var, keeping the rest', () => {
    const env = stripAgentEnv({
      PATH: '/bin',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDE_CODE_SSE_PORT: '1234',
      HOME: '/home/x',
    });
    expect(env).toEqual({ PATH: '/bin', HOME: '/home/x' });
  });
});

describe('mergeOrigins / buildPairingUrl / resolveStudioToken', () => {
  it('merges studio origins with any existing value', () => {
    expect(mergeOrigins('http://other:1', 5180)).toBe('http://other:1,http://localhost:5180,http://127.0.0.1:5180');
  });

  it('builds a fragment pairing URL and only adds &bridge= for a non-default API port', () => {
    const defaultPort = buildPairingUrl({ studioPort: 5180, apiPort: 3000, token: 'a b/c' });
    expect(defaultPort.pairingUrl).toBe('http://localhost:5180/#token=a%20b%2Fc');
    expect(defaultPort.pairingUrl).not.toContain('?token=');

    const stringDefault = buildPairingUrl({ studioPort: 5180, apiPort: '3000', token: 't' });
    expect(stringDefault.pairingUrl).toBe('http://localhost:5180/#token=t');

    const custom = buildPairingUrl({ studioPort: 5180, apiPort: '4000', token: 't' });
    expect(custom.pairingUrl).toBe(
      'http://localhost:5180/#token=t&bridge=http%3A%2F%2Flocalhost%3A4000'
    );
  });

  it('prefers STUDIO_BRIDGE_TOKEN, then the PROFESSOR_HOME token file, then migrates/generates', () => {
    const root = mkTemp();
    const home = mkTemp();
    expect(
      resolveStudioToken({ repoRoot: root, env: { STUDIO_BRIDGE_TOKEN: 'env-token', PROFESSOR_HOME: home } })
    ).toBe('env-token');

    writeFileSync(join(home, 'studio-token'), 'file-token\n');
    expect(resolveStudioToken({ repoRoot: root, env: { PROFESSOR_HOME: home } })).toBe('file-token');

    const legacyRoot = mkTemp();
    const legacyHome = mkTemp();
    mkdirSync(join(legacyRoot, 'web'), { recursive: true });
    writeFileSync(join(legacyRoot, 'web', '.studio-token'), 'legacy-token\n');
    expect(
      resolveStudioToken({ repoRoot: legacyRoot, env: { PROFESSOR_HOME: legacyHome } })
    ).toBe('legacy-token');
    expect(readFileSync(join(legacyHome, 'studio-token'), 'utf8').trim()).toBe('legacy-token');
    expect(existsSync(join(legacyRoot, 'web', '.studio-token'))).toBe(false);

    const generatedHome = mkTemp();
    const generated = resolveStudioToken({
      repoRoot: mkTemp(),
      env: { PROFESSOR_HOME: generatedHome },
    });
    expect(generated).toMatch(/^[0-9a-f]{48}$/);
    expect(readFileSync(join(generatedHome, 'studio-token'), 'utf8').trim()).toBe(generated);
  });
});

describe('studio --rotate-token', () => {
  const envKeys = ['PROFESSOR_HOME', 'STUDIO_BRIDGE_TOKEN'];

  async function withEnv(values, fn) {
    const saved = {};
    for (const key of envKeys) saved[key] = process.env[key];
    try {
      for (const key of envKeys) delete process.env[key];
      Object.assign(process.env, values);
      return await fn();
    } finally {
      for (const key of envKeys) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  }

  it('rotates, prints only a mask and exits without starting when used alone', async () => {
    const home = mkTemp();
    const logs = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    try {
      const code = await withEnv({ PROFESSOR_HOME: home }, async () =>
        run({ repoRoot: mkTemp(), args: ['--rotate-token'], nodeVersion: process.version })
      );
      expect(code).toBe(0);
      const token = readFileSync(join(home, 'studio-token'), 'utf8').trim();
      expect(token).toMatch(/^[0-9a-f]{48}$/);
      const output = logs.join('\n');
      expect(output).toContain('#token=');
      expect(output).not.toMatch(new RegExp(`^${token}$`, 'm'));
    } finally {
      logSpy.mockRestore();
    }
  });

  it('refuses rotation when STUDIO_BRIDGE_TOKEN is set and writes nothing', async () => {
    const home = mkTemp();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await withEnv({ PROFESSOR_HOME: home, STUDIO_BRIDGE_TOKEN: 'env-token' }, async () => {
        await expect(
          run({ repoRoot: mkTemp(), args: ['--rotate-token'], nodeVersion: process.version })
        ).rejects.toMatchObject({ code: 'env_token_immutable' });
      });
      expect(existsSync(join(home, 'studio-token'))).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('waitForHealth', () => {
  it('resolves once the health endpoint answers ok', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const health = await waitForHealth({ url: 'http://x/health', token: 't', fetchImpl, intervalMs: 1 });
    expect(health.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it('throws once the timeout elapses', async () => {
    const fetchImpl = async () => { throw new Error('refused'); };
    await expect(waitForHealth({ url: 'http://x/health', token: 't', fetchImpl, timeoutMs: 5, intervalMs: 1 })).rejects.toThrow(/did not become healthy/);
  });
});

describe('studio run wiring', () => {
  it('fails fast when web/server.js is missing', async () => {
    const root = mkTemp();
    const spinner = { start() { return this; }, stop() {}, succeed() {}, fail() {} };
    await expect(run({ repoRoot: root, args: ['--no-open'], ora: () => spinner })).rejects.toThrow(/Local server not found/);
  });
});

/* ------------------------------------------------------------------ static server */

describe('static server', () => {
  it('maps MIME types', () => {
    expect(contentTypeFor('a.html')).toMatch(/text\/html/);
    expect(contentTypeFor('a.js')).toMatch(/text\/javascript/);
    expect(contentTypeFor('a.woff2')).toBe('font/woff2');
    expect(contentTypeFor('a.unknown')).toBe('application/octet-stream');
  });

  it('refuses paths that escape the root', () => {
    const root = mkTemp();
    expect(resolveStaticPath(root, '/../../../etc/passwd')).toBeNull();
    expect(resolveStaticPath(root, '/assets/app.js')).toBe(join(root, 'assets', 'app.js'));
  });

  it('serves files, the SPA fallback, and 404s — no directory listing', async () => {
    const root = mkTemp();
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Studio</title>');
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');

    const server = await startStaticServer({ root, port: 0 });
    try {
      const html = await fetch(`${server.url}/`);
      expect(html.status).toBe(200);
      expect(html.headers.get('content-type')).toMatch(/text\/html/);
      expect(await html.text()).toContain('Studio');

      const js = await fetch(`${server.url}/assets/app.js`);
      expect(js.status).toBe(200);
      expect(js.headers.get('content-type')).toMatch(/text\/javascript/);

      const fallback = await fetch(`${server.url}/settings`);
      expect(fallback.status).toBe(200);
      expect(await fallback.text()).toContain('Studio');

      const missing = await fetch(`${server.url}/assets/missing.js`);
      expect(missing.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

/* ------------------------------------------------------------------ adapter contract */

function sqliteFactory() {
  return createStudioStore({ dbPath: join(mkTemp('cp-store-'), 'professor.db'), log: () => {} });
}
sqliteFactory.label = 'sqlite';
sqliteFactory.kind = 'sqlite';

runAdapterContract(sqliteFactory);
