/**
 * security.js — the single home for Phase 2 security helpers.
 *
 * This module is deliberately pure-ish: it owns token file operations, path containment and the
 * Host/Origin/JSON/env/argv predicates. It does not install Express middleware or open sockets, so
 * every later plan composes the same tested contract.
 *
 * Token resolution order (D-01): `STUDIO_BRIDGE_TOKEN` -> existing token file -> one-time legacy
 * migration -> a freshly generated 24-byte hex token. Every write re-applies mode `0600`.
 */
import { randomBytes } from 'crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'path';

/* ------------------------------------------------------------------ token lifecycle */

/**
 * Default token root. Kept as an exported constant for compatibility, but every helper accepts an
 * explicit `home`/`env.PROFESSOR_HOME` and never falls back to this value when one is supplied.
 */
export const PROFESSOR_HOME =
  process.env.PROFESSOR_HOME || join(homedir(), '.professor');

/** Resolve a token root without consulting the real home when the caller supplied one. */
function resolveHome({ env = {}, home } = {}) {
  return home || env.PROFESSOR_HOME || join(homedir(), '.professor');
}

/**
 * Absolute path of the pairing token file.
 * @param {Record<string, string|undefined>} [env]
 * @returns {string}
 */
export function tokenFilePath(env = process.env) {
  return join(resolveHome({ env }), 'studio-token');
}

/**
 * Legacy token path (`web/.studio-token`) for a repository root.
 * @param {string} repoRoot
 * @returns {string}
 */
export function legacyTokenPath(repoRoot) {
  return join(repoRoot, 'web', '.studio-token');
}

/**
 * Read a token file without ever writing to it. Returns `null` when missing or empty.
 * @param {string} file
 * @returns {string|null}
 */
