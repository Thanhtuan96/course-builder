/**
 * RON-354 — `learning/<slug>/` is the only course location.
 *
 * One describe block per requirement in
 * `openspec/changes/ron-354-learning-only/specs/course-storage/spec.md`.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { findCourses } from '../bin/course-reader.js';
import { defaultCoursesDir } from '../web/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = join(__dirname, '..', 'hooks', 'pre-compact.js');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

function tempRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'ron-354-'));
  tempDirs.push(dir);
  return dir;
}

function course(root, rel) {
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'COURSE.md'), '# Course\n');
  return dir;
}

describe('RON-354 one course location', () => {
  it('discovers a course that exists only under learning/', () => {
    const root = tempRoot();
    course(root, join('learning', 'sql'));

    const courses = findCourses(root);

    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ slug: 'sql', location: 'learning' });
  });

  it('ignores courses/old even when it is the only course on disk', () => {
    const root = tempRoot();
    course(root, join('courses', 'old'));

    expect(findCourses(root)).toEqual([]);
  });

  it('reads a duplicated slug from learning/ only', () => {
    const root = tempRoot();
    const learning = course(root, join('learning', 'x'));
    course(root, join('courses', 'x'));

    const courses = findCourses(root);

    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ slug: 'x', location: 'learning' });
    expect(courses[0].dir).toBe(learning);
  });
});

describe('RON-354 explicit course directory override', () => {
  it('returns a single course for a --dir pointing at a course directory', () => {
    const root = tempRoot();
    const dir = course(root, 'elsewhere');

    expect(findCourses(root, { dir })).toEqual([
      { slug: 'elsewhere', dir, location: 'custom' },
    ]);
  });

  it('returns each course for a --dir pointing at a parent directory', () => {
    const root = tempRoot();
    course(root, join('pack', 'a'));
    course(root, join('pack', 'b'));

    const courses = findCourses(root, { dir: join(root, 'pack') });

    expect(courses.map((c) => c.slug)).toEqual(['a', 'b']);
    expect(courses.every((c) => c.location === 'custom')).toBe(true);
  });
});

describe('RON-354 PreCompact scans only learning', () => {
  function runHook(root) {
    // package.json says "type": "module"; copy to .cjs so the hook loads the way a
    // CommonJS hook runner loads it.
    const hookCopy = join(root, 'pre-compact.cjs');
    copyFileSync(HOOK_PATH, hookCopy);
    const result = spawnSync(
      process.execPath,
      ['-e', `require(${JSON.stringify(hookCopy)})({ tokenCount: 200000 })`],
      { cwd: root, encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);
    return result.stderr;
  }

  it('saves to learning/ even when a newer courses/ COURSE.md exists', () => {
    const root = tempRoot();
    const learning = course(root, join('learning', 'sql'));
    const legacy = course(root, join('courses', 'old'));
    const future = new Date(Date.now() + 60_000);
    utimesSync(join(legacy, 'COURSE.md'), future, future);
    const legacyBefore = readFileSync(join(legacy, 'COURSE.md'), 'utf-8');

    runHook(root);

    const saved = readFileSync(join(learning, 'COURSE.md'), 'utf-8');
    expect(saved).toContain('session_state:');
    expect(readFileSync(join(legacy, 'COURSE.md'), 'utf-8')).toBe(legacyBefore);
  });

  it('skips the save when only courses/ exists', () => {
    const root = tempRoot();
    const legacy = course(root, join('courses', 'old'));
    const legacyBefore = readFileSync(join(legacy, 'COURSE.md'), 'utf-8');

    const warnings = runHook(root);

    expect(warnings).toContain('No course found under learning/');
    expect(readFileSync(join(legacy, 'COURSE.md'), 'utf-8')).toBe(legacyBefore);
  });
});

describe('RON-354 capstone and syllabus find new courses', () => {
  const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf-8');

  function learningCourse(slug) {
    const root = tempRoot();
    const dir = course(root, join('learning', slug));
    writeFileSync(join(dir, 'CAPSTONE.md'), '# Capstone\n');
    return dir;
  }

  it('capstone discovers and reads a course under learning/', () => {
    const dir = learningCourse('sql');
    const capstone = read(join('commands', 'professor', 'capstone.md'));

    expect(capstone).toContain('learning/*/COURSE.md');
    expect(capstone).toContain('learning/{topic-slug}/CAPSTONE.md');
    expect(existsSync(join(dir, 'CAPSTONE.md'))).toBe(true);
  });

  it('syllabus discovers and reads a course under learning/', () => {
    const dir = learningCourse('sql');
    const syllabus = read(join('commands', 'professor', 'syllabus.md'));

    expect(syllabus).toContain('learning/*/COURSE.md');
    expect(existsSync(join(dir, 'COURSE.md'))).toBe(true);
  });

  it('both commands point a learner with no course at new-topic', () => {
    for (const name of ['capstone.md', 'syllabus.md']) {
      const text = read(join('commands', 'professor', name));
      expect(text).toContain('No active course found');
      expect(text).toContain('/professor:new-topic');
    }
  });
});

