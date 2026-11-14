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
import { createCourse, supportsOrphanWorktree, listWorktrees, saveCourse } from '../bin/commands/create.js';

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
  mkdirSync(join(d, 'src'));
  writeFileSync(join(d, 'src', 'app.js'), 'host code\n');
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
    git(repo, 'branch', 'learning'); // existing ref blocks refs/heads/learning/sql
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

describe('RON-355 — orphan course branches', () => {
  it('RON-355: creates an orphan worktree that contains no host files', () => {
    const repo = mkRepo();
    expect(supportsOrphanWorktree(repo)).toBe(true);

    const { dir } = createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });

    expect(listWorktrees(repo)).toContainEqual({ path: dir, branch: 'learning/sql' });
    expect(existsSync(join(dir, 'README.md'))).toBe(false);
    expect(existsSync(join(dir, 'src'))).toBe(false);
    expect(() => git(dir, 'rev-parse', '--verify', 'HEAD')).toThrow();
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('RON-355: a new course branch shares no commit with the host branch', () => {
    const repo = mkRepo();
    const { dir } = createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    expect(() => git(repo, 'rev-parse', '--verify', 'refs/heads/learning/sql')).toThrow();

    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');
    expect(saveCourse({ cwd: repo, slug: 'sql', message: 'course(sql): create' }).committed).toBe(true);

    const hostHead = git(repo, 'rev-parse', 'HEAD');
    const courseHead = git(repo, 'rev-parse', 'refs/heads/learning/sql');
    expect(git(repo, 'log', '--format=%H', 'refs/heads/learning/sql').split('\n')).toEqual([courseHead]);
    expect(git(repo, 'log', '--format=%H').split('\n')).not.toContain(courseHead);
    expect(hostHead).not.toBe(courseHead);
    expect(git(repo, 'ls-tree', '--name-only', 'refs/heads/learning/sql')).toBe('COURSE.md');
    expect(git(repo, 'log', '-1', '--format=%s')).toBe('init');
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(saveCourse({ cwd: repo, slug: 'sql' })).toEqual({ committed: false, reason: 'nothing to save' });
  });

  it('RON-355: the forced fallback produces the same orphan worktree', () => {
    const repo = mkRepo();
    const { dir } = createCourse({
      cwd: repo, slug: 'sql', kind: 'programming', orphanStrategy: 'fallback',
    });

    expect(listWorktrees(repo)).toContainEqual({ path: dir, branch: 'learning/sql' });
    expect(existsSync(join(dir, 'README.md'))).toBe(false);
    expect(() => git(dir, 'rev-parse', '--verify', 'HEAD')).toThrow();
    expect(git(repo, 'status', '--porcelain')).toBe('');

    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');
    expect(saveCourse({ cwd: repo, slug: 'sql' }).committed).toBe(true);
    expect(git(dir, 'log', '--format=%s')).toBe('course(sql): save progress');
  });

  it('RON-355: the forced fallback rolls back when the worktree cannot be created', () => {
    const repo = mkRepo();
    writeFileSync(join(repo, 'learning'), 'not a directory');

    expect(() => createCourse({
      cwd: repo, slug: 'sql', kind: 'programming', orphanStrategy: 'fallback',
    })).toThrow(/nothing was kept/);
    expect(existsSync(join(repo, 'learning', 'sql'))).toBe(false);
    expect(listWorktrees(repo)).toHaveLength(1);
    expect(() => git(repo, 'rev-parse', '--verify', 'refs/heads/learning/sql')).toThrow();
  });

  it('RON-355: supportsOrphanWorktree tolerates a probe that cannot run', () => {
    expect(supportsOrphanWorktree(join(mkTemp(), 'missing'))).toBe(false);
  });

  it('RON-355: a re-run on an existing course worktree changes nothing', () => {
    const repo = mkRepo();
    const { dir } = createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');
    saveCourse({ cwd: repo, slug: 'sql' });
    const head = git(repo, 'rev-parse', 'refs/heads/learning/sql');

    expect(createCourse({ cwd: repo, slug: 'sql', kind: 'programming' }).created).toBe(false);
    expect(git(repo, 'rev-parse', 'refs/heads/learning/sql')).toBe(head);
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });

  it('RON-355: reattach restores the orphan branch history after worktree removal', () => {
    const repo = mkRepo();
    const { dir } = createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    writeFileSync(join(dir, 'COURSE.md'), '# SQL\n');
    saveCourse({ cwd: repo, slug: 'sql' });
    const head = git(repo, 'rev-parse', 'refs/heads/learning/sql');
    git(repo, 'worktree', 'remove', dir);

    createCourse({ cwd: repo, slug: 'sql', kind: 'programming' });
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(readFileSync(join(dir, 'COURSE.md'), 'utf-8')).toBe('# SQL\n');
    expect(existsSync(join(dir, 'README.md'))).toBe(false);
  });

  it('RON-355: refuses a foreign directory and creates no branch', () => {
    const repo = mkRepo();
    mkdirSync(join(repo, 'learning', 'sql'), { recursive: true });
    writeFileSync(join(repo, 'learning', 'sql', 'keep.txt'), 'mine');

    expect(() => createCourse({ cwd: repo, slug: 'sql', kind: 'programming' }))
      .toThrow(/not the learning\/sql worktree/);
    expect(readFileSync(join(repo, 'learning', 'sql', 'keep.txt'), 'utf-8')).toBe('mine');
    expect(() => git(repo, 'rev-parse', '--verify', 'refs/heads/learning/sql')).toThrow();
  });

  it('RON-355: requires a git repository with a commit and creates no worktree', () => {
    const outside = mkTemp();
    expect(() => createCourse({ cwd: outside, slug: 'sql', kind: 'programming' }))
      .toThrow(/require a git repository/);
    expect(existsSync(join(outside, 'learning', 'sql'))).toBe(false);

    const empty = mkTemp();
    git(empty, 'init', '-q');
    expect(() => createCourse({ cwd: empty, slug: 'sql', kind: 'programming' }))
      .toThrow(/no commits/);
    expect(existsSync(join(empty, 'learning', 'sql'))).toBe(false);
  });

  it('RON-355: a non-programming course stays a plain folder', () => {
    const repo = mkRepo();
    const r = createCourse({ cwd: repo, slug: 'lich-su-viet-nam', kind: 'conceptual' });

    expect(r).toMatchObject({ branch: null, created: true });
    expect(existsSync(join(repo, 'learning', 'lich-su-viet-nam'))).toBe(true);
    expect(listWorktrees(repo)).toHaveLength(1);
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
      expect(text).toContain('skillforce create');
      expect(text).not.toMatch(/git worktree add/);
    }
    expect(read('professor-skill/SKILL.md')).toMatch(
      /Look for courses in `learning\/\*\/COURSE\.md`/,
    );
  });
});
