/**
 * Stable, dependency-free hash for code snapshots (CODE-05).
 *
 * Run results store a snapshot hash so the history drawer can tell when the code changed without
 * comparing full file bodies. FNV-1a over the ordered JSON of files is deterministic across
 * sessions and platforms (no async crypto needed, works in workers).
 */

/**
 * FNV-1a 32-bit. Returns 8 hex chars.
 * @param {string} input
 * @returns {string}
 */
export function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in uint32 range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * @param {Record<string,string>|Array<{path:string, content:string}>} files
 * @returns {string} stable hash of path + content, order-independent by path
 */
export function hashFiles(files) {
  const rows = Array.isArray(files)
    ? files.map((f) => [String(f.path), String(f.content ?? '')])
    : Object.entries(files || {}).map(([path, content]) => [String(path), String(content ?? '')]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return fnv1a(JSON.stringify(rows));
}
