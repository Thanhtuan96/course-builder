/**
 * node-version — the single source of truth for the Node.js floor required by Professor Studio.
 *
 * Studio's SQLite storage layer (`web/studio-db.js`) uses the built-in `node:sqlite` module, which
 * ships from Node 22.5.0. The setup/registry commands and `doctor` only need Node 18 (see
 * `package.json` `engines`), so the stricter Studio floor is checked at the point of use — the
 * `studio`, `review` and `import` commands — and reported by `doctor`.
 */

export const STUDIO_MIN_NODE = { major: 22, minor: 5 };

/**
 * Parse a `process.version`-style string into `{ major, minor }`.
 * @param {string} version e.g. "v22.5.0"
 * @returns {{ major: number, minor: number }|null}
 */
export function parseNodeVersion(version) {
  const match = String(version || '').replace(/^v/, '').match(/^(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * Whether `version` is >= the Studio floor (Node 22.5.0) and can use `node:sqlite`.
 * @param {string} [version]
 * @returns {boolean}
 */
export function nodeSupportsSqlite(version = process.version) {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  const { major, minor } = STUDIO_MIN_NODE;
  return parsed.major > major || (parsed.major === major && parsed.minor >= minor);
}

/**
 * The message shown when the Node version is too old for Studio.
 * @param {string} [version]
 * @returns {string}
 */
export function studioNodeMessage(version = process.version) {
  return `Professor Studio needs Node 22.5+ (you have ${version}). Install from https://nodejs.org`;
}

/**
 * Throw when the running Node cannot use `node:sqlite`. Pure — callers decide how to surface it.
 * @param {string} [version]
 */
export function assertStudioNode(version = process.version) {
  if (!nodeSupportsSqlite(version)) throw new Error(studioNodeMessage(version));
}

/**
 * Guard for CLI command entry points: print a one-line error and exit 1 when Node is too old.
 * @param {string} [version]
 */
export function requireStudioNode(version = process.version) {
  if (nodeSupportsSqlite(version)) return;
  console.error(studioNodeMessage(version));
  process.exit(1);
}
