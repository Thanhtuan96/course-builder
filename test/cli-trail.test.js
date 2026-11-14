/**
 * RON-250 — Coach gets an explicit course context and its review trail is persisted.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendRound, buildContext, recordRound, MAX_ROUNDS } from '../bin/commands/trail.js';
import { createCourse } from '../bin/commands/create.js';

const temps = [];
afterEach(() => { for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true }); });

const COURSE = `# Playwright E2E

**Level**: beginner
**Kind**: programming
**Active exercise**: exercises/01-first-test.js

## Sections

| # | Section | Status |
|---|---|---|
| 1 | First test | 🔄 In progress |
| 2 | Locators | ⬜ Not started |
`;

function mkCourse(slug = 'playwright-e2e', root = realpathSync(mkdtempSync(join(tmpdir(), 'cp-trail-')))) {
  temps.push(root);
  const dir = join(root, 'learning', slug);
  mkdirSync(join(dir, 'exercises'), { recursive: true });
  writeFileSync(join(dir, 'COURSE.md'), COURSE);
  writeFileSync(join(dir, 'exercises', '01-first-test.js'), '// TODO\n');
  writeFileSync(join(dir, 'LECTURE.md'), '# Section 1: First test\n\n## Objectives\n- Write one passing test\n');
  return { root, dir };
}

const round = (n) => ({ learner: `attempt ${n}`, asked: `question ${n}?`, concept: `concept ${n}` });

describe('buildContext', () => {
  it('returns the explicit course path, section, objectives and exercise', () => {
    const { root, dir } = mkCourse();
    expect(buildContext({ cwd: root, slug: 'playwright-e2e' })).toMatchObject({
      slug: 'playwright-e2e',
      dir,
      kind: 'programming',
      section: '1 — First test',
      objectives: ['Write one passing test'],
      activeExercise: join(dir, 'exercises', '01-first-test.js'),
      learningLog: join(dir, 'LEARNING-LOG.md'),
      trail: [],
    });
  });

  it('never guesses: unknown slug or several courses without a slug is an error', () => {
    const { root } = mkCourse('a');
    mkCourse('b', root);
    expect(() => buildContext({ cwd: root, slug: 'todomvc' })).toThrow(/No course "todomvc".*a, b/);
    expect(() => buildContext({ cwd: root })).toThrow(/pass the slug: a, b/);
  });

  it('uses the only course when no slug is given', () => {
    const { root } = mkCourse();
    expect(buildContext({ cwd: root }).slug).toBe('playwright-e2e');
  });
});

describe('appendRound', () => {
  const base = { slug: 's', section: '1 — First test', date: '2026-11-14' };

  it('creates the log and keeps only the last rounds per section', () => {
    let text = '';
    for (let n = 1; n <= MAX_ROUNDS + 2; n++) text = appendRound(text, { ...base, ...round(n) }).text;
    expect(text).toMatch(/^---\ncourse: s\nupdated: 2026-11-14\n---/);
    expect(text.match(/^Round \d+/gm)).toEqual(['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5']);
    expect(text).not.toContain('attempt 2"');
    expect(text).toContain('Learner: "attempt 7"');
  });

  it('keeps other sections and log parts, and sets a single watch-this flag', () => {
    const existing = '# Learning Log\n\n## 🗣️ Reasoning Trail\n\n### Section 2 — Locators\n\nRound 1 — 2026-11-01\n  Learner: "x"\n\n## 📋 Attempt Log\n\n- 14:22 — stuck\n';
    let text = appendRound(existing, { ...base, ...round(1), watch: 'waits' }).text;
    text = appendRound(text, { ...base, ...round(2), watch: 'auto-waiting', evidence: '1 failed, 0 passed' }).text;
    expect(text).toContain('### Section 2 — Locators\n\nRound 1 — 2026-11-01');
    expect(text).toContain('## 📋 Attempt Log\n\n- 14:22 — stuck');
    expect(text.match(/watch-this/g)).toHaveLength(1);
    expect(text).toContain('⚠️ watch-this: auto-waiting');
    expect(text).toContain('Evidence: 1 failed, 0 passed');
  });
});

describe('recordRound', () => {
  it('writes the trail where context reads it back (new session restores it)', () => {
    const { root, dir } = mkCourse();
    const r = recordRound({ cwd: root, slug: 'playwright-e2e', ...round(1), date: '2026-11-14' });
    expect(r).toMatchObject({ recorded: true, path: join(dir, 'LEARNING-LOG.md'), rounds: 1 });
    expect(buildContext({ cwd: root, slug: 'playwright-e2e' }).trail[0]).toContain('question 1?');
  });

  it('--stdin heredoc keeps shell syntax in learner text literal', () => {
    const { root, dir } = mkCourse();
    const cli = new URL('../bin/cli.js', import.meta.url).pathname;
    const json = JSON.stringify({ learner: 'I ran $(touch pwned) and `id`', asked: 'why?', concept: 'c' });
    execFileSync('sh', ['-c', `node "${cli}" trail playwright-e2e --stdin <<'TRAIL_EOF'\n${json}\nTRAIL_EOF`], { cwd: root });
    expect(readFileSync(join(dir, 'LEARNING-LOG.md'), 'utf-8')).toContain('Learner: "I ran $(touch pwned) and `id`"');
    expect(existsSync(join(root, 'pwned'))).toBe(false);
  });

  it('refuses to record without a slug or required fields', () => {
    const { root } = mkCourse();
    expect(() => recordRound({ cwd: root, ...round(1) })).toThrow(/slug/);
    expect(() => recordRound({ cwd: root, slug: 'playwright-e2e', learner: 'x', asked: '', concept: 'c' })).toThrow(/--asked/);
  });

  it('commits the round on a programming course worktree', () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'cp-trail-git-')));
    temps.push(repo);
    const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf-8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    writeFileSync(join(repo, 'README.md'), 'host\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    const { dir } = createCourse({ cwd: repo, slug: 'pw', kind: 'programming' });
    writeFileSync(join(dir, 'COURSE.md'), COURSE);

    expect(recordRound({ cwd: repo, slug: 'pw', ...round(1) }).saved).toBe(true);
    expect(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir, encoding: 'utf-8' }).trim())
      .toBe('course(pw): review round, section 1');
    expect(readFileSync(join(dir, 'LEARNING-LOG.md'), 'utf-8')).toContain('Coach asked: "question 1?"');
  });
});

describe('Coach contract', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');

  it('review and stuck pass the CLI context to Coach and record through trail', () => {
    for (const p of ['commands/professor/review.md', 'commands/professor/stuck.md']) {
      const text = read(p);
      expect(text).toContain('skillforce context');
      expect(text).toContain('skillforce trail');
      expect(text).toContain("<<'TRAIL_EOF'");
    }
    expect(read('agents/coach.md')).toMatch(/never guess/i);
  });
});
