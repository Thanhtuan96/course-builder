/**
 * 02-05 — CLI pairing, web flags and the doctor security posture.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildPostureChecks, buildStudioHealthCheck } from '../../bin/commands/doctor.js';
import { buildPairingUrl } from '../../bin/commands/studio.js';
import { parseWebArgs, resolveWebUiPort } from '../../bin/commands/web.js';

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

function mkTemp(prefix = 'professor-cli-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function byName(checks, name) {
  return checks.find((check) => check.name === name);
}

describe('buildPairingUrl', () => {
  it('uses the fragment form and omits bridge for the default API port', () => {
    for (const apiPort of [3000, '3000']) {
      const { pairingUrl } = buildPairingUrl({ studioPort: 5180, apiPort, token: 'abc/def' });
      expect(pairingUrl).toBe('http://localhost:5180/#token=abc%2Fdef');
      expect(pairingUrl).not.toContain('?token=');
      expect(pairingUrl).not.toContain('bridge=');
    }
  });

  it('adds the encoded bridge inside the fragment only for a non-default API port', () => {
    for (const apiPort of [4000, '4000']) {
      const { pairingUrl } = buildPairingUrl({ studioPort: 5180, apiPort, token: 't' });
      expect(pairingUrl).toBe(
        'http://localhost:5180/#token=t&bridge=http%3A%2F%2Flocalhost%3A4000'
      );
    }
  });
});

describe('parseWebArgs / resolveWebUiPort', () => {
  it('parses flags and keeps the positional port as a string', () => {
    expect(parseWebArgs(['--legacy', '4000'])).toEqual({
      legacy: true,
      production: false,
      cloud: false,
      rotateToken: false,
      port: '4000',
    });
    expect(parseWebArgs(['--rotate-token'])).toEqual({
      legacy: false,
      production: false,
      cloud: false,
      rotateToken: true,
      port: null,
    });
    expect(parseWebArgs(['--production', '--cloud']).port).toBeNull();
  });

  it('never treats a flag as a port or duplicates the positional port', () => {
    const parsed = parseWebArgs(['--legacy', '--production', '5000', '6000']);
    expect(parsed.port).toBe('5000');
    expect(parsed.legacy).toBe(true);
    expect(parsed.production).toBe(true);
  });

  it('prints 5173 only for legacy dev; every other mode uses the API port', () => {
    expect(resolveWebUiPort({ legacy: true, production: false, port: '4000' })).toBe('5173');
    expect(resolveWebUiPort({ legacy: true, production: true, port: '4000' })).toBe('4000');
    expect(resolveWebUiPort({ legacy: false, production: false, port: '4000' })).toBe('4000');
    expect(resolveWebUiPort({ legacy: false, production: false, port: null })).toBe('3000');
  });
});

describe('doctor security posture', () => {
  it('fails a token file that is not 0600 and accepts 0600', () => {
    const home = mkTemp();
    const tokenFile = join(home, 'studio-token');
    writeFileSync(tokenFile, 'secret\n');
    chmodSync(tokenFile, 0o644);

    const worldReadable = buildPostureChecks({ env: { PROFESSOR_HOME: home } });
    const badToken = byName(worldReadable, 'Security · token file');
    expect(badToken.status).toBe('fail');
    expect(badToken.detail).toMatch(/0644/);

    chmodSync(tokenFile, 0o600);
    const locked = buildPostureChecks({ env: { PROFESSOR_HOME: home } });
    const goodToken = byName(locked, 'Security · token file');
    expect(goodToken.status).toBe('ok');
    expect(goodToken.detail).toMatch(/0600/);
  });

  it('warns for legacy, non-loopback bind, Bash and each relaxed env, and fails the combination', () => {
    const checks = buildPostureChecks({
      env: {
        PROFESSOR_HOME: mkTemp(),
        PROFESSOR_LEGACY: '1',
        HOST: '0.0.0.0',
        PROFESSOR_ALLOW_BASH: '1',
        STUDIO_ORIGINS: '*',
      },
      platform: 'linux',
    });
    expect(byName(checks, 'Security · legacy web').status).toBe('fail');
    expect(byName(checks, 'Security · bind address').status).toBe('warn');
    expect(byName(checks, 'Security · bash runner').status).toBe('warn');
    expect(byName(checks, 'Security · relaxed env').status).toBe('warn');

    const combination = buildPostureChecks({
      env: {
        PROFESSOR_HOME: mkTemp(),
        STUDIO_ORIGINS: '*',
        STUDIO_ALLOW_NON_LOOPBACK: '1',
      },
      platform: 'linux',
    });
    expect(byName(combination, 'Security · relaxed env').status).toBe('fail');
  });

  it('reports the unsupported Windows .cmd/.bat agent shim', () => {
    const checks = buildPostureChecks({
      env: { PROFESSOR_HOME: mkTemp() },
      platform: 'win32',
      resolveExecutableImpl: (cmd) =>
        cmd === 'claude' ? 'C:\\Users\\learner\\bin\\claude.cmd' : null,
    });
    const shim = byName(checks, 'Windows agent shims');
    expect(shim.status).toBe('fail');
    expect(shim.hint).toMatch(/unsupported|WSL|native binary/i);
  });

  it('probes without a token when none exists and reports 401 as reachable but unpaired', async () => {
    const home = mkTemp();
    const seen = [];
    const check = await buildStudioHealthCheck({
      env: { PROFESSOR_HOME: home },
      port: 3000,
      httpGetImpl: async (url, timeoutMs, headers) => {
        seen.push({ url, timeoutMs, headers });
        return { ok: false, status: 401, body: '' };
      },
      portOpenImpl: async () => true,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].headers).toEqual({});
    expect(check.status).toBe('warn');
    expect(check.detail).toMatch(/reachable but unpaired/i);
    expect(existsSync(join(home, 'studio-token'))).toBe(false);
  });

  it('sends X-Studio-Token when the token file already exists', async () => {
    const home = mkTemp();
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'studio-token'), 'doctor-token\n');
    let seenHeaders = null;
    const check = await buildStudioHealthCheck({
      env: { PROFESSOR_HOME: home },
      port: 3000,
      httpGetImpl: async (url, timeoutMs, headers) => {
        seenHeaders = headers;
        return { ok: true, status: 200, body: '{}' };
      },
      portOpenImpl: async () => true,
    });
    expect(seenHeaders).toEqual({ 'X-Studio-Token': 'doctor-token' });
    expect(check.status).toBe('ok');
  });
});
