/**
 * Capstone domain helpers (CAP-02 unlock, CAP-04 test run, CAP-05 completion export).
 *
 * Pure apart from the optional test run: everything the Capstone page and Course card need to
 * decide "locked / unlocked / complete", combine a submission with the capstone's self-check tests
 * and render a plugin-compatible COMPLETION.md lives here so it is unit-testable without a DOM.
 */
import { run as runCode } from './runner/index.js';
import { slugify } from './course.js';
import { normalizeLanguage } from './i18n/languages.js';
import { getProvider, createGenerateJson } from './ai/index.js';
import { buildCapstoneMessages, validateCapstone, capstoneValidator } from './prompts/capstone.js';
import {
  validateExternalCapstoneReview,
  applyDeterministicClamps,
  defaultExternalQuestion,
} from './prompts/capstone.js';
import { createCapstone } from './repo/index.js';

/** True when every lesson in the course is done and there is at least one lesson. */
export function allLessonsDone(course) {
  const lessons = (course?.lessons || []).filter((l) => !l.deleted_at);
  return lessons.length > 0 && lessons.every((l) => l.status === 'done');
}

/** The capstone unlocks only after all lessons are done (CAP-02). */
export function capstoneUnlocked(course) {
  return allLessonsDone(course);
}

/** Lesson completion counts for the locked-state progress label. */
export function capstoneProgress(course) {
  const lessons = (course?.lessons || []).filter((l) => !l.deleted_at);
  const done = lessons.filter((l) => l.status === 'done').length;
  return { done, total: lessons.length, pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0 };
}

/** Whether a capstone has automated self-check tests (programming). */
export function capstoneHasTests(capstone) {
  return Boolean(capstone?.tests && capstone.tests.files && Object.keys(capstone.tests.files).length);
}

/**
 * Run a capstone's self-check tests against the submitted files using the Phase 29 runner.
 * The test file(s) are merged over the learner's files; the run result's named checks become the
 * pass/fail list. Returns null when the capstone has no tests.
 *
 * @param {{ capstone: object, files: Record<string,string>|null, runImpl?: Function, signal?: AbortSignal, courseSlug?: string }} input
 * @returns {Promise<null | { runner: string|null, exitCode: number|null, checks: Array<{name:string,passed:boolean,message?:string}>, failed: boolean, timedOut: boolean, stdout: string, stderr: string }>}
 */
export async function runCapstoneTests({ capstone, files, runImpl = runCode, signal, courseSlug = 'capstone' } = {}) {
  if (!capstoneHasTests(capstone)) return null;
  const tests = capstone.tests;
  const combined = { ...(files || {}), ...tests.files };
  const result = await runImpl({
    language: tests.language,
    files: combined,
    entry: tests.entry,
    signal,
    courseSlug,
  });
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  const failed = checks.length
    ? checks.some((c) => !c.passed)
    : result?.exitCode != null && result.exitCode !== 0;
  return {
    runner: result?.runner || null,
    exitCode: result?.exitCode ?? null,
    checks,
    failed,
    timedOut: Boolean(result?.timedOut),
    stdout: result?.stdout || '',
    stderr: result?.stderr || '',
  };
}

/** `{ passed, failed, total }` for a checks array. */
export function summarizeChecks(checks) {
  const list = Array.isArray(checks) ? checks : [];
  const passed = list.filter((c) => c.passed).length;
  return { passed, failed: list.length - passed, total: list.length };
}

/** One-line artifact label. */
export function artifactLabel(artifact) {
  if (!artifact) return '';
  return String(artifact.title || artifact.deliverable || '').trim();
}

/* ------------------------------------------------------------------ external evidence mode */

/** The stable rubric keys of the external (template) capstone. */
const EXTERNAL_RUBRIC_KEYS = Object.freeze(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);

/**
 * Which review path a capstone takes: `'external'` when the learner ran Playwright in their own
 * project (a template course), `'in_app'` when Studio runs the self-check tests itself (D-03).
 *
 * External is detected from data only — the capstone `external_id` prefix or a rubric carrying all
 * seven R1–R7 keys — so no course column or migration is needed.
 *
 * @param {{ external_id?: string|null, rubric?: Array<{ key?: string }> }|null} [capstone]
 * @returns {'external'|'in_app'}
 */
