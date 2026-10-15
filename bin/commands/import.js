/**
 * `course-professor import [slug|--all] [--dry-run]` (CLI-07) — bring CLI courses into Studio.
 *
 * Reads `learning/{slug}/` (primary) and legacy `courses/{slug}/` through `course-reader.js` and
 * writes them into the shared Studio SQLite DB. Everything goes through the repository or the same
 * StorageAdapter, so Studio sees identical rows:
 *
 *   COURSE.md          → courses (title, level, kind, goal) + lessons (sections, status, dates)
 *   lectures/NN-*.md   → lesson_versions (ordered)
 *   LECTURE.md         → lesson_versions of the active lesson (appended, never overwritten)
 *   SCHEDULE.md        → cards (due dates preserved)
 *   LEARNING-LOG.md    → quiz_attempts / reflections where they map, else notes
 *
 * Idempotent: `source: 'cli'` plus a stable `external_id` (`cli:<slug>`, `cli:<slug>:<n>`, …) means
 * re-running updates instead of duplicating. `--dry-run` prints the plan and writes nothing.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { findCourses, readCourse } from '../course-reader.js';
import { requireStudioNode } from '../node-version.js';
import { newCardState } from '../../studio/src/lib/srs.js';
import {
  useAdapter,
  createCourse,
  updateCourse,
  updateLesson,
  addLessonVersion,
  saveNote,
  saveReflection,
  saveQuizAttempt,
  logActivity,
  getCapstone,
  createCapstone,
  createCapstoneSubmission,
} from '../../studio/src/lib/repo/index.js';
import { parseRubricFromMarkdown } from '../../studio/src/lib/prompts/capstone.js';

const nowIso = () => new Date().toISOString();
const dateIso = (date) => (date ? `${date}T00:00:00.000Z` : nowIso());
const norm = (s) => String(s || '').trim().toLowerCase();

/** `**Goal**: …` from COURSE.md (not otherwise parsed by course-reader). */
export function readCourseGoal(dir) {
  try {
    const content = readFileSync(join(dir, 'COURSE.md'), 'utf-8');
    const m = content.match(/^\s*[-*]?\s*\*\*Goal\*\*\s*:?\s*(.*?)\s*$/mi);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

/**
 * Read `CAPSTONE.md` (immutable brief; rubric parsed if present, else empty) and `COMPLETION.md`
 * (frontmatter verdict + summary) for a course (CAP-05). Missing files yield null.
 * @param {string} dir
 * @param {string} slug
 */
export function readCapstonePlan(dir, slug) {
  const capstonePath = join(dir, 'CAPSTONE.md');
  const capstone = existsSync(capstonePath)
    ? {
        brief_md: readFileSync(capstonePath, 'utf-8'),
        externalId: `cli:${slug}:capstone`,
      }
    : null;
  if (capstone) capstone.rubric = parseRubricFromMarkdown(capstone.brief_md);

  const completionPath = join(dir, 'COMPLETION.md');
  let completion = null;
  if (existsSync(completionPath)) {
    const raw = readFileSync(completionPath, 'utf-8');
    const meta = parseFrontmatter(raw);
    completion = {
      content_md: meta.capstone_summary || stripFrontmatter(raw),
      verdict: 'course_complete',
      completed: meta.completed || null,
      externalId: `cli:${slug}:completion`,
    };
  }
  return { capstone, completion };
}

/** Parse simple `key: value` YAML frontmatter (no nesting — this file is flat). */
function parseFrontmatter(text) {
  const match = String(text || '').match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function stripFrontmatter(text) {
  return String(text || '').replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}

/** Archived lectures (sorted) + the current LECTURE.md, each with a stable external id. */
export function readLectureContents(course) {
  const slug = course.slug;
  const out = [];
  const lecturesDir = join(course.dir, 'lectures');
  if (existsSync(lecturesDir)) {
    let files = [];
    try { files = readdirSync(lecturesDir).filter((f) => f.endsWith('.md')).sort(); } catch { files = []; }
    for (const filename of files) {
      out.push({
        filename,
        current: false,
        content_md: readFileSync(join(lecturesDir, filename), 'utf-8'),
        externalId: `cli:${slug}:lecture:${filename}`,
      });
    }
  }
  const lecturePath = join(course.dir, 'LECTURE.md');
  if (existsSync(lecturePath)) {
    out.push({
      filename: 'LECTURE.md',
      current: true,
      content_md: readFileSync(lecturePath, 'utf-8'),
      externalId: `cli:${slug}:lecture:current`,
    });
  }
  return out;
}

/**
 * Turn a parsed course into a deterministic import plan. Pure apart from reading lecture files.
 * @param {object} course output of readCourse
 * @param {{ now?: number }} [opts]
 * @returns {object}
 */
export function planCourseImport(course, { now = Date.now() } = {}) {
  const slug = course.slug;
  const courseId = `cli-course-${slug}`;
  const goal = readCourseGoal(course.dir);
  const lectures = readLectureContents(course);

  const sectionList = course.sections.length
    ? course.sections
    : lectures.length
      ? [{ n: '1', title: course.title, status: 'active', completedAt: null }]
      : [];

  const lessons = sectionList.map((s, i) => ({
    n: s.n,
    position: i + 1,
    id: `cli-lesson-${slug}-${i + 1}`,
    externalId: `cli:${slug}:${s.n ?? i + 1}`,
    title: s.title,
    status: s.status === 'active' ? 'active' : s.status === 'done' ? 'done' : 'todo',
    completed_at: s.completedAt || null,
    lectures: [],
  }));

  const assignLesson = (item) => {
    if (!lessons.length) return null;
    if (item.current) {
      const n = course.currentSection?.n;
      return lessons.find((l) => String(l.n) === String(n)) || lessons[lessons.length - 1];
    }
    const m = item.filename.match(/^(\d+)/);
    if (m) {
      const padded = m[1].padStart(2, '0');
      const byNumber = lessons.find((l) => String(l.n).padStart(2, '0') === padded);
      if (byNumber) return byNumber;
      const byPosition = lessons[Number.parseInt(m[1], 10) - 1];
      if (byPosition) return byPosition;
    }
    return lessons[0];
  };

  for (const lecture of lectures) {
    const lesson = assignLesson(lecture);
    if (lesson) lesson.lectures.push(lecture);
  }

  const cards = (course.cards || []).map((c, i) => ({
    id: `cli-card-${slug}-${i + 1}`,
    externalId: `cli:${slug}:card:${i + 1}`,
    front: c.front,
    back: '',
    due_at: c.due ? `${c.due}T00:00:00.000Z` : new Date(now).toISOString(),
  }));

  const findLesson = (section) => {
    const target = norm(section);
    if (!target) return null;
    return (
      lessons.find((l) => norm(l.title) === target) ||
      lessons.find((l) => target.includes(norm(l.title))) ||
      null
    );
  };

  const logs = (course.log || []).map((entry, i) => {
    const verdict = entry.verdict || '';
    const lesson = findLesson(entry.section);
    const scoreMatch = verdict.match(/(\d+)\s*\/\s*(\d+)/);
    let kind = 'note';
    if (lesson && scoreMatch) kind = 'quiz';
    else if (lesson && verdict) kind = 'reflection';
    return {
      index: i,
      date: entry.date,
      section: entry.section,
      verdict,
      lessonId: lesson ? lesson.id : null,
      kind,
      score: scoreMatch ? Number.parseInt(scoreMatch[1], 10) : null,
      total: scoreMatch ? Number.parseInt(scoreMatch[2], 10) : null,
      externalId: `cli:${slug}:log:${i + 1}`,
    };
  });

  const { capstone, completion } = readCapstonePlan(course.dir, slug);

  return {
    course: {
      id: courseId,
      externalId: `cli:${slug}`,
      slug,
      title: course.title,
      level: course.level || null,
      kind: course.kind,
      goal,
    },
    lessons,
    cards,
    logs,
    capstone,
    completion,
    versionCount: lessons.reduce((n, l) => n + l.lectures.length, 0),
  };
}

/** Aggregate counters for one course (also used by --dry-run). */
function emptyStats() {
  return { lessons: 0, versions: 0, cards: 0, quiz: 0, reflections: 0, notes: 0, capstones: 0, completions: 0 };
}

async function existingExternalIds(store, table, where) {
  const rows = await store.list(table, where ? { where } : {});
  return new Set(rows.map((r) => r.external_id).filter(Boolean));
}

/**
 * Write one plan through the repository/adapter. Returns counts of what was (or would be) applied.
 * @param {object} plan
 * @param {object} store
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function applyCourseImport(plan, store, { dryRun = false } = {}) {
  const stats = emptyStats();
  stats.lessons = plan.lessons.length;
  stats.versions = plan.versionCount;
  stats.cards = plan.cards.length;
  stats.capstones = plan.capstone ? 1 : 0;
  stats.completions = plan.completion ? 1 : 0;
  for (const log of plan.logs) {
    if (log.kind === 'quiz') stats.quiz += 1;
    else if (log.kind === 'reflection') stats.reflections += 1;
    else stats.notes += 1;
  }
  if (dryRun) return stats;

  // Repository calls (createCourse, addLessonVersion, saveNote, …) must target this store.
  useAdapter(store);

  const { course } = plan;
  const existingCourse = await store.get('courses', course.id);
  if (existingCourse) {
    await updateCourse(course.id, {
      title: course.title,
      level: course.level,
      kind: course.kind,
      goal: course.goal,
      source: 'cli',
    });
  } else {
    await createCourse({
      id: course.id,
      title: course.title,
      level: course.level,
      kind: course.kind,
      goal: course.goal,
      source: 'cli',
    });
  }
  const courseRow = await store.get('courses', course.id);
  if (courseRow && courseRow.external_id !== course.externalId) {
    await store.put('courses', { ...courseRow, external_id: course.externalId });
  }

  for (const lesson of plan.lessons) {
    const prev = await store.get('lessons', lesson.id);
    if (prev) {
      await updateLesson(lesson.id, {
        title: lesson.title,
        status: lesson.status,
        completed_at: lesson.completed_at,
        position: lesson.position,
      });
      const row = await store.get('lessons', lesson.id);
      if (row && row.external_id !== lesson.externalId) {
        await store.put('lessons', { ...row, external_id: lesson.externalId });
      }
    } else {
      const now = nowIso();
      await store.put('lessons', {
        id: lesson.id,
        owner_id: 'local',
        course_id: course.id,
        position: lesson.position,
        title: lesson.title,
        summary: '',
        status: lesson.status,
        completed_at: lesson.completed_at,
        current_version_id: null,
        quiz_seed: null,
        external_id: lesson.externalId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
    }

    const seen = await existingExternalIds(store, 'lesson_versions', { lesson_id: lesson.id });
    for (const lecture of lesson.lectures) {
      if (seen.has(lecture.externalId)) continue;
      const version = await addLessonVersion(lesson.id, {
        content_md: lecture.content_md,
        model: 'cli-import',
        provider: 'cli',
      });
      await store.put('lesson_versions', { ...version, external_id: lecture.externalId });
    }
  }

  const state = newCardState();
  for (const card of plan.cards) {
    if (await store.get('cards', card.id)) continue; // never clobber a graded card
    const now = nowIso();
    await store.put('cards', {
      id: card.id,
      owner_id: 'local',
      course_id: course.id,
      lesson_id: null,
      front: card.front,
      back: card.back,
      ease: state.ease,
      interval_days: state.interval,
      reps: state.reps,
      lapses: state.lapses,
      due_at: card.due_at,
      external_id: card.externalId,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
  }

  await applyLogs(plan, store);
  await applyCapstone(plan, store);

  await logActivity('import', course.id);
  return stats;
}

/**
 * Import `CAPSTONE.md` into `capstones` (immutable — an existing capstone is kept) and
 * `COMPLETION.md` into a `course_complete` submission. Idempotent via `external_id`.
 * @param {object} plan
 * @param {object} store
 */
async function applyCapstone(plan, store) {
  const { course } = plan;
  if (!plan.capstone && !plan.completion) return;

  let capstone = null;
  if (plan.capstone) {
    capstone = await createCapstone({
      courseId: course.id,
      kind: course.kind,
      brief_md: plan.capstone.brief_md,
      rubric: plan.capstone.rubric || [],
      externalId: plan.capstone.externalId,
    });
  }

  if (!plan.completion) return;
  if (!capstone) capstone = await getCapstone(course.id);
  if (!capstone) {
    // A COMPLETION.md without a brief: create an (empty-brief) capstone so the submission can attach.
    capstone = await createCapstone({
      courseId: course.id,
      kind: course.kind,
      brief_md: '',
      rubric: [],
      externalId: `cli:${course.slug}:capstone`,
    });
  }

  const submission = await createCapstoneSubmission({
    capstoneId: capstone.id,
    content_md: plan.completion.content_md || '',
    verdict: plan.completion.verdict,
    externalId: plan.completion.externalId,
  });
  if (plan.completion.completed && submission?.id) {
    const at = dateIso(plan.completion.completed);
    await store.put('capstone_submissions', { ...submission, created_at: at, updated_at: at });
  }

  const courseRow = await store.get('courses', course.id);
  if (courseRow && courseRow.status !== 'completed') {
    await updateCourse(course.id, { status: 'completed' });
  }
}

async function applyLogs(plan, store) {
  const notes = await store.list('notes', { where: { course_id: plan.course.id } });
  const noteSet = new Set(notes.map((n) => n.content_md));
  const reflectionsByLesson = new Map();
  const quizByLesson = new Map();

  for (const log of plan.logs) {
    const created_at = dateIso(log.date);
    if (log.kind === 'quiz') {
      const list = quizByLesson.get(log.lessonId) || (await store.list('quiz_attempts', { where: { lesson_id: log.lessonId } }));
      quizByLesson.set(log.lessonId, list);
      const signature = `${log.score}|${log.total}|${created_at}`;
      if (list.some((a) => `${a.score}|${a.total}|${a.created_at}` === signature)) continue;
      const row = await saveQuizAttempt(log.lessonId, { score: log.score, total: log.total });
      await store.put('quiz_attempts', { ...row, created_at, updated_at: created_at });
    } else if (log.kind === 'reflection') {
      const list = reflectionsByLesson.get(log.lessonId) || (await store.list('reflections', { where: { lesson_id: log.lessonId } }));
      reflectionsByLesson.set(log.lessonId, list);
      if (list.some((r) => r.note === log.verdict && r.hardest === log.section)) continue;
      const row = await saveReflection(log.lessonId, { hardest: log.section, note: log.verdict });
      await store.put('reflections', { ...row, created_at, updated_at: created_at });
    } else {
      const content_md = formatLogNote(log);
      if (noteSet.has(content_md)) continue;
      const row = await saveNote({ courseId: plan.course.id, lessonId: log.lessonId, content_md });
      await store.put('notes', { ...row, created_at, updated_at: created_at });
      noteSet.add(content_md);
    }
  }
}

/** @param {object} log */
export function formatLogNote(log) {
  const heading = [log.date, log.section].filter(Boolean).join(' · ');
  return heading ? `**${heading}**\n${log.verdict}` : log.verdict;
}

/**
 * @param {{ args?: string[], cwd?: string, chalk?: object, style?: Function, store?: object }} [ctx]
 */
export async function run(ctx = {}) {
  requireStudioNode(ctx.nodeVersion);
  const { args = [], cwd = process.cwd(), chalk, style = (t, m) => m } = ctx;
  const dryRun = args.includes('--dry-run');
  const slug = args.find((a) => !a.startsWith('--')) || null;
  const all = args.includes('--all') || !slug;

  const courses = findCourses(cwd);
  const selected = slug ? courses.filter((c) => c.slug === slug) : courses;

  if (slug && selected.length === 0) {
    console.error(style('error', `No course "${slug}" found in learning/ or courses/.`));
    process.exitCode = 1;
    return { courses: 0, error: `not found: ${slug}` };
  }

  if (selected.length === 0) {
    console.log('');
    console.log(style('info', 'No courses found in learning/ or courses/.'));
    console.log('');
    return { courses: 0 };
  }

  const ownStore = !ctx.store;
  // `studio-store` (→ `web/studio-db.js`) imports `node:sqlite`, which only exists on Node 22.5+.
  // Import it lazily so the version guard above runs first and prints a helpful message.
  const store = ctx.store || (await (await import('../studio-store.js')).installStudioStore());
  useAdapter(store);

  const totals = emptyStats();
  try {
    for (const found of selected) {
      const course = readCourse(found.dir, { slug: found.slug });
      const plan = planCourseImport(course);
      const stats = await applyCourseImport(plan, store, { dryRun });

      for (const key of Object.keys(totals)) totals[key] += stats[key];

      const verb = dryRun ? 'would import' : 'imported';
      console.log('');
      console.log(chalk ? chalk.bold(course.slug) : course.slug);
      console.log(`  ${course.title}  (${course.kind}${course.level ? `, ${course.level}` : ''})`);
      console.log(`  ${verb}: ${stats.lessons} lessons · ${stats.versions} lecture versions · ${stats.cards} cards`);
      console.log(`             ${stats.quiz} quiz attempts · ${stats.reflections} reflections · ${stats.notes} notes`);
      if (stats.capstones || stats.completions) {
        console.log(`             ${stats.capstones} capstone · ${stats.completions} completion(s)`);
      }

      if (dryRun) {
        for (const lesson of plan.lessons) {
          console.log(`    lesson ${lesson.position}. ${lesson.title} [${lesson.status}]${lesson.lectures.length ? ` ← ${lesson.lectures.length} version(s)` : ''}`);
        }
      }
    }

    console.log('');
    const verb = dryRun ? 'Would import' : 'Imported';
    console.log(
      style('success',
        `${verb} ${selected.length} course${selected.length === 1 ? '' : 's'}: ` +
        `${totals.lessons} lessons, ${totals.versions} versions, ${totals.cards} cards, ` +
        `${totals.quiz + totals.reflections + totals.notes} log entries, ` +
        `${totals.capstones} capstones, ${totals.completions} completions.`)
    );
    console.log('');
    return { courses: selected.length, totals, dryRun, all };
  } finally {
    if (ownStore && store.close) store.close();
  }
}