export function readTokenFile(file) {
  try {
    const token = readFileSync(file, 'utf-8').trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Atomically write a token file with mode `0600` (mode is re-applied even when the file existed).
 * @param {string} file
 * @param {string} token
 * @returns {string} the file path
 */
export function writeTokenFile(file, token) {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* best effort: existing directories may be owned differently on exotic platforms */
  }
  const tmp = join(
    dir,
    `.studio-token.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`
  );
  try {
    writeFileSync(tmp, `${token}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
  return file;
}

/**
 * Migrate a legacy `web/.studio-token` exactly once (D-02).
 *
 * Runs only when there is no env override and no new token file. The new file is written before the
 * legacy file is deleted; when the new file already exists the legacy file is left untouched.
 * @param {{ env?: Record<string,string|undefined>, legacyFile?: string, file?: string }} [opts]
 * @returns {string|null}
 */
export function migrateLegacyToken({ env = {}, legacyFile, file } = {}) {
  if (env.STUDIO_BRIDGE_TOKEN) return null;
  if (!legacyFile || !file) return null;
  if (existsSync(file)) return null;
  const token = readTokenFile(legacyFile);
  if (!token) return null;
  writeTokenFile(file, token);
  try {
    rmSync(legacyFile, { force: true });
  } catch {
    /* best effort: the new token is already persisted */
  }
  return token;
}

/**
 * Resolve the pairing token, generating and persisting it only when necessary.
 * @param {{ env?: Record<string,string|undefined>, home?: string, legacyFile?: string,
 *           log?: (...a:any[])=>void }} [opts]
 * @returns {string}
 */
export function ensureStudioToken({ env = process.env, home, legacyFile, log } = {}) {
  if (env.STUDIO_BRIDGE_TOKEN) return env.STUDIO_BRIDGE_TOKEN;

  const root = resolveHome({ env, home });
  const file = join(root, 'studio-token');

  const existing = readTokenFile(file);
  if (existing) {
    try {
      chmodSync(file, 0o600);
    } catch (err) {
      log?.(`Warning: could not chmod ${file}: ${err.message}`);
    }
    return existing;
  }

  const migrated = migrateLegacyToken({ env, legacyFile, file });
  if (migrated) return migrated;

  const token = randomBytes(24).toString('hex');
  try {
    writeTokenFile(file, token);
  } catch (err) {
    log?.(`Warning: could not write ${file}: ${err.message}`);
  }
  return token;
}

/**
 * Fixed-width first-four/last-four mask. Never returns the full token (D-05).
 * @param {string} token
 * @returns {string}
 */
export function maskToken(token) {
  if (typeof token !== 'string' || token.length === 0) return '••••';
  if (token.length <= 8) return '•'.repeat(token.length);
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Create a cached getter that re-reads the token file when `mtimeMs`/`size` change (D-23).
 * @param {{ env?: Record<string,string|undefined>, home?: string, legacyFile?: string,
 *           log?: (...a:any[])=>void }} [opts]
 * @returns {() => string}
 */
export function createTokenGetter({ env = process.env, home, legacyFile, log } = {}) {
  const root = resolveHome({ env, home });
  const file = join(root, 'studio-token');
  let cache = null;

  return function getToken() {
    if (env.STUDIO_BRIDGE_TOKEN) return env.STUDIO_BRIDGE_TOKEN;

    let info = null;
    try {
      info = statSync(file);
    } catch {
      info = null;
    }

    if (cache && info && cache.mtimeMs === info.mtimeMs && cache.size === info.size) {
      return cache.token;
    }

    const token = readTokenFile(file);
    if (token && info) {
      cache = { token, mtimeMs: info.mtimeMs, size: info.size };
      return token;
    }

    const created = ensureStudioToken({ env, home, legacyFile, log });
    try {
      const after = statSync(file);
      cache = { token: created, mtimeMs: after.mtimeMs, size: after.size };
    } catch {
      cache = { token: created, mtimeMs: 0, size: 0 };
    }
    return created;
  };
}

/**
 * Generate and atomically persist a new token. Refuses when `STUDIO_BRIDGE_TOKEN` is set (D-23).
 * @param {{ env?: Record<string,string|undefined>, home?: string, legacyFile?: string,
 *           log?: (...a:any[])=>void }} [opts]
 * @returns {string}
 */
export function rotateStudioToken({ env = process.env, home } = {}) {
  if (env.STUDIO_BRIDGE_TOKEN) {
    const err = new Error('STUDIO_BRIDGE_TOKEN is set; environment tokens cannot be rotated');
    err.code = 'env_token_immutable';
    throw err;
  }
  const root = resolveHome({ env, home });
  const file = join(root, 'studio-token');
  const token = randomBytes(24).toString('hex');
  writeTokenFile(file, token);
  return token;
}

/* ------------------------------------------------------------------ path containment */

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const COURSE_FILES = new Set(['COURSE.md', 'LECTURE.md', 'NOTES.md', 'CAPSTONE.md']);
const EXERCISE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;

function unsafePath(message) {
  const err = new Error(message);
  err.code = 'unsafe_path';
  return err;
}

/**
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isSafeSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= 120 &&
    SLUG.test(slug)
  );
}

/**
 * @param {unknown} file
 * @returns {boolean}
 */
export function isSafeCourseFile(file) {
  return typeof file === 'string' && COURSE_FILES.has(file);
}

/**
 * @param {unknown} filename
 * @returns {boolean}
 */
export function isSafeExerciseFilename(filename) {
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    filename.length <= 200 &&
    !filename.includes('..') &&
    EXERCISE_FILENAME.test(filename)
  );
}

/**
 * @param {unknown} relPath
 * @returns {boolean}
 */
export function isSafeWorkspaceRelPath(relPath) {
  if (typeof relPath !== 'string') return false;
  if (!relPath || relPath.length > 512) return false;
  if (CONTROL_CHARS.test(relPath)) return false;
  if (relPath.startsWith('/') || relPath.startsWith('~')) return false;
  if (WINDOWS_DRIVE.test(relPath)) return false;
  if (relPath.includes('\\')) return false;
  if (relPath.endsWith('/')) return false;
  return relPath.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

/** True when `child` is `parent` or nested inside it (case-sensitive lexical check). */
function isWithin(child, parent) {
  if (child === parent) return true;
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}

/** Decode one URL-encoded segment and re-validate it; throws on any unsafe form. */
function decodeSegment(segment) {
  if (typeof segment !== 'string') throw unsafePath('Unsafe path segment: not a string');
  if (!segment) throw unsafePath('Unsafe path segment: empty');
  if (CONTROL_CHARS.test(segment)) throw unsafePath('Unsafe path segment: control character');

  let decoded;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw unsafePath(`Unsafe path segment: ${segment}`);
  }

  if (!decoded) throw unsafePath('Unsafe path segment: empty');
  if (CONTROL_CHARS.test(decoded)) throw unsafePath('Unsafe path segment: control character');
  if (decoded.includes('%')) throw unsafePath(`Unsafe path segment: ${segment}`);
  if (decoded.includes('/') || decoded.includes('\\')) {
    throw unsafePath(`Unsafe path segment: ${segment}`);
  }
  if (decoded === '.' || decoded === '..') throw unsafePath(`Unsafe path segment: ${decoded}`);
  if (decoded.startsWith('~')) throw unsafePath(`Unsafe path segment: ${segment}`);
  if (isAbsolute(decoded) || WINDOWS_DRIVE.test(decoded)) {
    throw unsafePath(`Unsafe path segment: ${segment}`);
  }
  return decoded;
}

/** Realpath of `p`, or of its nearest existing ancestor with the missing suffix re-appended. */
function realpathOfNearest(p) {
  let current = resolve(p);
  const missing = [];
  while (true) {
    try {
      return { real: realpathSync.native(current), missing };
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
      const parent = dirname(current);
      if (parent === current) {
        return { real: current, missing };
      }
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * Resolve `segments` under `root`, rejecting lexical, encoded, backslash, absolute and symlink
 * escapes for both reads and writes.
 * @param {string} root
 * @param {...string} segments
 * @returns {string} absolute path safely inside `root`
 */
export function resolveInside(root, ...segments) {
  if (typeof root !== 'string' || !root) throw unsafePath('Unsafe path root');
  if (CONTROL_CHARS.test(root)) throw unsafePath('Unsafe path root');

  const absoluteRoot = resolve(root);
  const decoded = segments.map(decodeSegment);
  const candidate = resolve(absoluteRoot, ...decoded);

  if (candidate !== absoluteRoot && !candidate.startsWith(absoluteRoot + sep)) {
    throw unsafePath(`Refusing to resolve outside root: ${segments.join('/')}`);
  }

  const { real: realBase } = realpathOfNearest(absoluteRoot);

  let probe = candidate;
  while (true) {
    let info;
    try {
      info = lstatSync(probe);
    } catch {
      info = null;
    }
    if (info) {
      if (probe === candidate && info.isSymbolicLink()) {
        throw unsafePath(`Refusing to follow symlink: ${candidate}`);
      }
      const realProbe = realpathSync.native(probe);
      if (!isWithin(realProbe, realBase)) {
        throw unsafePath(`Refusing to resolve outside root: ${candidate}`);
      }
      break;
    }
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }

  return candidate;
}

/**
 * Safely write `content` to `segments` under `root`. Directories are created only after every
 * containment check passes; the last component is opened with `O_NOFOLLOW` where available.
 * @param {string} root
 * @param {string[]|string} segments
 * @param {string} content
 * @returns {string} the written path
 */
export function safeWriteFile(root, segments, content) {
  const parts = Array.isArray(segments) ? segments : [segments];
  const target = resolveInside(root, ...parts);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });

  const flags =
    fsConstants.O_WRONLY |
    fsConstants.O_CREAT |
    fsConstants.O_TRUNC |
    (fsConstants.O_NOFOLLOW || 0);
  let fd;
  try {
    fd = openSync(target, flags, 0o600);
    writeFileSync(fd, content);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return target;
}

/* ------------------------------------------------------------------ Host and Origin */

export const HOST_ALLOWLIST = new Set(['localhost', '127.0.0.1', '[::1]']);

const WILDCARD_HOSTS = new Set(['*', '0.0.0.0', '::', '[::]', '']);

/**
 * Parse a raw `Host` header into a normalized hostname, or `null` when malformed.
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseHostHeader(value) {
  if (typeof value !== 'string') return null;
  if (!value || value !== value.trim()) return null;
  if (/\s/.test(value) || CONTROL_CHARS.test(value)) return null;
  if (value.includes('/') || value.includes('?') || value.includes('#')) return null;

  let url;
  try {
    url = new URL(`http://${value}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.pathname !== '/' || url.search || url.hash) return null;
  if (!url.hostname) return null;
  return url.hostname.toLowerCase();
}

/**
 * @param {unknown} value raw Host header
 * @param {{ extraHosts?: string[] }} [opts]
 * @returns {boolean}
 */
export function isAllowedHost(value, { extraHosts = [] } = {}) {
  const hostname = parseHostHeader(value);
  if (!hostname) return false;
  if (HOST_ALLOWLIST.has(hostname)) return true;
  for (const extra of extraHosts || []) {
    const normalized = parseHostHeader(String(extra));
    if (normalized && normalized === hostname) return true;
  }
  return false;
}

/**
 * True when `STUDIO_ALLOW_NON_LOOPBACK` explicitly opts in (truthy flag or host list).
 * `0`/`false`/`no`/`off` are treated as disabled.
 * @param {Record<string,string|undefined>} [env]
 * @returns {boolean}
 */
export function isNonLoopbackOptIn(env = process.env) {
  const raw = env.STUDIO_ALLOW_NON_LOOPBACK;
  if (raw === undefined || raw === null || raw === '') return false;
  const value = String(raw).trim().toLowerCase();
  return !(value === '0' || value === 'false' || value === 'no' || value === 'off');
}

/**
 * Resolve the explicit non-loopback Host opt-in. Never returns a wildcard address.
 * @param {{ env?: Record<string,string|undefined>, host?: string }} [opts]
 * @returns {string[]}
 */
export function resolveExtraHosts({ env = process.env, host } = {}) {
  const raw = env.STUDIO_ALLOW_NON_LOOPBACK;
  if (raw === undefined || raw === null || raw === '') return [];
  const value = String(raw).trim().toLowerCase();
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return [];
  const entries =
    value === '1' || value === 'true'
      ? [host || env.HOST]
      : String(raw)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

  const out = [];
  for (const entry of entries) {
    if (!entry) continue;
    const normalized = parseHostHeader(entry);
    const hostname = normalized || String(entry).toLowerCase();
    if (WILDCARD_HOSTS.has(hostname)) continue;
    if (!out.includes(hostname)) out.push(hostname);
  }
  return out;
}

/**
 * @param {unknown} address
 * @returns {boolean}
 */
export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || !address) return false;
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.')
  );
}

