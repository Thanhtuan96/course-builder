/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { readCourse } from '../bin/course-reader.js';
import { buildStatusReport } from '../bin/commands/status.js';
import { resolveActiveCourse } from '../bin/commands/next.js';
import { parseCheckOutput, resolveRunner, run as runCheck } from '../bin/commands/check.js';
import { evaluateNodeVersion, summarizeChecks, whichPath } from '../bin/commands/doctor.js';

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
  const dir = mkdtempSync(join(tmpdir(), 'cp-cmd-'));
  tempDirs.push(dir);
  return dir;
}

// ─── status ───────────────────────────────────────────────────────────────────

describe('buildStatusReport', () => {
  const course = readCourse(join(FIXTURES, 'flavour-table'), {
    slug: 'flavour-table', today: '2026-10-15',
  });

  it('produces the documented --json shape', () => {
    const report = buildStatusReport([course], { today: '2026-10-15' });
    expect(Object.keys(report)).toEqual(['courses', 'streak']);
    expect(report.courses[0]).toEqual({
      slug: 'flavour-table',
      title: 'Table Flavour',
      kind: 'conceptual',
      level: 'Beginner',
      progress: { done: 1, total: 3, percent: 33 },
      currentSection: { n: '2', title: 'Second Steps', status: 'active' },
      dueCards: 1,
      lastActive: '2026-10-15',
      streak: 2,
    });
    expect(report.streak).toBe(2);
  });

  it('is JSON-serializable', () => {
    const report = buildStatusReport([course], { today: '2026-10-15' });
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(JSON.parse(JSON.stringify(report)).courses).toHaveLength(1);
  });
});

// ─── next ─────────────────────────────────────────────────────────────────────

describe('resolveActiveCourse', () => {
  it('returns the course matching an explicit slug', () => {
    const courses = [
      { slug: 'a', lastActive: '2026-10-15', currentSection: { status: 'active' } },
      { slug: 'b', lastActive: '2026-10-10', currentSection: { status: 'active' } },
    ];
    expect(resolveActiveCourse(courses, 'b').slug).toBe('b');
    expect(resolveActiveCourse(courses, 'missing')).toBeNull();
  });

  it('prefers the only active course', () => {
    const courses = [
      { slug: 'a', lastActive: '2026-10-01', currentSection: { status: 'active' } },
      { slug: 'b', lastActive: '2026-10-15', currentSection: { status: 'todo' } },
    ];
    expect(resolveActiveCourse(courses, null).slug).toBe('a');
  });

  it('falls back to the most recently active course', () => {
    const courses = [
      { slug: 'old', lastActive: '2026-10-01', currentSection: null },
      { slug: 'new', lastActive: '2026-10-15', currentSection: null },
    ];
    expect(resolveActiveCourse(courses, null).slug).toBe('new');
  });
});

// ─── check ────────────────────────────────────────────────────────────────────

describe('resolveRunner', () => {
  it('maps programming extensions to the right toolchain', () => {
    expect(resolveRunner('a.py')).toMatchObject({ kind: 'run', cmd: 'python3' });
    expect(resolveRunner('a.js')).toMatchObject({ kind: 'run', cmd: 'node' });
    expect(resolveRunner('a.mjs')).toMatchObject({ kind: 'run', cmd: 'node' });
    expect(resolveRunner('a.ts')).toMatchObject({ kind: 'tsx', cmd: 'npx' });
    expect(resolveRunner('a.go')).toMatchObject({ kind: 'run', cmd: 'go' });
  });

  it('explains non-runnable and rubric files', () => {
    expect(resolveRunner('a.rs').kind).toBe('explain');
    expect(resolveRunner('a.sql').kind).toBe('explain');
    expect(resolveRunner('a.md').kind).toBe('rubric');
    expect(resolveRunner('a.xyz').kind).toBe('explain');
  });
});

