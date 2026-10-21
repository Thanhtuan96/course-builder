import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  AGENT_ENV_DENYLIST,
  DEFAULT_ORIGINS,
  HOST_ALLOWLIST,
  assertSafeAgentInvocation,
  buildAgentEnv,
  buildLearnerEnv,
  hasRequestBody,
  isAllowedHost,
  isJsonMediaType,
  isLoopbackAddress,
  isNullOrigin,
  isOriginAllowed,
  isWildcardOrigins,
  isWindowsCommandShim,
  parseHostHeader,
  parseOrigins,
  requiresJsonContentType,
  resolveExecutable,
  resolveExtraHosts,
  unsupportedWindowsShimMessage,
} from '../../web/security.js';

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'professor-helpers-'));
});

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('Host header parsing', () => {
  it('accepts loopback hosts on any valid port', () => {
    expect(parseHostHeader('localhost:3000')).toBe('localhost');
    expect(parseHostHeader('127.0.0.1:9')).toBe('127.0.0.1');
    expect(parseHostHeader('[::1]:3000')).toBe('[::1]');
    expect(isAllowedHost('localhost:3000')).toBe(true);
    expect(isAllowedHost('127.0.0.1:9')).toBe(true);
    expect(isAllowedHost('[::1]:3000')).toBe(true);
    expect(HOST_ALLOWLIST.has('localhost')).toBe(true);
  });

  it('rejects spoofed, malformed and userinfo hosts', () => {
    for (const host of [
      undefined,
      '',
      'evil.example',
      'localhost.evil',
      'localhost:abc',
      'evil@localhost',
      'localhost/path',
      ' localhost',
      'localhost:99999',
      '[::1]evil',
    ]) {
      expect(isAllowedHost(host)).toBe(false);
    }
    expect(parseHostHeader('localhost:abc')).toBeNull();
    expect(parseHostHeader('evil@localhost')).toBeNull();
  });

  it('accepts explicitly opted-in extra hosts only', () => {
    expect(isAllowedHost('example.test:4000', { extraHosts: ['example.test'] })).toBe(true);
    expect(isAllowedHost('example.test:4000')).toBe(false);
  });
});

describe('resolveExtraHosts', () => {
  it('returns [] by default', () => {
    expect(resolveExtraHosts({ env: {} })).toEqual([]);
  });

  it('returns the explicit host for 1/true', () => {
    expect(
      resolveExtraHosts({ env: { STUDIO_ALLOW_NON_LOOPBACK: '1' }, host: 'example.test' })
    ).toEqual(['example.test']);
    expect(
      resolveExtraHosts({
        env: { STUDIO_ALLOW_NON_LOOPBACK: 'true', HOST: '10.0.0.5' },
      })
    ).toEqual(['10.0.0.5']);
  });

  it('never returns a wildcard or ambiguous bind address', () => {
    expect(
      resolveExtraHosts({ env: { STUDIO_ALLOW_NON_LOOPBACK: '1', HOST: '0.0.0.0' } })
    ).toEqual([]);
    expect(
      resolveExtraHosts({ env: { STUDIO_ALLOW_NON_LOOPBACK: '1', HOST: '::' } })
    ).toEqual([]);
    expect(
      resolveExtraHosts({ env: { STUDIO_ALLOW_NON_LOOPBACK: '*,0.0.0.0' } })
    ).toEqual([]);
  });

  it('parses a comma-separated hostname list', () => {
    expect(
      resolveExtraHosts({ env: { STUDIO_ALLOW_NON_LOOPBACK: 'example.test, 10.0.0.5' } })
    ).toEqual(['example.test', '10.0.0.5']);
  });
});

