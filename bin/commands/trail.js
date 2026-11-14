/**
 * RON-250 — give Coach the real course and keep its review trail on disk.
 *
 * `course-professor context [slug] --json` prints one explicit context object (absolute course
 * path, section, objectives, active exercise, recent trail) so Coach never guesses a path.
 *
 * `course-professor trail <slug> --stdin <<'EOF' {"learner","asked","concept","evidence?","watch?"} EOF`
 * (or the same fields as `--learner ..` flags) appends one review round to `LEARNING-LOG.md` → `## 🗣️ Reasoning Trail` (max 5 rounds per
 * section, oldest dropped), then commits programming course worktrees.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import { findCourses, parseLecture, readCourse, todayISO } from '../course-reader.js';
import { saveCourse } from './create.js';
import { style } from '../registry-helpers.js';

export const MAX_ROUNDS = 5;
const TRAIL_RE = /^##\s+.*reasoning trail/i;
const ROUND_RE = /^Round\s+\d+\b/;

/** Pick the course by slug; with no slug only a single course is accepted — never guess. */
export function resolveCourse(cwd, slug) {
  const courses = findCourses(cwd);
  if (slug) {
    const hit = courses.find((c) => c.slug === slug);
    if (hit) return hit;
    throw new Error(`No course "${slug}" under learning/ or courses/. Found: ${courses.map((c) => c.slug).join(', ') || 'none'}.`);
  }
  if (courses.length === 1) return courses[0];
  if (!courses.length) throw new Error('No course found under learning/ or courses/. Run professor:new-topic first.');
  throw new Error(`Several courses found — pass the slug: ${courses.map((c) => c.slug).join(', ')}.`);
}

const sectionKey = (section) => String(section).trim().split(/\s+/)[0];

