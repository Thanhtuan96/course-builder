/**
 * `course-professor create <slug> --kind <kind>` — create the course folder the
 * way `professor:new-topic` promises, so the agent never improvises it (RON-249).
 *
 * - `programming`: a registered git worktree at `learning/<slug>/` on branch
 *   `learning/<slug>`, verified after creation; rolled back on any failure.
 * - other kinds: a plain `learning/<slug>/` folder.
 *
 * `course-professor save <slug> [-m msg]` commits the course worktree so its
 * state lives in git history, not only in untracked files.
 */
import { execFileSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import { COURSE_KINDS } from '../course-reader.js';
import { style } from '../registry-helpers.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(cwd, args) {
  try { return git(cwd, args); } catch { return null; }
}

/** Registered worktrees as `{ path, branch }` (branch without `refs/heads/`). */
export function listWorktrees(cwd) {
  const out = tryGit(cwd, ['worktree', 'list', '--porcelain']) || '';
  const trees = [];
  for (const block of out.split('\n\n')) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (!path) continue;
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] || null;
    trees.push({ path: realpathSync.native(path), branch });
  }
  return trees;
}

function isCourseWorktree(cwd, dir, branch) {
  if (!existsSync(dir)) return false;
  const real = realpathSync.native(dir);
  return listWorktrees(cwd).some((t) => t.path === real && t.branch === branch);
}

/** Keep `learning/` out of the host repo's `git status` without touching tracked files. */
function excludeLearningDir(root, cwd) {
  const probe = join(cwd, 'learning');
  if (tryGit(root, ['check-ignore', '-q', probe]) !== null) return;
  const commonDir = git(root, ['rev-parse', '--git-common-dir']);
  const infoDir = join(isAbsolute(commonDir) ? commonDir : join(root, commonDir), 'info');
  mkdirSync(infoDir, { recursive: true });
  const excludeFile = join(infoDir, 'exclude');
  const line = `/${relative(root, probe).split('\\').join('/')}/`;
  const current = existsSync(excludeFile) ? readFileSync(excludeFile, 'utf-8') : '';
  if (current.split('\n').includes(line)) return;
  appendFileSync(excludeFile, `${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`);
}

/**
 * Create (or reattach) the course directory. Throws with a user-facing message.
 * @returns {{ slug: string, kind: string, dir: string, branch: string|null, created: boolean }}
 */
export function createCourse({ cwd, slug, kind }) {
  if (!SLUG_RE.test(slug || '')) {
    throw new Error(`Invalid slug ${JSON.stringify(slug)} — use lowercase a-z, 0-9 and single hyphens.`);
  }
  if (!COURSE_KINDS.includes(kind)) {
    throw new Error(`Invalid kind ${JSON.stringify(kind)} — use one of: ${COURSE_KINDS.join(', ')}.`);
  }
  const dir = join(cwd, 'learning', slug);

  if (kind !== 'programming') {
    const created = !existsSync(dir);
    mkdirSync(dir, { recursive: true });
    return { slug, kind, dir, branch: null, created };
  }

  const root = tryGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) {
    throw new Error('Programming courses require a git repository. Run `git init` and make a first commit.');
  }
  if (tryGit(root, ['rev-parse', '--verify', '-q', 'HEAD']) === null) {
    throw new Error('This git repository has no commits yet. Make a first commit, then retry.');
  }

  const branch = `learning/${slug}`;
  if (isCourseWorktree(root, dir, branch)) {
    excludeLearningDir(root, cwd);
    return { slug, kind, dir, branch, created: false };
  }
  if (existsSync(dir)) {
    throw new Error(`${relative(cwd, dir)}/ already exists but is not the ${branch} worktree. ` +
      'Move it aside or pick another slug — nothing was changed.');
  }

  const branchExists = tryGit(root, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]) !== null;
  try {
    // Reattach an existing branch (course restored after its worktree was pruned).
    git(root, ['worktree', 'add', dir, ...(branchExists ? [branch] : ['-b', branch])]);
    if (!isCourseWorktree(root, dir, branch)) throw new Error('worktree is not registered after creation');
  } catch (err) {
    tryGit(root, ['worktree', 'remove', '--force', dir]);
    if (!branchExists) tryGit(root, ['branch', '-D', branch]);
    rmSync(dir, { recursive: true, force: true });
    tryGit(root, ['worktree', 'prune']);
    const detail = (err.stderr || err.message || '').toString().trim();
    throw new Error(`Could not create the course worktree — nothing was kept. ${detail}`);
  }
  excludeLearningDir(root, cwd);
  return { slug, kind, dir, branch, created: true };
}

/**
 * Commit everything in a course worktree. No-op for plain-folder courses.
 * @returns {{ committed: boolean, reason?: string }}
 */
export function saveCourse({ cwd, slug, message }) {
  if (!SLUG_RE.test(slug || '')) throw new Error(`Invalid slug ${JSON.stringify(slug)}.`);
  const dir = join(cwd, 'learning', slug);
  if (!existsSync(join(dir, 'COURSE.md'))) throw new Error(`No course at learning/${slug}/.`);
  if (!isCourseWorktree(cwd, dir, `learning/${slug}`)) {
    return { committed: false, reason: 'not a course worktree (plain-folder course)' };
  }
  git(dir, ['add', '-A']);
  if (tryGit(dir, ['diff', '--cached', '--quiet']) !== null) {
    return { committed: false, reason: 'nothing to save' };
  }
  git(dir, ['commit', '-q', '--no-verify', '-m', message || `course(${slug}): save progress`]);
  return { committed: true };
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : null;
}

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (['--kind', '-m', '--message'].includes(args[i])) { i++; continue; }
    if (!args[i].startsWith('-')) out.push(args[i]);
  }
  return out;
}

/** `create` and `save` share this module; cli.js passes the command name. */
export async function run({ args = [], cwd = process.cwd(), command = 'create' } = {}) {
  const slug = positionals(args)[0];
  const json = args.includes('--json');
  try {
    const result = command === 'save'
      ? saveCourse({ cwd, slug, message: flagValue(args, '-m') || flagValue(args, '--message') })
      : createCourse({ cwd, slug, kind: flagValue(args, '--kind') || 'programming' });
    if (json) console.log(JSON.stringify(result));
    else if (command === 'save') {
      console.log(style(result.committed ? 'success' : 'info',
        result.committed ? `Saved learning/${slug}/` : `Not saved: ${result.reason}`));
    } else {
      const where = result.branch ? `git worktree on branch ${result.branch}` : 'plain folder';
      console.log(style('success', `${result.created ? 'Created' : 'Reusing'} learning/${slug}/ (${where})`));
    }
  } catch (err) {
    if (json) console.log(JSON.stringify({ error: err.message }));
    else console.error(style('error', err.message));
    process.exitCode = 1;
  }
}
