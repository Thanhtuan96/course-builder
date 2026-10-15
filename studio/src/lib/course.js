/**
 * Course model + conversions to/from the Professor plugin's Markdown files.
 * Keeping COURSE.md compatibility means a course started in the browser can be continued
 * in Claude Code / Cursor / Gemini CLI with `professor:*` commands, and vice versa.
 */
import { uid } from './db.js';

export const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

export function slugify(text) {
  return String(text || 'course')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'course';
}

export function makeLesson(title, index, summary = '') {
  return {
    id: uid('l_'),
    index,
    title: String(title).trim(),
    summary,
    status: 'todo', // todo | active | done
    content: null, // generated Markdown
    quiz: null, // [{ question, options, answer, explanation }]
    quizScore: null,
    completedAt: null,
  };
}

export function makeCourse({ title, description = '', level = 'Beginner', topics = [], goal = '', source = 'ai', lessons = [], registryName = null }) {
  const now = new Date().toISOString();
  return {
    id: uid('c_'),
    slug: slugify(title),
    title,
    description,
    level,
    topics,
    goal,
    source, // ai | registry | import
    registryName,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: null,
    capstone: null,
    notes: '',
    lessons: lessons.map((l, i) => (typeof l === 'string' ? makeLesson(l, i + 1) : makeLesson(l.title, i + 1, l.summary || ''))),
  };
}

export function progress(course) {
  const total = course.lessons.length;
  const done = course.lessons.filter((l) => l.status === 'done').length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function nextLesson(course) {
  return course.lessons.find((l) => l.status === 'active') || course.lessons.find((l) => l.status !== 'done') || null;
}

const STATUS_ICON = { todo: '⬜', active: '🔄', done: '✅' };

/**
 * Parse section titles out of any COURSE.md flavour the plugin has produced:
 *   "⬜ 1. Title"                      (registry templates)
 *   "- ⬜ Section 1: Title"             (web server format)
 *   "| 1 | **Title** | 🔄 In progress |" (professor:new-topic table)
 */
export function parseCourseMarkdown(md) {
  const lines = String(md || '').split('\n');
  const titleLine = lines.find((l) => /^#\s+/.test(l)) || '';
  const title = titleLine
    .replace(/^#\s+/, '')
    .replace(/^📚\s*/, '')
    .replace(/^Course:\s*/i, '')
    .trim();
  const levelMatch = md.match(/\*\*Level\*\*:\s*([A-Za-z]+)/);

  const sections = [];
  for (const line of lines) {
    let m = line.match(/^\s*(?:[-*]\s*)?(⬜|🔄|✅)\s*(?:Section\s*)?(\d+)[.:]\s*(.+?)\s*$/);
    if (m) {
      sections.push({ title: clean(m[3]), status: iconToStatus(m[1]) });
      continue;
    }
    m = line.match(/^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(⬜|🔄|✅)/);
    if (m) sections.push({ title: clean(m[2]), status: iconToStatus(m[3]) });
  }
  return { title, level: levelMatch ? levelMatch[1] : null, sections };
}

function clean(s) {
  return s.replace(/\*\*/g, '').replace(/\s{2,}/g, ' ').trim();
}

function iconToStatus(icon) {
  return icon === '✅' ? 'done' : icon === '🔄' ? 'active' : 'todo';
}

export function courseFromMarkdown(md, extra = {}) {
  const parsed = parseCourseMarkdown(md);
  if (parsed.sections.length === 0) throw new Error('No sections found in COURSE.md');
  const course = makeCourse({
    title: extra.title || parsed.title || 'Imported course',
    level: extra.level || parsed.level || 'Beginner',
    description: extra.description || '',
    topics: extra.topics || [],
    source: extra.source || 'import',
    registryName: extra.registryName || null,
    lessons: parsed.sections.map((s) => s.title),
  });
  parsed.sections.forEach((s, i) => {
    course.lessons[i].status = s.status;
  });
  return course;
}

/** Serialise to the plugin's COURSE.md format (table flavour used by professor:new-topic). */
export function toCourseMarkdown(course) {
  const rows = course.lessons
    .map((l) => {
      const status = { todo: '⬜ Not started', active: '🔄 In progress', done: '✅ Done' }[l.status];
      const done = l.completedAt ? l.completedAt.slice(0, 10) : '—';
      return `| ${l.index} | **${l.title}** | ${status} | ${done} |`;
    })
    .join('\n');
  const all = progress(course);
  return `# 📚 Course: ${course.title} (${course.level})
**Level**: ${course.level}
**Learner goal**: ${course.goal || '—'}
**Started**: ${course.createdAt.slice(0, 10)}
**Last active**: ${(course.lastStudiedAt || course.updatedAt).slice(0, 10)}
**Capstone status**: ${all.done === all.total ? '🔓 Unlocked' : '🔒 Locked (complete all sections to unlock)'}

---

## 📖 Syllabus & Progress

| # | Section Title | Status | Completed |
|---|---------------|--------|-----------|
${rows}

Status legend: ⬜ Not started · 🔄 In progress · ✅ Done · 🔒 Locked
`;
}

export function statusIcon(status) {
  return STATUS_ICON[status] || '⬜';
}

// ---- Activity / streaks -----------------------------------------------------

export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** activity: { [dayKey]: count } → current streak in days (today or yesterday must be active). */
export function streak(activity, today = new Date()) {
  let count = 0;
  const cursor = new Date(today);
  if (!activity[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (activity[dayKey(cursor)]) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}
