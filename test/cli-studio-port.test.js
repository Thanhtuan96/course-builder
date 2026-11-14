/**
 * fix-studio-port — `studio` must (a) poll and print `127.0.0.1` URLs, so a `::1`-only listener
 * never answers instead of the bridge, and (b) refuse to start on a port it cannot actually bind
 * on either loopback family.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'net';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  HEALTH_PATH,
  buildPairingUrl,
  createStudioStaticServer,
  isPortBusy,
  findFreePort,
  resolveStudioPorts,
  toLoopbackUrl,
  waitForHealth,
} from '../bin/commands/studio.js';

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) {
    try {
      rmSync(tempDirs.pop(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function mkTemp(prefix = 'cp-fix-studio-port-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Bind a listening socket on `host` (ephemeral port) and resolve once it accepts connections. */
function listen(host) {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.end());
    server.once('error', reject);
    server.listen({ port: 0, host }, () => resolve({ server, port: server.address().port }));
  });
}

function close(server) {
  return new Promise((done) => server.close(() => done()));
}

async function canListen(host) {
  try {
    const { server } = await listen(host);
    await close(server);
    return true;
  } catch {
    return false;
  }
}

const ipv6Loopback = await canListen('::1');

describe('fix-studio-port: printed and polled URLs use 127.0.0.1', () => {
  it('builds the health, UI and pairing URLs on the IPv4 literal', () => {
    const { apiUrl, studioUrl, pairingUrl } = buildPairingUrl({
      studioPort: 5180,
      apiPort: 3000,
      token: 'tok',
    });

    expect(apiUrl).toBe('http://127.0.0.1:3000');
    expect(`${apiUrl}${HEALTH_PATH}`).toBe('http://127.0.0.1:3000/api/studio/health');
    expect(studioUrl).toBe('http://127.0.0.1:5180');
    expect(pairingUrl).toBe('http://127.0.0.1:5180/#token=tok');
    for (const url of [apiUrl, studioUrl, pairingUrl]) {
      expect(url).not.toContain('localhost');
    }
  });

  it('puts the 127.0.0.1 bridge in the fragment for a non-default API port', () => {
    const { pairingUrl } = buildPairingUrl({ studioPort: 5180, apiPort: 3001, token: 't' });
    const bridge = decodeURIComponent(pairingUrl.split('bridge=')[1]);
    expect(bridge).toBe('http://127.0.0.1:3001');
  });

  it('normalizes server-provided localhost URLs for printing', () => {
    expect(toLoopbackUrl('http://localhost:3000')).toBe('http://127.0.0.1:3000');
    expect(toLoopbackUrl('http://localhost:5173/app')).toBe('http://127.0.0.1:5173/app');
    expect(toLoopbackUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(toLoopbackUrl('https://example.com')).toBe('https://example.com');
  });

  it('serves Studio on a 127.0.0.1 URL that answers', async () => {
    const root = mkTemp();
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Studio</title>');

    const server = await createStudioStaticServer({ root, port: 0 });
    try {
      expect(server.url).toBe(`http://127.0.0.1:${server.port}`);
      const res = await fetch(server.url);
      expect(res.status).toBe(200);
    } finally {
      await server.close();
    }
  });
});

describe('fix-studio-port: busy-port detection', () => {
  it('treats a port held only on 127.0.0.1 as busy on both families', async () => {
    const { server, port } = await listen('127.0.0.1');
    try {
      expect(await isPortBusy(port)).toBe(true);
      expect(await isPortBusy(port, { hosts: ['127.0.0.1'] })).toBe(true);
    } finally {
      await close(server);
    }
  });

  it.skipIf(!ipv6Loopback)('treats a port held only on ::1 as busy', async () => {
    const { server, port } = await listen('::1');
    try {
      // The IPv4-only probe is exactly the check that used to pass: the bind succeeded while
      // the browser and the health poll went to the other app on ::1.
      expect(await isPortBusy(port, { hosts: ['127.0.0.1'] })).toBe(false);
      expect(await isPortBusy(port)).toBe(true);
    } finally {
      await close(server);
    }
  });

  it('reports a free port as free', async () => {
    const { server, port } = await listen('127.0.0.1');
    await close(server);
    expect(await isPortBusy(port)).toBe(false);
    expect(await findFreePort(port)).toBe(port);
  });
});

describe('fix-studio-port: port resolution', () => {
  it('auto-picks the next free API port when the default is busy and no flag was passed', async () => {
    const { server, port } = await listen('127.0.0.1');
    try {
      const resolved = await resolveStudioPorts({ port: 0, apiPort: port });
      expect(resolved.apiPort).toBeGreaterThan(port);
      expect(await isPortBusy(resolved.apiPort)).toBe(false);
      expect(resolved.notices).toHaveLength(1);
      expect(resolved.notices[0]).toContain(`${port} is in use`);
      expect(resolved.notices[0]).toContain(String(resolved.apiPort));
    } finally {
      await close(server);
    }
  });

  it('auto-picks a free Studio UI port too', async () => {
    const { server, port } = await listen('127.0.0.1');
    try {
      const resolved = await resolveStudioPorts({ port, apiPort: 0 });
      expect(resolved.port).toBeGreaterThan(port);
      expect(resolved.notices[0]).toMatch(/Studio/);
    } finally {
      await close(server);
    }
  });

  it('keeps a free port and stays quiet', async () => {
    const resolved = await resolveStudioPorts({ port: 0, apiPort: 0 });
    expect(resolved).toEqual({ port: 0, apiPort: 0, notices: [] });
  });

  it('fails with the flag hint when the user pinned a busy --api-port', async () => {
    const { server, port } = await listen('127.0.0.1');
    try {
      await expect(resolveStudioPorts({ port: 0, apiPort: port, apiPortExplicit: true })).rejects.toThrow(
        new RegExp(`Port ${port} is already in use`)
      );
      await expect(resolveStudioPorts({ port: 0, apiPort: port, apiPortExplicit: true })).rejects.toThrow(
        /--api-port <free port>/
      );
    } finally {
      await close(server);
    }
  });

  it('fails with the flag hint when the user pinned a busy --port', async () => {
    const { server, port } = await listen('127.0.0.1');
    try {
      await expect(resolveStudioPorts({ port, apiPort: 0, portExplicit: true })).rejects.toThrow(
        /--port <free port>/
      );
    } finally {
      await close(server);
    }
  });
});

describe('fix-studio-port: health poll names the other app', () => {
  const url = 'http://127.0.0.1:3000/api/studio/health';
  const fast = { timeoutMs: 20, intervalMs: 1, token: 't' };

  it('explains a 404 on the port and suggests --api-port', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await expect(waitForHealth({ url, fetchImpl, ...fast })).rejects.toThrow(
      /Another app is answering on port 3000/
    );
    await expect(waitForHealth({ url, fetchImpl, ...fast })).rejects.toThrow(/--api-port/);
  });

  it('explains a 200 whose JSON is not Studio health', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ wxt: true }) });
    await expect(waitForHealth({ url, fetchImpl, ...fast })).rejects.toThrow(/Another app is answering/);
  });

  it('does not blame another app when nothing answers', async () => {
    const fetchImpl = async () => {
      throw new Error('connect ECONNREFUSED');
    };
    await expect(waitForHealth({ url, fetchImpl, ...fast })).rejects.toThrow(/did not become healthy/);
    await expect(waitForHealth({ url, fetchImpl, ...fast })).rejects.not.toThrow(/Another app/);
  });
});
