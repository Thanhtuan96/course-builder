/**
 * Small id helper shared by course.js and any seed/demo code.
 * The repository stamps its own ids with crypto.randomUUID(); this is the manual-entry equivalent.
 */

/** @param {string} [prefix] */
export function uid(prefix = '') {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return prefix + rand.replace(/-/g, '').slice(0, 12);
}
