/**
 * Course-file export used by both the DataPanel (Settings) and the Course page header.
 *
 * Serialises a course to the plugin's COURSE.md flavour and triggers a browser download. Kept in
 * one place so the page and the Settings panel cannot drift (HANDOFF-23).
 */
import { getCourse } from './repo/index.js';
import { slugify, toCourseMarkdown } from './course.js';

/**
 * Trigger a client-side file download.
 * @param {string} filename
 * @param {string} text
 * @param {string} [type]
 */
export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Export a course (by id or full object) as `<slug>-COURSE.md`.
 * @param {{ id: string }} course
 * @returns {Promise<string>} the filename written
 */
export async function exportCourseMarkdown(course) {
  const full = (await getCourse(course.id)) || course;
  const filename = `${slugify(full.title)}-COURSE.md`;
  download(filename, toCourseMarkdown(full), 'text/markdown');
  return filename;
}
