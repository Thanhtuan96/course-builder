/**
 * `course-professor status` — one table for every course on disk.
 */
import { computeStreak, findCourses, readCourse, todayISO } from '../course-reader.js';
import { style } from '../registry-helpers.js';

/**
 * Read a `--flag value` pair from the argument list.
 * @param {string[]} args
 * @param {string} name
 * @returns {string|boolean|null}
 */
function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function progressBar(percent, chalk) {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  return chalk ? chalk.green(bar) : bar;
}

/**
 * Build the plain report object used by the table and `--json`.
 * @param {object[]} courses parsed courses (from readCourse)
 * @param {{ today?: string }} [opts]
 * @returns {{ courses: object[], streak: number }}
 */
export function buildStatusReport(courses, { today = todayISO() } = {}) {
  const rows = courses.map((c) => ({
    slug: c.slug,
    title: c.title,
    kind: c.kind,
    level: c.level,
    progress: c.progress,
    currentSection: c.currentSection,
    dueCards: c.cards.filter((card) => card.due && card.due <= today).length,
    lastActive: c.lastActive,
    streak: c.streak,
  }));
  const allDates = [...new Set(courses.flatMap((c) => c.activityDates || []))];
  return { courses: rows, streak: computeStreak(allDates, today) };
}

function pad(text, width) {
  const value = String(text ?? '');
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/**
 * @param {{ args: string[], cwd?: string, chalk?: object }} ctx
 */
export async function run({ args = [], cwd = process.cwd(), chalk } = {}) {
  const json = args.includes('--json');
  const dir = flagValue(args, '--dir');
  const courses = findCourses(cwd, { dir: typeof dir === 'string' ? dir : undefined });

  if (courses.length === 0) {
    if (json) {
      console.log(JSON.stringify({ courses: [], streak: 0 }, null, 2));
      return;
    }
    console.log('');
    console.log(style('info', 'No courses found in learning/ or courses/.'));
    console.log('');
    console.log('  Start one in your agent:   /professor:new-topic');
    console.log('  Or install a course:       npx course-professor install <name>');
    console.log('');
    return;
  }

  const parsed = courses.map((c) => readCourse(c.dir, { slug: c.slug }));
  const report = buildStatusReport(parsed);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const headers = ['Course', 'Kind', 'Progress', 'Current section', 'Due', 'Last active'];
  const rows = report.courses.map((c) => {
    const bar = progressBar(c.progress.percent, chalk);
    const current = c.currentSection
      ? `${c.currentSection.n}. ${c.currentSection.title}` : '—';
    return [
      c.slug,
      c.kind,
      `${bar} ${String(c.progress.percent).padStart(3)}% ${c.progress.done}/${c.progress.total}`,
      current,
      String(c.dueCards),
      c.lastActive || '—',
    ];
  });

  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const headerLine = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const divider = widths.map((w) => '─'.repeat(w)).join('  ');

  console.log('');
  console.log(chalk ? chalk.bold(headerLine) : headerLine);
  console.log(chalk ? chalk.dim(divider) : divider);
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '));
  }
  console.log('');

  const flame = report.streak >= 3 ? ' 🔥' : '';
  const plural = report.streak === 1 ? '' : 's';
  console.log(style('info', `Overall streak: ${report.streak} day${plural}${flame}`));
  console.log('');
}
