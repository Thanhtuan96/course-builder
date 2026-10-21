/**
 * web/legacy-server.js — the opt-in legacy HTTP surface.
 *
 * Everything the deprecated React client needs lives here: course read/write routes, agent
 * capability probes, the SSE chat proxy and the notification placeholder. The router is only
 * mounted by `createApp({ legacy: true })`; importing this module has no side effects (no listen,
 * no spawn, no directory creation, no logging).
 *
 * Security contract (Phase 2):
 *   - Every route sits behind the same Host -> Origin -> token -> JSON guards as Studio.
 *   - Slugs, course filenames and exercise filenames are exact allowlists and every path goes
 *     through `security.resolveInside` (decode, lexical + realpath/symlink containment).
 *   - Agent spawns reuse the Plan 04 hardened runners (allowlisted env, temp cwd, shell-less,
 *     deny-checked argv); no legacy bypass flag/env survives.
 *   - Capability/model probes run through a 30s TTL cache backed by the shared shell-less
 *     `detectAgents`/`listAgentModels`, never a per-request `which` probe.
 */
import express from 'express';
import { spawn } from 'child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'fs';
import { join, resolve, sep } from 'path';

import { archiveLecture } from './lecture-archive.js';
import { installGuards } from './studio-api/guards.js';
import {
  detectAgents,
  listAgentModels,
} from './studio-api/health.js';
import {
  buildAgentArgs,
  defaultAgentRunners,
} from './studio-api/agents.js';
import * as security from './security.js';


/* ------------------------------------------------------------------ constants */

export const LEGACY_COURSE_FILES = Object.freeze([
  'COURSE.md',
  'LECTURE.md',
  'NOTES.md',
  'CAPSTONE.md',
]);

const LEGACY_CAPABILITY_TTL_MS = 30000;

// Professor system prompt — instructs the AI to behave as a Socratic teaching assistant and to
// wrap any course files it creates in <file path="...">...</file> tags so the server can persist
// them. Moved verbatim from the pre-Phase-2 server.
export const PROFESSOR_SYSTEM_PROMPT = `You are Professor Claude — a Socratic technology mentor built into a web-based learning app.

## Your role
Teach users by asking questions, NOT by giving answers. Guide them to discover concepts themselves.
- Never write working code for the user
- Never complete exercises on their behalf
- Always ask "What have you tried?" before offering hints
- Give hints in layers: conceptual → pattern/tool → pseudo-code only

## Commands you handle
- \`professor:new-topic\` — Ask what they want to learn and their level (Beginner/Intermediate/Advanced/Expert), then create a course
- \`professor:next\` — Load the next not-started section into LECTURE.md
- \`professor:review\` — Socratic review: what's working → question → concept to study → next action
- \`professor:done\` — Confirm understanding verbally, then mark section complete
- \`professor:hint\` — Layer 1 (concept) → Layer 2 (tool/pattern) → Layer 3 (pseudo-code only)
- \`professor:stuck\` — Walk through what they tried → exact sticking point → smaller steps → analogy
- \`professor:discuss\` — Conceptual Q&A only
- \`professor:quiz\` — 5 questions matched to their level
- \`professor:syllabus\` — Describe course outline from COURSE.md
- \`professor:progress\` — Summarize completed/current/remaining sections

## Creating course files
When creating or updating course files, include them in your response wrapped in XML tags.
The app will save them automatically — do NOT mention the tags to the user.

When creating a NEW course (professor:new-topic), derive a URL-safe slug from the topic name
(e.g., "React Hooks" → "react-hooks") and include the slug in the path:

<file path="courses/react-hooks/COURSE.md">
[full file content here]
</file>

<file path="courses/react-hooks/CAPSTONE.md">
[full file content here]
</file>

When updating an EXISTING course file (professor:next, professor:done, etc.), use just the filename:

<file path="LECTURE.md">
[full file content here]
</file>

<file path="COURSE.md">
[updated content here]
</file>

## COURSE.md format
\`\`\`
# Course: {Topic Name}
**Level**: {Beginner/Intermediate/Advanced/Expert}
**Created**: {date}
**Last active**: {date}

## Syllabus
- ⬜ Section 1: {Name}
- ⬜ Section 2: {Name}
...

## Progress Log
(entries added as sections are completed)
\`\`\`

Status icons: ⬜ Not started | 🔄 In progress | ✅ Done

## LECTURE.md format
\`\`\`
# Section N: {Name}
**Status**: 🔄 In progress

## Concepts
[key concepts explained clearly]

## Exercise
[one focused exercise — they must solve it themselves]

## What to do
Read through this, then attempt the exercise. Use \`professor:review\` when ready, or \`professor:hint\` if stuck.
\`\`\`
`;

