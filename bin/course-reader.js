/**
 * Course reader — pure parsers for course files on disk.
 *
 * Reads `learning/{slug}/` (primary) and `courses/{slug}/` (legacy). Every
 * function here is side-effect free apart from reading files, so Phase 31
 * (`studio`, `review`, `import`) can reuse the same shapes without going
 * through the CLI.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, isAbsolute, join } from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

export const COURSE_KINDS = ['programming', 'quantitative', 'conceptual', 'skill'];
export const DEFAULT_KIND = 'programming';

const STATUS_BY_EMOJI = {
  '⬜': 'todo',
  '🔄': 'active',
  '✅': 'done',
  '🔒': 'locked',
};

const SECTION_EMOJI_RE = /[⬜🔄✅🔒]/;
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Normalize a human date ("March 15, 2026", "2026-03-15", "15/03/2026") to ISO.
 * @param {string} value
 * @returns {string|null} YYYY-MM-DD or null
 */
export function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text || text === '—' || text === '-') return null;

  let m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month !== -1) return `${m[3]}-${pad2(month + 1)}-${pad2(m[2])}`;
  }

  m = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    if (month !== -1) return `${m[3]}-${pad2(month + 1)}-${pad2(m[1])}`;
  }

  return null;
}

function toDayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function fromDayNumber(n) {
  const date = new Date(n * 86400000);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Today's local date as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Extract every distinctive date from a blob of Markdown.
 * @param {string} text
 * @returns {string[]} unique ISO dates
 */
export function extractDates(text) {
  if (!text) return [];
  const found = new Set();

  for (const m of text.matchAll(/\d{4}-\d{2}-\d{2}/g)) {
    const iso = normalizeDate(m[0]);
    if (iso) found.add(iso);
  }

  const monthRe = new RegExp(
    `(${MONTHS.join('|')})\\s+\\d{1,2},?\\s+\\d{4}`,
    'gi'
  );
  for (const m of text.matchAll(monthRe)) {
    const iso = normalizeDate(m[0]);
    if (iso) found.add(iso);
  }

  return [...found];
}

/**
 * Consecutive days of activity ending today or yesterday.
 * @param {string[]} dates ISO dates
 * @param {string} [today] ISO date
 * @returns {number}
 */
export function computeStreak(dates, today = todayISO()) {
  const set = new Set(dates);
  if (set.size === 0) return 0;

  const todayNum = toDayNumber(today);
  let cursor;
  if (set.has(fromDayNumber(todayNum))) cursor = todayNum;
  else if (set.has(fromDayNumber(todayNum - 1))) cursor = todayNum - 1;
  else return 0;

  let streak = 0;
  while (set.has(fromDayNumber(cursor))) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

// ─── Markdown helpers ─────────────────────────────────────────────────────────

function stripMarkdown(text) {
  return String(text)
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[⬜🔄✅🔒🏗️]/g, '')
    .trim();
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');
}

function splitTableRow(line) {
  return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

/** Slice the body of the first `## <heading>` matching the pattern. */
function sliceSection(content, headingRe) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && headingRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function metaValue(content, label) {
  const re = new RegExp(`^\\s*[-*]?\\s*\\*\\*${label}\\*\\*\\s*:?\\s*(.*?)\\s*$`, 'mi');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// ─── COURSE.md ────────────────────────────────────────────────────────────────

function statusFromCell(cell) {
  for (const emoji of Object.keys(STATUS_BY_EMOJI)) {
    if (cell.includes(emoji)) return STATUS_BY_EMOJI[emoji];
  }
  return null;
}

function parseTitle(content, slug) {
  const named = content.match(/^#\s*(?:[^\w\n]*)?Course\s*:\s*(.+?)\s*$/mi);
  if (named) return named[1].trim();
  const plain = content.match(/^#\s+(.+?)\s*$/m);
  return plain ? stripMarkdown(plain[1]) : slug;
}

function parseTableSections(region) {
  const sections = [];
  let capstoneStatus = null;
  const lines = region.split('\n');

  for (const line of lines) {
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = splitTableRow(line);
    if (isSeparatorRow(cells)) continue;
    if (!cells.some((c) => SECTION_EMOJI_RE.test(c))) continue;

    const statusCell = cells.find((c) => SECTION_EMOJI_RE.test(c));
    const status = statusFromCell(statusCell) || 'todo';
    const isCapstone = cells.some((c) => /capstone/i.test(c));

    if (isCapstone) { capstoneStatus = status; continue; }

    const n = cells.find((c) => /^\d+(\.\d+)*$/.test(c)) || null;
    const dateCell = cells.find((c) => normalizeDate(c));
    const candidates = cells.filter((c) =>
      c !== statusCell && c !== n && c !== dateCell &&
      c !== '' && c !== '—' && !normalizeDate(c) && !/^\d+(\.\d+)*$/.test(c)
    );
    const titleCell = candidates.sort((a, b) => b.length - a.length)[0] || '';
    const title = stripMarkdown(titleCell);
    if (!title) continue;

    sections.push({ n, title, status, completedAt: dateCell ? normalizeDate(dateCell) : null });
  }
  return { sections, capstoneStatus };
}

function parseListSections(region) {
  const sections = [];
  let capstoneStatus = null;
  const lines = region.split('\n');

  for (const line of lines) {
    const m = line.match(
      /^\s*(?:[-*+]\s*)?(⬜|🔄|✅|🔒)\s*(?:Section\s+)?(\d+(?:\.\d+)*)?\s*[.):\-—]?\s*(.+?)\s*$/
    );
    if (!m) continue;
    const [, emoji, number, rawTitle] = m;
    const title = stripMarkdown(rawTitle);
    if (!title) continue;
    if (/capstone/i.test(title)) { capstoneStatus = STATUS_BY_EMOJI[emoji]; continue; }
    const n = number || String(sections.length + 1);
    sections.push({ n, title, status: STATUS_BY_EMOJI[emoji], completedAt: null });
  }
  return { sections, capstoneStatus };
}

/**
 * Parse a COURSE.md syllabus in any of its flavours:
 *   - `⬜ 1. Title`
 *   - `- ⬜ Section 1: Title`
 *   - `| # | **Title** | 🔄 In progress |`
 * @param {string} content
 * @returns {{ sections: object[], capstoneStatus: string|null }}
 */
export function parseSections(content) {
  if (!content) return { sections: [], capstoneStatus: null };
  const region = sliceSection(content, /syllabus|sections/i) || content;
  const table = parseTableSections(region);
  if (table.sections.length > 0) return table;
  return parseListSections(region);
}

function parseCapstoneStatus(content, rowStatus) {
  const raw = metaValue(content, 'Capstone status');
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower.includes('locked') || raw.includes('🔒')) return 'locked';
    if (lower.includes('complete') || raw.includes('✅')) return 'done';
    if (lower.includes('progress') || raw.includes('🔄')) return 'active';
  }
  return rowStatus || 'none';
}

// ─── LECTURE.md ───────────────────────────────────────────────────────────────

function sectionBody(content, headingRe) {
  const lines = content.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && headingRe.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) || /^---\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function firstParagraph(body) {
  if (!body) return null;
  const paragraph = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) { if (paragraph.length) break; else continue; }
    paragraph.push(line);
  }
  return paragraph.length ? paragraph.join(' ') : null;
}

