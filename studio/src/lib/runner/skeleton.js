/**
 * Derive the initial workspace files from a lesson's Markdown (CODE-01).
 *
 * A programming lesson ships its exercise skeleton as a fenced code block under the
 * "Exercise" section (Phase 23/28 convention). We pick the fence with `TODO` markers; otherwise the
 * first block whose info string matches the course language; if there is none we fall back to an
 * empty `main.<ext>`. Concept-section code samples are only used when there is no Exercise section
 * at all — the learner should land on the thing they are asked to do.
 */
import { defaultEntry, guessCourseLanguage, languageForPath, normalizeLanguage } from './languages.js';
import { isExerciseHeading } from '../prompts/lesson.js';

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
 *
 * Heading-looking lines inside a fenced code block are not headings: a `# comment` at column 0 is
 * ordinary code in Bash, Python, Ruby and friends, and treating it as one used to cut the exercise
 * section short inside its own fence (RON-197). Fence ranges come from `extractFencedBlocks`, so
 * there is exactly one fence parser in this module.
 *
 * @param {string} markdown
 * @returns {{ body: string, start: number, end: number } | null}
 */
export function findExerciseSection(markdown) {
  const text = String(markdown ?? '');
  const fenced = extractFencedBlocks(text);
  const inFence = (index) => fenced.some((block) => index >= block.start && index < block.end);
  const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
  let match;
  let level = 0;
  let start = -1;
  let bodyStart = -1;
  while ((match = heading.exec(text))) {
    if (inFence(match.index)) continue;
    if (start >= 0) {
      if (match[1].length <= level) {
        return { body: text.slice(bodyStart, match.index), start, end: match.index };
      }
      continue;
    }
    if (isExerciseHeading(match[2])) {
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

const TODO_MARKER = /\bTODO\b/;

/**
 * A TODO fence is the exercise skeleton; a reference file or a self-check block next to it is not.
 * Unsupported-language fences still qualify: generated lessons sometimes ship the real skeleton in
 * `dockerfile`/`yaml`, and a reference file in the course language must not shadow it.
 * @param {{ code: string }} block
 */
function isTodoSkeleton(block) {
  return TODO_MARKER.test(block.code);
}

/**
 * @param {Array<{ info: string, code: string }>} candidates
 * @param {string|null} lang
 */
function chooseSkeleton(candidates, lang) {
  const todos = candidates.filter(isTodoSkeleton);
  return (
    todos.find((b) => blockMatches(b.info, lang)) ||
    todos[0] ||
    candidates.find((b) => blockMatches(b.info, lang)) ||
    (!lang ? candidates[0] : null)
  );
}

/**
 * The fences the exercise section offers, falling back to the whole lesson.
 * @param {string} markdown
 * @param {Array<{ start: number, end: number }>} blocks
 */
function exerciseCandidates(markdown, blocks) {
  const section = findExerciseSection(markdown);
  const pool = section
    ? blocks.filter((b) => b.start >= section.start && b.end <= section.end)
    : blocks;
  return pool.length ? pool : blocks;
}

/**
 * Pick the exercise skeleton from a lesson body.
 * @param {string} markdown
 * @param {{ language?: string|null, course?: object }} [opts]
 * @returns {{ content: string, language: string|null, unsupported?: string } | null}
 */
export function extractSkeleton(markdown, { language = null, course = null } = {}) {
  const lang = normalizeLanguage(language) || guessCourseLanguage(course || {});
  const blocks = extractFencedBlocks(markdown);
  if (!blocks.length) return null;

  const chosen = chooseSkeleton(exerciseCandidates(markdown, blocks), lang);
  if (!chosen) return null;
  const normalised = normalizeLanguage(chosen.info);
  if (!normalised && chosen.info) return { content: chosen.code, language: null, unsupported: chosen.info };
  return { content: chosen.code, language: normalised || lang || null };
}

/**
 * Build the initial files for a lesson workspace, plus the skeleton the Workspace cannot run.
 *
 * An unsupported skeleton seeds nothing: an unrelated entry file full of another language's code is
 * worse than an empty workspace. The caller shows the text read-only instead.
 *
 * @param {{ content_md?: string }|null} lesson
 * @param {object|null} course
 * @param {{ language?: string|null }} [opts]
 * @returns {{ files: SeedFile[], unsupportedSkeleton: { info: string, content: string }|null }}
 */
export function planSeed(lesson, course = null, { language = null } = {}) {
  const lang = normalizeLanguage(language) || guessCourseLanguage(course || {});
  const skeleton = lesson?.content_md ? extractSkeleton(lesson.content_md, { language: lang, course }) : null;
  if (skeleton?.unsupported) {
    return {
      files: [],
      unsupportedSkeleton: { info: skeleton.unsupported, content: skeleton.content },
    };
  }
  if (skeleton) {
    const resolved = skeleton.language || lang || 'javascript';
    return {
      files: [{ path: defaultEntry(resolved), content: skeleton.content, language: resolved }],
      unsupportedSkeleton: null,
    };
  }
  const fallback = lang || 'javascript';
  return {
    files: [{ path: defaultEntry(fallback), content: '', language: fallback }],
    unsupportedSkeleton: null,
  };
}

/**
 * The files only. Kept for callers that do not need to report an unsupported skeleton.
 * @param {{ content_md?: string }|null} lesson
 * @param {object|null} course
 * @param {{ language?: string|null }} [opts]
 * @returns {SeedFile[]}
 */
export function seedFiles(lesson, course = null, opts = {}) {
  return planSeed(lesson, course, opts).files;
}

/**
 * What a reset writes and which stored files it must soft-delete.
 *
 * When the exercise cannot be seeded at all, a reset drops every stored file: otherwise the row an
 * earlier build wrote (the reference fence in `main.js`) comes straight back on the next load.
 *
 * @param {{ lesson?: object|null, course?: object|null, storedPaths?: string[] }} [input]
 * @returns {{
 *   files: SeedFile[],
 *   persist: boolean,
 *   unsupportedSkeleton: { info: string, content: string }|null,
 *   deletePaths: string[],
 * }}
 */
export function planReset({ lesson = null, course = null, storedPaths = [] } = {}) {
  const { files, unsupportedSkeleton } = planSeed(lesson, course);
  const persist = !unsupportedSkeleton && files.some((f) => !isBlank(f.content));
  return {
    files,
    persist,
    unsupportedSkeleton,
    deletePaths: unsupportedSkeleton ? [...new Set(storedPaths)] : [],
  };
}

/**
 * True when every stored file is a verbatim copy of a lesson fence that is not the exercise skeleton
 * — the reference or self-check block an earlier build seeded. Any difference is a learner edit and
 * keeps the file untouched.
 * @param {SeedFile[]} stored
 * @param {string} markdown
 * @param {string|null} language
 */
function isStaleReferenceSeed(stored, markdown, language) {
  if (!stored.length) return false;
  const blocks = extractFencedBlocks(markdown);
  if (!blocks.length) return false;
  const chosen = chooseSkeleton(exerciseCandidates(markdown, blocks), language);
  const references = new Set(
    blocks
      .filter((b) => b !== chosen)
      .map((b) => b.code.trim())
      .filter(Boolean)
  );
  if (!references.size) return false;
  return stored.every((f) => references.has(String(f.content ?? '').trim()));
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

/**
 * @param {string|null|undefined} content
 * @returns {boolean} true when the learner never put anything in the file
 */
function isBlank(content) {
  return !String(content ?? '').trim();
}

/**
 * Decide what the Workspace opens with (RON-196).
 *
 * Lesson Markdown lives in `lesson_versions`, never on the `lessons` row the UI holds, so the seed
 * comes from the current version; the row's own `content_md` is only a backwards-compatible
 * fallback when there is no version. Stored workspace files still win over the skeleton — unless
 * every one of them is blank and the lesson has no run result: that is an empty seed persisted by
 * an earlier build, so the rows are overwritten with the skeleton instead of trapping the learner
 * on an empty editor.
 *
 * A stored row that is a verbatim copy of a non-skeleton fence is the same kind of stale seed: an
 * earlier build seeded the reference block it found first, so it is re-seeded too. A learner who
 * changed even one character keeps their file.
 *
 * `persist` is false when the seed has no skeleton: keeping the empty file in memory only lets a
 * later lesson version still seed it.
 *
 * `stalePaths` lists the stored rows the re-seed does not replace — an earlier build guessed the
 * entry extension from the course (`main.js`), while the skeleton fence resolves to another one
 * (`main.sh`), or it wrote the reference fence and the exercise cannot be seeded at all. The caller
 * soft-deletes them, so the learner does not get a stray file next to the skeleton.
 *
 * `unsupportedSkeleton` is set when the exercise skeleton is in a language no runner executes: no
 * file is seeded or persisted, and the caller shows the text read-only.
 *
 * @param {{
 *   lesson?: object|null,
 *   course?: object|null,
 *   version?: { content_md?: string }|null,
 *   rows?: Array<object>,
 *   runCount?: number,
 * }} [input]
 * @returns {{
 *   files: SeedFile[],
 *   persist: boolean,
 *   stalePaths: string[],
 *   unsupportedSkeleton: { info: string, content: string }|null,
 * }}
 */
export function resolveWorkspaceSeed({ lesson = null, course = null, version = null, rows = [], runCount = 0 } = {}) {
  const stored = filesFromRows(rows);
  const content_md = version?.content_md || lesson?.content_md || '';
  const untouched = stored.length > 0 && stored.every((f) => isBlank(f.content)) && runCount === 0;
  const staleSeed = !untouched && isStaleReferenceSeed(stored, content_md, guessCourseLanguage(course || {}));
  if (stored.length && !untouched && !staleSeed) {
    return { files: stored, persist: false, stalePaths: [], unsupportedSkeleton: null };
  }

  const { files, unsupportedSkeleton } = planSeed({ ...(lesson || {}), content_md }, course);
  const persist = !unsupportedSkeleton && files.some((f) => !isBlank(f.content));
  const kept = new Set(files.map((f) => f.path));
  const stalePaths =
    persist || staleSeed ? stored.filter((f) => !kept.has(f.path)).map((f) => f.path) : [];
  return { files, persist, stalePaths, unsupportedSkeleton };
}
