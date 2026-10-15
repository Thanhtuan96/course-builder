import { describe, it, expect } from 'vitest';
import { newCardState, review, isDue } from '../src/lib/srs.js';

const DAY = 24 * 60 * 60 * 1000;

describe('SM-2', () => {
  it('new cards are due immediately', () => {
    const now = Date.now();
    const card = newCardState(now);
    expect(card).toMatchObject({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now });
    expect(isDue(card, now)).toBe(true);
  });

  it('good/easy grades schedule further into the future', () => {
    const now = Date.now();
    let card = newCardState(now);
    card = review(card, 2, now);
    expect(card.reps).toBe(1);
    expect(card.interval).toBe(1);
    expect(isDue(card, now)).toBe(false);
    expect(isDue(card, now + 2 * DAY)).toBe(true);

    card = review(card, 2, now + 2 * DAY);
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(3);

    const later = review(card, 3, now + 5 * DAY);
    expect(later.interval).toBeGreaterThan(card.interval);
  });

  it('again resets reps and increases lapses', () => {
    const now = Date.now();
    let card = newCardState(now);
    card = review(card, 2, now);
    const again = review(card, 0, now);
    expect(again.reps).toBe(0);
    expect(again.lapses).toBe(1);
    expect(again.ease).toBeLessThan(card.ease);
    expect(again.due).toBe(now + 10 * 60 * 1000);
  });

  it('never lets ease fall below 1.3', () => {
    const now = Date.now();
    let card = { ...newCardState(now), ease: 1.3 };
    for (let i = 0; i < 5; i++) card = review(card, 0, now);
    expect(card.ease).toBeGreaterThanOrEqual(1.3);
  });
});
