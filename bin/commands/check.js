/**
 * `course-professor check [slug]` — run the active exercise's self-checks
 * with the right toolchain. Shows pass/fail per check, never solutions.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import { findCourses, readCourse, todayISO } from '../course-reader.js';
import { resolveActiveCourse } from './next.js';
import { style } from '../registry-helpers.js';

const TIMEOUT_MS = 30000;

function flagValue(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') { i++; continue; }
    if (args[i].startsWith('--')) continue;
    out.push(args[i]);
  }
  return out;
}

/**
 * Map a file extension to a runner strategy.
 * @param {string} file
 * @returns {{ kind: 'run'|'tsx'|'explain'|'rubric', cmd?: string, args?: string[], note?: string }}
 */
export function resolveRunner(file) {
  const ext = extname(file).toLowerCase();
  switch (ext) {
    case '.py': return { kind: 'run', cmd: 'python3', args: [file] };
    case '.js':
    case '.mjs': return { kind: 'run', cmd: 'node', args: [file] };
    case '.ts':
    case '.tsx': return { kind: 'tsx', cmd: 'npx', args: ['--yes', 'tsx', file] };
    case '.go': return { kind: 'run', cmd: 'go', args: ['run', file] };
    case '.rs':
      return { kind: 'explain', note: 'Rust: compile with `rustc <file> -o out && ./out`.' };
    case '.sql':
      return {
        kind: 'explain',
        note: 'SQL: no DB is configured — review the expected result in the file.',
      };
    case '.md': return { kind: 'rubric' };
    default:
      return {
        kind: 'explain',
        note: `No CLI runner for "${ext || 'this file'}" — open it and follow its instructions.`,
      };
  }
}

/**
 * Parse self-check output into per-check pass/fail results.
 * @param {{ stdout?: string, stderr?: string, code?: number }} result
 * @returns {{ checks: object[], allPass: boolean, code: number, errorLine: string|null }}
 */
export function parseCheckOutput({ stdout = '', stderr = '', code = 0 } = {}) {
  const checks = [];
  const lines = `${stdout}\n${stderr}`.split('\n');
  for (const line of lines) {
    let m = line.match(/^\s*[✓✔]\s*(.+?)\s*$/);
    if (m) { checks.push({ name: m[1], pass: true }); continue; }
    m = line.match(/^\s*[✗✘×]\s*(.+?)\s*$/);
    if (m) { checks.push({ name: m[1], pass: false }); continue; }
    m = line.match(/^\s*PASS\s*[:—–-]\s*(.+?)\s*$/i);
    if (m) { checks.push({ name: m[1], pass: true }); continue; }
    m = line.match(/^\s*FAIL\s*[:—–-]\s*(.+?)\s*$/i);
    if (m) { checks.push({ name: m[1], pass: false }); continue; }
  }

  const trimmed = lines.map((l) => l.trim()).filter(Boolean);
  // `console.assert` (JS) and Python `assert` failures: the former does not set
  // a non-zero exit code, so scan the output too.
  const assertRe = /assert(ion)?\s*(error|fail(ed)?)|ERR_ASSERTION/i;
  const assertion = trimmed.find((l) => assertRe.test(l)) || null;
  const errorLine = assertion
    || trimmed.find((l) => /assert|error:/i.test(l))
    || trimmed.find((l) => /error|traceback|exception|not ok/i.test(l))
    || trimmed[0] || null;

  const allPass = code === 0 && !checks.some((c) => !c.pass) && !assertion;
  return { checks, allPass, code, errorLine, assertionFailed: Boolean(assertion) };
}

function runProcess(cmd, args, cwd) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell: false });
    } catch (err) {
      resolve({ stdout, stderr: err.message, code: 127 });
      return;
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish({ stdout, stderr: `${stderr}\nTimed out after 30s`, code: 124 });
    }, TIMEOUT_MS);

    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (err) => finish({ stdout, stderr: `${stderr}\n${err.message}`, code: 127 }));
    child.on('close', (code) => finish({ stdout, stderr, code: code ?? 1 }));
  });
}

function whichPath(cmd) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const dir of (process.env.PATH || '').split(sep)) {
    for (const ext of exts) {
      const full = join(dir, cmd + ext);
      try { if (statSync(full).isFile()) return full; } catch {}
    }
  }
  return null;
}