const sectionHeadRe = (key) =>
  new RegExp(`^###\\s+Section\\s+${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);

/** Lines of `### Section <key>` inside the trail region, or [] when absent. */
function trailBlock(text, key) {
  const lines = text.split('\n');
  const t = lines.findIndex((l) => TRAIL_RE.test(l));
  if (t === -1) return [];
  const headRe = sectionHeadRe(key);
  let h = -1;
  for (let i = t + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (headRe.test(lines[i])) { h = i; break; }
  }
  if (h === -1) return [];
  let end = h + 1;
  while (end < lines.length && !/^#{2,3}\s/.test(lines[end])) end++;
  return lines.slice(h + 1, end);
}

/** Split a section block into preface lines (watch flags) and rounds (arrays of lines). */
function splitRounds(block) {
  const preface = [];
  const rounds = [];
  for (const line of block) {
    if (ROUND_RE.test(line)) rounds.push([line]);
    else if (rounds.length) { if (line.trim()) rounds[rounds.length - 1].push(line); }
    else if (line.trim()) preface.push(line);
  }
  return { preface, rounds };
}

/** Explicit context Coach must use. */
export function buildContext({ cwd, slug }) {
  const found = resolveCourse(cwd, slug);
  const course = readCourse(found.dir, { slug: found.slug });
  const lecturePath = join(found.dir, 'LECTURE.md');
  const lecture = existsSync(lecturePath) ? parseLecture(readFileSync(lecturePath, 'utf-8')) : null;
  const logPath = join(found.dir, 'LEARNING-LOG.md');
  const section = course.currentSection;
  const block = section && existsSync(logPath)
    ? trailBlock(readFileSync(logPath, 'utf-8'), String(section.n)) : [];
  const { preface, rounds } = splitRounds(block);
  const exercise = course.activeExercise
    ? (isAbsolute(course.activeExercise) ? course.activeExercise : join(found.dir, course.activeExercise))
    : null;
  return {
    slug: found.slug,
    dir: found.dir,
    kind: course.kind,
    title: course.title,
    section: section ? `${section.n} — ${section.title}` : null,
    objectives: lecture?.objectives || [],
    activeExercise: exercise && existsSync(exercise) ? exercise : null,
    learningLog: logPath,
    watch: preface.filter((l) => /watch-this/i.test(l)).map((l) => l.trim()),
    trail: rounds.map((r) => r.join('\n')),
  };
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Pure: return LEARNING-LOG.md text with one more round for `section`. */
export function appendRound(text, { slug, section, learner, asked, concept, evidence, watch, date }) {
  let src = text && text.trim()
    ? text
    : `---\ncourse: ${slug}\nupdated: ${date}\n---\n\n# Learning Log\n`;
  src = src.replace(/^(---\n[\s\S]*?^updated:\s*).*$/m, `$1${date}`);
  const lines = src.replace(/\n+$/, '').split('\n');

  let t = lines.findIndex((l) => TRAIL_RE.test(l));
  if (t === -1) {
    const firstH2 = lines.findIndex((l) => /^##\s/.test(l));
    if (firstH2 === -1) lines.push('', '## 🗣️ Reasoning Trail');
    else lines.splice(firstH2, 0, '## 🗣️ Reasoning Trail', '');
    t = lines.findIndex((l) => TRAIL_RE.test(l));
  }
  let regionEnd = t + 1;
  while (regionEnd < lines.length && !/^##\s/.test(lines[regionEnd])) regionEnd++;

  const key = sectionKey(section);
  const block = trailBlock(lines.join('\n'), key);
  let h = -1;
  for (let i = t + 1; i < regionEnd; i++) {
    if (sectionHeadRe(key).test(lines[i])) { h = i; break; }
  }
  if (h === -1) {
    let at = regionEnd;
    while (at > t + 1 && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, '', `### Section ${section}`);
    h = at + 1;
  }

  const { preface, rounds } = splitRounds(block);
  const keep = preface.filter((l) => !(watch && /watch-this/i.test(l)));
  if (watch) keep.push(`⚠️ watch-this: ${oneLine(watch)}`);
  rounds.push([
    `Round 0 — ${date}`,
    `  Learner: "${oneLine(learner)}"`,
    `  Coach asked: "${oneLine(asked)}"`,
    ...(evidence ? [`  Evidence: ${oneLine(evidence)}`] : []),
    `  Concept: ${oneLine(concept)}`,
  ]);
  const kept = rounds.slice(-MAX_ROUNDS).map((r, i) => [r[0].replace(/^Round\s+\d+/, `Round ${i + 1}`), ...r.slice(1)]);

  const body = ['', ...(keep.length ? [...keep, ''] : []), ...kept.flatMap((r) => [...r, '']).slice(0, -1)];
  lines.splice(h + 1, block.length, ...body, ...(h + 1 + block.length < lines.length ? [''] : []));
  return { text: `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`, rounds: kept.length };
}

export function recordRound({ cwd, slug, section, learner, asked, concept, evidence, watch, date = todayISO() }) {
  if (!slug) throw new Error('Pass the course slug — trail never guesses which course to write.');
  for (const [name, v] of [['--learner', learner], ['--asked', asked], ['--concept', concept]]) {
    if (!oneLine(v)) throw new Error(`Missing ${name} — nothing was recorded.`);
  }
  const ctx = buildContext({ cwd, slug });
  const target = section || ctx.section;
  if (!target) throw new Error('No current section in COURSE.md — pass --section "N — Title".');
  const path = ctx.learningLog;
  const before = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const { text, rounds } = appendRound(before, { slug, section: target, learner, asked, concept, evidence, watch, date });
  writeFileSync(path, text);
  let saved = false;
  try {
    saved = saveCourse({ cwd, slug, message: `course(${slug}): review round, section ${sectionKey(target)}` }).committed;
  } catch { /* file is written; commit is best-effort (plain folders, missing git identity) */ }
  return { recorded: true, path, section: target, rounds, saved };
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined && !args[i + 1].startsWith('--') ? args[i + 1] : null;
}

const VALUE_FLAGS = ['--section', '--learner', '--asked', '--concept', '--evidence', '--watch', '--date'];

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.includes(args[i])) { i++; continue; }
    if (!args[i].startsWith('--')) out.push(args[i]);
  }
  return out;
}

/** `context` and `trail` share this module; cli.js passes the command name. */
export async function run({ args = [], cwd = process.cwd(), command = 'context' } = {}) {
  const slug = positionals(args)[0] || null;
  const json = args.includes('--json');
  try {
    if (command === 'trail') {
      // Agents pass learner text as JSON on stdin (quoted heredoc) so the shell never expands it.
      const fromStdin = args.includes('--stdin') ? JSON.parse(readFileSync(0, 'utf-8')) : {};
      const f = (n) => fromStdin[n.slice(2)] ?? flagValue(args, n);
      const r = recordRound({
        cwd, slug, section: f('--section'), learner: f('--learner'), asked: f('--asked'),
        concept: f('--concept'), evidence: f('--evidence'), watch: f('--watch'), date: f('--date') || undefined,
      });
      if (json) console.log(JSON.stringify(r));
      else {
        console.log(style('success', `Recorded review round ${r.rounds} for Section ${r.section} in ${relative(cwd, r.path)}`
          + (r.saved ? ' (committed)' : '')));
      }
      return;
    }
    const ctx = buildContext({ cwd, slug });
    if (json) { console.log(JSON.stringify(ctx, null, 2)); return; }
    console.log(`${ctx.title} (${ctx.slug}, ${ctx.kind}) — ${ctx.dir}`);
    console.log(`Section: ${ctx.section || '—'}`);
    console.log(`Active exercise: ${ctx.activeExercise || '—'}`);
    console.log(`Trail rounds this section: ${ctx.trail.length}`);
  } catch (err) {
    if (json) console.log(JSON.stringify({ error: err.message }));
    else console.error(style('error', err.message));
    process.exitCode = 1;
  }
}