describe('loopback and origins', () => {
  it('recognizes loopback client addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.0.0.2')).toBe(true);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it('keeps the documented default origin string', () => {
    expect(DEFAULT_ORIGINS).toBe('http://localhost:5180,http://127.0.0.1:5180');
    const origins = parseOrigins();
    expect(origins.has('http://localhost:5180')).toBe(true);
    expect(origins.has('http://127.0.0.1:5180')).toBe(true);
    expect(parseOrigins('').size).toBe(2);
  });

  it('allows exact members and always rejects the literal null origin', () => {
    const origins = parseOrigins('http://localhost:5180,http://127.0.0.1:5180');

    expect(isOriginAllowed('http://localhost:5180', origins)).toBe(true);
    expect(isOriginAllowed('http://evil.example', origins)).toBe(false);
    expect(isOriginAllowed('null', origins)).toBe(false);
    expect(isOriginAllowed(undefined, origins)).toBe(true);
    expect(isNullOrigin('null')).toBe(true);
    expect(isNullOrigin('NULL')).toBe(true);
    expect(isNullOrigin('http://localhost')).toBe(false);
  });

  it('supports wildcard mode without an emitted wildcard string', () => {
    const origins = parseOrigins('*');
    expect(isWildcardOrigins(origins)).toBe(true);
    expect(isWildcardOrigins(new Set(['http://localhost:5180']))).toBe(false);
    expect(isOriginAllowed('http://evil.example', origins)).toBe(true);
    expect(isOriginAllowed('null', origins)).toBe(false);
  });
});

describe('JSON media type and body gating', () => {
  it('accepts application/json with parameters and rejects +json', () => {
    expect(isJsonMediaType('application/json')).toBe(true);
    expect(isJsonMediaType('application/json; charset=utf-8')).toBe(true);
    expect(isJsonMediaType('Application/JSON;charset=UTF-8')).toBe(true);
    expect(isJsonMediaType('application/problem+json')).toBe(false);
    expect(isJsonMediaType('text/plain')).toBe(false);
    expect(isJsonMediaType('')).toBe(false);
    expect(isJsonMediaType(undefined)).toBe(false);
  });

  it('detects bodies from Content-Length and Transfer-Encoding', () => {
    expect(hasRequestBody({ headers: { 'content-length': '0' } })).toBe(false);
    expect(hasRequestBody({ headers: { 'content-length': '5' } })).toBe(true);
    expect(hasRequestBody({ headers: { 'transfer-encoding': 'chunked' } })).toBe(true);
    expect(hasRequestBody({})).toBe(false);
  });

  it('requires JSON for state-changing requests only when appropriate', () => {
    expect(
      requiresJsonContentType('POST', {
        headers: { 'content-type': 'text/plain', 'content-length': '3' },
      })
    ).toBe(true);
    expect(
      requiresJsonContentType('POST', {
        headers: { 'content-type': 'application/json', 'content-length': '3' },
      })
    ).toBe(false);
    expect(
      requiresJsonContentType('POST', { headers: { 'content-type': 'application/json' } })
    ).toBe(true);
    expect(requiresJsonContentType('GET', {})).toBe(false);
    expect(requiresJsonContentType('HEAD', {})).toBe(false);
    expect(requiresJsonContentType('OPTIONS', {})).toBe(false);
    expect(
      requiresJsonContentType('DELETE', { headers: { 'content-length': '0' } })
    ).toBe(false);
    expect(
      requiresJsonContentType('DELETE', {
        headers: { 'content-type': 'text/plain', 'content-length': '2' },
      })
    ).toBe(true);
  });
});