export const DEFAULT_ORIGINS = 'http://localhost:5180,http://127.0.0.1:5180';

/**
 * @param {string|Set<string>} [value]
 * @returns {Set<string>}
 */
export function parseOrigins(value = DEFAULT_ORIGINS) {
  if (value instanceof Set) return new Set(value);
  const set = new Set(
    String(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  return set.size ? set : new Set(DEFAULT_ORIGINS.split(','));
}

/**
 * @param {Set<string>|string[]|string} origins
 * @returns {boolean}
 */
export function isWildcardOrigins(origins) {
  if (origins instanceof Set) return origins.has('*');
  if (Array.isArray(origins)) return origins.includes('*');
  return String(origins || '')
    .split(',')
    .map((entry) => entry.trim())
    .includes('*');
}

/**
 * @param {unknown} origin
 * @returns {boolean}
 */
export function isNullOrigin(origin) {
  return typeof origin === 'string' && origin.trim().toLowerCase() === 'null';
}

/**
 * Exact origin membership. An absent Origin returns `true` (the token guard still runs); the
 * literal `null` origin is always rejected.
 * @param {unknown} origin
 * @param {Set<string>|string[]|string} origins
 * @param {{ allowAll?: boolean }} [opts]
 * @returns {boolean}
 */
export function isOriginAllowed(origin, origins, { allowAll = false } = {}) {
  if (origin === undefined || origin === null) return true;
  if (isNullOrigin(origin)) return false;
  const set = origins instanceof Set ? origins : parseOrigins(origins);
  if (allowAll || set.has('*')) return true;
  return set.has(origin);
}

/* ------------------------------------------------------------------ JSON media type */

function headerOf(input, name) {
  if (!input) return undefined;
  const headers = input.headers || input;
  const lower = name.toLowerCase();
  if (headers[lower] !== undefined) return headers[lower];
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * @param {unknown} value raw Content-Type header
 * @returns {boolean}
 */
export function isJsonMediaType(value) {
  if (typeof value !== 'string') return false;
  const [mediaType] = value.split(';');
  return String(mediaType).trim().toLowerCase() === 'application/json';
}

/**
 * @param {{ headers?: Record<string, unknown> }|Record<string, unknown>} reqOrHeaders
 * @returns {boolean}
 */
export function hasRequestBody(reqOrHeaders) {
  const transferEncoding = headerOf(reqOrHeaders, 'transfer-encoding');
  if (transferEncoding) return true;
  const length = Number(headerOf(reqOrHeaders, 'content-length') || 0);
  return Number.isFinite(length) && length > 0;
}

/**
 * @param {string} method
 * @param {{ headers?: Record<string, unknown> }|Record<string, unknown>} reqOrHeaders
 * @returns {boolean}
 */
export function requiresJsonContentType(method, reqOrHeaders) {
  const verb = String(method || '').toUpperCase();
  const hasBody = hasRequestBody(reqOrHeaders);
  if (verb === 'POST' || verb === 'PUT' || verb === 'PATCH') {
    return !hasBody || !isJsonMediaType(headerOf(reqOrHeaders, 'content-type'));
  }
  if (verb === 'DELETE') {
    return hasBody && !isJsonMediaType(headerOf(reqOrHeaders, 'content-type'));
  }
  return false;
}

/* ------------------------------------------------------------------ agent env / argv */

export const AGENT_ENV_ALLOWLIST = Object.freeze([
  // POSIX essentials.
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  // Windows process/runtime essentials.
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'WINDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
]);

export const LEARNER_ENV_ALLOWLIST = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'WINDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
]);

/** Exact deny keys plus prefix entries ending in `*`. */
export const AGENT_ENV_DENYLIST = new Set([
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'DYLD_*',
  'BASH_ENV',
  'ENV',
  'SHELLOPTS',
  'BASHOPTS',
  'PS4',
  'PROMPT_COMMAND',
  'CDPATH',
  'PERL5LIB',
  'PERL5OPT',
  'PERL5DB',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'PYTHONHOME',
  'RUBYOPT',
  'RUBYLIB',
  'JAVA_TOOL_OPTIONS',
  '_JAVA_OPTIONS',
  'JDK_JAVA_OPTIONS',
  'MAVEN_OPTS',
  'GRADLE_OPTS',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_KEY_*',
  'GIT_CONFIG_VALUE_*',
  'GIT_SSH_COMMAND',
  'GIT_EXTERNAL_DIFF',
  'GIT_PAGER',
  'PAGER',
  'LESSOPEN',
  'LESSCLOSE',
  'SSH_ASKPASS',
  'SUDO_ASKPASS',
  'npm_config_*',
  'OPENCODE_PERMISSION',
  'CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS',
  'CLAUDECODE',
  'CLAUDE_CODE_*',
]);

/** @param {string} key @returns {boolean} */
function isDeniedEnvKey(key) {
  if (AGENT_ENV_DENYLIST.has(key)) return true;
  for (const entry of AGENT_ENV_DENYLIST) {
    if (entry.endsWith('*') && key.startsWith(entry.slice(0, -1))) return true;
  }
  return false;
}

const AGENT_CREDENTIALS = {
  claude: [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_API_KEY',
    'CLAUDE_CONFIG_DIR',
  ],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS'],
  cursor: ['CURSOR_API_KEY'],
  opencode: ['OPENCODE_CONFIG_CONTENT', 'OPENCODE_MODEL'],
  antigravity: ['GOOGLE_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS'],
  ollama: ['OLLAMA_HOST', 'OLLAMA_MODEL'],
};

/** Keys the server itself builds and therefore never copies from the inherited environment. */
const SERVER_BUILT_KEYS = new Set(['OPENCODE_CONFIG_CONTENT']);

/**
 * Build an allowlisted environment for an agent CLI (D-15).
 * @param {string} agent
 * @param {Record<string, string|undefined>} [env]
 * @param {{ extraEnv?: Record<string, string|undefined> }} [opts]
 * @returns {Record<string, string>}
 */
export function buildAgentEnv(agent, env = process.env, { extraEnv = {} } = {}) {
  const allowed = new Set([
    ...AGENT_ENV_ALLOWLIST,
    ...(AGENT_CREDENTIALS[agent] || []),
  ]);
  const out = {};
  for (const key of allowed) {
    if (SERVER_BUILT_KEYS.has(key)) continue;
    if (isDeniedEnvKey(key)) continue;
    const value = env?.[key];
    if (value !== undefined) out[key] = value;
  }
  for (const [key, value] of Object.entries(extraEnv || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Build the scrubbed environment for learner-run child processes (D-18).
 * @param {Record<string, string|undefined>} [env]
 * @returns {Record<string, string>}
 */
export function buildLearnerEnv(env = process.env) {
  const out = {};
  for (const key of LEARNER_ENV_ALLOWLIST) {
    if (isDeniedEnvKey(key)) continue;
    const value = env?.[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Per-agent denied flags (exact tokens; value-aware handling lives in the assert helper). */
export const AGENT_DENY_FLAGS = Object.freeze({
  claude: Object.freeze([
    '--dangerously-skip-permissions',
    '--allow-dangerously-skip-permissions',
    '--enable-auto-mode',
    '--permission-mode=bypassPermissions',
    '--permission-mode=acceptEdits',
    '--permission-mode=auto',
  ]),
  cursor: Object.freeze([
    '--force',
    '-f',
    '--yolo',
    '--trust',
    '--approve-mcps',
    '--sandbox=disabled',
  ]),
  opencode: Object.freeze(['--auto', '--dangerously-skip-permissions']),
  gemini: Object.freeze([
    '--yolo',
    '-y',
    '--skip-trust',
    '--allowed-tools',
    '--allowed-mcp-server-names',
  ]),
  antigravity: Object.freeze([
    '--dangerously-skip-permissions',
    '--agent',
    '--remote-control',
  ]),
  ollama: Object.freeze([]),
});

const UNIVERSAL_DENY_FLAGS = new Set([
  '--dangerously-skip-permissions',
  '--allow-dangerously-skip-permissions',
  '--yolo',
  '--force',
  '--trust',
]);

function unsafeInvocation(message, offending) {
  const err = new Error(message);
  err.code = 'unsafe_invocation';
  err.offending = offending;
  return err;
}

/**
 * Reject a deny-listed flag (including `--flag=value` forms) or env key before spawn (D-15).
 * @param {string} agent
 * @param {string[]} argv
 * @param {Record<string, string|undefined>} [env]
 * @returns {true}
 */
export function assertSafeAgentInvocation(agent, argv, env = process.env) {
  const args = Array.isArray(argv) ? argv.map(String) : [];
  const deny = new Set([
    ...(AGENT_DENY_FLAGS[agent] || []),
    ...UNIVERSAL_DENY_FLAGS,
  ]);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? undefined : arg.slice(eq + 1);
    const next = eq === -1 ? args[i + 1] : undefined;

    if (deny.has(arg) || deny.has(flag)) {
      throw unsafeInvocation(`Unsafe agent invocation flag: ${arg}`, arg);
    }

    if (flag === '--permission-mode' && agent === 'claude') {
      const mode = value !== undefined ? value : next;
      if (!mode || ['bypassPermissions', 'acceptEdits', 'auto'].includes(mode)) {
        throw unsafeInvocation(`Unsafe permission mode: ${mode || arg}`, arg);
      }
    }

    if (flag === '--approval-mode' && agent === 'gemini') {
      const mode = value !== undefined ? value : next;
      if (mode !== 'plan') {
        throw unsafeInvocation(`Unsafe approval mode: ${mode || arg}`, arg);
      }
    }

    if (flag === '--mode' && agent === 'antigravity') {
      const mode = value !== undefined ? value : next;
      if (mode !== 'plan') {
        throw unsafeInvocation(`Unsafe execution mode: ${mode || arg}`, arg);
      }
    }

    if (flag === '--sandbox' && agent === 'cursor') {
      const mode = value !== undefined ? value : next;
      if (mode === 'disabled') {
        throw unsafeInvocation(`Unsafe sandbox mode: ${mode}`, arg);
      }
    }
  }

  for (const key of Object.keys(env || {})) {
    if (isDeniedEnvKey(key)) {
      throw unsafeInvocation(`Unsafe environment variable for agent: ${key}`, key);
    }
  }

  return true;
}

/* ------------------------------------------------------------------ executables */

/**
 * Cross-platform command resolver. Returns an absolute path or `null`; never spawns a shell.
 * @param {string} command
 * @param {{ platform?: string, pathValue?: string, fs?: object, pathext?: string }} [opts]
 * @returns {string|null}
 */
export function resolveExecutable(
  command,
  { platform = process.platform, pathValue = process.env.PATH || '', fs = null, pathext } = {}
) {
  const io = fs || { statSync, readdirSync };
  const isWin = platform === 'win32';
  const exists = (candidate) => {
    try {
      return io.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };

  if (!command) return null;

  if (isAbsolute(command) || command.includes('/') || (isWin && command.includes('\\'))) {
    return exists(command) ? resolve(command) : null;
  }

  const dirs = String(pathValue || '')
    .split(isWin ? ';' : ':')
    .filter(Boolean);
  const exts = isWin
    ? String(pathext || process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .filter(Boolean)
    : [''];

  for (const dir of dirs) {
    if (isWin && typeof io.readdirSync === 'function') {
      // Match the actual directory entry case-insensitively so the returned path is the real
      // filename on both Windows and case-insensitive POSIX filesystems.
      let names;
      try {
        names = io.readdirSync(dir);
      } catch {
        names = null;
      }
      if (names) {
        for (const ext of exts) {
          const wanted = `${command}${ext}`.toLowerCase();
          const match = names.find((name) => name.toLowerCase() === wanted);
          if (match && exists(join(dir, match))) return resolve(join(dir, match));
        }
        const bare = names.find((name) => name.toLowerCase() === command.toLowerCase());
        if (bare && exists(join(dir, bare))) return resolve(join(dir, bare));
        continue;
      }
    }

    if (isWin) {
      for (const ext of exts) {
        const candidate = join(dir, command + ext);
        if (exists(candidate)) return resolve(candidate);
      }
      const bare = join(dir, command);
      if (exists(bare)) return resolve(bare);
    } else {
      const candidate = join(dir, command);
      if (exists(candidate)) return resolve(candidate);
    }
  }
  return null;
}

/**
 * @param {string} resolvedPath
 * @param {string} [platform]
 * @returns {boolean}
 */
export function isWindowsCommandShim(resolvedPath, platform = process.platform) {
  if (platform !== 'win32' || typeof resolvedPath !== 'string') return false;
  return /\.(cmd|bat)$/i.test(resolvedPath);
}

/**
 * @param {string} name
 * @param {string} resolvedPath
 * @returns {string}
 */
export function unsupportedWindowsShimMessage(name, resolvedPath) {
  return (
    `${name} is installed as a Windows batch shim (${resolvedPath}). ` +
    'The local bridge runs agents without a shell, so .cmd/.bat shims are unsupported in this beta. ' +
    'Install the native binary or use WSL.'
  );
}
