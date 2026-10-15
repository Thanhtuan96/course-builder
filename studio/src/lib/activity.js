/**
 * Study-activity helpers for streaks and the days-studied indicator (PRACTICE-04).
 *
 * All boundaries are **local calendar days** (not UTC), so a session just after local midnight
 * counts for the new day. Day arithmetic walks the local calendar via `Date#setDate`, which is
 * DST-safe: the clock hour may shift but the calendar day never skips or repeats.
 *
 * The pure `computeStreak` / `computeStudyDays` take activity rows and a `today` Date, so tests
 * can pin time. The async `getStreak` / `getStudyDays` read from the repository.
 */
import { listActivity } from './repo/index.js';
import { dayKey } from './course.js';

export const STUDY_WINDOW_DAYS = 7;

/**
 * Collapse activity rows into `{ [dayKey]: count }`, preferring the stored local `day`.
 * @param {Array<{ day?: string, created_at?: string }>} rows
 * @returns {Record<string, number>}
 */
export function activityCounts(rows = []) {
  const counts = {};
  for (const row of rows || []) {
    const key = row?.day || (row?.created_at ? dayKey(row.created_at) : null);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

/** Local noon anchor — noon keeps `setDate` on the same calendar day through DST changes. */
function localNoon(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/**
 * Consecutive days studied ending today or yesterday. Today or yesterday must be active.
 * @param {Array<object>} rows activity rows
 * @param {Date|string|number} [today]
 * @returns {number}
 */
export function computeStreak(rows = [], today = new Date()) {
  const counts = activityCounts(rows);
  let streak = 0;
  const cursor = localNoon(today);
  if (!counts[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (counts[dayKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * The last `n` local days, oldest first, each flagged if studied.
 * @param {Array<object>} rows activity rows
 * @param {number} [n]
 * @param {Date|string|number} [today]
 * @returns {Array<{ day: string, studied: boolean, count: number }>}
 */
export function computeStudyDays(rows = [], n = STUDY_WINDOW_DAYS, today = new Date()) {
  const counts = activityCounts(rows);
  const size = Math.max(1, Math.round(n) || STUDY_WINDOW_DAYS);
  const days = [];
  const cursor = localNoon(today);
  for (let i = 0; i < size; i++) {
    const key = dayKey(cursor);
    days.unshift({ day: key, studied: (counts[key] || 0) > 0, count: counts[key] || 0 });
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
}

/**
 * Current streak, read from the activity log.
 * @param {Date} [today]
 * @returns {Promise<number>}
 */
export async function getStreak(today = new Date()) {
  return computeStreak(await listActivity(), today);
}

/**
 * Days-studied window, read from the activity log.
 * @param {number} [n]
 * @param {Date} [today]
 * @returns {Promise<Array<{ day: string, studied: boolean, count: number }>>}
 */
export async function getStudyDays(n = STUDY_WINDOW_DAYS, today = new Date()) {
  return computeStudyDays(await listActivity(), n, today);
}
