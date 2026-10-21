import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  createTokenGetter,
  ensureStudioToken,
  legacyTokenPath,
  maskToken,
  migrateLegacyToken,
  readTokenFile,
  rotateStudioToken,
  tokenFilePath,
  writeTokenFile,
} from '../../web/security.js';
import { restoreEnv, withTempProfessorHome } from './helpers/env.js';

const TOKEN_A = 'a'.repeat(48);
const TOKEN_B = 'b'.repeat(48);

let home;
let base;

beforeEach(() => {
  base = withTempProfessorHome();
  home = base;
});

afterEach(() => {
  restoreEnv();
  if (base) rmSync(base, { recursive: true, force: true });
  base = null;
  home = null;
});

function tokenFile() {
  return join(home, 'studio-token');
}

function modeOf(file) {
  return statSync(file).mode & 0o777;
}

describe('ensureStudioToken', () => {
  it('generates a 48-hex-character token, writes a newline and mode 0600', () => {
    const token = ensureStudioToken({ env: {}, home });

    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(existsSync(tokenFile())).toBe(true);
    expect(readFileSync(tokenFile(), 'utf-8')).toBe(`${token}\n`);
    expect(modeOf(tokenFile())).toBe(0o600);
    expect(tokenFilePath({ PROFESSOR_HOME: home })).toBe(tokenFile());
  });

  it('keeps an existing token and re-applies mode 0600 over a pre-existing 0644 file', () => {
    writeFileSync(tokenFile(), 'preset-token-1234\n', { mode: 0o644 });
    chmodSync(tokenFile(), 0o644);
    expect(modeOf(tokenFile())).toBe(0o644);

    const token = ensureStudioToken({ env: {}, home });

    expect(token).toBe('preset-token-1234');
    expect(readFileSync(tokenFile(), 'utf-8')).toBe('preset-token-1234\n');
    expect(modeOf(tokenFile())).toBe(0o600);
  });

  it('short-circuits on STUDIO_BRIDGE_TOKEN and writes nothing', () => {
    const token = ensureStudioToken({
      env: { STUDIO_BRIDGE_TOKEN: 'env-token' },
      home,
    });

    expect(token).toBe('env-token');
    expect(existsSync(tokenFile())).toBe(false);
  });

  it('migrates web/.studio-token once and deletes the legacy file', () => {
    const legacy = legacyTokenPath(home);
    mkdirSync(join(home, 'web'), { recursive: true });
    writeFileSync(legacy, 'legacy-token\n', { mode: 0o600 });

    const token = ensureStudioToken({ env: {}, home, legacyFile: legacy });

    expect(token).toBe('legacy-token');
    expect(readTokenFile(tokenFile())).toBe('legacy-token');
    expect(existsSync(legacy)).toBe(false);
    expect(modeOf(tokenFile())).toBe(0o600);
  });

  it('prefers an existing new token file and leaves the legacy file untouched', () => {
    const legacy = legacyTokenPath(home);
    mkdirSync(join(home, 'web'), { recursive: true });
    writeFileSync(legacy, 'legacy-token\n', { mode: 0o600 });
    writeTokenFile(tokenFile(), TOKEN_A);

    const token = ensureStudioToken({ env: {}, home, legacyFile: legacy });

    expect(token).toBe(TOKEN_A);
    expect(existsSync(legacy)).toBe(true);
    expect(readFileSync(legacy, 'utf-8')).toBe('legacy-token\n');
  });

  it('does not migrate when an env token is set', () => {
    const legacy = legacyTokenPath(home);
    mkdirSync(join(home, 'web'), { recursive: true });
    writeFileSync(legacy, 'legacy-token\n', { mode: 0o600 });

    const token = ensureStudioToken({
      env: { STUDIO_BRIDGE_TOKEN: 'env-token' },
      home,
      legacyFile: legacy,
    });

    expect(token).toBe('env-token');
    expect(existsSync(tokenFile())).toBe(false);
    expect(existsSync(legacy)).toBe(true);
  });

  it('migrateLegacyToken is a no-op when the new file exists', () => {
    const legacy = legacyTokenPath(home);
    mkdirSync(join(home, 'web'), { recursive: true });
    writeFileSync(legacy, 'legacy-token\n', { mode: 0o600 });
    writeTokenFile(tokenFile(), TOKEN_B);

    expect(migrateLegacyToken({ env: {}, legacyFile: legacy, file: tokenFile() })).toBeNull();
    expect(readFileSync(tokenFile(), 'utf-8')).toBe(`${TOKEN_B}\n`);
    expect(existsSync(legacy)).toBe(true);
  });
});

describe('rotateStudioToken', () => {
  it('writes a different token with mode 0600', () => {
    const first = ensureStudioToken({ env: {}, home });
    const rotated = rotateStudioToken({ env: {}, home });

    expect(rotated).not.toBe(first);
    expect(rotated).toMatch(/^[0-9a-f]{48}$/);
    expect(readTokenFile(tokenFile())).toBe(rotated);
    expect(modeOf(tokenFile())).toBe(0o600);
  });

  it('throws env_token_immutable and leaves the file byte-identical when an env token is set', () => {
    ensureStudioToken({ env: {}, home });
    const before = readFileSync(tokenFile());

    let error;
    try {
      rotateStudioToken({ env: { STUDIO_BRIDGE_TOKEN: 'env-token' }, home });
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.code).toBe('env_token_immutable');
    expect(readFileSync(tokenFile())).toEqual(before);
  });
});

describe('maskToken', () => {
  it('never returns the input and keeps the first four and last four characters', () => {
    const masked = maskToken('abcdefghijklmnop');

    expect(masked).not.toBe('abcdefghijklmnop');
    expect(masked).toContain('abcd');
    expect(masked).toContain('mnop');
    expect(masked).not.toContain('efgh');
  });

  it('handles empty and short tokens without leaking them', () => {
    expect(maskToken('')).toBe('••••');
    expect(maskToken('short')).not.toBe('short');
    expect(maskToken(null)).toBe('••••');
  });
});

describe('createTokenGetter', () => {
  it('re-reads a rewritten token after mtime/size changes', () => {
    const first = ensureStudioToken({ env: {}, home });
    const getToken = createTokenGetter({ env: {}, home });

    expect(getToken()).toBe(first);

    const newer = 'c'.repeat(40);
    writeTokenFile(tokenFile(), newer);
    const future = new Date(Date.now() + 2000);
    utimesSync(tokenFile(), future, future);

    expect(getToken()).toBe(newer);
  });

  it('returns the cached value when the stat is unchanged', () => {
    const first = ensureStudioToken({ env: {}, home });
    const getToken = createTokenGetter({ env: {}, home });

    expect(getToken()).toBe(first);
    expect(getToken()).toBe(first);
    expect(getToken()).toBe(first);
  });

  it('honors an env token without touching the file', () => {
    const getToken = createTokenGetter({
      env: { STUDIO_BRIDGE_TOKEN: 'env-token' },
      home,
    });

    expect(getToken()).toBe('env-token');
    expect(getToken()).toBe('env-token');
    expect(existsSync(tokenFile())).toBe(false);
  });
});
