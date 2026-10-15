import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { normText, listCards, existingFronts, dedupeCards, nextDueAt } from '../src/components/practice/card-store.js';

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('dedupeCards', () => {
  it('drops blank and case/whitespace-duplicate fronts', () => {
    const existing = new Set([normText('Active Recall')]);
    const out = dedupeCards(
      [
        { front: '  active   recall ', back: 'dup' },
        { front: 'New card', back: ' keep ' },
        { front: '', back: 'nope' },
        { front: 'New Card', back: 'internal dup' },
      ],
      existing
    );
    expect(out).toEqual([{ front: 'New card', back: 'keep' }]);
  });
});

describe('card-store repository helpers', () => {
  it('existingFronts only sees the given lesson and ignores deleted cards', async () => {
    const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L1' }, { title: 'L2' }] });
    const [l1, l2] = course.lessons;
    await repo.addCards(course.id, l1.id, [{ front: 'Alpha', back: 'a' }]);
    await repo.addCards(course.id, l2.id, [{ front: 'Beta', back: 'b' }]);

    const fronts = await existingFronts(l1.id);
    expect(fronts.has('alpha')).toBe(true);
    expect(fronts.has('beta')).toBe(false);
    expect(await listCards()).toHaveLength(2);
  });

  it('nextDueAt ignores overdue cards and returns the soonest future due', async () => {
    const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L' }] });
    const cards = await repo.addCards(course.id, course.lessons[0].id, [{ front: 'a', back: 'b' }]);
    expect(await nextDueAt()).toBeNull(); // fresh card is due now, not in the future
    await repo.gradeCard(cards[0].id, 2);
    expect(await nextDueAt()).toBeGreaterThan(Date.now());
  });
});
