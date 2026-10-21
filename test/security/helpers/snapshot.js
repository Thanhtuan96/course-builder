/**
 * Filesystem snapshot helper for "rejected requests wrote nothing" assertions.
 *
 * Walks a temp root without following symlinks and records each entry's relative path, type, mode,
 * size and SHA-256. Comparing a before/after snapshot proves a rejected request left no trace.
 */
import { createHash } from 'crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'fs';
import { join, relative, sep } from 'path';
import { deepStrictEqual } from 'assert';

function sha256(file) {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex');
}

/**
 * @param {string} root
 * @returns {Record<string, { type: string, mode: number, size?: number, sha256?: string,
 *                            target?: string }>}
 */
export function snapshotTree(root) {
  const snapshot = {};
  if (!existsSync(root)) return snapshot;

  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      let info;
      try {
        info = lstatSync(full);
      } catch {
        continue;
      }
      const mode = info.mode & 0o777;

      if (info.isSymbolicLink()) {
        snapshot[rel] = { type: 'symlink', mode, target: readlinkSync(full) };
      } else if (info.isDirectory()) {
        snapshot[rel] = { type: 'dir', mode };
        walk(full);
      } else if (info.isFile()) {
        snapshot[rel] = { type: 'file', mode, size: info.size, sha256: sha256(full) };
      } else {
        snapshot[rel] = { type: 'other', mode };
      }
    }
  };

  walk(root);
  return snapshot;
}

/**
 * Assert `after` is byte-identical to `before` (path, type, mode, size, hash/link target).
 * @param {ReturnType<typeof snapshotTree>} before
 * @param {ReturnType<typeof snapshotTree>} after
 * @param {string} [message]
 */
export function assertUnchanged(before, after, message = 'filesystem changed') {
  deepStrictEqual(after, before, message);
}
