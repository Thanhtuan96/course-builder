/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  sectionNumberFromLecture,
  archiveFileName,
  archiveLecture,
} from '../web/lecture-archive.js';

describe('sectionNumberFromLecture', () => {
  it('parses a plain "# Section 2: X" heading', () => {
    expect(sectionNumberFromLecture('# Section 2: Functions')).toBe('2');
  });

  it('parses the "📖" heading variant', () => {
    expect(sectionNumberFromLecture('# 📖 Section 2: Functions')).toBe('2');
  });

  it('parses a multi-digit section number', () => {
    expect(sectionNumberFromLecture('# 📖 Section 10: Advanced')).toBe('10');
  });

  it('parses a dotted section number', () => {
    expect(sectionNumberFromLecture('# Section 2.1: Closures')).toBe('2.1');
  });

  it('parses headings of other levels', () => {
    expect(sectionNumberFromLecture('## Section 3: Scope')).toBe('3');
  });

  it('finds the heading even when preceded by frontmatter', () => {
    const md = '---\ncourse: js\n---\n\n# Section 4: Async\n\nBody';
    expect(sectionNumberFromLecture(md)).toBe('4');
  });

  it('returns null when no heading is present', () => {
    expect(sectionNumberFromLecture('Just some lecture body')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(sectionNumberFromLecture(undefined)).toBeNull();
  });
});

describe('archiveFileName', () => {
  it('zero-pads the section number and slugifies the title', () => {
    expect(archiveFileName('# Section 2: Closures', [])).toBe('02-closures.md');
  });

  it('slugifies punctuation and ampersands', () => {
    expect(archiveFileName('# 📖 Section 3: Closures & Scope', [])).toBe(
      '03-closures-scope.md'
    );
  });

  it('normalizes dotted section numbers', () => {
    expect(archiveFileName('# Section 2.1: Closures', [])).toBe('02-01-closures.md');
  });

  it('falls back to the next free number when the heading has no number', () => {
    expect(archiveFileName('No heading here', [])).toBe('01-section.md');
  });

  it('falls back to next free number after existing archives', () => {
    const existing = ['01-section.md', '02-section.md'];
    expect(archiveFileName('No heading here', existing)).toBe('03-section.md');
  });

  it('increments past the highest existing archive number', () => {
    const existing = ['07-intro.md'];
    expect(archiveFileName('No heading here', existing)).toBe('08-section.md');
  });

  it('resolves collisions with a numeric suffix', () => {
    const existing = ['02-closures.md'];
    expect(archiveFileName('# Section 2: Closures', existing)).toBe(
      '02-closures-2.md'
    );
  });
});

describe('archiveLecture', () => {
  let courseDir;

  beforeEach(() => {
    courseDir = mkdtempSync(join(tmpdir(), 'lecture-archive-'));
  });

  afterEach(() => {
    rmSync(courseDir, { recursive: true, force: true });
  });

  it('reports no-lecture when LECTURE.md is missing', () => {
    const result = archiveLecture(courseDir);
    expect(result.archived).toBe(false);
    expect(result.reason).toBe('no-lecture');
  });

  it('copies LECTURE.md into lectures/NN-slug.md', () => {
    const lecture = '# 📖 Section 2: Closures\n\nContent here.';
    writeFileSync(join(courseDir, 'LECTURE.md'), lecture, 'utf-8');

    const result = archiveLecture(courseDir);

    expect(result.archived).toBe(true);
    expect(result.fileName).toBe('02-closures.md');
    expect(result.path).toBe(join('lectures', '02-closures.md'));

    const archived = readFileSync(
      join(courseDir, 'lectures', '02-closures.md'),
      'utf-8'
    );
    expect(archived).toBe(lecture);
    // The original is preserved (never deleted) — the caller overwrites it.
    expect(existsSync(join(courseDir, 'LECTURE.md'))).toBe(true);
  });

  it('creates the lectures directory when absent', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 1: Intro', 'utf-8');
    archiveLecture(courseDir);
    expect(existsSync(join(courseDir, 'lectures'))).toBe(true);
  });

  it('uses the next free number for a second unnumbered lecture', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), 'First lecture', 'utf-8');
    archiveLecture(courseDir);
    writeFileSync(join(courseDir, 'LECTURE.md'), 'Second lecture', 'utf-8');
    const result = archiveLecture(courseDir);

    expect(result.archived).toBe(true);
    expect(result.fileName).toBe('02-section.md');
  });

  it('never overwrites an existing archive (collision gets a suffix)', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 2: Closures', 'utf-8');
    archiveLecture(courseDir);
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 2: Closures', 'utf-8');
    const result = archiveLecture(courseDir);

    expect(result.fileName).toBe('02-closures-2.md');
    expect(existsSync(join(courseDir, 'lectures', '02-closures.md'))).toBe(true);
    expect(existsSync(join(courseDir, 'lectures', '02-closures-2.md'))).toBe(true);
  });

  it('does not create lectures/ when there is nothing to archive', () => {
    archiveLecture(courseDir);
    expect(existsSync(join(courseDir, 'lectures'))).toBe(false);
  });
});