/**
 * Parse the active LECTURE.md.
 * @param {string} content
 * @returns {object}
 */
export function parseLecture(content) {
  if (!content) return null;
  const heading =
    content.match(/^#\s*(?:📖\s*)?Section\s+([\d.]+)\s*[:\-—]\s*(.+?)\s*$/mi) ||
    content.match(/^#\s+(.+?)\s*$/m);
  const sectionNumber = heading && heading.length === 3 ? heading[1] : null;
  const title = heading ? stripMarkdown(heading[heading.length - 1]) : null;

  const objectivesBody = sectionBody(content, /objectives/i);
  const objectives = objectivesBody
    ? objectivesBody.split('\n')
      .map((l) => l.match(/^\s*[-*]\s+(.+?)\s*$/))
      .filter(Boolean)
      .map((m) => stripMarkdown(m[1]))
    : [];

  const explanation = firstParagraph(sectionBody(content, /explanation/i));

  const exerciseBody = sectionBody(content, /exercise/i);
  let successCriteria = [];
  let exerciseTask = null;
  if (exerciseBody) {
    successCriteria = exerciseBody.split('\n')
      .map((l) => l.match(/^\s*(?:>\s*)?[-*]\s*\[[ xX]\]\s*(.+?)\s*$/))
      .filter(Boolean)
      .map((m) => stripMarkdown(m[1]));
    const quote = exerciseBody.split('\n')
      .find((l) => /^\s*>\s+\S/.test(l) && !/success criteria/i.test(l));
    exerciseTask = quote ? stripMarkdown(quote.replace(/^\s*>\s*/, '')) : null;
  }

  return { sectionNumber, title, objectives, explanation, successCriteria, exerciseTask };
}

// ─── LEARNING-LOG.md ──────────────────────────────────────────────────────────

function parseSectionEntries(region) {
  const entries = [];
  const blocks = region.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    const section = stripMarkdown(lines[0]);
    const dateLine = block.match(/^\s*[-*]\s*Date\s*:\s*(.+?)\s*$/mi);
    const verdictLine = block.match(/^\s*[-*]\s*Verdict\s*:\s*(.+?)\s*$/mi);
    entries.push({
      date: dateLine ? normalizeDate(dateLine[1]) : null,
      section,
      verdict: verdictLine ? verdictLine[1].trim() : null,
    });
  }
  return entries;
}

/**
 * Parse LEARNING-LOG.md Section Entries.
 * @param {string} content
 * @returns {{ date: string|null, section: string, verdict: string|null }[]}
 */
export function parseLearningLog(content) {
  if (!content) return [];
  const region = sliceSection(content, /section entries/i);
  if (!region) return [];
  return parseSectionEntries(region);
}

// ─── SCHEDULE.md ──────────────────────────────────────────────────────────────

/**
 * Parse SCHEDULE.md flashcards into `{ front, due }` pairs.
 * @param {string} content
 * @returns {{ front: string, due: string|null }[]}
 */
export function parseSchedule(content) {
  if (!content) return [];
  const region = sliceSection(content, /flashcard/i) || content;
  const lines = region.split('\n');

  let header = null;
  const cards = [];
  for (const line of lines) {
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    const cells = splitTableRow(line);
    if (isSeparatorRow(cells)) continue;

    if (!header) {
      const frontIdx = cells.findIndex((c) => /question|front/i.test(c));
      const dueIdx = cells.findIndex((c) => /next review|due/i.test(c));
      if (frontIdx !== -1 && dueIdx !== -1) header = { frontIdx, dueIdx };
      continue;
    }

    const front = stripMarkdown(cells[header.frontIdx] || '');
    if (!front) continue;
    cards.push({ front, due: normalizeDate(cells[header.dueIdx]) });
  }
  return cards;
}

// ─── Course discovery ─────────────────────────────────────────────────────────

/**
 * Find every course directory on disk.
 * Scans `learning/*​/` first, then legacy `courses/*​/` (dedup by slug).
 * @param {string} cwd
 * @param {{ dir?: string }} [opts] `dir` overrides the roots (single course or parent)
 * @returns {{ slug: string, dir: string, location: 'learning'|'courses'|'custom' }[]}
 */
export function findCourses(cwd, { dir } = {}) {
  if (dir) {
    const abs = isAbsolute(dir) ? dir : join(cwd, dir);
    if (existsSync(join(abs, 'COURSE.md'))) {
      return [{ slug: basename(abs), dir: abs, location: 'custom' }];
    }
    return scanRoot(abs, 'custom');
  }
  const results = [];
  const seen = new Set();
  for (const [name, location] of [['learning', 'learning'], ['courses', 'courses']]) {
    for (const course of scanRoot(join(cwd, name), location)) {
      if (seen.has(course.slug)) continue;
      seen.add(course.slug);
      results.push(course);
    }
  }
  return results;
}

function scanRoot(root, location) {
  if (!existsSync(root)) return [];
  const found = [];
  let entries;
  try { entries = readdirSync(root); } catch { return []; }
  for (const name of entries.sort()) {
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, 'COURSE.md'))) continue;
    } catch { continue; }
    found.push({ slug: name, dir, location });
  }
  return found;
}