describe('RON-354 canonical plugin files name only learning', () => {
  function canonicalFiles() {
    const root = join(__dirname, '..');
    const files = [];
    for (const dir of ['agents', join('commands', 'professor')]) {
      for (const name of readdirSync(join(root, dir))) {
        if (name.endsWith('.md')) files.push(join(root, dir, name));
      }
    }
    files.push(join(root, 'professor-skill', 'SKILL.md'));
    return files;
  }

  it('no canonical command, agent or SKILL.md mentions courses/ as a course location', () => {
    const offenders = canonicalFiles().filter((file) =>
      readFileSync(file, 'utf-8').includes('courses/'),
    );

    expect(offenders).toEqual([]);
  });
});

describe('RON-354 docs and CHANGELOG state the migration', () => {
  it('the newest CHANGELOG release tells old users to move courses/<slug>/ by hand', () => {
    const changelog = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf-8');
    const start = changelog.indexOf('\n## [');
    const unreleased = changelog.slice(start, changelog.indexOf('\n## [', start + 1));

    expect(unreleased).toContain('`courses/<slug>/`');
    expect(unreleased).toContain('move it to `learning/<slug>/` by hand');
    expect(unreleased).toMatch(/nothing is migrated automatically/i);
  });

  it('CLAUDE.md, README.md and AGENTS.md present learning/ as the only location', () => {
    for (const name of ['CLAUDE.md', 'README.md', 'AGENTS.md']) {
      const text = readFileSync(join(__dirname, '..', name), 'utf-8');
      expect(text, `${name} should not name courses/ as a course location`).not.toContain(
        'courses/',
      );
      expect(text, `${name} should name learning/`).toContain('learning/');
    }
  });
});

describe('RON-354 web course directory defaults to learning', () => {
  const originalCoursesDir = process.env.COURSES_DIR;

  afterEach(() => {
    if (originalCoursesDir === undefined) delete process.env.COURSES_DIR;
    else process.env.COURSES_DIR = originalCoursesDir;
  });

  it('defaults to ./learning when COURSES_DIR is unset', () => {
    delete process.env.COURSES_DIR;

    expect(defaultCoursesDir()).toBe('./learning');
  });

  it('honours an explicit COURSES_DIR', () => {
    process.env.COURSES_DIR = './custom';

    expect(defaultCoursesDir()).toBe('./custom');
  });

  it('the web command sets ./learning and never ./courses', () => {
    const source = readFileSync(join(__dirname, '..', 'bin', 'commands', 'web.js'), 'utf-8');

    expect(source).toContain("process.env.COURSES_DIR = process.env.COURSES_DIR || './learning'");
    expect(source).not.toContain("'./courses'");
  });
});
