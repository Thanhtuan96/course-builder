/**
 * Card helpers used by the flashcard generator and the Review page.
 *
 * The repository exposes `listDueCards` / `addCards` / `gradeCard` but no "all cards" reader, so
 * we read the backup dump (`repo.exportAll`) to dedupe and to find the next due time. A dedicated
 * `repo.listCards()` would be cheaper — noted in HANDOFF-24.md. Keeping this in one place avoids
 * duplicating the workaround across components.
 */
import { exportAll } from '../../lib/repo/index.js';

/** Normalise card text for duplicate detection. */
export function normText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Every live (non-deleted) card across all courses. */
export async function listCards() {
  const dump = await exportAll();
  return (dump?.tables?.cards || []).filter((c) => !c.deleted_at);
}

/** Set of normalised fronts already stored for a lesson. */
export async function existingFronts(lessonId) {
  const cards = await listCards();
  return new Set(cards.filter((c) => c.lesson_id === lessonId).map((c) => normText(c.front)));
}

/**
 * Drop blank or already-known cards, preserving order.
 * @param {Array<{ front?: string, back?: string }>} cards
 * @param {Set<string>} [existing]
 * @returns {Array<{ front: string, back: string }>}
 */
export function dedupeCards(cards = [], existing = new Set()) {
  const seen = new Set(existing);
  const out = [];
  for (const card of cards) {
    const front = String(card?.front || '').trim();
    const back = String(card?.back || '').trim();
    const key = normText(front);
    if (!front || !back || seen.has(key)) continue;
    seen.add(key);
    out.push({ front, back });
  }
  return out;
}

/**
 * Soonest future due timestamp (ms) across all cards, or null when nothing is scheduled ahead.
 * @param {number} [now]
 * @returns {Promise<number|null>}
 */
export async function nextDueAt(now = Date.now()) {
  const cards = await listCards();
  let soonest = null;
  for (const card of cards) {
    const due = Date.parse(card.due_at);
    if (Number.isNaN(due)) continue;
    if (due > now && (soonest === null || due < soonest)) soonest = due;
  }
  return soonest;
}
