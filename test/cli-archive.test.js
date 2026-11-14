/**
 * RON-356 — archiving keeps every course file and the course commits.
 *
 * One describe block per requirement in
 * `openspec/changes/ron-356-archive-keeps-everything/specs/course-archive/spec.md`.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

import { archiveCourse, nextFreePath, verifyCopy } from '../bin/commands/archive.js';
import { createCourse, excludeRepoPath, saveCourse } from '../bin/commands/create.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'bin', 'cli.js');

const temps = [];
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

function mkTemp() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'cp-archive-')));
  temps.push(d);
  return d;
}

function mkRepo() {
  const d = mkTemp();
  git(d, 'init', '-q', '-b', 'main');
  git(d, 'config', 'user.email', 't@example.com');
  git(d, 'config', 'user.name', 'T');
  writeFileSync(join(d, 'README.md'), 'host\n');
  git(d, 'add', '.');
  git(d, 'commit', '-q', '-m', 'init');
  return d;
}

const COURSE_FILES = {
  'COURSE.md': '# Next.js\n\n**Kind**: programming\n',
  'CAPSTONE.md': '# Capstone\n',
  'NOTES.md': '# Notes\n',
  'LECTURE.md': '# 📖 Section 2: Routing\n',
  'LEARNING-LOG.md': '# Learning log\n',
  'SCHEDULE.md': '# Schedule\n',
  'COMPLETION.md': 'completed: no\n',
  'SKILL.md': '# Skill\n',
  'lectures/01-intro.md': '# 📖 Section 1: Intro\n',
  'exercises/01-state/README.md': 'Exercise\n',
};

/** A programming course with every file a learner accumulates, plus one saved commit. */
function mkProgrammingCourse(slug = 'nextjs') {
  const repo = mkRepo();
  const { dir } = createCourse({ cwd: repo, slug, kind: 'programming' });
  for (const [name, body] of Object.entries(COURSE_FILES)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  saveCourse({ cwd: repo, slug, message: `course(${slug}): first save` });
  return { repo, dir, slug };
}

function snapshot(dir, prefix = '') {
  const out = {};
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const abs = join(dir, name);
    const rel = prefix ? join(prefix, name) : name;
    if (statSync(abs).isDirectory()) Object.assign(out, snapshot(abs, rel));
    else out[rel] = readFileSync(abs, 'utf-8');
  }
  return out;
}

describe('RON-356 archive — the whole course is copied', () => {
  it('keeps every file of a programming course and skips .git', () => {
    const { repo, dir, slug } = mkProgrammingCourse();
    writeFileSync(join(dir, 'LECTURE.md'), '# 📖 Section 3: Data fetching\n');
    saveCourse({ cwd: repo, slug, message: `course(${slug}): second save` });

    const before = snapshot(dir);
    const result = archiveCourse({ cwd: repo, slug });

    expect(result).toMatchObject({
      archivedTo: join('.course_archive', 'nextjs'),
      branch: 'archive/nextjs',
      removed: true,
    });
    const archived = join(repo, '.course_archive', 'nextjs');
    for (const [name, body] of Object.entries(before)) {
      expect(readFileSync(join(archived, name), 'utf-8')).toBe(body);
    }
    expect(existsSync(join(archived, '.git'))).toBe(false);
    expect(existsSync(dir)).toBe(false);
  });

  it('commits pending work before renaming the branch', () => {
    const { repo, dir, slug } = mkProgrammingCourse();
    writeFileSync(join(dir, 'NOTES.md'), '# Notes\n\npending paragraph\n');

    archiveCourse({ cwd: repo, slug });

    expect(git(repo, 'log', 'archive/nextjs', '-1', '--format=%s')).toMatch(/course\(nextjs\)/);
    expect(readFileSync(join(repo, '.course_archive', 'nextjs', 'NOTES.md'), 'utf-8'))
      .toContain('pending paragraph');
  });

  it('second archive of the same slug gets a suffix and keeps the first archive', () => {
    const repo = mkRepo();
    createCourse({ cwd: repo, slug: 'nextjs', kind: 'programming' });
    writeFileSync(join(repo, 'learning', 'nextjs', 'COURSE.md'), '# Next.js\n');
    mkdirSync(join(repo, '.course_archive', 'nextjs'), { recursive: true });
    writeFileSync(join(repo, '.course_archive', 'nextjs', 'keep.txt'), 'original');

    const result = archiveCourse({ cwd: repo, slug: 'nextjs' });

    expect(result.archivedTo).toBe(join('.course_archive', 'nextjs-2'));
    expect(readFileSync(join(repo, '.course_archive', 'nextjs', 'keep.txt'), 'utf-8')).toBe('original');
    expect(existsSync(join(repo, '.course_archive', 'nextjs-2', 'COURSE.md'))).toBe(true);
  });

  it('suffixes increment past the highest used one', () => {
    const repo = mkRepo();
    for (const name of ['nextjs', 'nextjs-2']) {
      mkdirSync(join(repo, '.course_archive', name), { recursive: true });
      writeFileSync(join(repo, '.course_archive', name, 'keep.txt'), name);
    }
    createCourse({ cwd: repo, slug: 'nextjs', kind: 'programming' });
    writeFileSync(join(repo, 'learning', 'nextjs', 'COURSE.md'), '# Next.js\n');

    expect(archiveCourse({ cwd: repo, slug: 'nextjs' }).archivedTo)
      .toBe(join('.course_archive', 'nextjs-3'));
  });

  it('nextFreePath only picks a free path', () => {
    const d = mkTemp();
    expect(nextFreePath(join(d, 'x'))).toBe(join(d, 'x'));
    mkdirSync(join(d, 'x'));
    expect(nextFreePath(join(d, 'x'))).toBe(join(d, 'x-2'));
    mkdirSync(join(d, 'x-2'));
    expect(nextFreePath(join(d, 'x'))).toBe(join(d, 'x-3'));
  });
});