function findExercise(course) {
  const exercisesDir = join(course.dir, 'exercises');
  if (course.activeExercise) {
    const active = join(course.dir, course.activeExercise);
    if (existsSync(active)) return active;
  }
  if (!existsSync(exercisesDir)) return null;
  let files;
  try {
    files = readdirSync(exercisesDir).filter((f) => !f.startsWith('.'));
  } catch { return null; }

  if (course.currentSection?.n) {
    const prefix = String(course.currentSection.n).padStart(2, '0');
    const match = files.find((f) => f.startsWith(`${prefix}-`));
    if (match) return join(exercisesDir, match);
  }

  const latest = files.map((f) => {
    try { return { f, m: statSync(join(exercisesDir, f)).mtimeMs }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.m - a.m)[0];
  return latest ? join(exercisesDir, latest.f) : null;
}

function checklistFrom(filePath, lecture) {
  if (filePath && existsSync(filePath)) {
    const text = readFileSync(filePath, 'utf-8');
    const items = text.split('\n')
      .map((l) => l.match(/^\s*[-*]\s*\[[ xX]\]\s*(.+?)\s*$/))
      .filter(Boolean)
      .map((m) => m[1]);
    if (items.length) return items;
  }
  return lecture?.successCriteria || [];
}

async function runRubric({ course, exerciseFile, lecture }) {
  const items = checklistFrom(exerciseFile, lecture);

  console.log('');
  console.log(`  📋 Self-assessment: ${course.slug}`);
  if (!items.length) {
    console.log('  No rubric items found in the exercise. Read it and self-assess.');
    console.log('');
    return;
  }
  for (const [i, item] of items.entries()) console.log(`    ${i + 1}. ${item}`);
  console.log('');

  if (!process.stdin.isTTY) {
    console.log(style('info', 'Run this in a terminal to self-assess each item (y/n).'));
    console.log('');
    return;
  }

  const answers = [];
  for (const item of items) {
    const { done } = await inquirer.prompt([{
      type: 'confirm', name: 'done', message: item, default: true,
    }]);
    answers.push({ item, done });
  }

  const passed = answers.filter((a) => a.done).length;
  const verdict = passed === answers.length ? 'solid' : '⚠️ needs work';
  const section = course.currentSection
    ? `${course.currentSection.n} — ${course.currentSection.title}`
    : 'General';
  const entry = [
    '',
    `### ${section}`,
    '',
    `- Date: ${todayISO()}`,
    '- Check: self-assessed (CLI check)',
    ...answers.map((a) => `- Q: "${a.item}" → A: ${a.done ? 'yes' : 'no'}`),
    `- Verdict: ${verdict}`,
    '',
  ].join('\n');

  const logPath = join(course.dir, 'LEARNING-LOG.md');
  const header = existsSync(logPath) ? '' : '# Learning Log\n\n## 📝 Section Entries\n';
  try {
    appendFileSync(logPath, header + entry);
    console.log('');
    const saved = `Self-assessment saved (${passed}/${answers.length} criteria met).`;
    console.log(style('success', saved));
  } catch (err) {
    console.log(style('warning', `Could not save self-assessment: ${err.message}`));
  }
  console.log('');
}

/**
 * @param {{ args: string[], cwd?: string }} ctx
 */
export async function run({ args = [], cwd = process.cwd() } = {}) {
  const slug = positionals(args)[0] || null;
  const dir = flagValue(args, '--dir');
  const courses = findCourses(cwd, { dir: typeof dir === 'string' ? dir : undefined });
  if (courses.length === 0) {
    console.log(style('info', 'No course found. Start one with /professor:new-topic.'));
    process.exitCode = 1;
    return;
  }

  const descriptors = courses.map((c) => readCourse(c.dir, { slug: c.slug }));
  const course = resolveActiveCourse(descriptors, slug);
  if (!course) {
    console.log(style('error', `Course "${slug}" not found.`));
    process.exitCode = 1;
    return;
  }

  const exerciseFile = findExercise(course);
  if (!exerciseFile) {
    const hint = `No active exercise for "${course.slug}". Run professor:next first.`;
    console.log(style('info', hint));
    process.exitCode = 1;
    return;
  }

  const lecturePath = join(course.dir, 'LECTURE.md');
  const { parseLecture } = await import('../course-reader.js');
  const lecture = existsSync(lecturePath) ? parseLecture(readFileSync(lecturePath, 'utf-8')) : null;

  const runner = resolveRunner(exerciseFile);
  const inCourse = exerciseFile.startsWith(course.dir);
  const rel = inCourse ? exerciseFile.slice(course.dir.length + 1) : exerciseFile;
  console.log('');
  console.log(style('info', `Check: ${course.slug} → ${rel}`));

  if (runner.kind === 'rubric') {
    await runRubric({ course, exerciseFile, lecture });
    return;
  }

  if (runner.kind === 'explain') {
    console.log(`  ℹ️  ${runner.note}`);
    console.log('');
    return;
  }

  const tsxAvailable = whichPath('tsx')
    || existsSync(join(course.dir, 'node_modules', '.bin', 'tsx'));
  if (runner.kind === 'tsx' && !tsxAvailable) {
    console.log('  ℹ️  TypeScript needs `tsx` (or `ts-node`) to run from the CLI.');
    console.log('      Install it:  npm i -D tsx   — or run with `npx tsx <file>`.');
    console.log('');
    return;
  }

  const result = await runProcess(runner.cmd, runner.args, course.dir);
  const parsed = parseCheckOutput(result);

  if (parsed.checks.length) {
    for (const check of parsed.checks) {
      const mark = check.pass ? '✓' : '✗';
      const line = `  ${mark} ${check.name}`;
      console.log(check.pass ? line : style('error', line));
    }
  }

  console.log('');
  if (parsed.allPass) {
    const message = parsed.checks.length
      ? 'All checks passed.'
      : 'Ran cleanly (no explicit checks).';
    console.log(style('success', message));
  } else {
    console.log(style('error', `Check failed (exit ${parsed.code}). First error:`));
    if (parsed.errorLine) console.log(`    ${parsed.errorLine}`);
    console.log('    Fix it yourself, then run check again. (No solution given.)');
    process.exitCode = 1;
  }
  console.log('');
}
