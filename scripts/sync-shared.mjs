#!/usr/bin/env node
/**
 * sync-shared.mjs — regenerate the managed `shared/` tree from canonical sources.
 *
 * Canonical sources (D-01):
 *   agents/*.md               -> shared/agents/*.md
 *   commands/professor/*.md   -> shared/commands/professor/*.md
 *   hooks/pre-compact.js      -> shared/hooks/pre-compact.js
 *   professor-skill/SKILL.md  -> shared/SKILL.md
 *
 * Modes (D-02):
 *   node scripts/sync-shared.mjs          write canonical bytes into shared/
 *   node scripts/sync-shared.mjs --check  read-only drift report; exit 1 on drift
 *
 * Writes are byte-for-byte and deterministic (D-04). Nothing outside the managed
 * `shared/` trees is ever created, modified, or removed (D-03).
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

/** Absolute repository root, derived from this script's location. */
export const REPO_ROOT = resolve(SCRIPT_DIR, '..');

const SKILL_SOURCE = 'professor-skill/SKILL.md';
const SKILL_DEST = 'shared/SKILL.md';

const MANAGED_DIRS = ['shared/agents', 'shared/commands/professor', 'shared/hooks'];

const DIR_SOURCES = [
  { sourceDir: 'agents', destDir: 'shared/agents', ext: '.md' },
  { sourceDir: 'commands/professor', destDir: 'shared/commands/professor', ext: '.md' },
];

const SINGLE_SOURCES = [
  { source: 'hooks/pre-compact.js', dest: 'shared/hooks/pre-compact.js' },
  { source: SKILL_SOURCE, dest: SKILL_DEST },
];

/**
 * Reject an unsafe single path segment (separator, dot, or traversal).
 * @param {string} name
 * @param {string} label
 */
function assertPlainName(name, label) {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error(`unsafe path segment in ${label}: ${JSON.stringify(name)}`);
  }
}

/**
 * `lstatSync` that returns null for ENOENT and rethrows everything else.
 * @param {string} absPath
 * @returns {import('fs').Stats|null}
 */