/* ------------------------------------------------------------------ path helpers */

function unsafe(message, status = 400) {
  const err = new Error(message);
  err.code = 'unsafe_path';
  err.status = status;
  return err;
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function realWithin(child, parent) {
  try {
    const realChild = realpathSync.native(child);
    const realParent = realpathSync.native(parent);
    return realChild === realParent || realChild.startsWith(realParent + sep);
  } catch {
    return false;
  }
}

/**
 * Decode a route param exactly once before validation. Express has already decoded it, so a
 * surviving `%` means the value was double encoded and is rejected by the allowlists anyway.
 * @param {unknown} value
 * @returns {string|null}
 */
function decodeParam(value) {
  if (typeof value !== 'string') return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * List courses under `coursesDir`. Symlinked course directories are skipped and a symlinked
 * COURSE.md is never read for metadata.
 * @param {string} [coursesDir]
 * @returns {Array<{name: string, slug: string, description: string}>}
 */
export function getCourses(coursesDir) {
  const root = resolve(coursesDir);
  if (!existsSync(root)) return [];

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const courses = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!security.isSafeSlug(entry.name)) continue;

    const courseDir = join(root, entry.name);
    if (isSymlink(courseDir)) continue;

    const metadata = { name: entry.name, slug: entry.name, description: '' };
    const courseFile = join(courseDir, 'COURSE.md');

    if (existsSync(courseFile) && !isSymlink(courseFile)) {
      try {
        const raw = security.resolveInside(root, entry.name, 'COURSE.md');
        const content = readFileSync(raw, 'utf-8');
        const titleMatch = content.match(/^#\s+(.+)$/m);
        if (titleMatch) metadata.name = titleMatch[1];
        const descMatch = content.match(/^#\s+.+\n\n(.+?)(?:\n\n#|\n$)/m);
        if (descMatch) metadata.description = descMatch[1].substring(0, 200);
      } catch {
        /* unreadable or unsafe: keep the slug-only metadata */
      }
    }

    courses.push(metadata);
  }

  return courses;
}

/**
 * Read one of the four known course files.
 * @param {string} slug
 * @param {string} file
 * @param {string} [coursesDir]
 * @returns {string|null}
 */
export function getCourseFile(slug, file, coursesDir) {
  if (!security.isSafeSlug(slug) || !security.isSafeCourseFile(file)) return null;

  let filePath;
  try {
    filePath = security.resolveInside(coursesDir, slug, file);
  } catch {
    return null;
  }

  if (isSymlink(filePath) || !existsSync(filePath)) return null;
  try {
    if (!lstatSync(filePath).isFile()) return null;
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * All exercises for a course. Symlinked exercise files and a symlinked `exercises` directory are
 * skipped, never read.
 * @param {string} slug
 * @param {string} [coursesDir]
 * @returns {Array<{filename: string, path: string, content: string}>}
 */
export function getExercises(slug, coursesDir) {
  if (!security.isSafeSlug(slug)) return [];

  let exercisesDir;
  try {
    exercisesDir = security.resolveInside(coursesDir, slug, 'exercises');
  } catch {
    return [];
  }
  if (!isDirectory(exercisesDir) || isSymlink(exercisesDir)) return [];

  let entries;
  try {
    entries = readdirSync(exercisesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const exercises = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!security.isSafeExerciseFilename(entry.name)) continue;

    let filePath;
    try {
      filePath = security.resolveInside(coursesDir, slug, 'exercises', entry.name);
    } catch {
      continue;
    }
    if (isSymlink(filePath)) continue;

    try {
      exercises.push({
        filename: entry.name,
        path: `exercises/${entry.name}`,
        content: readFileSync(filePath, 'utf-8'),
      });
    } catch {
      /* skip unreadable file */
    }
  }

  return exercises;
}

/**
 * Active exercise filename recorded in COURSE.md.
 * @param {string} slug
 * @param {string} [coursesDir]
 * @returns {string|null}
 */
export function getActiveExercise(slug, coursesDir) {
  const courseContent = getCourseFile(slug, 'COURSE.md', coursesDir);
  if (!courseContent) return null;
  const match = courseContent.match(/Active exercise:\s*exercises\/([^\s]+)/i);
  return match ? match[1] : null;
}

/**
 * Save one of the four course files. The LECTURE archive path is validated before
 * `archiveLecture` is called; a symlinked `lectures` directory rejects the write.
 *
 * @param {string} slug
 * @param {string} file
 * @param {string} content
 * @param {{ coursesDir: string, log?: (...a:any[])=>void }} options
 * @returns {{ success: boolean, error?: string, code?: string, status?: number }}
 */
export function saveCourseFile(slug, file, content, { coursesDir, log = () => {} } = {}) {
  if (!security.isSafeSlug(slug) || !security.isSafeCourseFile(file)) {
    return { success: false, error: 'Invalid course file', code: 'unsafe_path', status: 400 };
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Content is required', code: 'invalid_request', status: 400 };
  }

  const root = resolve(coursesDir);
  let courseDir;
  let filePath;
  try {
    courseDir = security.resolveInside(root, slug);
    filePath = security.resolveInside(root, slug, file);
  } catch (err) {
    const status = isSymlink(join(root, slug)) ? 403 : 400;
    return { success: false, error: err.message, code: 'unsafe_path', status };
  }

  if (isSymlink(courseDir)) {
    return {
      success: false,
      error: 'Refusing to write through a symlinked course directory',
      code: 'unsafe_path',
      status: 403,
    };
  }
  if (isSymlink(filePath)) {
    return {
      success: false,
      error: 'Refusing to write through a symlinked file',
      code: 'unsafe_path',
      status: 403,
    };
  }

  if (file === 'LECTURE.md' && existsSync(filePath)) {
    const lecturesDir = join(courseDir, 'lectures');
    let lecturesInfo = null;
    try {
      lecturesInfo = lstatSync(lecturesDir);
    } catch {
      lecturesInfo = null;
    }
    if (lecturesInfo) {
      if (lecturesInfo.isSymbolicLink()) {
        return {
          success: false,
          error: 'Refusing to archive through a symlinked lectures directory',
          code: 'unsafe_path',
          status: 403,
        };
      }
      if (!lecturesInfo.isDirectory() || !realWithin(lecturesDir, courseDir)) {
        return {
          success: false,
          error: 'Unsafe lectures directory',
          code: 'unsafe_path',
          status: 403,
        };
      }
    }

    const result = archiveLecture(courseDir, content);
    if (result.archived) {
      log(`Archived previous lecture -> courses/${slug}/${result.path}`);
    }
  }

  try {
    security.safeWriteFile(root, [slug, file], content);
    return { success: true };
  } catch (err) {
    const status = err.code === 'ELOOP' || isSymlink(filePath) ? 403 : 400;
    return {
      success: false,
      error: err.message,
      code: err.code === 'unsafe_path' ? 'unsafe_path' : 'write_failed',
      status,
    };
  }
}

/**
 * Save an exercise file under `<course>/exercises`.
 * @param {string} slug
 * @param {string} filename
 * @param {string} content
 * @param {{ coursesDir: string, log?: (...a:any[])=>void }} options
 * @returns {{ success: boolean, error?: string, code?: string, status?: number }}
 */
export function saveExerciseFile(slug, filename, content, { coursesDir, log = () => {} } = {}) {
  if (!security.isSafeSlug(slug) || !security.isSafeExerciseFilename(filename)) {
    return { success: false, error: 'Invalid exercise filename', code: 'unsafe_path', status: 400 };
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Content is required', code: 'invalid_request', status: 400 };
  }

  const root = resolve(coursesDir);
  let courseDir;
  try {
    courseDir = security.resolveInside(root, slug);
  } catch (err) {
    return { success: false, error: err.message, code: 'unsafe_path', status: 400 };
  }
  if (isSymlink(courseDir)) {
    return {
      success: false,
      error: 'Refusing to write through a symlinked course directory',
      code: 'unsafe_path',
      status: 403,
    };
  }

  const exercisesDir = join(courseDir, 'exercises');
  if (isSymlink(exercisesDir)) {
    return {
      success: false,
      error: 'Refusing to write through a symlinked exercises directory',
      code: 'unsafe_path',
      status: 403,
    };
  }
  if (existsSync(exercisesDir) && !isDirectory(exercisesDir)) {
    return { success: false, error: 'Invalid exercises path', code: 'unsafe_path', status: 400 };
  }

  try {
    security.safeWriteFile(root, [slug, 'exercises', filename], content);
    log(`Saved exercise ${filename} -> courses/${slug}/exercises/`);
    return { success: true };
  } catch (err) {
    const status = err.code === 'ELOOP' ? 403 : 400;
    return {
      success: false,
      error: err.message,
      code: err.code === 'unsafe_path' ? 'unsafe_path' : 'write_failed',
      status,
    };
  }
}

/**
 * Parse `<file path="...">...</file>` blocks from an AI response and save them, scoped to the
 * current course (D-25).
 *
 * - With `courseSlug`: only bare `FILE.md` and `courses/<courseSlug>/FILE.md` are honored.
 * - Without: exactly one `courses/<valid-slug>/...` is accepted when that directory does not
 *   already exist, and that slug is adopted for the rest of the response.
 *
 * @param {string} fullText
 * @param {string} courseSlug
 * @param {{ coursesDir: string, log?: (...a:any[])=>void }} options
 * @returns {Array<{ slug: string, file: string }>}
 */
export function saveFilesFromResponse(fullText, courseSlug, { coursesDir, log = () => {} } = {}) {
  const saved = [];
  if (typeof fullText !== 'string' || !coursesDir) return saved;

  const hasCurrent = typeof courseSlug === 'string' && courseSlug.length > 0;
  if (hasCurrent && !security.isSafeSlug(courseSlug)) return saved;

  let effectiveSlug = hasCurrent ? courseSlug : '';
  let adopted = false;

  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;

  while ((match = fileRegex.exec(fullText)) !== null) {
    const [, rawPath, content] = match;
    const target = String(rawPath || '').trim();
    if (!target) continue;

    const coursePathMatch = target.match(/^courses\/([^/]+)\/([^/]+)$/);
    let slug;
    let fileName;

    if (coursePathMatch) {
      const pathSlug = coursePathMatch[1];
      fileName = coursePathMatch[2];
      if (!security.isSafeSlug(pathSlug) || !security.isSafeCourseFile(fileName)) continue;

      if (effectiveSlug) {
        if (pathSlug !== effectiveSlug) continue;
      } else if (adopted) {
        if (pathSlug !== effectiveSlug) continue;
      } else {
        // Legacy new-topic: allow one brand-new course directory and adopt it.
        let existing = false;
        try {
          existing = existsSync(security.resolveInside(coursesDir, pathSlug));
        } catch {
          continue;
        }
        if (existing) continue;
        effectiveSlug = pathSlug;
        adopted = true;
      }
      slug = pathSlug;
    } else {
      if (target.includes('/') || target.includes('\\')) continue;
      if (!effectiveSlug || !security.isSafeCourseFile(target)) continue;
      slug = effectiveSlug;
      fileName = target;
    }

    try {
      security.resolveInside(coursesDir, slug, fileName);
    } catch {
      continue;
    }

    const result = saveCourseFile(slug, fileName, content.trim(), { coursesDir, log });
    if (result.success) {
      saved.push({ slug, file: fileName });
      log(`Saved ${fileName} -> courses/${slug}/`);
    }
  }

  return saved;
}

/* ------------------------------------------------------------------ capability cache */

/**
 * Tiny async TTL cache used for capability and model probes (CONCERNS #6). Keys are independent;
 * concurrent misses for the same key share one in-flight probe.
 *
 * @param {{ ttlMs?: number, now?: () => number,
 *           probe: (key: string, args?: object) => any }} options
 * @returns {{ get: (key?: string, args?: object) => Promise<any>,
 *             invalidate: (key?: string) => void, size: number }}
 */
export function createCapabilityCache({
  ttlMs = LEGACY_CAPABILITY_TTL_MS,
  now = Date.now,
  probe,
} = {}) {
  if (typeof probe !== 'function') {
    throw new TypeError('createCapabilityCache requires a probe function');
  }

  const entries = new Map();
  const pending = new Map();

  return {
    async get(key = 'capabilities', args) {
      const hit = entries.get(key);
      if (hit && now() - hit.at < ttlMs) return hit.value;

      if (pending.has(key)) return pending.get(key);

      const promise = Promise.resolve()
        .then(() => probe(key, args))
        .then((value) => {
          entries.set(key, { at: now(), value });
          return value;
        })
        .finally(() => {
          pending.delete(key);
        });

      pending.set(key, promise);
      return promise;
    },
    invalidate(key) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}

/* ------------------------------------------------------------------ capabilities */

function legacyCapabilities(base = {}, env = process.env, useCli) {
  const out = {};
  const source = base && typeof base === 'object' ? base : {};

  const defaults = {
    claude: { installed: false, supportsResume: true, supportsModelSelection: false },
    cursor: { installed: false, supportsResume: true, supportsModelSelection: true },
    opencode: { installed: false, supportsResume: true, supportsModelSelection: true },
    ollama: { installed: false, supportsResume: false, supportsModelSelection: true },
  };

  for (const [agent, fallback] of Object.entries(defaults)) {
    const entry = source[agent] || {};
    out[agent] = {
      ...fallback,
      ...entry,
      installed: Boolean(entry.installed ?? fallback.installed),
      supportsStreaming: true,
    };
  }
  if (useCli === true) out.claude.installed = true;
  if (out.ollama) {
    out.ollama.daemonReady = Boolean(out.ollama.reachable ?? out.ollama.daemonReady);
  }

  out.cloud = {
    available: Boolean(
      env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY || env.OPENAI_API_KEY
    ),
    supportsStreaming: true,
    supportsResume: false,
    supportsModelSelection: true,
  };

  return out;
}

/**
 * Resolve the provider the legacy chat should use.
 * @param {string} requestedProvider
 * @param {ReturnType<typeof legacyCapabilities>} capabilities
 * @returns {string}
 */
export function resolveProvider(requestedProvider, capabilities) {
  if (requestedProvider && requestedProvider !== 'auto') {
    if (requestedProvider === 'cloud') {
      return capabilities.cloud?.available ? 'cloud' : 'none';
    }
    if (!capabilities[requestedProvider]?.installed) return 'none';
    return requestedProvider;
  }

  const priority = ['claude', 'cursor', 'opencode', 'ollama', 'cloud'];
  for (const provider of priority) {
    if (provider === 'cloud' && capabilities.cloud?.available) return provider;
    if (provider !== 'cloud' && capabilities[provider]?.installed) return provider;
  }
  return 'none';
}

function cloudModels(env) {
  return env.OPENAI_API_KEY ? ['gpt-4o', 'gpt-4.1-mini'] : ['claude-sonnet-4-6'];
}

/* ------------------------------------------------------------------ agent runners */

/**
 * Claude CLI detection without a shell (replaces the old per-request `which claude` probe).
 * @param {{ platform?: string, pathValue?: string, fs?: object, pathext?: string }} [opts]
 * @returns {boolean}
 */
export function claudeCLIAvailable(opts = {}) {
  try {
    return Boolean(security.resolveExecutable('claude', opts));
  } catch {
    return false;
  }
}

/**
 * The legacy spawn factory. It delegates to Plan 04's hardened `defaultAgentRunners`, which owns
 * the shell-less spawn, temp cwd, allowlisted env and pre-spawn argv assertion. `extraEnv` is the
 * test-only capture hook; production callers pass nothing.
 *
 * @param {{ extraEnv?: Record<string, string|undefined> }} [options]
 * @returns {Record<string, Function>}
 */
export function createLegacyAgentRunners({ extraEnv = {} } = {}) {
  return defaultAgentRunners({ extraEnv });
}

/**
 * Safe argv for a legacy chat turn. Plan 04's builder is the single source of flags; the pre-spawn
 * assertion in `runJsonCli` re-checks it.
 * @param {string} agent
 * @param {{ system?: string, prompt: string, model?: string }} ctx
 * @returns {string[]}
 */
export function legacyAgentArgs(agent, ctx) {
  return buildAgentArgs(agent, ctx);
}

/* ------------------------------------------------------------------ SSE helpers */

function sendSSE(res, payload) {
  if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendSSEError(res, code, message, details = {}) {
  sendSSE(res, { error: message, errorCode: code, ...details });
  if (!res.writableEnded) res.end();
}

function flattenLegacyMessages(system, messages, includeSystem) {
  const parts = [];
  if (includeSystem && system) parts.push(`[System]\n${system}`);
  for (const message of messages || []) {
    const role = message.role === 'assistant' ? 'ASSISTANT' : 'USER';
    parts.push(`${role}: ${message.content}`);
  }
  return parts.join('\n\n');
}

function completeFromText(res, text, courseSlug, { coursesDir, log }) {
  const saved = saveFilesFromResponse(text, courseSlug, { coursesDir, log });
  if (saved.length > 0) {
    const bySlug = {};
    for (const { slug, file } of saved) {
      if (!bySlug[slug]) bySlug[slug] = [];
      bySlug[slug].push(file);
    }
    for (const [slug, files] of Object.entries(bySlug)) {
      sendSSE(res, { filesUpdated: files, courseSlug: slug });
    }
  }
  if (!res.writableEnded) {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

/* ------------------------------------------------------------------ dev server */

/**
 * Spawn Vite only in legacy dev mode, without a shell. Windows `.cmd` shims are unsupported for
 * beta and return the shared structured error instead of an opaque failure (D-16).
 *
 * @param {{ clientDir: string, spawnImpl?: Function, platform?: string,
 *           log?: (...a:any[])=>void, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ child: object|null, error: { code: string, message: string }|null,
 *             kill: () => void }}
 */
export function startLegacyDevServer({
  clientDir,
  spawnImpl = spawn,
  platform = process.platform,
  log = () => {},
  env = process.env,
} = {}) {
  if (platform === 'win32') {
    const message = security.unsupportedWindowsShimMessage('npm', 'npm.cmd');
    log(`[legacy] ${message}`);
    return { child: null, error: { code: 'unsupported_windows_shim', message }, kill() {} };
  }

  let command = 'npm';
  try {
    const resolved = security.resolveExecutable('npm', {
      platform,
      pathValue: env?.PATH,
    });
    if (resolved) command = resolved;
  } catch {
    /* fall back to the bare command */
  }

  const child = spawnImpl(command, ['run', 'dev'], {
    cwd: clientDir,
    shell: false,
    stdio: 'inherit',
    env,
  });

  child?.on?.('error', (err) => {
    log(`[legacy] Failed to start Vite: ${err.message}`);
  });

  return {
    child,
    error: null,
    kill() {
      child?.kill?.('SIGTERM');
    },
  };
}

/* ------------------------------------------------------------------ router */

/**
 * Build the guarded legacy router.
 *
 * @param {object} options
 * @param {string} options.coursesDir absolute or relative courses root
 * @param {string} [options.token] static token (back-compat)
 * @param {() => string} options.getToken token getter
 * @param {Set<string>|string|string[]} [options.origins]
 * @param {boolean} [options.allowNonLoopback]
 * @param {string[]} [options.extraHosts]
 * @param {Function} [options.spawnImpl]
 * @param {() => object} [options.capabilities]
 * @param {object} [options.capabilityCache]
 * @param {(agent: string, deps: object) => Promise<object>} [options.listAgentModels]
 * @param {Record<string, Function>} [options.runners]
 * @param {Record<string, string|undefined>} [options.extraEnv]
 * @param {boolean} [options.useCli]
 * @param {() => number} [options.now]
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {Function} [options.fetchImpl]
 * @param {(...a:any[])=>void} [options.log]
 * @returns {import('express').Router}
 */
export function createLegacyRouter({
  coursesDir,
  token,
  getToken,
  origins,
  allowNonLoopback = false,
  extraHosts = [],
  spawnImpl,
  capabilities = detectAgents,
  capabilityCache,
  listAgentModels: listModels = listAgentModels,
  runners,
  extraEnv = {},
  useCli = false,
  now = Date.now,
  env = process.env,
  fetchImpl = fetch,
  log = () => {},
} = {}) {
  if (!coursesDir) throw new TypeError('createLegacyRouter requires coursesDir');
  if (typeof getToken !== 'function') {
    throw new TypeError('createLegacyRouter requires a getToken function');
  }

  const root = resolve(coursesDir);
  const capabilitiesFn =
    typeof capabilities === 'function' ? capabilities : () => capabilities || {};

  const cache =
    capabilityCache ||
    createCapabilityCache({
      ttlMs: LEGACY_CAPABILITY_TTL_MS,
      now,
      probe: async (key, args = {}) => {
        if (key === 'capabilities') {
          const base = await capabilitiesFn();
          return legacyCapabilities(base, env, useCli);
        }
        if (typeof key === 'string' && key.startsWith('models:')) {
          return listModels(key.slice('models:'.length), {
            env,
            installed: args.installed !== false,
          });
        }
        throw new Error(`Unknown capability cache key: ${key}`);
      },
    });

  const agentRunners = runners || createLegacyAgentRunners({ extraEnv });

  const router = express.Router();
  const api = express.Router();

  installGuards(api, {
    token,
    getToken,
    origins,
    allowNonLoopback,
    extraHosts,
  });

  /* ---------------------------------------------------------------- course reads */

  api.get('/courses', (req, res) => {
    res.json(getCourses(root));
  });

  api.get('/courses/:slug/exercises', (req, res) => {
    const slug = decodeParam(req.params.slug);
    if (!security.isSafeSlug(slug)) {
      res.status(400).json({ error: 'Invalid course slug', code: 'unsafe_path' });
      return;
    }
    res.json({
      exercises: getExercises(slug, root),
      activeExercise: getActiveExercise(slug, root),
    });
  });

  api.get('/courses/:slug/exercises/:filename', (req, res) => {
    const slug = decodeParam(req.params.slug);
    const filename = decodeParam(req.params.filename);
    if (!security.isSafeSlug(slug) || !security.isSafeExerciseFilename(filename)) {
      res.status(400).json({ error: 'Invalid exercise path', code: 'unsafe_path' });
      return;
    }

    let filePath;
    try {
      filePath = security.resolveInside(root, slug, 'exercises', filename);
    } catch (err) {
      res.status(403).json({ error: err.message, code: 'unsafe_path' });
      return;
    }
    if (isSymlink(filePath)) {
      res.status(403).json({ error: 'Unsafe exercise path', code: 'unsafe_path' });
      return;
    }
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'Exercise not found', code: 'not_found' });
      return;
    }
    try {
      const content = readFileSync(filePath, 'utf-8');
      res.json({ content, filename });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  api.get('/courses/:slug/:file', (req, res) => {
    const slug = decodeParam(req.params.slug);
    const file = decodeParam(req.params.file);
    if (!security.isSafeSlug(slug) || !security.isSafeCourseFile(file)) {
      res.status(400).json({ error: 'Invalid course file', code: 'unsafe_path' });
      return;
    }
    const content = getCourseFile(slug, file, root);
    if (content === null) {
      res.status(404).json({ error: 'File not found', code: 'not_found' });
      return;
    }
    res.json({ content });
  });

  /* ---------------------------------------------------------------- course writes */

  api.post('/courses/:slug/exercises/:filename', (req, res) => {
    const slug = decodeParam(req.params.slug);
    const filename = decodeParam(req.params.filename);
    if (!security.isSafeSlug(slug) || !security.isSafeExerciseFilename(filename)) {
      res.status(400).json({ error: 'Invalid exercise path', code: 'unsafe_path' });
      return;
    }
    const { content } = req.body || {};
    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    const result = saveExerciseFile(slug, filename, content, { coursesDir: root, log });
    if (!result.success) {
      res.status(result.status || 400).json({ error: result.error, code: result.code });
      return;
    }
    res.json({ success: true });
  });

  api.post('/courses/:slug/:file', (req, res) => {
    const slug = decodeParam(req.params.slug);
    const file = decodeParam(req.params.file);
    if (!security.isSafeSlug(slug) || !security.isSafeCourseFile(file)) {
      res.status(400).json({ error: 'Invalid course file', code: 'unsafe_path' });
      return;
    }
    const { content } = req.body || {};
    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    const result = saveCourseFile(slug, file, content, { coursesDir: root, log });
    if (!result.success) {
      res.status(result.status || 400).json({ error: result.error, code: result.code });
      return;
    }
    res.json({ success: true });
  });

  /* ---------------------------------------------------------------- agents */

  api.get('/agents/capabilities', async (req, res) => {
    try {
      const capabilitiesValue = await cache.get('capabilities');
      res.json({ capabilities: capabilitiesValue });
    } catch (err) {
      res.status(500).json({ error: err.message, code: err.code || 'server' });
    }
  });

  api.get('/agents/models', async (req, res) => {
    const provider = String(req.query.provider || 'auto');
    try {
      const capabilitiesValue = await cache.get('capabilities');
      const resolved = resolveProvider(provider, capabilitiesValue);

      if (resolved === 'none') {
        res.json({ provider: resolved, supportsModelSelection: false, allowCustomModel: false, models: [] });
        return;
      }
      if (resolved === 'cloud') {
        res.json({
          provider: resolved,
          supportsModelSelection: true,
          allowCustomModel: false,
          models: cloudModels(env),
        });
        return;
      }
      if (resolved === 'claude') {
        res.json({
          provider: resolved,
          supportsModelSelection: false,
          allowCustomModel: false,
          models: [],
        });
        return;
      }

      const result = await cache.get(`models:${resolved}`, {
        agent: resolved,
        installed: capabilitiesValue[resolved]?.installed !== false,
      });
      const models = (result?.models || [])
        .map((model) => (typeof model === 'string' ? model : model?.id))
        .filter(Boolean);

      res.json({
        provider: resolved,
        supportsModelSelection: true,
        allowCustomModel: true,
        models,
      });
    } catch (err) {
      res.status(500).json({ error: err.message, code: err.code || 'server' });
    }
  });

  /* ---------------------------------------------------------------- chat */

  api.post('/chat', async (req, res) => {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const courseSlug = typeof body.courseSlug === 'string' ? body.courseSlug : '';
    const provider = typeof body.provider === 'string' ? body.provider : 'auto';
    const model = typeof body.model === 'string' ? body.model : undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const lastUser = [...messages].reverse().find((message) => message?.role === 'user');
    if (!lastUser) {
      sendSSEError(res, 'missing_message', 'No user message provided.');
      return;
    }

    let capabilitiesValue;
    try {
      capabilitiesValue = await cache.get('capabilities');
    } catch (err) {
      sendSSEError(res, 'capabilities_failed', err.message);
      return;
    }

    const selectedProvider = resolveProvider(provider, capabilitiesValue);
    if (selectedProvider === 'none') {
      sendSSEError(
        res,
        'no_provider_available',
        'No local provider or cloud API is available.'
      );
      return;
    }

    sendSSE(res, { provider: selectedProvider });

    if (selectedProvider === 'cloud') {
      await streamViaCloud({
        res,
        messages,
        courseSlug,
        root,
        env,
        fetchImpl,
        log,
      });
      return;
    }

    const runner = agentRunners[selectedProvider];
    if (typeof runner !== 'function') {
      sendSSEError(res, 'no_provider_available', `No runner for provider ${selectedProvider}.`);
      return;
    }

    const system = PROFESSOR_SYSTEM_PROMPT;
    const includeSystem = selectedProvider !== 'claude';
    const prompt = flattenLegacyMessages(system, messages, includeSystem);

    let fullText = '';
    let ended = false;
    let handle = null;

    const finish = () => {
      if (ended) return;
      ended = true;
      completeFromText(res, fullText, courseSlug, { coursesDir: root, log });
    };

    try {
      handle = runner({
        system,
        prompt,
        model,
        messages,
        onText(text) {
          if (typeof text !== 'string' || !text || ended) return;
          fullText += text;
          sendSSE(res, { content: text });
        },
        onError(error) {
          if (ended) return;
          ended = true;
          sendSSEError(res, error?.code || 'agent_failed', error?.message || 'Agent failed.');
        },
        onDone: finish,
        log,
      });
    } catch (err) {
      ended = true;
      sendSSEError(res, 'agent_failed', err.message);
      return;
    }

    res.on('close', () => {
      if (!res.writableEnded) {
        ended = true;
        handle?.kill?.();
      }
    });
  });

  api.post('/notify', (req, res) => {
    res.json({ success: true, message: 'Notification sent' });
  });

  router.use('/api', api);

  return router;
}

/* ------------------------------------------------------------------ cloud fallback */

async function streamViaCloud({ res, messages, courseSlug, root, env, fetchImpl, log }) {
  const apiKey =
    env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY || env.OPENAI_API_KEY;

  if (!apiKey) {
    sendSSEError(res, 'no_api_key', 'No API key configured. Run: export ANTHROPIC_API_KEY=your-key');
    return;
  }

  const apiMessages = messages
    .filter((message) => message?.content && String(message.content).trim())
    .map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
    }));

  const isOpenAI =
    Boolean(env.OPENAI_API_KEY) && !env.ANTHROPIC_API_KEY && !env.CLAUDE_API_KEY;

  const apiUrl = isOpenAI
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.anthropic.com/v1/messages';
  const headers = isOpenAI
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
    : {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
  const requestBody = isOpenAI
    ? {
        model: 'gpt-4o',
        messages: [{ role: 'system', content: PROFESSOR_SYSTEM_PROMPT }, ...apiMessages],
        stream: true,
      }
    : {
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: PROFESSOR_SYSTEM_PROMPT,
        messages: apiMessages,
        stream: true,
      };

  let fullText = '';
  let ended = false;
  const finalize = () => {
    if (ended) return;
    ended = true;
    completeFromText(res, fullText, courseSlug, { coursesDir: root, log });
  };

  try {
    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      sendSSEError(res, 'api_error', `API error ${response.status}: ${text.slice(0, 200)}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          finalize();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = isOpenAI
            ? parsed.choices?.[0]?.delta?.content
            : parsed.type === 'content_block_delta'
              ? parsed.delta?.text
              : null;
          if (text) {
            fullText += text;
            sendSSE(res, { content: text });
          }
        } catch {
          /* skip malformed stream line */
        }
      }
    }

    finalize();
  } catch (err) {
    sendSSEError(res, 'api_error', err.message);
  }
}
