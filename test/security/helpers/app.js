/**
 * Build a fully isolated `createApp` instance for the security suite.
 *
 * Every app gets its own temp `PROFESSOR_HOME`/courses dir/Studio dist and a real SQLite DB under a
 * temp path, so no test can fall back to the real `~/.professor` or a real agent CLI. The spawn spy
 * records calls and throws, proving a rejected request never reached a child process.
 */
import { createServer, request as httpRequest } from 'http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { createApp } from '../../../web/server.js';
import { createStudioDb } from '../../../web/studio-db.js';
import { isolateEnv } from './env.js';

export const TEST_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';

/** Capabilities where no agent is installed, so the bridge never probes a real CLI. */
export const STATIC_CAPABILITIES = () => ({
  claude: { installed: false },
  cursor: { installed: false },
  opencode: { installed: false },
  gemini: { installed: false },
  antigravity: { installed: false },
  ollama: { installed: false, reachable: false },
});

/** No injected agent runners: the bridge is never exercised by guard/entry tests. */
export const FAKE_RUNNERS = Object.freeze({});

/**
 * @param {object} [options]
 * @param {boolean} [options.legacy]
 * @param {string} [options.nodeEnv]
 * @param {string} [options.token]
 * @param {string} [options.studioDist] `null` means "missing build"; omit for a built temp dist
 * @param {string|null} [options.legacyDist]
 * @param {Record<string, Function>} [options.runners]
 * @param {() => object} [options.capabilities]
 * @param {string[]} [options.extraHosts]
 * @param {boolean} [options.allowNonLoopback]
 * @returns {Promise<{ app: import('express').Express, db: object, tempDir: string,
 *                     coursesDir: string, studioDist: string, legacyDist: string,
 *                     spawnSpy: Function, cleanup: () => void }>}
 */
export async function buildTestApp({
  legacy = false,
  nodeEnv = 'development',
  token = TEST_TOKEN,
  studioDist,
  legacyDist,
  runners = FAKE_RUNNERS,
  capabilities = STATIC_CAPABILITIES,
  extraHosts,
  allowNonLoopback,
} = {}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'professor-app-'));
  const coursesDir = join(tempDir, 'courses');
  mkdirSync(coursesDir, { recursive: true });

  let resolvedStudioDist = studioDist;
  if (resolvedStudioDist === undefined) {
    resolvedStudioDist = join(tempDir, 'studio-dist');
    mkdirSync(resolvedStudioDist, { recursive: true });
    writeFileSync(join(resolvedStudioDist, 'index.html'), '<!doctype html><title>Studio Test</title>');
  } else if (resolvedStudioDist === null) {
    resolvedStudioDist = join(tempDir, 'studio-dist');
  }

  const resolvedLegacyDist = legacyDist ?? join(tempDir, 'legacy-dist');
  const dbPath = join(tempDir, 'professor.db');

  isolateEnv({ PROFESSOR_HOME: tempDir, STUDIO_DB: dbPath });

  const db = createStudioDb({ dbPath });
  const spawnSpy = (...args) => {
    spawnSpy.calls.push(args);
    throw new Error('spawn must not be called by a rejected request');
  };
  spawnSpy.calls = [];

  const app = await createApp({
    legacy,
    nodeEnv,
    token,
    coursesDir,
    studioDist: resolvedStudioDist,
    legacyDist: resolvedLegacyDist,
    db,
    runners,
    capabilities,
    spawnImpl: spawnSpy,
    extraHosts,
    allowNonLoopback,
  });

  return {
    app,
    db,
    tempDir,
    coursesDir,
    studioDist: resolvedStudioDist,
    legacyDist: resolvedLegacyDist,
    spawnSpy,
    cleanup() {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Bind an Express app on an ephemeral loopback port.
 * @param {import('express').Express} app
 * @returns {Promise<{ server: import('http').Server, url: string, port: number,
 *                     close: () => Promise<void> }>}
 */
export async function bootTestServer(app) {
  const server = createServer(app);
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

/**
 * Minimal HTTP request helper that can spoof `Host` (fetch/undici cannot).
 * @param {{ url: string, method?: string, headers?: Record<string,string>, body?: string,
 *           setHost?: boolean }} opts
 * @returns {Promise<{ status: number, headers: Record<string,string|string[]|undefined>,
 *                     body: string }>}
 */
export function requestWithHost({ url, method = 'GET', headers = {}, body, setHost = true }) {
  return new Promise((resolveRequest, reject) => {
    const req = httpRequest(url, { method, headers, setHost }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        resolveRequest({ status: res.statusCode, headers: res.headers, body: text });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
