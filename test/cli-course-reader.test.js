/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import {
  computeStreak,
  extractDates,
  findCourses,
  normalizeDate,
  parseLearningLog,
  parseLecture,
  parseSchedule,
  parseSections,
  readCourse,
  resolveExercise,
  todayISO,
} from '../bin/course-reader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'courses');

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkTemp() {
  const dir = mkdtempSync(join(tmpdir(), 'cp-reader-'));
  tempDirs.push(dir);
  return dir;
}

const BASE_COURSE = [
  '# Test Course',
  '**Kind**: programming',
  '',
  '## Sections',
  '',
  '| # | Section | Status |',
  '|---|---------|--------|',
  '| 1 | Intro | 🔄 In progress |',
  '| 2 | Deep Dive | ⬜ Not started |',
].join('\n');

function writeCourse(files = {}) {
  const dir = mkTemp();
  writeFileSync(join(dir, 'COURSE.md'), files['COURSE.md'] || BASE_COURSE);
  for (const [rel, content] of Object.entries(files)) {
    if (rel === 'COURSE.md') continue;
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

// ─── findCourses ──────────────────────────────────────────────────────────────

describe('findCourses', () => {
  it('finds every course directory under a --dir override', () => {
    const courses = findCourses(process.cwd(), { dir: FIXTURES });
    expect(courses.map((c) => c.slug)).toEqual([
      'flavour-checkbox',
      'flavour-list',
      'flavour-nokind',
      'flavour-table',
    ]);
    expect(courses.every((c) => c.location === 'custom')).toBe(true);
  });

  it('scans learning/ before legacy courses/ and dedups by slug', () => {
    const root = join(__dirname, 'fixtures', 'roots');
    const courses = findCourses(root);
    expect(courses.map((c) => c.slug)).toEqual(['primary', 'shared', 'legacy']);
    expect(courses.find((c) => c.slug === 'shared').location).toBe('learning');
    expect(courses.find((c) => c.slug === 'legacy').location).toBe('courses');
  });

  it('ignores directories without a COURSE.md', () => {
    const courses = findCourses(process.cwd(), { dir: FIXTURES });
    expect(courses.some((c) => c.slug === 'not-a-course')).toBe(false);
  });
});

// ─── parseSections — the three COURSE.md flavours ────────────────────────────

describe('parseSections', () => {
  it('parses the list flavour: "- ⬜ Section 1: Title"', () => {
    const md = [
      '## 📖 Syllabus',
      '',
      '- ✅ Section 1: Basics',
      '- 🔄 Section 2: Drills',
      '- ⬜ Section 3: Performance',
    ].join('\n');
    const { sections } = parseSections(md);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toEqual({ n: '1', title: 'Basics', status: 'done', completedAt: null });
    expect(sections[1].status).toBe('active');
    expect(sections[2].status).toBe('todo');
  });

  it('parses the checkbox flavour: "⬜ 1. Title"', () => {
    const md = [
      '## 📖 Syllabus', '',
      '✅ 1. Matrices', '🔄 2. Eigenvalues', '⬜ 3. Decompositions',
    ].join('\n');
    const { sections } = parseSections(md);
    expect(sections.map((s) => s.title)).toEqual(['Matrices', 'Eigenvalues', 'Decompositions']);
    expect(sections.map((s) => s.n)).toEqual(['1', '2', '3']);
  });

  it('parses the table flavour with a bold title', () => {
    const md = [
      '## 📖 Syllabus & Progress',
      '',
      '| # | Section | Status |',
      '|---|---------|--------|',
      '| 1 | **First Steps** | ✅ Done |',
      '| 2 | **Second Steps** | 🔄 In progress |',
    ].join('\n');
    const { sections } = parseSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe('First Steps');
    expect(sections[1].status).toBe('active');
  });

  it('reads a completion date from a four-column table', () => {
    const md = [
      '## 📖 Syllabus', '',
      '| # | Section | Status | Completed |',
      '|---|---------|--------|-----------|',
      '| 1 | **Intro** | ✅ Done | 2026-10-14 |',
    ].join('\n');
    const { sections } = parseSections(md);
    expect(sections[0].completedAt).toBe('2026-10-14');
  });

  it('captures the capstone row separately from the sections', () => {
    const md = [
      '## Sections', '',
      '| 1 | **Intro** | ✅ Done |',
      '| 🏗️ | Capstone: **Demo** | 🔒 Locked |',
    ].join('\n');
    const { sections, capstoneStatus } = parseSections(md);
    expect(sections).toHaveLength(1);
    expect(capstoneStatus).toBe('locked');
  });
});

// ─── readCourse ───────────────────────────────────────────────────────────────

describe('readCourse', () => {
  it('reads a full course (title, kind, sections, cards, log, streak)', () => {
    const dir = join(FIXTURES, 'flavour-table');
    const course = readCourse(dir, { slug: 'flavour-table', today: '2026-10-15' });
    expect(course.title).toBe('Table Flavour');
    expect(course.level).toBe('Beginner');
    expect(course.kind).toBe('conceptual');
    expect(course.progress).toEqual({ done: 1, total: 3, percent: 33 });
    expect(course.currentSection).toEqual({ n: '2', title: 'Second Steps', status: 'active' });
    expect(course.capstoneStatus).toBe('locked');
    expect(course.lastActive).toBe('2026-10-15');
    expect(course.streak).toBe(2);
    expect(course.lectures).toEqual(['01-first-steps.md']);
    expect(course.cards).toHaveLength(2);
    expect(course.cards[0]).toEqual({ front: 'What is X?', due: '2026-10-15' });
    expect(course.log).toEqual([
      { date: '2026-10-14', section: 'Section 1 — First Steps', verdict: 'solid' },
    ]);
  });

  it('defaults a missing Kind to programming', () => {
    const course = readCourse(join(FIXTURES, 'flavour-nokind'), { slug: 'flavour-nokind' });
    expect(course.kind).toBe('programming');
    expect(course.activeExercise).toBe('exercises/01-intro.md');
    expect(course.currentSection.n).toBe('2');
  });

  it('reads the list and checkbox flavours', () => {
    const list = readCourse(join(FIXTURES, 'flavour-list'), { slug: 'flavour-list' });
    expect(list.kind).toBe('skill');
    expect(list.currentSection).toEqual({ n: '2', title: 'Drills', status: 'active' });
    expect(list.capstoneStatus).toBe('locked');

    const checkbox = readCourse(join(FIXTURES, 'flavour-checkbox'), { slug: 'flavour-checkbox' });
    expect(checkbox.kind).toBe('quantitative');
    expect(checkbox.currentSection.title).toBe('Eigenvalues');
  });

  it('throws when COURSE.md is missing', () => {
    expect(() => readCourse(join(FIXTURES, 'not-a-course'))).toThrow(/COURSE.md/);
  });
});

// ─── parseLecture ─────────────────────────────────────────────────────────────

describe('parseLecture', () => {
  const md = [
    '# 📖 Section 2: Second Steps',
    '',
    '---',
    '',
    '## 🎯 Objectives',
    'By the end of this section you will be able to:',
    '- Explain the first thing',
    '- Apply the second thing',
    '',
    '---',
    '',
    '## 🧠 Explanation',
    'This is the first paragraph. It has two sentences.',
    '',
    'A second paragraph.',
    '',
    '---',
    '',
    '## 🛠️ Exercise',
    '> **Your task** — do this yourself:',
    '>',
    '> Write the analysis.',
    '>',
    '> **Success criteria** — you\'re done when:',
    '> - [ ] Criterion A',
    '> - [x] Criterion B',
  ].join('\n');

  it('extracts section number, title, objectives and the first explanation paragraph', () => {
    const lecture = parseLecture(md);
    expect(lecture.sectionNumber).toBe('2');
    expect(lecture.title).toBe('Second Steps');
    expect(lecture.objectives).toEqual(['Explain the first thing', 'Apply the second thing']);
    expect(lecture.explanation).toBe('This is the first paragraph. It has two sentences.');
  });

  it('extracts success criteria from the quoted exercise block', () => {
    const lecture = parseLecture(md);
    expect(lecture.successCriteria).toEqual(['Criterion A', 'Criterion B']);
  });

  it('extracts an exercise path written in the lecture', () => {
    const withPath = `${md}\n> Work in exercises/01-second-steps.md\n`;
    expect(parseLecture(withPath).exercisePath).toBe('exercises/01-second-steps.md');
  });

  it('returns an exercisePath only when a real file path is present', () => {
    expect(parseLecture(md).exercisePath).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseLecture('')).toBeNull();
  });
});

// ─── resolveExercise ──────────────────────────────────────────────────────────

describe('resolveExercise', () => {
  it('uses the COURSE.md Active exercise field when the file exists', () => {
    const dir = writeCourse({
      'COURSE.md': `${BASE_COURSE}\n\n**Active exercise**: exercises/01-intro.js\n`,
      'exercises/01-intro.js': '// skeleton\n',
    });
    const course = readCourse(dir, { slug: 'test' });
    expect(resolveExercise(course)).toEqual({
      path: 'exercises/01-intro.js', source: 'course', exists: true,
    });
  });

  it('uses the exercise path from LECTURE.md when COURSE.md has none', () => {
    const dir = writeCourse({
      'LECTURE.md': '# Section 1: Intro\n\n## 🛠️ Exercise\n> File: exercises/01-intro.js\n',
      'exercises/01-intro.js': '// skeleton\n',
    });
    const course = readCourse(dir, { slug: 'test' });
    const lecture = parseLecture('## 🛠️ Exercise\n> File: exercises/01-intro.js');
    expect(resolveExercise(course, { lecture })).toEqual({
      path: 'exercises/01-intro.js', source: 'lecture', exists: true,
    });
  });

  it('falls back to the newest exercises/NN-* matching the current section', () => {
    const dir = writeCourse({
      'COURSE.md': `${BASE_COURSE}\n\n**Active exercise**: exercises/99-missing.js\n`,
      'exercises/01-intro.js': '// older\n',
      'exercises/01-other.js': '// newer\n',
    });
    const course = readCourse(dir, { slug: 'test' });
    const resolved = resolveExercise(course);
    expect(resolved.source).toBe('matching');
    expect(resolved.exists).toBe(true);
    expect(resolved.path).toMatch(/^exercises\/01-/);
  });

  it('returns the declared path with exists=false when nothing is on disk', () => {
    const dir = writeCourse({
      'COURSE.md': `${BASE_COURSE}\n\n**Active exercise**: exercises/09-missing.js\n`,
    });
    const course = readCourse(dir, { slug: 'test' });
    expect(resolveExercise(course)).toEqual({
      path: 'exercises/09-missing.js', source: 'course', exists: false,
    });
  });

  it('derives a synthetic path when there is nothing declared', () => {
    const dir = writeCourse();
    const course = readCourse(dir, { slug: 'test' });
    expect(resolveExercise(course)).toEqual({
      path: 'exercises/01-intro.js', source: 'derived', exists: false,
    });
  });

  it('resolves the same path for next and check on a real fixture', () => {
    const course = readCourse(join(FIXTURES, 'flavour-table'), { slug: 'flavour-table' });
    const lecture = parseLecture(
      '## 🛠️ Exercise\n> Success criteria\n> - [ ] A\n'
    );
    const resolved = resolveExercise(course, { lecture });
    expect(resolved.path).toBe('exercises/02-second-steps.md');
    expect(resolved.exists).toBe(false);
  });
});

// ─── parseLearningLog / parseSchedule ─────────────────────────────────────────

describe('parseLearningLog', () => {
  it('parses Section Entries into date/section/verdict', () => {
    const entries = parseLearningLog([
      '## 📝 Section Entries',
      '',
      '### Section 3 — Closures',
      '- Date: 2026-10-10',
      '- Verdict: ⚠️ watch-this: boundaries',
    ].join('\n'));
    expect(entries).toEqual([
      { date: '2026-10-10', section: 'Section 3 — Closures', verdict: '⚠️ watch-this: boundaries' },
    ]);
  });

  it('returns an empty array when there is no log', () => {
    expect(parseLearningLog('')).toEqual([]);
  });
});

describe('parseSchedule', () => {
  it('parses flashcard front/due pairs', () => {
    const md = [
      '## Flashcard Set',
      '',
      '| Section | Question | Answer | Next Review |',
      '|---------|----------|--------|-------------|',
      '| 1 | What is X? | X is... | 2026-10-15 |',
      '| 1 | When to use X? | Use X... | — |',
    ].join('\n');
    expect(parseSchedule(md)).toEqual([
      { front: 'What is X?', due: '2026-10-15' },
      { front: 'When to use X?', due: null },
    ]);
  });

  it('returns an empty array without a SCHEDULE', () => {
    expect(parseSchedule('')).toEqual([]);
  });
});

// ─── Dates and streak ─────────────────────────────────────────────────────────

describe('normalizeDate', () => {
  it('handles ISO, slashes and month-name dates', () => {
    expect(normalizeDate('2026-03-15')).toBe('2026-03-15');
    expect(normalizeDate('March 15, 2026')).toBe('2026-03-15');
    expect(normalizeDate('March 5, 2026')).toBe('2026-03-05');
    expect(normalizeDate('—')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});

describe('extractDates', () => {
  it('collects unique ISO and month-name dates', () => {
    const dates = extractDates('Created: March 15, 2026\nActive: 2026-03-15\nDone: 2026-03-16');
    expect(dates.sort()).toEqual(['2026-03-15', '2026-03-16']);
  });
});

describe('computeStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-10-13', '2026-10-14', '2026-10-15'], '2026-10-15')).toBe(3);
  });

  it('counts a streak that ends yesterday', () => {
    expect(computeStreak(['2026-10-14'], '2026-10-15')).toBe(1);
    expect(computeStreak(['2026-10-13', '2026-10-14'], '2026-10-15')).toBe(2);
  });

  it('breaks the streak across a gap', () => {
    expect(computeStreak(['2026-10-12'], '2026-10-15')).toBe(0);
    expect(computeStreak(['2026-10-10', '2026-10-14', '2026-10-15'], '2026-10-15')).toBe(2);
  });

  it('is zero with no activity', () => {
    expect(computeStreak([], '2026-10-15')).toBe(0);
  });
});

describe('todayISO', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});
