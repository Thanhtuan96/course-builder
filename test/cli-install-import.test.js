/**
 * @vitest-environment node
 *
 * RON-279 — `install <course>` wrote `learning/{slug}/` and stopped there: Studio keeps its courses
 * in SQLite (`$PROFESSOR_HOME/professor.db`), so the course was invisible until the learner found
 * `course-professor import`. The install now imports through the same code path as `import`, writes
 * the absolute path, and points at the correct next step.
 *
 * Everything here runs against a temp cwd + temp `PROFESSOR_HOME` with a stubbed registry fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('ora', () => ({
  default: function ora(text) {
    return {
      text,
      start: () => ora(text),
      stop: () => ora(text),
      succeed: () => ora(text),
      fail: () => ora(text),
    };
  },
}));

const { installCourse } = await import('../bin/registry-helpers.js');
const { DatabaseSync } = await import('node:sqlite');

const SLUG = 'react-hooks';

const COURSE_MD = [
  '# Course: React Hooks',
  '',
  '**Kind**: programming',
  '**Level**: beginner',
  '**Goal**: Build a mental model for hooks.',
  '',
  '## Syllabus',
  '',
  '- ⬜ Section 1: useState',
  '- ⬜ Section 2: useEffect',
  '- ⬜ Section 3: useRef',
  '- ⬜ Section 4: useMemo',
  '- ⬜ Section 5: useCallback',
  '- ⬜ Section 6: useContext',
  '- ⬜ Section 7: Custom hooks',
  '- ⬜ Section 8: Rules of hooks',
  '',
].join('\n');

const INDEX = {
  courses: [{ name: SLUG, title: 'React Hooks', level: 'beginner', sections: 8 }],
};

/** Registry fetch stub — no network. meta.json is optional, as in the real installer. */
const fetchText = async (url, { optional = false } = {}) => {
  if (url.endsWith('/COURSE.md')) return COURSE_MD;
  if (url.endsWith('/meta.json')) {
    return optional ? null : JSON.stringify({ name: SLUG, title: 'React Hooks' });
  }
  throw new Error(`unexpected registry URL: ${url}`);
};

const tempDirs = [];
const realHome = process.env.PROFESSOR_HOME;
const realStudioDb = process.env.STUDIO_DB;
let home;

function mkTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function mkCwd() {
  const cwd = mkTemp('cp-install-cwd-');
  mkdirSync(join(cwd, 'learning'), { recursive: true });
  return cwd;
}

/** Counts read straight from the Studio DB (independent of the install code path). */
function counts() {
  const dbPath = join(home, 'professor.db');
  if (!existsSync(dbPath)) return { courses: 0, lessons: 0 };
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return {
      courses: db.prepare('SELECT COUNT(*) AS n FROM courses WHERE external_id = ?').get(`cli:${SLUG}`).n,
      lessons: db.prepare('SELECT COUNT(*) AS n FROM lessons WHERE course_id = ?').get(`cli-course-${SLUG}`).n,
    };
  } finally {
    db.close();
  }
}

function captureLog() {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return {
    text: () => lines.join('\n'),
    restore: () => { console.log = original; },
  };
}

beforeEach(() => {
  home = mkTemp('cp-install-home-');
  process.env.PROFESSOR_HOME = home;
  delete process.env.STUDIO_DB;
});

afterEach(() => {
  if (realHome === undefined) delete process.env.PROFESSOR_HOME;
  else process.env.PROFESSOR_HOME = realHome;
  if (realStudioDb === undefined) delete process.env.STUDIO_DB;
  else process.env.STUDIO_DB = realStudioDb;
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

describe('RON-279 install <course>', () => {
  it('writes the course files and imports the course into Studio', async () => {
    const cwd = mkCwd();
    const log = captureLog();
    try {
      await installCourse(SLUG, { index: INDEX, cwd, fetchText });
    } finally {
      log.restore();
    }

    const coursePath = join(cwd, 'learning', SLUG, 'COURSE.md');
    expect(readFileSync(coursePath, 'utf-8')).toBe(COURSE_MD);
    expect(counts()).toEqual({ courses: 1, lessons: 8 });

    const output = log.text();
    expect(output).toContain(coursePath); // absolute path, not the misleading relative one
    expect(output).toContain('Imported into Studio');
    expect(output).toContain('course-professor studio');
    expect(output).toContain(`professor:switch ${SLUG}`);
    expect(output).not.toContain('professor:new-topic');
  });

  it('re-installing does not create a duplicate course', async () => {
    const cwd = mkCwd();
    const log = captureLog();
    try {
      await installCourse(SLUG, { index: INDEX, cwd, fetchText });
      await installCourse(SLUG, { index: INDEX, cwd, fetchText, force: true });
    } finally {
      log.restore();
    }

    expect(counts()).toEqual({ courses: 1, lessons: 8 });
  });

  it('--no-import writes the files only and prints the import command', async () => {
    const cwd = mkCwd();
    const log = captureLog();
    try {
      await installCourse(SLUG, { index: INDEX, cwd, fetchText, importToStudio: false });
    } finally {
      log.restore();
    }

    expect(existsSync(join(cwd, 'learning', SLUG, 'COURSE.md'))).toBe(true);
    expect(counts()).toEqual({ courses: 0, lessons: 0 });

    const output = log.text();
    expect(output).toContain(`course-professor import ${SLUG}`);
    expect(output).toContain(`professor:switch ${SLUG}`);
    expect(output).not.toContain('professor:new-topic');
  });

  it('skips the import on a runtime without node:sqlite, still exiting 0', async () => {
    const cwd = mkCwd();
    const log = captureLog();
    try {
      await installCourse(SLUG, {
        index: INDEX,
        cwd,
        fetchText,
        nodeVersion: 'v20.19.0',
        force: true,
      });
    } finally {
      log.restore();
    }

    expect(existsSync(join(cwd, 'learning', SLUG, 'COURSE.md'))).toBe(true);
    expect(counts()).toEqual({ courses: 0, lessons: 0 });

    const output = log.text();
    expect(output).toContain('Not imported into Studio');
    expect(output).toContain('Node 22.5+');
    expect(output).toContain(`course-professor import ${SLUG}`);
    expect(output).not.toContain('professor:new-topic');
    expect(process.exitCode).toBeFalsy();
  });

  it('never tells the learner to run professor:new-topic', async () => {
    const cwd = mkCwd();
    const log = captureLog();
    try {
      writeFileSync(join(cwd, '.keep'), '');
      await installCourse(SLUG, { index: INDEX, cwd, fetchText });
    } finally {
      log.restore();
    }
    expect(log.text()).not.toMatch(/professor:new-topic/);
    expect(log.text()).toMatch(new RegExp(`professor:switch ${SLUG}`));
  });
});