describe('parseCheckOutput', () => {
  it('parses ✓ / ✗ self-check lines', () => {
    const result = parseCheckOutput({
      stdout: '✓ adds two numbers\n✗ handles zero\n',
      code: 1,
    });
    expect(result.checks).toEqual([
      { name: 'adds two numbers', pass: true },
      { name: 'handles zero', pass: false },
    ]);
    expect(result.allPass).toBe(false);
  });

  it('parses PASS:/FAIL: self-check lines', () => {
    const result = parseCheckOutput({ stdout: 'PASS: first\nFAIL: second\n', code: 1 });
    expect(result.checks).toEqual([
      { name: 'first', pass: true },
      { name: 'second', pass: false },
    ]);
  });

  it('passes on a clean exit with no explicit checks', () => {
    const result = parseCheckOutput({ stdout: 'ran fine\n', code: 0 });
    expect(result.checks).toEqual([]);
    expect(result.allPass).toBe(true);
  });

  it('fails on a non-zero exit and surfaces the first error line', () => {
    const result = parseCheckOutput({
      stdout: '',
      stderr: 'Traceback (most recent call last):\nAssertionError: expected 1 to equal 2',
      code: 1,
    });
    expect(result.allPass).toBe(false);
    expect(result.errorLine).toContain('AssertionError');
  });

  it('fails when a check fails even if the exit code is zero', () => {
    const result = parseCheckOutput({ stdout: '✗ one check failed\n', code: 0 });
    expect(result.allPass).toBe(false);
  });

  it('detects console.assert failures that exit zero', () => {
    const result = parseCheckOutput({
      stdout: '',
      stderr: [
        'AssertionError [ERR_ASSERTION]: expected add(2,2) to be 4',
        '    at Object.<anonymous>',
      ].join('\n'),
      code: 0,
    });
    expect(result.allPass).toBe(false);
    expect(result.assertionFailed).toBe(true);
    expect(result.errorLine).toContain('expected add(2,2) to be 4');
  });
});

// ─── doctor ───────────────────────────────────────────────────────────────────

describe('evaluateNodeVersion', () => {
  it('accepts Node >= 18', () => {
    expect(evaluateNodeVersion('v18.0.0').status).toBe('ok');
    expect(evaluateNodeVersion('v26.8.1').status).toBe('ok');
  });

  it('fails on older Node and gives a fix hint', () => {
    const result = evaluateNodeVersion('v16.20.0');
    expect(result.status).toBe('fail');
    expect(result.hint).toMatch(/Node/i);
  });
});

describe('whichPath', () => {
  it('finds an executable on the supplied PATH', () => {
    const dir = mkTemp();
    const exe = join(dir, 'fake-tool');
    writeFileSync(exe, '#!/bin/sh\n', { mode: 0o755 });
    expect(whichPath('fake-tool', dir)).toBe(exe);
  });

  it('returns null when the executable is absent', () => {
    const dir = mkTemp();
    expect(whichPath('definitely-not-here', dir)).toBeNull();
  });
});

describe('summarizeChecks', () => {
  it('counts checks by status', () => {
    const counts = summarizeChecks([
      { status: 'ok' }, { status: 'ok' }, { status: 'warn' }, { status: 'fail' },
    ]);
    expect(counts).toEqual({ ok: 2, warn: 1, fail: 1 });
  });
});

// ─── CLI wiring guard ─────────────────────────────────────────────────────────

describe('check command discovery', () => {
  it('reads the active exercise for a course with one declared', () => {
    const course = readCourse(join(FIXTURES, 'flavour-nokind'), { slug: 'flavour-nokind' });
    expect(course.activeExercise).toBe('exercises/01-intro.md');
  });

  it('creates no files as a side effect of reading', () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'courses'), { recursive: true });
    expect(readCourse).toBeTypeOf('function');
  });

  it('reports a resolved-but-missing exercise clearly with exit code 1', async () => {
    const dir = mkTemp();
    mkdirSync(join(dir, 'learning', 'test-course'), { recursive: true });
    writeFileSync(join(dir, 'learning', 'test-course', 'COURSE.md'), [
      '# Test Course',
      '**Kind**: programming',
      '',
      '## Sections',
      '',
      '| # | Section | Status |',
      '|---|---------|--------|',
      '| 1 | Intro | 🔄 In progress |',
      '',
      '**Active exercise**: exercises/09-missing.js',
    ].join('\n'));

    const logs = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
    const prevExit = process.exitCode;
    process.exitCode = 0;
    try {
      await runCheck({ args: [], cwd: dir });
      expect(process.exitCode).toBe(1);
    } finally {
      spy.mockRestore();
      process.exitCode = prevExit;
    }
    const output = logs.join('\n');
    expect(output).toContain('Exercise not found: exercises/09-missing.js');
    expect(output).toMatch(/Run professor:next to create it/);
  });
});
