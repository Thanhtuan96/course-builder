import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Matches a lecture heading and captures the section number + title.
// Examples: "# Section 2: Closures", "# 📖 Section 2.1: Scope"
const SECTION_HEADING =
  /^#{1,6}\s*(?:📖\s*)?Section\s+([0-9]+(?:\.[0-9]+)*)\s*[:—-]?\s*(.*)$/m;

/**
 * Extract the section number from a lecture's markdown heading.
 * @param {string} md - Lecture markdown.
 * @returns {string|null} Raw section number (e.g. "2", "2.1") or null if not found.
 */
export function sectionNumberFromLecture(md) {
  if (typeof md !== 'string') return null;
  const match = md.match(SECTION_HEADING);
  return match ? match[1] : null;
}

/**
 * Extract the section title from a lecture's markdown heading.
 * @param {string} md - Lecture markdown.
 * @returns {string} Section title, or empty string when absent.
 */
function sectionTitleFromLecture(md) {
  if (typeof md !== 'string') return '';
  const match = md.match(SECTION_HEADING);
  if (!match) return '';
  return (match[2] || '').trim();
}

/**
 * Turn a title into a kebab-case filename slug.
 * @param {string} text
 * @param {string} [fallback='section']
 * @returns {string}
 */
function slugify(text, fallback = 'section') {
  const slug = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/**
 * Zero-pad each dotted segment of a section number and join with dashes.
 * "2" -> "02", "2.1" -> "02-01".
 * @param {string} number
 * @returns {string}
 */
function padSectionNumber(number) {
  return number
    .split('.')
    .map((part) => part.padStart(2, '0'))
    .join('-');
}

/**
 * Find the next free section number after the ones already archived.
 * @param {string[]} existingNames - Existing archive file names.
 * @returns {string} Zero-padded number (e.g. "03").
 */
function nextFreeNumber(existingNames) {
  let max = 0;
  for (const name of existingNames) {
    const match = String(name).match(/^(\d+)/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return String(max + 1).padStart(2, '0');
}

/**
 * Build the archive file name for a lecture.
 * Uses the lecture's section number when present, otherwise the next free
 * number after the existing archives. Resolves collisions with a numeric suffix.
 * @param {string} md - Lecture markdown.
 * @param {string[]} [existingNames=[]] - Existing archive file names.
 * @returns {string} Archive file name, e.g. "02-closures.md".
 */
export function archiveFileName(md, existingNames = []) {
  const names = Array.isArray(existingNames) ? existingNames : [];
  const rawNumber = sectionNumberFromLecture(md);
  const number = rawNumber ? padSectionNumber(rawNumber) : nextFreeNumber(names);
  const slug = slugify(sectionTitleFromLecture(md));

  let candidate = `${number}-${slug}.md`;
  let suffix = 2;
  while (names.includes(candidate)) {
    candidate = `${number}-${slug}-${suffix}.md`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Archive the current LECTURE.md of a course into lectures/NN-<slug>.md.
 * Copies (never deletes) the file; the caller overwrites LECTURE.md afterwards.
 * @param {string} courseDir - Absolute course directory.
 * @returns {{ archived: boolean, fileName?: string, path?: string, reason?: string, error?: string }}
 */
export function archiveLecture(courseDir) {
  const lecturePath = join(courseDir, 'LECTURE.md');
  if (!existsSync(lecturePath)) {
    return { archived: false, reason: 'no-lecture' };
  }

  try {
    const content = readFileSync(lecturePath, 'utf-8');
    const lecturesDir = join(courseDir, 'lectures');
    const existingNames = existsSync(lecturesDir)
      ? readdirSync(lecturesDir).filter((name) => name.endsWith('.md'))
      : [];

    if (!existsSync(lecturesDir)) {
      mkdirSync(lecturesDir, { recursive: true });
    }

    const fileName = archiveFileName(content, existingNames);
    writeFileSync(join(lecturesDir, fileName), content, 'utf-8');
    return { archived: true, fileName, path: join('lectures', fileName) };
  } catch (error) {
    return { archived: false, error: error.message };
  }
}
