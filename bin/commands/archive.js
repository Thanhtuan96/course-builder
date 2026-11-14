/**
 * `skillforce archive <slug> [--json]` — retire a course without losing learner work.
 *
 * - Copies the whole `learning/<slug>/` directory, minus `.git`, to
 *   `.course_archive/<slug>[-N]` (an existing archive is never overwritten).
 * - Programming courses keep their commits on branch `archive/<slug>` instead of `-D`.
 * - Plain-folder courses are removed only after the copy is verified.
 */
import { execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'fs';
import { basename, join, relative } from 'path';
import { listWorktrees, saveCourse, excludeRepoPath, SLUG_RE } from './create.js';
import { style } from '../registry-helpers.js';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(cwd, args) {
  try { return git(cwd, args); } catch { return null; }
}

/** First non-existing path among `<base>`, `<base>-2`, `<base>-3`, … */
export function nextFreePath(base) {
  if (!existsSync(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function nextFreeBranch(cwd, base) {
  if (tryGit(cwd, ['rev-parse', '--verify', '-q', `refs/heads/${base}`]) === null) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    const exists = tryGit(cwd, ['rev-parse', '--verify', '-q', `refs/heads/${candidate}`]);
    if (exists === null) return candidate;
  }
}

/** Every entry under `dir`, as paths relative to it, skipping any `.git` entry. */
function entries(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === '.git') continue;
    const rel = prefix ? join(prefix, name) : name;
    const abs = join(dir, name);
    const stat = lstatSync(abs);
    out.push({ rel, stat });
    if (stat.isDirectory()) out.push(...entries(abs, rel));
  }
  return out;
}

/** Throw unless every source entry exists in the copy with the same type and byte size. */
export function verifyCopy(src, dest) {
  for (const { rel, stat } of entries(src)) {
    const copy = join(dest, rel);
    if (!existsSync(copy)) throw new Error(`Archive copy is missing ${rel}.`);
    const copied = lstatSync(copy);
    if (copied.isDirectory() !== stat.isDirectory()) {
      throw new Error(`Archive copy has the wrong type for ${rel}.`);
    }
    if (!stat.isDirectory() && copied.size !== stat.size) {
      throw new Error(`Archive copy size differs for ${rel}.`);
    }
  }
}

/** Collapse multiline git stderr into one readable line. */
function detail(err) {
  return (err.stderr || err.message || '').toString().trim().split('\n')[0];
}

function archiveProgramming({ root, cwd, slug, courseDir, branch, target }) {
  let archiveBranch = branch;
  if (!branch || !branch.startsWith('archive/')) {
    try {
      saveCourse({ cwd, slug });
    } catch (err) {
      throw new Error(`Could not commit learning/${slug}/ — nothing was removed. ${detail(err)} ` +
        `The copy is at ${relative(cwd, target)}.`);
    }
    const dirty = tryGit(courseDir, ['status', '--porcelain']);
    if (dirty === null) {
      throw new Error(`Could not read the status of learning/${slug}/ — nothing was removed. ` +
        `The copy is at ${relative(cwd, target)}.`);
    }
    if (dirty !== '') {
      throw new Error(`learning/${slug}/ still has uncommitted changes — nothing was removed. ` +
        `The copy is at ${relative(cwd, target)}.`);
    }
    archiveBranch = nextFreeBranch(root, `archive/${slug}`);
    try {
      git(courseDir, ['branch', '-m', archiveBranch]);
    } catch (err) {
      throw new Error(`Could not rename the course branch to ${archiveBranch} — nothing was ` +
        `removed. ${detail(err)} The copy is at ${relative(cwd, target)}.`);
    }
  }

  try {
    git(root, ['worktree', 'remove', courseDir]);
  } catch (err) {
    throw new Error(`Could not remove learning/${slug}/ (it is still registered on branch ` +
      `${archiveBranch}). ${detail(err)} The copy is at ${relative(cwd, target)}.`);
  }
  return { archivedTo: relative(cwd, target), branch: archiveBranch, removed: true };
}

/**
 * Archive one course. Throws with a user-facing message on any failure; the course is then
 * still in `learning/<slug>/` unless the error says git removed it.
 * @returns {{ archivedTo: string, branch: string|null, removed: boolean, warning?: string }}
 */
export function archiveCourse({ cwd, slug, verify = verifyCopy }) {
  if (!SLUG_RE.test(slug || '')) {
    throw new Error(`Invalid slug ${JSON.stringify(slug)} — use lowercase a-z, 0-9 and single hyphens.`);
  }
  const courseDir = join(cwd, 'learning', slug);
  if (!existsSync(join(courseDir, 'COURSE.md'))) {
    throw new Error(`No course at learning/${slug}/.`);
  }

  let warning;
  const root = tryGit(cwd, ['rev-parse', '--show-toplevel']);
  if (root) {
    try {
      excludeRepoPath(root, cwd, join(cwd, '.course_archive'));
    } catch (err) {
      warning = `Could not add .course_archive/ to git info/exclude: ${detail(err)}`;
    }
  }

  const target = nextFreePath(join(cwd, '.course_archive', slug));
  cpSync(courseDir, target, {
    recursive: true,
    filter: (source) => basename(source) !== '.git',
  });
  verify(courseDir, target);

  const worktree = root
    ? listWorktrees(root).find((tree) => tree.path === realpathSync.native(courseDir))
    : null;
  if (worktree) {
    const result = archiveProgramming({ root, cwd, slug, courseDir, branch: worktree.branch, target });
    return warning ? { ...result, warning } : result;
  }

  rmSync(courseDir, { recursive: true });
  const result = { archivedTo: relative(cwd, target), branch: null, removed: true };
  return warning ? { ...result, warning } : result;
}

function positionals(args) {
  return args.filter((arg) => !arg.startsWith('-'));
}

/** CLI entry point for `skillforce archive`. */
export async function run({ args = [], cwd = process.cwd() } = {}) {
  const slug = positionals(args)[0];
  const json = args.includes('--json');
  try {
    const result = archiveCourse({ cwd, slug });
    if (json) {
      console.log(JSON.stringify({
        archivedTo: result.archivedTo,
        branch: result.branch,
        removed: result.removed,
      }));
      return;
    }
    console.log(style('success', `Archived learning/${slug}/ → ${result.archivedTo}`));
    if (result.branch) console.log(style('info', `History kept on branch ${result.branch}.`));
    if (result.warning) console.log(style('warning', result.warning));
  } catch (err) {
    if (json) console.log(JSON.stringify({ error: err.message }));
    else console.error(style('error', err.message));
    process.exitCode = 1;
  }
}