// ─── readCourse ───────────────────────────────────────────────────────────────

/**
 * Read and parse a single course directory.
 * @param {string} dir
 * @param {{ slug?: string, today?: string }} [opts]
 * @returns {object}
 */
export function readCourse(dir, { slug = basename(dir), today = todayISO() } = {}) {
  const coursePath = join(dir, 'COURSE.md');
  if (!existsSync(coursePath)) {
    throw new Error(`No COURSE.md in ${dir}`);
  }
  const content = readFileSync(coursePath, 'utf-8');

  const { sections, capstoneStatus: rowCapstone } = parseSections(content);
  const kindRaw = (metaValue(content, 'Kind') || '').toLowerCase().trim();
  const kind = kindRaw || DEFAULT_KIND;

  const progressRegion = sliceSection(content, /progress log/i);
  const progressDates = extractDates(progressRegion || '');

  const logPath = join(dir, 'LEARNING-LOG.md');
  const logText = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
  const log = parseLearningLog(logText);

  const schedulePath = join(dir, 'SCHEDULE.md');
  const scheduleText = existsSync(schedulePath) ? readFileSync(schedulePath, 'utf-8') : '';
  const cards = parseSchedule(scheduleText);

  const lecturesDir = join(dir, 'lectures');
  let lectures = [];
  if (existsSync(lecturesDir)) {
    try {
      lectures = readdirSync(lecturesDir).filter((f) => f.endsWith('.md')).sort();
    } catch { lectures = []; }
  }

  const activeExerciseRaw = metaValue(content, 'Active exercise');
  const activeExercise = activeExerciseRaw && activeExerciseRaw !== '—' && activeExerciseRaw !== '-'
    ? activeExerciseRaw : null;

  const done = sections.filter((s) => s.status === 'done').length;
  const current = sections.find((s) => s.status === 'active')
    || sections.find((s) => s.status === 'todo')
    || null;

  const activityDates = [...new Set([
    ...progressDates,
    ...extractDates(logText),
    ...log.map((e) => e.date).filter(Boolean),
  ])];

  const lastActive = normalizeDate(metaValue(content, 'Last active'))
    || [...activityDates].sort().pop()
    || null;

  return {
    slug,
    dir,
    title: parseTitle(content, slug),
    level: metaValue(content, 'Level') || null,
    kind,
    sections: sections.map((s) => ({ ...s, status: s.status === 'locked' ? 'todo' : s.status })),
    activeExercise,
    lastActive,
    capstoneStatus: parseCapstoneStatus(content, rowCapstone),
    lectures,
    log,
    cards,
    streak: computeStreak(activityDates, today),
    activityDates,
    progress: {
      done,
      total: sections.length,
      percent: sections.length ? Math.round((done / sections.length) * 100) : 0,
    },
    currentSection: current ? { n: current.n, title: current.title, status: current.status } : null,
  };
}
