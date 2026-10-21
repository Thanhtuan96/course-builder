import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  isSafeCourseFile,
  isSafeExerciseFilename,
  isSafeSlug,
  isSafeWorkspaceRelPath,
  resolveInside,
  safeWriteFile,
} from '../../web/security.js';
import { assertUnchanged, snapshotTree } from './helpers/snapshot.js';

let base;
let root;
let outside;

beforeEach(() => {
  base = join(tmpdir(), `professor-paths-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  root = join(base, 'root');
  outside = join(base, 'outside');
  mkdirSync(root, { mode: 0o700 });
  mkdirSync(outside, { mode: 0o700 });
});

afterEach(() => {
  if (base) rmSync(base, { recursive: true, force: true });
  base = null;
  root = null;
  outside = null;
});

const REJECTED_SEGMENTS = [
  '..',
  '../x',
  '..%2F..%2Fprobe',
  '%2e%2e',
  '%252e%252e',
  '..\\',
  '/etc/passwd',
  'C:\\x',
  '\\\\server\\share',
  'x/../../y.md',
];

describe('resolveInside rejects traversal vectors', () => {
  for (const vector of REJECTED_SEGMENTS) {
    it(`rejects ${JSON.stringify(vector)} without touching the filesystem`, () => {
      const before = snapshotTree(base);
      expect(() => resolveInside(root, vector)).toThrow();
      expect(() => safeWriteFile(root, [vector], 'owned')).toThrow();
      assertUnchanged(before, snapshotTree(base), `${vector} changed the filesystem`);
    });
  }

  it('rejects nested .. segments', () => {
    const before = snapshotTree(base);
    expect(() => resolveInside(root, 'course', '..', '..', 'probe.md')).toThrow();
    expect(() => safeWriteFile(root, ['course', '..', '..', 'probe.md'], 'x')).toThrow();
    assertUnchanged(before, snapshotTree(base));
  });

  it('rejects non-strings, empty segments and control characters', () => {
    expect(() => resolveInside(root, 42)).toThrow();
    expect(() => resolveInside(root, '')).toThrow();
    expect(() => resolveInside(root, 'a\u0000b')).toThrow();
  });
});

describe('resolveInside rejects symlink escapes', () => {
  it('rejects a final file symlink pointing outside the root', () => {
    const courseDir = join(root, 'course');
    mkdirSync(courseDir);
    const secret = join(outside, 'secret.md');
    writeFileSync(secret, 'secret');
    symlinkSync(secret, join(courseDir, 'COURSE.md'));

    const before = snapshotTree(base);
    expect(() => resolveInside(root, 'course', 'COURSE.md')).toThrow();
    expect(() => safeWriteFile(root, ['course', 'COURSE.md'], 'owned')).toThrow();
    assertUnchanged(before, snapshotTree(base));
  });

  it('rejects a directory symlink pointing outside the root', () => {
    const courseDir = join(root, 'course');
    mkdirSync(courseDir);
    symlinkSync(outside, join(courseDir, 'exercises'));

    const before = snapshotTree(base);
    expect(() => resolveInside(root, 'course', 'exercises', '01-intro.md')).toThrow();
    expect(() => safeWriteFile(root, ['course', 'exercises', '01-intro.md'], 'owned')).toThrow();
    assertUnchanged(before, snapshotTree(base));
  });
});

describe('resolveInside accepts valid paths', () => {
  it('resolves a valid slug and course file under the root', () => {
    const resolved = resolveInside(root, 'javascript-fundamentals', 'COURSE.md');
    expect(resolved).toBe(join(root, 'javascript-fundamentals', 'COURSE.md'));
  });

  it('resolves a nested workspace path', () => {
    const resolved = resolveInside(root, 'course', 'src', 'main.js');
    expect(resolved).toBe(join(root, 'course', 'src', 'main.js'));
  });

  it('safeWriteFile creates directories only after validation and writes content', () => {
    const target = safeWriteFile(
      root,
      ['javascript-fundamentals', 'exercises', '01-intro.md'],
      'hello'
    );

    expect(target).toBe(
      join(root, 'javascript-fundamentals', 'exercises', '01-intro.md')
    );
    expect(readFileSync(target, 'utf-8')).toBe('hello');
  });

  it('safeWriteFile never creates a directory for a rejected path', () => {
    const before = snapshotTree(base);
    expect(() => safeWriteFile(root, ['newdir', '..', '..', 'evil.md'], 'x')).toThrow();
    assertUnchanged(before, snapshotTree(base));
  });
});

describe('allowlist predicates', () => {
  it('accepts valid slugs and rejects anything outside the slug grammar', () => {
    expect(isSafeSlug('javascript-fundamentals')).toBe(true);
    expect(isSafeSlug('a')).toBe(true);
    expect(isSafeSlug('..')).toBe(false);
    expect(isSafeSlug('../x')).toBe(false);
    expect(isSafeSlug('A')).toBe(false);
    expect(isSafeSlug('a..b')).toBe(false);
    expect(isSafeSlug('a/b')).toBe(false);
    expect(isSafeSlug('')).toBe(false);
    expect(isSafeSlug(42)).toBe(false);
    expect(isSafeSlug('a'.repeat(121))).toBe(false);
  });

  it('only accepts the four known course files', () => {
    for (const file of ['COURSE.md', 'LECTURE.md', 'NOTES.md', 'CAPSTONE.md']) {
      expect(isSafeCourseFile(file)).toBe(true);
    }
    expect(isSafeCourseFile('course.md')).toBe(false);
    expect(isSafeCourseFile('../COURSE.md')).toBe(false);
    expect(isSafeCourseFile('/etc/passwd')).toBe(false);
    expect(isSafeCourseFile(null)).toBe(false);
  });

  it('accepts valid exercise filenames and rejects traversal/encoded variants', () => {
    expect(isSafeExerciseFilename('01-intro.md')).toBe(true);
    expect(isSafeExerciseFilename('a_b-c.2.md')).toBe(true);
    expect(isSafeExerciseFilename('..md')).toBe(false);
    expect(isSafeExerciseFilename('a..b.md')).toBe(false);
    expect(isSafeExerciseFilename('../x.md')).toBe(false);
    expect(isSafeExerciseFilename('x/../y.md')).toBe(false);
    expect(isSafeExerciseFilename('C:\\x.md')).toBe(false);
    expect(isSafeExerciseFilename('a'.repeat(201))).toBe(false);
  });

  it('accepts only safe workspace-relative paths', () => {
    expect(isSafeWorkspaceRelPath('src/main.js')).toBe(true);
    expect(isSafeWorkspaceRelPath('a/b/c.txt')).toBe(true);
    expect(isSafeWorkspaceRelPath('../escape.js')).toBe(false);
    expect(isSafeWorkspaceRelPath('a/../../b')).toBe(false);
    expect(isSafeWorkspaceRelPath('/etc/passwd')).toBe(false);
    expect(isSafeWorkspaceRelPath('C:\\x')).toBe(false);
    expect(isSafeWorkspaceRelPath('a\\b')).toBe(false);
    expect(isSafeWorkspaceRelPath('')).toBe(false);
    expect(isSafeWorkspaceRelPath(null)).toBe(false);
  });
});
