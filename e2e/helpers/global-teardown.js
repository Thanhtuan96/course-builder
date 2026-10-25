/**
 * Remove the per-run temp PROFESSOR_HOME after Playwright finishes (RON-168).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { PROFESSOR_HOME_MARKER, removeTempHome } from './env.js';

export default async function globalTeardown() {
  let home = '';
  try {
    home = existsSync(PROFESSOR_HOME_MARKER) ? readFileSync(PROFESSOR_HOME_MARKER, 'utf8').trim() : '';
  } catch {
    home = '';
  }
  removeTempHome(home);
  try {
    rmSync(PROFESSOR_HOME_MARKER, { force: true });
  } catch {
    /* ignore */
  }
}
