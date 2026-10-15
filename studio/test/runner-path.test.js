import { describe, it, expect } from 'vitest';
import { isSafeRelPath, isSafeSlug, slugify, resolveInside, normalizeFiles, toPosix } from '../src/lib/runner/path.js';

describe('runner path safety', () => {
  it('accepts safe relative paths', () => {
    expect(isSafeRelPath('main.py')).toBe(true);
    expect(isSafeRelPath('src/util/helpers.js')).toBe(true);
    expect(isSafeRelPath('a-b_c.d.ts')).toBe(true);
  });

  it('rejects traversal and absolute paths', () => {
    expect(isSafeRelPath('../evil.js')).toBe(false);
    expect(isSafeRelPath('src/../../etc/passwd')).toBe(false);
    expect(isSafeRelPath('/etc/passwd')).toBe(false);
    expect(isSafeRelPath('~/.ssh/id_rsa')).toBe(false);
    expect(isSafeRelPath('C:\\Windows\\system32')).toBe(false);
    expect(isSafeRelPath('src\\windows.js')).toBe(false);
    expect(isSafeRelPath('')).toBe(false);
    expect(isSafeRelPath('a/../b')).toBe(false);
    expect(isSafeRelPath('bad\u0000name.js')).toBe(false);
    expect(isSafeRelPath('trailing/')).toBe(false);
    expect(isSafeRelPath(42)).toBe(false);
  });

  it('validates slugs', () => {
    expect(isSafeSlug('javascript-fundamentals')).toBe(true);
    expect(isSafeSlug('course_1')).toBe(true);
    expect(isSafeSlug('..')).toBe(false);
    expect(isSafeSlug('../etc')).toBe(false);
    expect(isSafeSlug('has space')).toBe(false);
    expect(isSafeSlug('')).toBe(false);
  });

  it('resolves inside a root and throws on escape attempts', () => {
    expect(resolveInside('/tmp/ws', 'src/a.js')).toBe('/tmp/ws/src/a.js');
    expect(() => resolveInside('/tmp/ws', '../x')).toThrow(/Unsafe path/);
  });

  it('slugifies titles', () => {
    expect(slugify('JavaScript Fundamentals!')).toBe('javascript-fundamentals');
    expect(slugify('  Héllo, Wörld  ')).toBe('hello-world');
    expect(slugify('')).toBe('workspace');
  });

  it('normalises file maps and lists', () => {
    expect(normalizeFiles({ 'a.js': 'x' })).toEqual([{ path: 'a.js', content: 'x' }]);
    expect(normalizeFiles([{ name: 'a.js', content: 'y' }])).toEqual([{ path: 'a.js', content: 'y' }]);
    expect(normalizeFiles(null)).toEqual([]);
    expect(toPosix('a\\b')).toBe('a/b');
  });
});