function lstatOrNull(absPath) {
  try {
    return lstatSync(absPath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Build the ordered canonical -> destination list for a given repository root.
 * @param {string} root
 * @returns {{ source: string, dest: string }[]}
 */
function buildCanonicalFiles(root) {
  const files = [];

  for (const { sourceDir, destDir, ext } of DIR_SOURCES) {
    const absDir = join(root, sourceDir);
    let names;
    try {
      names = readdirSync(absDir);
    } catch {
      throw new Error(`canonical directory missing: ${sourceDir}`);
    }

    for (const name of names.sort()) {
      if (name.startsWith('.')) continue;
      if (!name.endsWith(ext)) continue;
      assertPlainName(name, `${sourceDir}/${name}`);

      const stat = lstatOrNull(join(absDir, name));
      if (!stat || !stat.isFile()) {
        throw new Error(`canonical entry is not a regular file: ${sourceDir}/${name}`);
      }
      files.push({ source: `${sourceDir}/${name}`, dest: `${destDir}/${name}` });
    }
  }

  for (const { source, dest } of SINGLE_SOURCES) {
    assertPlainName(basename(source), source);
    assertPlainName(basename(dest), dest);

    const stat = lstatOrNull(join(root, source));
    if (!stat) throw new Error(`canonical source missing: ${source}`);
    if (!stat.isFile()) throw new Error(`canonical source is not a regular file: ${source}`);
    files.push({ source, dest });
  }

  return files.sort((a, b) => (a.dest < b.dest ? -1 : a.dest > b.dest ? 1 : 0));
}

/** Cached canonical list for the repository this script lives in. */
let canonicalFiles = [];
try {
  canonicalFiles = buildCanonicalFiles(REPO_ROOT);
} catch {
  canonicalFiles = [];
}
export { canonicalFiles };

/**
 * Managed root that owns a destination.
 * @param {string} destRel
 * @returns {string}
 */
function managedRootForDest(destRel) {
  if (destRel === SKILL_DEST) return 'shared';
  for (const dirRel of MANAGED_DIRS) {
    if (destRel === dirRel || destRel.startsWith(`${dirRel}/`)) return dirRel;
  }
  throw new Error(`destination is outside the managed shared/ trees: ${destRel}`);
}

/**
 * Resolve a destination and prove it stays inside its managed root.
 * @param {string} root
 * @param {string} destRel
 * @returns {{ rootRel: string, rootAbs: string, destAbs: string }}
 */
function resolveManagedDest(root, destRel) {
  const segments = destRel.split('/');
  for (const segment of segments) assertPlainName(segment, destRel);

  const rootRel = managedRootForDest(destRel);
  const rootAbs = resolve(root, rootRel);
  const destAbs = resolve(root, destRel);

  if (destAbs !== rootAbs && !destAbs.startsWith(rootAbs + sep)) {
    throw new Error(`unsafe destination outside managed tree: ${destRel}`);
  }
  return { rootRel, rootAbs, destAbs };
}

/**
 * Inspect `shared/` and each managed directory without following symlinks.
 * @param {string} root
 * @returns {{ problems: string[], usableDirs: Set<string>, sharedUsable: boolean }}
 */
function inspectManagedRoots(root) {
  const problems = [];
  const usableDirs = new Set();

  const sharedAbs = resolve(root, 'shared');
  const sharedStat = lstatOrNull(sharedAbs);
  if (sharedStat && !sharedStat.isDirectory()) {
    problems.push('shared');
    return { problems, usableDirs, sharedUsable: false };
  }

  for (const dirRel of MANAGED_DIRS) {
    const stat = lstatOrNull(resolve(root, dirRel));
    if (stat && !stat.isDirectory()) {
      problems.push(dirRel);
      continue;
    }
    usableDirs.add(dirRel);
  }

  return { problems, usableDirs, sharedUsable: true };
}

/**
 * List files under managed directories that have no canonical source.
 * Dotfiles are ignored; symlinks and directories are reported, never followed.
 * @param {string} root
 * @param {{ source: string, dest: string }[]} files
 * @returns {string[]}
 */
function listOrphans(root, files) {
  const expected = new Set(files.map((file) => file.dest));
  const orphans = [];

  for (const dirRel of MANAGED_DIRS) {
    const dirAbs = resolve(root, dirRel);
    const stat = lstatOrNull(dirAbs);
    if (!stat || !stat.isDirectory()) continue;

    for (const name of readdirSync(dirAbs).sort()) {
      if (name.startsWith('.')) continue;
      const destRel = `${dirRel}/${name}`;
      if (!expected.has(destRel)) orphans.push(destRel);
    }
  }

  return orphans;
}

/**
 * Print a deterministic drift report (repo-relative paths only).
 * @param {{ missing: string[], changed: string[], orphan: string[] }} groups
 * @param {number} total
 * @returns {boolean} true when the tree is clean
 */
function printReport(groups, total) {
  for (const path of groups.missing.sort()) console.log(`MISSING ${path}`);
  for (const path of groups.changed.sort()) console.log(`CHANGED ${path}`);
  for (const path of groups.orphan.sort()) console.log(`ORPHAN ${path}`);

  const drift = groups.missing.length + groups.changed.length + groups.orphan.length;
  if (drift === 0) {
    console.log(`OK shared/ is in sync (${total} managed files)`);
    return true;
  }
  console.log(
    `DRIFT ${drift} item(s): ${groups.missing.length} missing, ` +
      `${groups.changed.length} changed, ${groups.orphan.length} orphan`
  );
  return false;
}

/**
 * Write every canonical file into `shared/` and remove managed orphans (D-03).
 * @param {{ root?: string }} [options]
 * @returns {{ written: string[], unchanged: string[], removed: string[] }}
 */
export function syncShared({ root = REPO_ROOT } = {}) {
  const files = buildCanonicalFiles(root);
  const { problems, usableDirs, sharedUsable } = inspectManagedRoots(root);

  if (!sharedUsable) {
    throw new Error('shared is not a regular directory (refusing to write through it)');
  }
  if (problems.length > 0) {
    throw new Error(`managed directory is not a regular directory: ${problems.join(', ')}`);
  }

  const sharedAbs = resolve(root, 'shared');
  if (!existsSync(sharedAbs)) mkdirSync(sharedAbs, { recursive: true });
  for (const dirRel of MANAGED_DIRS) {
    const dirAbs = resolve(root, dirRel);
    if (!lstatOrNull(dirAbs)) mkdirSync(dirAbs, { recursive: true });
  }

  const written = [];
  const unchanged = [];

  for (const { source, dest } of files) {
    const { destAbs } = resolveManagedDest(root, dest);
    const stat = lstatOrNull(destAbs);

    if (dest === SKILL_DEST) {
      if (stat && !stat.isFile()) {
        throw new Error(`refusing to overwrite non-file at ${dest}`);
      }
    } else if (stat && !stat.isFile()) {
      throw new Error(`refusing to overwrite non-file at ${dest}`);
    }

    let sourceBytes;
    try {
      sourceBytes = readFileSync(join(root, source));
    } catch {
      throw new Error(`could not read canonical source: ${source}`);
    }

    if (!stat) {
      writeFileSync(destAbs, sourceBytes);
      written.push(dest);
      continue;
    }

    const destBytes = readFileSync(destAbs);
    if (!sourceBytes.equals(destBytes)) {
      writeFileSync(destAbs, sourceBytes);
      written.push(dest);
    } else {
      unchanged.push(dest);
    }
  }

  const removed = [];
  for (const destRel of listOrphans(root, files)) {
    const { destAbs, rootAbs } = resolveManagedDest(root, destRel);
    if (destAbs !== rootAbs && !destAbs.startsWith(rootAbs + sep)) {
      throw new Error(`unsafe orphan path: ${destRel}`);
    }
    const stat = lstatSync(destAbs);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      throw new Error(`refusing to remove non-file orphan: ${destRel}`);
    }
    unlinkSync(destAbs);
    removed.push(destRel);
  }

  for (const path of removed) console.log(`REMOVED ${path}`);
  for (const path of written) console.log(`WROTE ${path}`);
  console.log(
    `OK synced ${files.length} managed files ` +
      `(${written.length} written, ${unchanged.length} unchanged, ${removed.length} removed)`
  );

  return { written, unchanged, removed };
}

/**
 * Read-only drift check (never mkdir, write, or unlink).
 * @param {{ root?: string }} [options]
 * @returns {number} 0 when clean, 1 when any drift exists
 */
export function checkDrift({ root = REPO_ROOT } = {}) {
  const files = buildCanonicalFiles(root);
  const { problems, usableDirs, sharedUsable } = inspectManagedRoots(root);
  const groups = { missing: [], changed: [], orphan: [] };
  const seen = new Set();

  const add = (kind, path) => {
    const key = `${kind}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    groups[kind].push(path);
  };

  for (const path of problems) add('orphan', path);

  for (const { source, dest } of files) {
    const { rootRel, destAbs } = resolveManagedDest(root, dest);

    if (dest === SKILL_DEST) {
      if (!sharedUsable) continue;
      const stat = lstatOrNull(destAbs);
      if (!stat) {
        add('missing', dest);
      } else if (!stat.isFile()) {
        add('orphan', dest);
      } else {
        const sourceBytes = readFileSync(join(root, source));
        if (!sourceBytes.equals(readFileSync(destAbs))) add('changed', dest);
      }
      continue;
    }

    if (!usableDirs.has(rootRel)) continue;

    const stat = lstatOrNull(destAbs);
    if (!stat) {
      add('missing', dest);
    } else if (!stat.isFile()) {
      add('orphan', dest);
    } else {
      const sourceBytes = readFileSync(join(root, source));
      if (!sourceBytes.equals(readFileSync(destAbs))) add('changed', dest);
    }
  }

  for (const destRel of listOrphans(root, files)) add('orphan', destRel);

  const clean = printReport(groups, files.length);
  return clean ? 0 : 1;
}

/**
 * True only when this module is the process entry point.
 * Realpath comparison is required: on macOS `/var` and `/private/var` differ.
 * @returns {boolean}
 */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

/**
 * CLI entry point.
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  const args = argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    console.error(`Unknown argument(s): ${args.join(' ')}`);
    console.error('Usage: node scripts/sync-shared.mjs [--check]');
    return 1;
  }

  try {
    if (args[0] === '--check') return checkDrift();
    syncShared();
    return 0;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return 1;
  }
}

if (isMain()) {
  process.exitCode = main(process.argv);
}
