/**
 * SM-2 spaced repetition (the algorithm behind Anki), simplified to four grades.
 * grade: 0 = again, 1 = hard, 2 = good, 3 = easy
 */

const DAY = 24 * 60 * 60 * 1000;

export function newCardState(now = Date.now()) {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now };
}

export function review(card, grade, now = Date.now()) {
  const next = { ...card };
  if (grade === 0) {
    next.reps = 0;
    next.lapses = (card.lapses || 0) + 1;
    next.interval = 0;
    next.ease = Math.max(1.3, card.ease - 0.2);
    next.due = now + 10 * 60 * 1000; // see it again in 10 minutes
    return next;
  }

  // SM-2 quality mapping: hard=3, good=4, easy=5
  const q = grade + 2;
  next.ease = Math.max(1.3, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  next.reps = (card.reps || 0) + 1;

  if (next.reps === 1) next.interval = grade === 3 ? 4 : 1;
  else if (next.reps === 2) next.interval = grade === 3 ? 7 : 3;
  else next.interval = Math.round(card.interval * next.ease * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1));

  next.interval = Math.max(1, next.interval);
  next.due = now + next.interval * DAY;
  return next;
}

export function isDue(card, now = Date.now()) {
  return card.due <= now;
}