describe('agent environment allowlist', () => {
  const inherited = {
    PATH: '/usr/bin',
    HOME: '/home/learner',
    ANTHROPIC_API_KEY: 'anthropic-key',
    CLAUDE_API_KEY: 'claude-key',
    NODE_OPTIONS: '--require /tmp/evil.js',
    LD_PRELOAD: '/tmp/evil.so',
    DYLD_LIBRARY_PATH: '/tmp',
    BASH_ENV: '/tmp/evil.sh',
    OPENCODE_PERMISSION: '{"edit":"allow"}',
    CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    RANDOM_VAR: 'nope',
  };

  it('keeps only base keys and provider credentials', () => {
    const env = buildAgentEnv('claude', inherited);

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/learner');
    expect(env.ANTHROPIC_API_KEY).toBe('anthropic-key');
    expect(env.CLAUDE_API_KEY).toBe('claude-key');
    for (const key of [
      'NODE_OPTIONS',
      'LD_PRELOAD',
      'DYLD_LIBRARY_PATH',
      'BASH_ENV',
      'OPENCODE_PERMISSION',
      'CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS',
      'CLAUDE_CODE_ENTRYPOINT',
      'RANDOM_VAR',
    ]) {
      expect(env).not.toHaveProperty(key);
    }
    expect(AGENT_ENV_DENYLIST.has('NODE_OPTIONS')).toBe(true);
  });

  it('merges a test-only extraEnv only when explicitly requested', () => {
    expect(buildAgentEnv('claude', {})).not.toHaveProperty('PROFESSOR_CAPTURE_FILE');
    const env = buildAgentEnv('claude', {}, { extraEnv: { PROFESSOR_CAPTURE_FILE: '/tmp/x' } });
    expect(env.PROFESSOR_CAPTURE_FILE).toBe('/tmp/x');
    expect(Object.keys(env)).toEqual(['PROFESSOR_CAPTURE_FILE']);
  });

  it('keeps each provider credential for its agent', () => {
    expect(buildAgentEnv('gemini', { GEMINI_API_KEY: 'g' }).GEMINI_API_KEY).toBe('g');
    expect(buildAgentEnv('cursor', { CURSOR_API_KEY: 'c' }).CURSOR_API_KEY).toBe('c');
    expect(buildAgentEnv('antigravity', { GOOGLE_API_KEY: 'a' }).GOOGLE_API_KEY).toBe('a');
    expect(buildAgentEnv('ollama', { OLLAMA_HOST: 'http://127.0.0.1:11434' }).OLLAMA_HOST).toBe(
      'http://127.0.0.1:11434'
    );
  });

  it('never copies an inherited OpenCode config (the server builds it)', () => {
    const env = buildAgentEnv('opencode', {
      OPENCODE_CONFIG_CONTENT: '{"permission":{"edit":"allow"}}',
      OPENCODE_MODEL: 'model',
      PLACEHOLDER: 'x',
    });
    expect(env).not.toHaveProperty('OPENCODE_CONFIG_CONTENT');
    expect(env.OPENCODE_MODEL).toBe('model');
    expect(env).not.toHaveProperty('PLACEHOLDER');
  });
});

