/**
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createStudioStore } from '../bin/studio-store.js';
import { useAdapter, gradeCard } from '../studio/src/lib/repo/index.js';
import { parseReviewArgs, nextDueAt, emptyStateMessage, run } from '../bin/commands/review.js';

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  tempDirs.length = 0;
});

function mkStore() {
  const home = mkdtempSync(join(tmpdir(), 'cp-review-'));
  tempDirs.push(home);
  return createStudioStore({ dbPath: join(home, 'professor.db'), log: () => {} });
}

async function putCard(store, over = {}) {
  const now = new Date().toISOString();
  await store.put('cards', {
    id: over.id || 'card-1',
    owner_id: 'local',
    course_id: null,
    lesson_id: null,
    front: over.front || 'What is X?',
    back: over.back || 'X is the first thing.',
    ease: 2.5,
    interval_days: 0,
    reps: 0,
    lapses: 0,
    due_at: over.due_at || now,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
}

describe('parseReviewArgs', () => {
  it('defaults the limit and reads --limit N / --limit=N', () => {
    expect(parseReviewArgs([]).limit).toBe(20);
    expect(parseReviewArgs(['--limit', '5']).limit).toBe(5);
    expect(parseReviewArgs(['--limit=7']).limit).toBe(7);
    expect(parseReviewArgs(['--limit', 'nope']).limit).toBe(20);
  });
});

describe('nextDueAt / emptyStateMessage', () => {
  it('finds the soonest future due date and ignores past/null', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    const cards = [
      { due_at: '2026-10-15T00:00:00.000Z' }, // past
      { due_at: '2026-11-01T00:00:00.000Z' },
      { due_at: '2026-10-20T00:00:00.000Z' },
      { due_at: 'not-a-date' },
    ];
    expect(nextDueAt(cards, now)).toBe(Date.parse('2026-10-20T00:00:00.000Z'));
    expect(emptyStateMessage(null)).toContain('no cards scheduled');
    expect(emptyStateMessage(Date.parse('2026-10-20T00:00:00.000Z'))).toContain('next card due 2026-10-20');
  });
});

describe('review run (non-TTY)', () => {
  it('reports the due count without writing', async () => {
    const store = mkStore();
    await putCard(store, { due_at: '2026-10-15T00:00:00.000Z' });
    const logs = [];
    const original = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      const result = await run({ store, tty: false, now: Date.parse('2026-10-15T12:00:00Z'), style: (t, m) => m });
      expect(result.due).toBe(1);
    } finally {
      console.log = original;
    }
    expect(logs.join('\n')).toContain('1 card due');
    expect(await store.list('reviews')).toHaveLength(0);
    store.close();
  });

  it('shows the all-caught-up empty state with the next due date', async () => {
    const store = mkStore();
    await putCard(store, { due_at: '2026-11-01T00:00:00.000Z' });
    const logs = [];
    const original = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      const result = await run({ store, tty: false, now: Date.parse('2026-10-15T12:00:00Z'), style: (t, m) => m });
      expect(result.due).toBe(0);
    } finally {
      console.log = original;
    }
    expect(logs.join('\n')).toContain('All caught up — next card due 2026-11-01');
    store.close();
  });
});

describe('grading shares Studio business logic', () => {
  it('gradeCard updates SM-2 state and writes a reviews row via the store', async () => {
    const store = mkStore();
    await putCard(store);
    useAdapter(store);

    const { card, review } = await gradeCard('card-1', 2); // good
    expect(card.reps).toBe(1);
    expect(card.interval_days).toBe(1);
    expect(review.grade).toBe(2);
    expect(await store.list('reviews')).toHaveLength(1);
    store.close();
  });
});
