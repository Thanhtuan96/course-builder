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