export function capstoneEvidenceMode(capstone) {
  if (!capstone || typeof capstone !== 'object') return 'in_app';
  if (String(capstone.external_id ?? '').startsWith('template:')) return 'external';
  const keys = new Set(
    (Array.isArray(capstone.rubric) ? capstone.rubric : [])
      .map((criterion) => String(criterion?.key ?? '').trim().toUpperCase())
      .filter(Boolean)
  );
  return EXTERNAL_RUBRIC_KEYS.every((key) => keys.has(key)) ? 'external' : 'in_app';
}

/* ------------------------------------------------------------------ deterministic facts (D-08, D-26) */

/** Most snippets kept per fact category. */
const MAX_FACT_SNIPPETS = 10;

/** Longest snippet kept, in characters. */
const MAX_FACT_SNIPPET_CHARS = 80;

/** `getByRole`, `getByLabel`, … — the user-facing locator family (R2 positive). */
const SEMANTIC_LOCATOR_RE =
  /\bgetBy(?:Role|Label|Text|TestId|Placeholder|AltText|Title)\s*\(/g;

/** `.locator('…')` — CSS/XPath selector passed as a string (R2 negative). */
const CSS_LOCATOR_RE = /\.locator\s*\(\s*['"`]/g;

/** Legacy selector forms: raw XPath, `nth-child`, and the deprecated `page.$`/`page.$$`. */
const LEGACY_LOCATOR_RES = [/\bxpath\s*=/gi, /nth-child\s*\(/g, /\.\$\$?\s*\(/g];

/** Auto-retrying web-first assertions (R3 positive). */
const WEB_FIRST_ASSERTION_RE =
  /\b(?:toBeVisible|toBeHidden|toBeEnabled|toBeDisabled|toBeChecked|toBeEditable|toHaveText|toContainText|toHaveValue|toHaveCount|toHaveAttribute|toHaveClass|toBeInViewport|toHaveURL)\s*\(/g;

/** Manual assertion smells: the value is read once, so it never retries (R3 negative). */
const MANUAL_ASSERTION_RES = [
  /\bexpect\s*\(\s*await\b/g,
  /\.isVisible\s*\(/g,
  /\.isEnabled\s*\(/g,
  /\.isChecked\s*\(/g,
  /\.textContent\s*\(/g,
  /\.innerText\s*\(/g,
];

/** Fixed sleeps — inherently flaky (R4 negative). */
const HARD_WAIT_RES = [/\.waitForTimeout\s*\(/g, /\bsleep\s*\(/g];

/** `{ force: true }` bypasses actionability checks (R4 negative). */
const FORCE_RE = /\bforce\s*:\s*true\b/g;

/** Raw mouse coordinates or explicit click positions (R4 negative). */
const COORDINATE_RES = [
  /\.mouse\s*\.\s*(?:click|dblclick|move|down|up)\s*\(\s*[^)]*\d/g,
  /\.click\s*\(\s*\{\s*position\s*:/g,
];

/** Isolation positives: a describe block, per-test setup, reused auth state, `test.use`. */
const ISOLATION_POSITIVE_RES = [
  /\btest\.describe\s*\(/g,
  /\b(?:test\.)?beforeEach\s*\(/g,
  /\bstorageState\b/g,
  /\btest\.use\s*\(/g,
];

/** `test.describe.serial` — documented as "not recommended" because it hides shared state (R5). */
const SERIAL_RE = /\btest\.describe\.serial\s*\(/g;

/** Module-level mutable state shared across tests (R5 negative). */
const MODULE_STATE_RE = /^(?:let|var)\s+[A-Za-z_$][\w$]*\s*=/gm;

// Topic signals are deliberately substring matches: a learner writes "getByRole", "roles" or
// "waits", not a dictionary headword, and R7 only needs "did the write-up touch this topic".
const LOCATOR_TOPIC_RES = [/locator/i, /role/i, /label/i, /test\s*id/i, /định vị/i, /vai trò/i];
const WAIT_TOPIC_RES = [/wait/i, /flaky/i, /assertion/i, /chờ/i];
const ISOLATION_TOPIC_RES = [
  /isolation/i,
  /isolated/i,
  /independent/i,
  /beforeEach/i,
  /storageState/i,
  /cô lập/i,
  /độc lập/i,
];

/** Byte length of a string, without importing Node's `Buffer` (Studio also runs in the browser). */
function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

/** Collapse + clip one snippet line. @param {string} text */
function clipSnippet(text) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  return line.length > MAX_FACT_SNIPPET_CHARS
    ? `${line.slice(0, MAX_FACT_SNIPPET_CHARS - 1)}…`
    : line;
}

/** The whole source line containing `index`, clipped to a snippet. */
function snippetAt(source, index) {
  const start = source.lastIndexOf('\n', index) + 1;
  const newline = source.indexOf('\n', index);
  const end = newline === -1 ? source.length : newline;
  return clipSnippet(source.slice(start, end));
}

/** Count the matches of one global regular expression. */
function countMatches(source, regex) {
  return [...source.matchAll(regex)].length;
}

/** Count the matches of several global regular expressions. */
function countAll(source, regexes) {
  return regexes.reduce((total, regex) => total + countMatches(source, regex), 0);
}

/** Push the source line for each match, stopping at the shared snippet cap. */
function pushSnippets(target, source, regexes) {
  for (const regex of regexes) {
    for (const match of source.matchAll(regex)) {
      if (target.length >= MAX_FACT_SNIPPETS) return;
      target.push(snippetAt(source, match.index ?? 0));
    }
  }
}

/**
 * Remove comments and the *contents* of string/template literals so a mention inside prose cannot
 * create a false fact (D-26, Pitfall 7).
 *
 * Quote delimiters are preserved and each removed span becomes a single space, so `.locator('…')`
 * is still recognisable as a quoted selector while `'force: true'` no longer looks like an option.
 * Unbalanced input never throws — the rest of the file is treated as text.
 *
 * @param {unknown} source
 * @returns {string}
 */
export function stripCommentsAndStrings(source) {
  const text = typeof source === 'string' ? source : '';
  let out = '';
  let index = 0;
  const length = text.length;

  while (index < length) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '/' && next === '/') {
      while (index < length && text[index] !== '\n') index += 1;
      out += ' ';
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
      index = Math.min(length, index + 2);
      out += ' ';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      index += 1;
      while (index < length) {
        if (text[index] === '\\') {
          index += 2;
          continue;
        }
        if (text[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      out += `${quote} ${quote}`;
      continue;
    }

    out += char;
    index += 1;
  }

  return out;
}

/** An empty `lintSpecCode` result so callers always get the same shape. */
function emptySpecFacts() {
  return {
    specFiles: [],
    locators: { semantic: 0, css: 0, legacy: 0, snippets: [] },
    assertions: { webFirst: 0, manual: 0, snippets: [] },
    waits: { hard: 0, force: 0, coordinate: 0, snippets: [] },
    isolation: { describe: 0, beforeEach: 0, storageState: 0, testUse: 0, serial: 0, moduleState: 0 },
  };
}

/**
 * Deterministic facts about the submitted spec code (D-08). Regex matches run against the
 * `stripCommentsAndStrings` pre-pass, so comments and prose cannot manufacture a fact.
 *
 * Pure and tolerant: a missing/opaque input yields the zeroed shape and never throws.
 *
 * @param {Record<string, string>|null} [files] submitted files keyed by path
 * @returns {{ specFiles: Array<{ path: string, bytes: number }>, locators: object, assertions: object, waits: object, isolation: object }}
 */
export function lintSpecCode(files) {
  const facts = emptySpecFacts();
  const entries = files && typeof files === 'object' && !Array.isArray(files) ? Object.entries(files) : [];

  for (const [path, content] of entries) {
    const source = typeof content === 'string' ? content : String(content ?? '');
    facts.specFiles.push({ path: String(path), bytes: byteLength(source) });

    const stripped = stripCommentsAndStrings(source);

    facts.locators.semantic += countMatches(stripped, SEMANTIC_LOCATOR_RE);
    facts.locators.css += countMatches(stripped, CSS_LOCATOR_RE);
    facts.locators.legacy += countAll(stripped, LEGACY_LOCATOR_RES);

    facts.assertions.webFirst += countMatches(stripped, WEB_FIRST_ASSERTION_RE);
    facts.assertions.manual += countAll(stripped, MANUAL_ASSERTION_RES);

    facts.waits.hard += countAll(stripped, HARD_WAIT_RES);
    facts.waits.force += countMatches(stripped, FORCE_RE);
    facts.waits.coordinate += countAll(stripped, COORDINATE_RES);

    facts.isolation.describe += countMatches(stripped, ISOLATION_POSITIVE_RES[0]);
    facts.isolation.beforeEach += countMatches(stripped, ISOLATION_POSITIVE_RES[1]);
    facts.isolation.storageState += countMatches(stripped, ISOLATION_POSITIVE_RES[2]);
    facts.isolation.testUse += countMatches(stripped, ISOLATION_POSITIVE_RES[3]);
    facts.isolation.serial += countMatches(stripped, SERIAL_RE);
    facts.isolation.moduleState += countMatches(stripped, MODULE_STATE_RE);

    pushSnippets(facts.locators.snippets, stripped, [SEMANTIC_LOCATOR_RE, CSS_LOCATOR_RE, ...LEGACY_LOCATOR_RES]);
    pushSnippets(facts.assertions.snippets, stripped, [WEB_FIRST_ASSERTION_RE, ...MANUAL_ASSERTION_RES]);
    pushSnippets(facts.waits.snippets, stripped, [...HARD_WAIT_RES, FORCE_RE, ...COORDINATE_RES]);
  }

  for (const category of [facts.locators, facts.assertions, facts.waits]) {
    category.snippets = category.snippets.slice(0, MAX_FACT_SNIPPETS);
  }

  return facts;
}

/**
 * Deterministic facts about the learner's write-up (R7). Only says whether the text exists and
 * touches the three topics; the judgment itself stays with the model.
 *
 * @param {unknown} contentMd
 * @returns {{ words: number, mentionsLocator: boolean, mentionsWait: boolean, mentionsIsolation: boolean }}
 */
export function lintWriteup(contentMd) {
  const text = typeof contentMd === 'string' ? contentMd.trim() : '';
  return {
    words: text ? text.split(/\s+/).length : 0,
    mentionsLocator: LOCATOR_TOPIC_RES.some((regex) => regex.test(text)),
    mentionsWait: WAIT_TOPIC_RES.some((regex) => regex.test(text)),
    mentionsIsolation: ISOLATION_TOPIC_RES.some((regex) => regex.test(text)),
  };
}

/**
 * All deterministic facts handed to the review prompt: spec-code facts plus the write-up facts.
 * Never includes the raw source (only counts, paths, snippet lines).
 *
 * @param {{ files?: Record<string, string>|null, contentMd?: string }} [input]
 * @returns {object}
 */
export function computeCapstoneFacts({ files = null, contentMd = '' } = {}) {
  return { ...lintSpecCode(files), explanation: lintWriteup(contentMd) };
}

/* ------------------------------------------------------------------ external review finalisation (D-09, D-21, D-24) */

/**
 * Warning codes that block a pass on their own (D-21).
 *
 * `unknown_spec_files` and `claimed_pass_with_failures` are deliberately **not** here: they are
 * mismatch warnings shown to the learner and the reviewer, but the learner can still reconcile them
 * without the run being invalid.
 */
export const BLOCKING_WARNING_CODES = Object.freeze([
  'unrecognized_format',
  'no_tests',
  'truncated',
  'count_mismatch',
]);

/** The review statuses, in the order `normalizeStoredReview` maps legacy ratings onto. */
const STORED_STATUS_VALUES = ['met', 'partial', 'not_met'];

/** Legacy `rating` → modern `status` (Pitfall 9). */
const LEGACY_RATING_STATUS = { solid: 'met', partial: 'partial', missing: 'not_met' };

/** Copy only the keys that are present, so a legacy row never gains empty modern fields. */
function pickDefined(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/** A non-passing review built entirely from the rubric — used when the model reply is malformed. */
function nonPassingReview(capstone, language) {
  const rubric = Array.isArray(capstone?.rubric) ? capstone.rubric : [];
  const criteria = rubric
    .filter((criterion) => criterion && typeof criterion === 'object')
    .map((criterion) => {
      const key = String(criterion.key ?? '').trim() || 'criterion';
      const label = String(criterion.name ?? '').trim() || key;
      return { key, label, status: 'not_met', question: defaultExternalQuestion(key, language) };
    });
  return { criteria, strengths: [], nextAction: '' };
}

/**
 * Turn a raw model reply into the stored external review.
 *
 * The reply is re-keyed to the rubric, clamped by the deterministic facts, and stripped of any
 * `verdict` field (D-24) — the verdict is produced only by `computeCapstoneVerdict`. A malformed
 * reply still yields a renderable, non-passing review instead of throwing.
 *
 * @param {any} raw the model output
 * @param {{ capstone?: object, evidence?: object, facts?: object, language?: string }} [input]
 * @returns {{ criteria: object[], strengths: string[], nextAction: string }}
 */
export function finalizeExternalReview(raw, { capstone, evidence, facts, language } = {}) {
  const validated = validateExternalCapstoneReview(raw, { capstone, language });
  const review = validated.ok
    ? applyDeterministicClamps(validated.value, { evidence, facts, language })
    : nonPassingReview(capstone, language);

  const { verdict: _strippedVerdict, ...rest } = review || {};
  return {
    criteria: Array.isArray(rest.criteria) ? rest.criteria : [],
    strengths: Array.isArray(rest.strengths) ? rest.strengths : [],
    nextAction: typeof rest.nextAction === 'string' ? rest.nextAction : '',
  };
}

/**
 * The verdict gate — a pure function of the clamped criteria plus the verified evidence facts.
 *
 * `course_complete` requires all of: at least one criterion, every criterion `met`, no blocking
 * warning, zero failures, at least one passing test, an evidenced Chromium run and one submitted
 * spec file. Model text is never read here.
 *
 * @param {{ review?: object, evidence?: object, facts?: object }} [input]
 * @returns {{ verdict: 'course_complete'|'needs_work', reasons: string[] }}
 */
export function computeCapstoneVerdict({ review, evidence, facts } = {}) {
  const criteria = Array.isArray(review?.criteria) ? review.criteria : [];
  const stats = evidence?.stats || {};
  const warnings = Array.isArray(evidence?.warnings) ? evidence.warnings : [];
  const reasons = [];

  if (!criteria.length) {
    reasons.push('criterion:none');
  } else {
    for (const criterion of criteria) {
      if (criterion?.status !== 'met') reasons.push(`criterion:${criterion?.key ?? 'unknown'}`);
    }
  }

  const codes = new Set(warnings.map((warning) => warning?.code));
  for (const code of BLOCKING_WARNING_CODES) {
    if (codes.has(code)) reasons.push(`blocking:${code}`);
  }

  const failed = Number(stats.failed) || 0;
  if (failed > 0) reasons.push(`failed:${failed}`);
  if (!(Number(stats.passed) > 0)) reasons.push('no_passing_test');
  if (stats.chromium !== 'confirmed' && stats.chromium !== 'assumed') {
    reasons.push(`chromium:${stats.chromium || 'none'}`);
  }
  if (!(Array.isArray(facts?.specFiles) && facts.specFiles.length)) reasons.push('no_spec_files');

  return { verdict: reasons.length ? 'needs_work' : 'course_complete', reasons };
}

/**
 * Read a stored review from either shape — legacy `{ verdict, criteria[].rating }` or the modern
 * `{ criteria[].status, question }` — so attempt history never renders blanks (Pitfall 9).
 *
 * Legacy ratings map `solid → met`, `partial → partial`, `missing → not_met` (anything unknown is
 * `not_met`, the closed-by-default choice). The modern shape is passed through unchanged, so the
 * function is idempotent.
 *
 * @param {object|null} review
 * @returns {object|null}
 */
export function normalizeStoredReview(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return review ?? null;
  if (!Array.isArray(review.criteria)) return review;

  const criteria = review.criteria.map((criterion) => {
    if (!criterion || typeof criterion !== 'object') return criterion;
    if (STORED_STATUS_VALUES.includes(criterion.status)) return criterion;
    return {
      ...pickDefined(criterion, ['key', 'name', 'label', 'feedback', 'question']),
      status: LEGACY_RATING_STATUS[criterion.rating] || 'not_met',
    };
  });

  return { ...review, criteria };
}

/* ------------------------------------------------------------------ generation */

/**
 * Generate + persist the immutable capstone for a course (one model call). Used at course creation
 * (NewCourse) and by the one-off "Generate capstone" action for courses created before this phase.
 * @param {{ course: object, artifact?: object, settings?: object, signal?: AbortSignal }} input
 * @returns {Promise<object>} the stored capstone row
 */
export async function generateCapstoneForCourse({ course, artifact, settings = {}, signal } = {}) {
  const provider = await getProvider(settings);
  const { system, messages } = buildCapstoneMessages({ course, artifact, language: course?.language });
  const generateJson = createGenerateJson(provider.streamText.bind(provider));
  const raw = await generateJson({
    system,
    messages,
    signal,
    validate: capstoneValidator(course?.kind, { artifact }),
    language: course?.language,
  });
  const validated = validateCapstone(raw, { kind: course?.kind, artifact });
  if (!validated.ok) throw new Error(validated.error);
  return createCapstone({
    courseId: course.id,
    kind: course?.kind || 'conceptual',
    brief_md: validated.value.brief_md,
    rubric: validated.value.rubric,
    tests: validated.value.tests,
    hiddenAnswers: validated.value.hiddenAnswers,
    artifact: validated.value.artifact,
    externalId: `ai:${course.id}`,
  });
}

/* ------------------------------------------------------------------ copy */

/** Minimal page copy, localised by course language (English fallback). */
export function capstoneCopy(language) {
  if (normalizeLanguage(language) === 'vi') {
    return {
      yourArtifact: 'Sản phẩm của bạn',
      definitionOfDone: 'Định nghĩa hoàn thành',
      rubric: 'Tiêu chí đánh giá',
      brief: 'Đề bài capstone',
      locked: 'Hoàn thành tất cả bài học để mở khoá capstone',
      start: 'Bắt đầu capstone',
      submit: 'Gửi để đánh giá',
      generate: 'Tạo capstone',
      completion: 'Hoàn thành khoá học',
      verdictComplete: 'Hoàn thành khoá học',
      verdictNeedsWork: 'Cần hoàn thiện thêm',
      exportCompletion: 'Xuất COMPLETION.md',
      reviewTitle: 'Kết quả đánh giá',
      attempts: 'Lần nộp',
    };
  }
  return {
    yourArtifact: 'Your artifact',
    definitionOfDone: 'Definition of Done',
    rubric: 'Rubric',
    brief: 'Capstone brief',
    locked: 'Finish every lesson to unlock the capstone',
    start: 'Start capstone',
    submit: 'Submit for review',
    generate: 'Generate capstone',
    completion: 'Course complete',
    verdictComplete: 'Course Complete',
    verdictNeedsWork: 'Needs work',
    exportCompletion: 'Export COMPLETION.md',
    reviewTitle: 'Review',
    attempts: 'Attempts',
  };
}

/* ------------------------------------------------------------------ completion export */

const VERDICT_LABEL = { course_complete: 'Course Complete', needs_work: 'Needs work' };

/** Human verdict label for a stored verdict string. */
export function verdictLabel(verdict) {
  return VERDICT_LABEL[verdict] || (verdict ? String(verdict) : '');
}

/** ISO date (YYYY-MM-DD) of the completion. */
export function completionDate(submission) {
  const iso = submission?.updated_at || submission?.created_at || new Date().toISOString();
  return String(iso).slice(0, 10);
}

/** @param {string} text @param {number} max */
function clip(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** @param {string} text */
function yamlValue(text) {
  return String(text || '').replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim();
}

/**
 * Build a plugin-compatible COMPLETION.md (mirrors `professor:capstone-review`), extended with the
 * artifact so the result is portfolio-ready.
 * @param {{ course: object, capstone?: object, submission: object }} input
 * @returns {string}
 */
export function toCompletionMarkdown({ course, capstone, submission } = {}) {
  const slug = slugify(course?.title || course?.slug || 'course');
  const completed = completionDate(submission);
  const artifact = capstone?.artifact || null;
  const artifactTitle = artifactLabel(artifact) || '—';
  const summary = clip(submission?.content_md, 200);
  const repo = submission?.repo_url ? String(submission.repo_url).trim() : '';
  const review = submission?.review || null;

  const criteria = Array.isArray(review?.criteria) ? review.criteria : [];
  const rubricLines = criteria.length
    ? criteria.map((c) => `- **${c.name}** — ${c.rating}`).join('\n')
    : '- (no criteria recorded)';

  const body = [
    `---`,
    `course: ${slug}`,
    `completed: ${completed}`,
    `verdict: Course Complete`,
    `artifact: ${yamlValue(artifactTitle)}`,
    ...(repo ? [`artifact_link: ${yamlValue(repo)}`] : []),
    `capstone_summary: ${yamlValue(summary)}`,
    `---`,
    ``,
    `# 🎓 Course Complete: ${course?.title || slug}`,
    ``,
    `**Level**: ${course?.level || '—'} · **Kind**: ${course?.kind || '—'}`,
    `**Completed**: ${completed}`,
    ...(artifact?.deliverable ? [`**Artifact**: ${artifact.deliverable}`] : []),
    ...(repo ? [`**Repo**: ${repo}`] : []),
    ``,
    `## Final submission`,
    submission?.content_md ? clip(submission.content_md, 1000) : 'Submitted from the code workspace.',
    ``,
    `## Rubric`,
    rubricLines,
    ``,
    review?.nextAction ? `## Next step\n${review.nextAction}\n` : ``,
    `**You built this yourself.**`,
    ``,
  ];
  return body.join('\n');
}

/** Filename for the exported COMPLETION.md. */
export function completionFilename(course) {
  return `${slugify(course?.title || course?.slug || 'course')}-COMPLETION.md`;
}
