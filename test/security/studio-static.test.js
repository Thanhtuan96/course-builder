/**
 * 02-02 Task 6 — the Studio static port must enforce the same Host allowlist as the API (SEC-03).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import net from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

import { createStudioStaticServer } from '../../bin/commands/studio.js';
import { requestWithHost } from './helpers/app.js';

const tempDirs = [];
const servers = [];

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    try {
      await server.close();
    } catch {
      /* ignore */
    }
  }
  while (tempDirs.length) {
    try {
      rmSync(tempDirs.pop(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function makeDist() {
  const root = mkdtempSync(join(tmpdir(), 'studio-static-'));
  tempDirs.push(root);
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Studio Static Marker</title>');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app.js'), 'console.log("studio-static")');
  return root;
}

async function boot(root, extraHosts = []) {
  const server = await createStudioStaticServer({ root, port: 0, extraHosts });
  servers.push(server);
  return server;
}

/** Raw HTTP/1.0 request (no Host header is legal here, unlike HTTP/1.1). */
function rawGet(port) {
  return new Promise((resolveRaw, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.write('GET / HTTP/1.0\r\n\r\n');
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.on('end', () => resolveRaw(data));
    socket.on('close', () => resolveRaw(data));
    socket.on('error', reject);
  });
}

describe('createStudioStaticServer Host guard', () => {
  it('rejects a spoofed Host before the static handler runs (403, no index bytes)', async () => {
    const root = makeDist();
    const server = await boot(root);
    const res = await requestWithHost({
      url: `${server.url}/`,
      headers: { Host: 'evil.example' },
    });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('Studio Static Marker');
    expect(JSON.parse(res.body).code).toBe('forbidden_host');
  });

  it('rejects a missing Host header (403)', async () => {
    const root = makeDist();
    const server = await boot(root);
    const raw = await rawGet(server.port);
    expect(raw).toContain('403 Forbidden');
    expect(raw).toContain('forbidden_host');
    expect(raw).not.toContain('Studio Static Marker');
  });

  it('serves index.html for / and /index.html with a loopback Host (200)', async () => {
    const root = makeDist();
    const server = await boot(root);
    const host = `127.0.0.1:${server.port}`;

    const rootRes = await requestWithHost({ url: `${server.url}/`, headers: { Host: host } });
    expect(rootRes.status).toBe(200);
    expect(rootRes.body).toContain('Studio Static Marker');

    const indexRes = await requestWithHost({
      url: `${server.url}/index.html`,
      headers: { Host: host },
    });
    expect(indexRes.status).toBe(200);
    expect(indexRes.body).toContain('Studio Static Marker');
  });

  it('serves an explicitly opted-in non-loopback host only with extraHosts', async () => {
    const root = makeDist();

    const rejected = await boot(root);
    const host = `192.168.1.10:${rejected.port}`;
    const denied = await requestWithHost({
      url: `${rejected.url}/`,
      headers: { Host: host },
    });
    expect(denied.status).toBe(403);

    const allowed = await boot(root, ['192.168.1.10']);
    const permitted = await requestWithHost({
      url: `${allowed.url}/`,
      headers: { Host: `192.168.1.10:${allowed.port}` },
    });
    expect(permitted.status).toBe(200);
    expect(permitted.body).toContain('Studio Static Marker');
  });
});
