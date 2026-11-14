/**
 * RON-249 — `create` makes the course folder deterministically; `save` commits it.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createCourse, listWorktrees, saveCourse } from '../bin/commands/create.js';

const temps = [];
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

function mkTemp() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'cp-create-')));
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

describe('createCourse — programming', () => {
  it('creates a registered worktree on learning/<slug> and keeps host status clean', () => {
    const repo = mkRepo();
    const r = createCourse({ cwd: repo, slug: 'react-hooks', kind: 'programming' });

    expect(r).toMatchObject({ branch: 'learning/react-hooks', created: true });
    expect(listWorktrees(repo)).toContainEqual({ path: join(repo, 'learning', 'react-hooks'), branch: 'learning/react-hooks' });
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('is idempotent for an existing course worktree', () => {
    const repo = mkRepo();
    createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    expect(createCourse({ cwd: repo, slug: 'sql', kind: 'programming' }).created).toBe(false);
  });

  it('reattaches the course branch after the worktree was removed', () => {
    const repo = mkRepo();
    const { dir } = createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');
    expect(saveCourse({ cwd: repo, slug: 'sql' }).committed).toBe(true);
    git(repo, 'worktree', 'remove', dir);

    createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    expect(existsSync(join(dir, 'COURSE.md'))).toBe(true);
  });

  it('refuses a plain directory in the way and leaves it untouched', () => {
    const repo = mkRepo();
    mkdirSync(join(repo, 'learning', 'sql'), { recursive: true });
    writeFileSync(join(repo, 'learning', 'sql', 'keep.txt'), 'mine');
    expect(() => createCourse({ cwd: repo, slug: 'sql', kind: 'programming' })).toThrow(/not the learning\/sql worktree/);
    expect(existsSync(join(repo, 'learning', 'sql', 'keep.txt'))).toBe(true);
  });

  it('rolls back completely when git cannot create the branch', () => {
    const repo = mkRepo();
    git(repo, 'branch', 'learning'); // ref D/F conflict: refs/heads/learning blocks learning/<slug>
    expect(() => createCourse({ cwd: repo, slug: 'sql', kind: 'programming' })).toThrow(/nothing was kept/);
    expect(existsSync(join(repo, 'learning', 'sql'))).toBe(false);
    expect(listWorktrees(repo)).toHaveLength(1);
  });

  it('requires a git repository with a commit', () => {
    expect(() => createCourse({ cwd: mkTemp(), slug: 'sql', kind: 'programming' })).toThrow(/require a git repository/);
    const empty = mkTemp();
    git(empty, 'init', '-q');
    expect(() => createCourse({ cwd: empty, slug: 'sql', kind: 'programming' })).toThrow(/no commits/);
  });
});

describe('createCourse — other kinds and validation', () => {
  it('creates a plain folder without git', () => {
    const d = mkTemp();
    const r = createCourse({ cwd: d, slug: 'lich-su-viet-nam', kind: 'conceptual' });
    expect(r).toMatchObject({ branch: null, created: true });
    expect(existsSync(join(d, 'learning', 'lich-su-viet-nam'))).toBe(true);
  });

  it('rejects unsafe slugs and unknown kinds', () => {
    const d = mkTemp();
    for (const slug of ['../x', 'A', 'a/b', '', 'a--b']) {
      expect(() => createCourse({ cwd: d, slug, kind: 'skill' })).toThrow(/Invalid slug/);
    }
    expect(() => createCourse({ cwd: d, slug: 'ok', kind: 'poetry' })).toThrow(/Invalid kind/);
  });
});

describe('saveCourse', () => {
  it('commits course files on the course branch, then reports nothing to save', () => {
    const repo = mkRepo();
    const { dir } = createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');

    expect(saveCourse({ cwd: repo, slug: 'sql', message: 'course(sql): create' }).committed).toBe(true);
    expect(git(dir, 'log', '-1', '--format=%s')).toBe('course(sql): create');
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('init');
    expect(saveCourse({ cwd: repo, slug: 'sql' })).toEqual({ committed: false, reason: 'nothing to save' });
  });

  it('is a no-op for plain-folder courses', () => {
    const d = mkTemp();
    const { dir } = createCourse({ cwd: d, slug: 'chess', kind: 'skill' });
    writeFileSync(join(dir, 'COURSE.md'), '# Chess\n');
    expect(saveCourse({ cwd: d, slug: 'chess' }).committed).toBe(false);
  });
});

describe('course storage contract', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');

  it('new-topic and SKILL.md create courses through the CLI, under learning/', () => {
    for (const p of ['commands/professor/new-topic.md', 'professor-skill/SKILL.md']) {
      const text = read(p);
      expect(text).toContain('course-professor create');
      expect(text).not.toMatch(/git worktree add/);
    }
    expect(read('professor-skill/SKILL.md')).toMatch(/learning\/\*\/COURSE\.md` first/);
  });
});
