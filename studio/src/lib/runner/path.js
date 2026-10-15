/**
 * Path safety shared by the browser runner and `web/studio-runner.js` (PITFALLS: path traversal).
 *
 * A workspace file is addressed by a *relative* path (e.g. `main.py`, `src/util.py`). Anything
 * absolute, containing a `..` segment, a NUL byte, or a Windows drive prefix is rejected so a
 * crafted lesson/CLI payload can never write outside the workspace root.
 *
 * Pure module — no Node/DOM APIs — so both the SPA and the Express router import the same rules.
 */

const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const BACKSLASH = /\\/;

/**
 * @param {unknown} path
 * @returns {boolean} true when `path` is a safe, relative, portable path
 */
export function isSafeRelPath(path) {
  if (typeof path !== 'string') return false;
  const value = path.trim();
  if (!value) return false;
  if (value.length > 512) return false;
  if (CONTROL_CHARS.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('~')) return false;
  if (WINDOWS_DRIVE.test(value)) return false;
  if (BACKSLASH.test(value)) return false; // enforce forward slashes for portability
  if (value.endsWith('/')) return false;

  const segments = value.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return true;
}

/**
 * A course slug becomes a single folder name under the workspaces root.
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isSafeSlug(slug) {
  if (typeof slug !== 'string') return false;
  const value = slug.trim();
  if (!value || value.length > 120) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) return false;
  if (value === '.' || value === '..') return false;
  return true;
}

/**
 * Kebab-case slug from an arbitrary title (used to derive a course folder name).
 * @param {string} title
 * @returns {string}
 */
export function slugify(title) {
  const out = String(title || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return out || 'workspace';
}

/**
 * Normalise a relative path's separators to forward slashes (does not resolve `..`).
 * @param {string} path
 * @returns {string}
 */
export function toPosix(path) {
  return String(path || '').replace(/\\/g, '/');
}

/**
 * Resolve `rel` under `root` **and** assert the result stays inside `root`.
 * Uses only string ops so it behaves identically in the browser and in Node.
 * @param {string} root
 * @param {string} rel
 * @returns {string} the joined path (with the root's existing separators)
 * @throws {Error} when `rel` is unsafe
 */
export function resolveInside(root, rel) {
  if (!isSafeRelPath(rel)) throw new Error(`Unsafe path: ${rel}`);
  const sep = root.includes('\\') ? '\\' : '/';
  const base = root.replace(/[\\/]+$/, '');
  return `${base}${sep}${toPosix(rel).split('/').join(sep)}`;
}

/**
 * Convert a `{ path: content }` map (or `[{path, content}]` list) into a normalised list.
 * @param {Record<string,string>|Array<{path?:string, name?:string, content?:string}>|null|undefined} files
 * @returns {Array<{ path: string, content: string }>}
 */
export function normalizeFiles(files) {
  if (!files) return [];
  const rows = Array.isArray(files)
    ? files.map((f) => ({ path: f?.path ?? f?.name, content: f?.content ?? '' }))
    : Object.entries(files).map(([path, content]) => ({ path, content }));
  return rows
    .filter((f) => typeof f.path === 'string' && f.path)
    .map((f) => ({ path: toPosix(f.path), content: String(f.content ?? '') }));
}
