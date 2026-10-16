/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
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
  shouldArchive,
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

  it('transliterates Vietnamese diacritics to ASCII', () => {
    expect(archiveFileName('# Section 1: Biến và kiểu dữ liệu', [])).toBe(
      '01-bien-va-kieu-du-lieu.md'
    );
  });

  it('transliterates Vietnamese words with đ', () => {
    expect(archiveFileName('# Section 3: Đối tượng', [])).toBe(
      '03-doi-tuong.md'
    );
  });

  it('transliterates multi-word Vietnamese titles', () => {
    expect(
      archiveFileName('# 📖 Section 4: Lập trình hướng đối tượng', [])
    ).toBe('04-lap-trinh-huong-doi-tuong.md');
  });
});

describe('shouldArchive', () => {
  it('returns false for an in-place edit of the same section', () => {
    const existing = '# Section 2: Closures\n\nversion 1';
    const incoming = '# Section 2: Closures\n\nversion 2 (edited)';
    expect(shouldArchive(existing, incoming)).toBe(false);
  });

  it('returns true when moving to a new section', () => {
    expect(
      shouldArchive('# Section 2: Closures', '# Section 3: Scope')
    ).toBe(true);
  });

  it('returns false for identical content', () => {
    const md = '# Section 2: Closures\n\nsame body';
    expect(shouldArchive(md, md)).toBe(false);
  });

  it('returns false for identical unnumbered content', () => {
    expect(shouldArchive('no heading', 'no heading')).toBe(false);
  });

  it('returns true when only one side has a section number and content differs', () => {
    expect(shouldArchive('plain lecture body', '# Section 5: New Topic')).toBe(
      true
    );
  });

  it('returns false for unnumbered content whose titles both differ from nothing', () => {
    expect(shouldArchive('first body', 'second body')).toBe(false);
  });

  it('returns true when section numbers differ but titles match', () => {
    expect(shouldArchive('# Section 2: Closures', '# Section 4: Closures')).toBe(
      true
    );
  });

  it('returns false for non-string input', () => {
    expect(shouldArchive(undefined, '# Section 2: X')).toBe(false);
    expect(shouldArchive('# Section 2: X', null)).toBe(false);
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

  it('copies LECTURE.md into lectures/NN-slug.md when moving sections', () => {
    const lecture = '# 📖 Section 2: Closures\n\nContent here.';
    writeFileSync(join(courseDir, 'LECTURE.md'), lecture, 'utf-8');

    const result = archiveLecture(courseDir, '# 📖 Section 3: Scope');

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

  it('does not archive an in-place edit of the same section', () => {
    writeFileSync(
      join(courseDir, 'LECTURE.md'),
      '# Section 2: Closures\n\nversion 1',
      'utf-8'
    );

    const result = archiveLecture(courseDir, '# Section 2: Closures\n\nversion 2');

    expect(result.archived).toBe(false);
    expect(result.reason).toBe('same-section');
    expect(existsSync(join(courseDir, 'lectures'))).toBe(false);
  });

  it('creates the lectures directory when absent', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 1: Intro', 'utf-8');
    archiveLecture(courseDir, '# Section 2: Next');
    expect(existsSync(join(courseDir, 'lectures'))).toBe(true);
  });

  it('uses the next free number for an unnumbered incoming lecture', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 1: Intro', 'utf-8');
    const result = archiveLecture(courseDir, 'A lecture without a heading');

    expect(result.archived).toBe(true);
    expect(result.fileName).toBe('01-intro.md');
  });

  it('falls back to the next free number when a newer archive exists', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 1: Intro', 'utf-8');
    archiveLecture(courseDir, '# Section 2: Next');
    writeFileSync(join(courseDir, 'LECTURE.md'), 'No heading lecture', 'utf-8');

    const result = archiveLecture(courseDir, '# Section 3: Third');

    expect(result.archived).toBe(true);
    expect(result.fileName).toBe('02-section.md');
  });

  it('never overwrites an existing archive (collision gets a suffix)', () => {
    mkdirSync(join(courseDir, 'lectures'), { recursive: true });
    writeFileSync(join(courseDir, 'lectures', '02-closures.md'), 'prior', 'utf-8');
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 2: Closures', 'utf-8');

    const result = archiveLecture(courseDir, '# Section 02: Closures');

    expect(result.fileName).toBe('02-closures-2.md');
    expect(readFileSync(join(courseDir, 'lectures', '02-closures.md'), 'utf-8')).toBe(
      'prior'
    );
  });

  it('does not create lectures/ for a same-section edit', () => {
    writeFileSync(join(courseDir, 'LECTURE.md'), '# Section 1: Intro\n\nv1', 'utf-8');
    archiveLecture(courseDir, '# Section 1: Intro\n\nv2');
    expect(existsSync(join(courseDir, 'lectures'))).toBe(false);
  });
});
