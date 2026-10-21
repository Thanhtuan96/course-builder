/**
 * Pure beta metrics: activation, the active-day window, all-time loop totals and retention
 * (D-09/D-10).
 *
 * Day math is component-based on purpose (P2). A stored `YYYY-MM-DD` day is a local calendar
 * value, never an instant: passing it through `new Date()` would parse UTC midnight and shift
 * the day in any negative-offset zone. `dayKey` is only used on `created_at`/`now` instants.
 *
 * No adapter, repository or I/O is imported here; callers supply rows and an injected clock.
 */
import { dayKey } from '../course.js';
import { EVENT_KINDS } from '../repo/events.js';

const DAY_MS = 86400000;
const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convert a local `YYYY-MM-DD` day key to an integer calendar-day number.
 * @param {string} day
 * @returns {number|null} null when the string is malformed or not a real date
 */
export function dayNumber(day) {
  if (typeof day !== 'string') return null;
  const match = DAY_KEY_RE.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  const utc = Date.UTC(year, month - 1, date);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== date
  ) {
    return null;
  }
  return Math.floor(utc / DAY_MS);
}

/**
 * Local-calendar day offset from the activation day, clamped at 0 (D-09).
 * @param {string} day
 * @param {string} activatedDay
 * @returns {number|null} null when either side is malformed
 */
export function dayOffset(day, activatedDay) {
  const current = dayNumber(day);
  const activation = dayNumber(activatedDay);
  if (current == null || activation == null) return null;
  return Math.max(0, current - activation);
}

/**
 * The stored local day for an event, falling back to `created_at` only when `day` is absent.
 * @param {object} event
 * @returns {string|null}
 */
function eventDay(event) {
  if (dayNumber(event?.day) != null) return event.day;
  if (event?.created_at) {
    const day = dayKey(event.created_at);
    if (dayNumber(day) != null) return day;
  }
  return null;
}

/**
 * Earliest meaningful event by `created_at`, with the row `id` as a deterministic tiebreak (O2).
 * @param {object[]} rows
 * @returns {object|null}
 */
function earliestEvent(rows) {
  let best = null;
  for (const row of rows) {
    if (best == null) {
      best = row;
      continue;
    }
    const a = String(row.created_at ?? '');
    const b = String(best.created_at ?? '');
    if (a < b) {
      best = row;
    } else if (a === b && String(row.id ?? '') < String(best.id ?? '')) {
      best = row;
    }
  }
  return best;
}

/**
 * Compute beta metrics from stored rows plus an injected clock.
 * @param {{ events?: object[], profile?: object|null, now?: Date }} [input]
 * @returns {{ activation: { activated: boolean, firstEventKind: string|null }, generatedAtDayOffset: number, window: { activeDayOffsets: number[] }, loops: { byKind: Record<string, number> }, retention: { week1Active: boolean, week2Return: boolean, week2MeaningfulDays: number } }}
 */
export function computeMetrics({ events = [], profile = null, now = new Date() } = {}) {
  const rows = (events || []).filter(
    (event) => event && !event.deleted_at && EVENT_KINDS.includes(event.kind)
  );

  const byKind = {};
  for (const kind of EVENT_KINDS) byKind[kind] = 0;
  for (const event of rows) byKind[event.kind] += 1;

  const activatedDay = profile?.activated_day;
  const activated = dayNumber(activatedDay) != null;

  if (!activated) {
    return {
      activation: { activated: false, firstEventKind: null },
      generatedAtDayOffset: 0,
      window: { activeDayOffsets: [] },
      loops: { byKind },
      retention: { week1Active: false, week2Return: false, week2MeaningfulDays: 0 },
    };
  }

  const offsets = new Set();
  const week2Days = new Set();
  let week1Active = false;
  let week2Return = false;

  for (const event of rows) {
    const day = eventDay(event);
    if (day == null) continue;
    const offset = dayOffset(day, activatedDay);
    if (offset == null) continue;
    if (offset <= 14) offsets.add(offset);
    if (offset >= 1 && offset <= 7) week1Active = true;
    if (offset >= 8 && offset <= 14) {
      week2Return = true;
      week2Days.add(day);
    }
  }

  const first = earliestEvent(rows);
  const generatedAtDayOffset = dayOffset(dayKey(now), activatedDay) ?? 0;

  return {
    activation: { activated: true, firstEventKind: first ? first.kind : null },
    generatedAtDayOffset,
    window: { activeDayOffsets: [...offsets].sort((a, b) => a - b) },
    loops: { byKind },
    retention: { week1Active, week2Return, week2MeaningfulDays: week2Days.size },
  };
}
