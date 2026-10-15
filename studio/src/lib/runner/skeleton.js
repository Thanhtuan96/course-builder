/**
 * Derive the initial workspace files from a lesson's Markdown (CODE-01).
 *
 * A programming lesson ships its exercise skeleton as a fenced code block under the
 * "Exercise" section (Phase 23/28 convention). We pick the first block whose info string
 * matches the course language; if there is none we fall back to an empty `main.<ext>`.
 * Concept-section code samples are only used when there is no Exercise section at all —
 * the learner should land on the thing they are asked to do.
 */
import { defaultEntry, guessCourseLanguage, languageForPath, normalizeLanguage } from './languages.js';

/**
 * @typedef {{ path: string, content: string, language: string|null }} SeedFile
 */

/**
 * Extract all fenced code blocks from Markdown.
 * @param {string} markdown
 * @returns {Array<{ info: string, code: string, start: number, end: number }>}
 */
export function extractFencedBlocks(markdown) {
  const text = String(markdown ?? '');
  const blocks = [];
  const fence = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\n]*)\n([\s\S]*?)\n[ \t]*\2[ \t]*$/gm;
  let m;
  while ((m = fence.exec(text))) {
    blocks.push({
      info: (m[3] || '').trim().split(/\s+/)[0],
      code: m[4],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return blocks;
}

/**
 * Locate the first heading whose text starts with "exercise", returning its body and the absolute
 * range of the section (heading → next heading of the same or higher level).
 * @param {string} markdown
 * @returns {{ body: string, start: number, end: number } | null}
 */
export function findExerciseSection(markdown) {
  const text = String(markdown ?? '');
  const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let match;
  let level = 0;
  let start = -1;
  let bodyStart = -1;
  while ((match = heading.exec(text))) {
    if (start >= 0) {
      if (match[1].length <= level) {
        return { body: text.slice(bodyStart, match.index), start, end: match.index };
      }
      continue;
    }
    if (/^exercise\b/i.test(match[2])) {
      start = match.index;
      level = match[1].length;
      bodyStart = match.index + match[0].length;
    }
  }
  if (start < 0) return null;
  return { body: text.slice(bodyStart), start, end: text.length };
}

/**
 * @param {string|null|undefined} info fenced-code info string (e.g. `js`, `language-python`)
 * @param {string|null} language the course language
 */
function blockMatches(info, language) {
  const normalised = normalizeLanguage(info);
  if (!language) return Boolean(normalised);
  return normalised === language;
}

/**
 * Pick the exercise skeleton from a lesson body.
 * @param {string} markdown
 * @param {{ language?: string|null, course?: object }} [opts]
 * @returns {{ content: string, language: string|null } | null}
 */
export function extractSkeleton(markdown, { language = null, course = null } = {}) {
  const lang = normalizeLanguage(language) || guessCourseLanguage(course || {});
  const blocks = extractFencedBlocks(markdown);
  if (!blocks.length) return null;

  const section = findExerciseSection(markdown);
  const pool = section
    ? blocks.filter((b) => b.start >= section.start && b.end <= section.end)
    : blocks;

  const candidates = pool.length ? pool : blocks;
  const chosen = candidates.find((b) => blockMatches(b.info, lang)) || (!lang ? candidates[0] : null);
  if (!chosen) return null;
  return { content: chosen.code, language: normalizeLanguage(chosen.info) || lang || null };
}

/**
 * Build the initial files for a lesson workspace.
 * @param {{ content_md?: string }|null} lesson
 * @param {object|null} course
 * @param {{ language?: string|null }} [opts]
 * @returns {SeedFile[]}
 */
export function seedFiles(lesson, course = null, { language = null } = {}) {
  const lang = normalizeLanguage(language) || guessCourseLanguage(course || {});
  const skeleton = lesson?.content_md ? extractSkeleton(lesson.content_md, { language: lang, course }) : null;
  if (skeleton) {
    const resolved = skeleton.language || lang || 'javascript';
    return [{ path: defaultEntry(resolved), content: skeleton.content, language: resolved }];
  }
  const fallback = lang || 'javascript';
  return [{ path: defaultEntry(fallback), content: '', language: fallback }];
}

/**
 * Normalise stored repo rows into `{ path, content, language }`. Soft-deleted rows never reach
 * here — the adapter filters them out (see `repo.deleteWorkspaceFile`).
 * @param {Array<object>} rows
 * @returns {SeedFile[]}
 */
export function filesFromRows(rows) {
  return (rows || [])
    .map((r) => ({
      path: r.path,
      content: r.content ?? '',
      language: normalizeLanguage(r.language) || languageForPath(r.path),
    }))
    .filter((f) => typeof f.path === 'string' && f.path);
}