describe('learner environment scrub', () => {
  it('contains no API keys, option variables or loader paths', () => {
    const env = buildLearnerEnv({
      PATH: '/usr/bin',
      HOME: '/home/learner',
      USER: 'learner',
      ANTHROPIC_API_KEY: 'anthropic-key',
      OPENAI_API_KEY: 'openai-key',
      NODE_OPTIONS: '--require x',
      LD_PRELOAD: '/tmp/evil.so',
      DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib',
      PYTHONPATH: '/tmp',
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/learner');
    expect(env.USER).toBe('learner');
    for (const key of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'NODE_OPTIONS',
      'LD_PRELOAD',
      'DYLD_INSERT_LIBRARIES',
      'PYTHONPATH',
    ]) {
      expect(env).not.toHaveProperty(key);
    }
  });
});

describe('agent argv denylist', () => {
  const SAFE_ARGV = {
    claude: [
      '--print',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--system-prompt',
      'System',
      'hi',
    ],
    cursor: ['--print', '--output-format', 'stream-json', '--stream-partial-output', 'hi'],
    opencode: ['run', '--format', 'json', 'hi'],
    gemini: ['-p', 'hi', '-o', 'stream-json', '--approval-mode', 'plan'],
    antigravity: ['-p', 'hi', '--output-format', 'stream-json', '--mode', 'plan'],
  };

  it('accepts every real bridge argv', () => {
    for (const [agent, argv] of Object.entries(SAFE_ARGV)) {
      expect(() => assertSafeAgentInvocation(agent, argv, {})).not.toThrow();
    }
  });

  const DENIED = [
    ['claude', ['--dangerously-skip-permissions']],
    ['claude', ['--allow-dangerously-skip-permissions']],
    ['claude', ['--permission-mode=bypassPermissions']],
    ['claude', ['--permission-mode', 'acceptEdits']],
    ['claude', ['--permission-mode=auto']],
    ['claude', ['--enable-auto-mode']],
    ['cursor', ['--force']],
    ['cursor', ['-f']],
    ['cursor', ['--yolo']],
    ['cursor', ['--trust']],
    ['cursor', ['--approve-mcps']],
    ['cursor', ['--sandbox', 'disabled']],
    ['cursor', ['--sandbox=disabled']],
    ['opencode', ['--auto']],
    ['opencode', ['--dangerously-skip-permissions']],
    ['gemini', ['--yolo']],
    ['gemini', ['-y']],
    ['gemini', ['--skip-trust']],
    ['gemini', ['--allowed-tools', 'Bash']],
    ['gemini', ['--approval-mode=yolo']],
    ['gemini', ['--approval-mode', 'auto_edit']],
    ['antigravity', ['--dangerously-skip-permissions']],
    ['antigravity', ['--agent', 'custom']],
    ['antigravity', ['--remote-control']],
    ['antigravity', ['--mode', 'default']],
    ['antigravity', ['--mode=accept-edits']],
  ];

  for (const [agent, argv] of DENIED) {
    it(`rejects ${agent} ${argv.join(' ')}`, () => {
      let error;
      try {
        assertSafeAgentInvocation(agent, argv, {});
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.code).toBe('unsafe_invocation');
    });
  }

  it('rejects a deny-listed env key that survived into the final env', () => {
    let error;
    try {
      assertSafeAgentInvocation('claude', [], { PATH: '/usr/bin', NODE_OPTIONS: '--require x' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(error.code).toBe('unsafe_invocation');
    expect(error.message).toContain('NODE_OPTIONS');
  });

  it('accepts the allowlisted env built for an agent', () => {
    const env = buildAgentEnv('claude', {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'key',
      NODE_OPTIONS: '--require x',
    });
    expect(() => assertSafeAgentInvocation('claude', SAFE_ARGV.claude, env)).not.toThrow();
  });
});

describe('executable resolution and Windows shims', () => {
  it('resolves a command on PATH', () => {
    const bin = join(tempDir, 'fake-agent');
    writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
    chmodSync(bin, 0o755);

    expect(resolveExecutable('fake-agent', { platform: 'linux', pathValue: tempDir })).toBe(bin);
    expect(resolveExecutable('missing-agent', { platform: 'linux', pathValue: tempDir })).toBeNull();
  });

  it('resolves .cmd shims on win32 with PATHEXT', () => {
    const bin = join(tempDir, 'fake.cmd');
    writeFileSync(bin, '@echo off\n');

    expect(resolveExecutable('fake', { platform: 'win32', pathValue: tempDir })).toBe(bin);
  });

  it('detects Windows command shims only on win32', () => {
    expect(isWindowsCommandShim('C:\\tools\\claude.cmd', 'win32')).toBe(true);
    expect(isWindowsCommandShim('C:\\tools\\claude.BAT', 'win32')).toBe(true);
    expect(isWindowsCommandShim('/usr/local/bin/claude', 'linux')).toBe(false);
    expect(isWindowsCommandShim('C:\\tools\\claude.exe', 'win32')).toBe(false);
  });

  it('produces the documented unsupported-shim message', () => {
    const message = unsupportedWindowsShimMessage('Claude', 'C:\\tools\\claude.cmd');
    expect(message).toContain('C:\\tools\\claude.cmd');
    expect(message).toContain('.cmd/.bat');
    expect(message).toContain('unsupported');
  });
});
