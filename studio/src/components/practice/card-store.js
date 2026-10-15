/**
 * Card helpers used by the flashcard generator and the Review page.
 *
 * Reads cards through the repository's indexed `listCards` (soonest due first), so the whole
 * backup dump is never serialised just to dedupe (HANDOFF-24 §1).
 */
import { listCards as repoListCards } from '../../lib/repo/index.js';

/** Normalise card text for duplicate detection. */
export function normText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Every live (non-deleted) card, optionally scoped to a course/lesson. */
export async function listCards({ courseId, lessonId } = {}) {
  return repoListCards({ courseId, lessonId });
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