describe('RON-356 archive — programming courses keep their commits', () => {
  it('commits survive the archive and the host stays clean', () => {
    const { repo, dir, slug } = mkProgrammingCourse();
    writeFileSync(join(dir, 'SCHEDULE.md'), '# Schedule\n\nweek 2\n');
    saveCourse({ cwd: repo, slug, message: 'course(nextjs): two' });

    archiveCourse({ cwd: repo, slug });

    expect(git(repo, 'log', 'archive/nextjs', '--format=%s')).toContain('course(nextjs): first save');
    expect(git(repo, 'log', 'archive/nextjs', '--format=%s')).toContain('course(nextjs): two');
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(git(repo, 'branch', '--list', 'learning/nextjs')).toBe('');
  });

  it('an existing archive branch gets a suffix', () => {
    const { repo, slug } = mkProgrammingCourse();
    git(repo, 'branch', 'archive/nextjs', 'main');

    expect(archiveCourse({ cwd: repo, slug }).branch).toBe('archive/nextjs-2');
    expect(git(repo, 'rev-parse', '--verify', 'archive/nextjs')).toBeTruthy();
  });

  it('a worktree that cannot be committed is not removed', () => {
    const { repo, dir, slug } = mkProgrammingCourse();
    writeFileSync(join(dir, 'NOTES.md'), '# Notes\n\nuncommitted\n');
    const gitDir = git(dir, 'rev-parse', '--absolute-git-dir');
    writeFileSync(join(gitDir, 'index.lock'), '');

    expect(() => archiveCourse({ cwd: repo, slug })).toThrow(/nothing was removed/);
    expect(existsSync(dir)).toBe(true);
    expect(readFileSync(join(dir, 'NOTES.md'), 'utf-8')).toContain('uncommitted');
    expect(git(repo, 'branch', '--list', 'learning/nextjs')).not.toBe('');
    expect(existsSync(join(repo, '.course_archive', 'nextjs', 'COURSE.md'))).toBe(true);
  });

  it('a worktree that cannot be removed keeps its branch and can be archived again', () => {
    const { repo, dir, slug } = mkProgrammingCourse();
    git(repo, 'worktree', 'lock', dir);

    expect(() => archiveCourse({ cwd: repo, slug })).toThrow(/still registered/);
    expect(existsSync(dir)).toBe(true);
    expect(git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('archive/nextjs');

    git(repo, 'worktree', 'unlock', dir);
    const again = archiveCourse({ cwd: repo, slug });
    expect(again).toMatchObject({
      archivedTo: join('.course_archive', 'nextjs-2'),
      branch: 'archive/nextjs',
      removed: true,
    });
    expect(existsSync(dir)).toBe(false);
  });

  it('never forces a worktree removal', () => {
    const source = readFileSync(join(HERE, '..', 'bin', 'commands', 'archive.js'), 'utf-8');
    expect(source).not.toContain('--force');
  });
});

describe('RON-356 archive — plain-folder courses', () => {
  it('removes the folder only after a verified copy', () => {
    const root = mkTemp();
    const { dir } = createCourse({ cwd: root, slug: 'chess', kind: 'skill' });
    mkdirSync(join(dir, 'exercises'), { recursive: true });
    writeFileSync(join(dir, 'COURSE.md'), '# Chess\n');
    writeFileSync(join(dir, 'NOTES.md'), '# Notes\n');
    writeFileSync(join(dir, 'exercises', 'one.md'), 'Exercise\n');

    const result = archiveCourse({ cwd: root, slug: 'chess' });

    expect(result).toMatchObject({
      archivedTo: join('.course_archive', 'chess'),
      branch: null,
      removed: true,
    });
    for (const name of ['COURSE.md', 'NOTES.md', join('exercises', 'one.md')]) {
      expect(existsSync(join(root, '.course_archive', 'chess', name))).toBe(true);
    }
    expect(existsSync(dir)).toBe(false);
    expect(existsSync(join(root, '.git'))).toBe(false);
  });

  it('keeps the course when the copy cannot be verified', () => {
    const root = mkTemp();
    const { dir } = createCourse({ cwd: root, slug: 'chess', kind: 'skill' });
    writeFileSync(join(dir, 'COURSE.md'), '# Chess\n');

    const verify = () => { throw new Error('Archive copy size differs for COURSE.md.'); };
    expect(() => archiveCourse({ cwd: root, slug: 'chess', verify }))
      .toThrow(/size differs for COURSE\.md/);
    expect(readFileSync(join(dir, 'COURSE.md'), 'utf-8')).toBe('# Chess\n');
  });

  it('verifyCopy reports a missing destination file', () => {
    const root = mkTemp();
    const { dir } = createCourse({ cwd: root, slug: 'chess', kind: 'skill' });
    writeFileSync(join(dir, 'COURSE.md'), '# Chess\n');
    const dest = join(root, 'copy');
    mkdirSync(dest);

    expect(() => verifyCopy(dir, dest)).toThrow(/missing COURSE\.md/);
  });
});

describe('RON-356 archive — the host git status stays clean', () => {
  it('adds .course_archive/ to info/exclude once and leaves status empty', () => {
    const { repo, slug } = mkProgrammingCourse();

    archiveCourse({ cwd: repo, slug });
    const commonDir = git(repo, 'rev-parse', '--git-common-dir');
    const exclude = readFileSync(join(repo, commonDir, 'info', 'exclude'), 'utf-8');

    expect(exclude.split('\n').filter((line) => line === '/.course_archive/')).toHaveLength(1);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('does not duplicate an existing exclusion', () => {
    const repo = mkRepo();
    const root = git(repo, 'rev-parse', '--show-toplevel');
    excludeRepoPath(root, repo, join(repo, '.course_archive'));
    excludeRepoPath(root, repo, join(repo, '.course_archive'));

    const commonDir = git(repo, 'rev-parse', '--git-common-dir');
    const lines = readFileSync(join(repo, commonDir, 'info', 'exclude'), 'utf-8').split('\n');
    expect(lines.filter((line) => line === '/.course_archive/')).toHaveLength(1);
  });

  it('archives a plain folder outside git without touching .git', () => {
    const root = mkTemp();
    const { dir } = createCourse({ cwd: root, slug: 'sql', kind: 'conceptual' });
    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');

    expect(archiveCourse({ cwd: root, slug: 'sql' }).removed).toBe(true);
    expect(existsSync(join(root, '.git'))).toBe(false);
  });
});

describe('RON-356 archive — validation', () => {
  it('rejects an unknown slug without creating an archive', () => {
    const root = mkTemp();
    expect(() => archiveCourse({ cwd: root, slug: 'does-not-exist' })).toThrow(/No course at/);
    expect(existsSync(join(root, '.course_archive'))).toBe(false);
  });

  it('rejects an invalid slug', () => {
    const root = mkTemp();
    for (const slug of ['../etc', 'A', 'a--b', '']) {
      expect(() => archiveCourse({ cwd: root, slug })).toThrow(/Invalid slug/);
    }
  });
});

describe('RON-356 archive — CLI and Markdown contract', () => {
  it('prints one JSON object for --json', () => {
    const { repo, slug } = mkProgrammingCourse();
    const result = spawnSync(process.execPath, [CLI, 'archive', slug, '--json'], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout.trim().split('\n').pop());
    expect(out).toEqual({
      archivedTo: join('.course_archive', 'nextjs'),
      branch: 'archive/nextjs',
      removed: true,
    });
  });

  it('lists archive in --help', () => {
    const result = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8', timeout: 60_000 });
    expect(result.stdout).toMatch(/archive <slug>/);
  });

  it('archive.md delegates to the CLI and keeps no destructive git commands', () => {
    const text = readFileSync(join(HERE, '..', 'commands', 'professor', 'archive.md'), 'utf-8');
    expect(text).toContain('skillforce archive');
    expect(text).not.toContain('git branch -D');
    expect(text).not.toContain('--force');
    expect(text).toContain('AskUserQuestion');
    expect(text).toContain('SUMMARY.md');
  });
});
