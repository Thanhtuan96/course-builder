/**
 * Live code registry (CODE-05) — the bridge between the Workspace tab and the tutor's
 * "Check my answer" (Phase 25).
 *
 * The workspace pushes the *current* editor contents here on every change; the tutor reads them
 * with `getCurrentCode(lessonId)`. If the workspace was never opened this session, we fall back to
 * the last files saved in the repository so a reopened lesson still has code to attach.
 *
 * Deliberately framework-free and side-effect-light so both the component and a future tutor
 * prompt builder import one function.
 */
import { listWorkspaceFiles } from '../repo/index.js';
import { filesFromRows } from './skeleton.js';
import { normalizeLanguage } from './languages.js';
import { hashFiles } from './hash.js';

/**
 * @typedef {{ language: string, entry: string, files: Record<string,string>, hash: string, updatedAt: string }} CodeSnapshot
 */

/** @type {Map<string, CodeSnapshot>} */
const cache = new Map();

/**
 * Record the editor's current contents for a lesson.
 * @param {string} lessonId
 * @param {{ language?: string|null, entry?: string|null, files?: Record<string,string>|Array<{path:string,content:string}> }} input
 * @returns {CodeSnapshot}
 */
export function setCurrentCode(lessonId, { language = null, entry = null, files = {} } = {}) {
  const map = Array.isArray(files)
    ? Object.fromEntries(files.map((f) => [f.path, String(f.content ?? '')]))
    : Object.fromEntries(Object.entries(files || {}).map(([k, v]) => [k, String(v ?? '')]));
  const entryPath = entry || Object.keys(map)[0] || null;
  const snapshot = {
    language: normalizeLanguage(language) || null,
    entry: entryPath,
    files: map,
    hash: hashFiles(map),
    updatedAt: new Date().toISOString(),
  };
  cache.set(lessonId, snapshot);
  return snapshot;
}

/** @param {string} lessonId */
export function clearCurrentCode(lessonId) {
  cache.delete(lessonId);
}

/**
 * The code to attach to a tutor request. Reads the live buffer, falling back to the repository.
 * @param {string} lessonId
 * @returns {Promise<CodeSnapshot|null>}
 */
export async function getCurrentCode(lessonId) {
  if (!lessonId) return null;
  const live = cache.get(lessonId);
  if (live) return live;
  let rows = [];
  try {
    rows = await listWorkspaceFiles(lessonId);
  } catch {
    return null;
  }
  const files = filesFromRows(rows);
  if (!files.length) return null;
  const map = Object.fromEntries(files.map((f) => [f.path, f.content]));
  const snapshot = {
    language: files[0].language || null,
    entry: files[0].path || null,
    files: map,
    hash: hashFiles(map),
    updatedAt: new Date().toISOString(),
  };
  cache.set(lessonId, snapshot);
  return snapshot;
}

/**
 * A compact text block a tutor prompt can embed (never a solution — just the learner's code).
 * @param {string} lessonId
 * @param {{ maxBytes?: number }} [opts]
 * @returns {Promise<string|null>}
 */
export async function currentCodeBlock(lessonId, { maxBytes = 20_000 } = {}) {
  const snapshot = await getCurrentCode(lessonId);
  if (!snapshot) return null;
  let out = '';
  for (const [path, content] of Object.entries(snapshot.files)) {
    out += `\n--- ${path} ---\n${content}\n`;
    if (out.length > maxBytes) {
      out = out.slice(0, maxBytes) + '\n… (truncated)';
      break;
    }
  }
  return out.trim() || null;
}
