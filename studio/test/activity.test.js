import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { dayKey } from '../src/lib/course.js';
import { activityCounts, computeStreak, computeStudyDays, getStreak, getStudyDays } from '../src/lib/activity.js';

const on = (y, m, d, h = 12) => dayKey(new Date(y, m, d, h));
const row = (key) => ({ day: key });

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('activityCounts', () => {
  it('prefers the stored day and falls back to created_at', () => {
    const counts = activityCounts([row('2026-10-15'), { created_at: new Date(2026, 9, 15, 12).toISOString() }]);
    expect(counts['2026-10-15']).toBe(2);
  });
});

describe('computeStreak', () => {
  it('counts consecutive days ending today or yesterday', () => {
    const today = new Date(2026, 9, 15, 12);
    const rows = [row(on(2026, 9, 15)), row(on(2026, 9, 14)), row(on(2026, 9, 13)), row(on(2026, 9, 11))];
    expect(computeStreak(rows, today)).toBe(3);
  });

  it('counts a streak that ended yesterday, but not older', () => {
    expect(computeStreak([row(on(2026, 9, 14)), row(on(2026, 9, 13))], new Date(2026, 9, 15, 12))).toBe(2);
    expect(computeStreak([row(on(2026, 9, 13))], new Date(2026, 9, 15, 12))).toBe(0);
  });

  it('is empty with no activity', () => {
    expect(computeStreak([], new Date(2026, 9, 15, 12))).toBe(0);
  });

  it('counts a streak across the spring-forward DST boundary', () => {
    const today = new Date(2026, 2, 8, 20); // US spring forward: 2026-03-08
    const rows = [row(on(2026, 2, 8, 10)), row(on(2026, 2, 7, 10))];
    expect(computeStreak(rows, today)).toBe(2);
  });

  it('does not duplicate or skip the fall-back DST day', () => {
    const today = new Date(2026, 10, 2, 12); // US fall back: 2026-11-01
    const rows = [row(on(2026, 10, 2, 1)), row(on(2026, 10, 1, 12))];
    expect(computeStreak(rows, today)).toBe(2);
    expect(computeStudyDays(rows, 3, today).map((d) => d.day)).toEqual([
      on(2026, 9, 31),
      on(2026, 10, 1),
      on(2026, 10, 2),
    ]);
  });
});

describe('computeStudyDays', () => {
  it('returns the last n local days, oldest first, flagging studied days', () => {
    const today = new Date(2026, 2, 10, 9);
    const rows = [row(on(2026, 2, 10, 1)), row(on(2026, 2, 9, 23)), row(on(2026, 2, 7))];
    const days = computeStudyDays(rows, 7, today);
    expect(days).toHaveLength(7);
    expect(new Set(days.map((d) => d.day)).size).toBe(7);
    expect(days[days.length - 1]).toMatchObject({ day: on(2026, 2, 10), studied: true, count: 1 });
    expect(days[days.length - 2].studied).toBe(true);
    expect(days[days.length - 3].studied).toBe(false);
  });
});

describe('activity repository readers', () => {
  it('getStreak and getStudyDays read the activity log', async () => {
    await repo.logActivity('quiz');
    await repo.logActivity('review');
    const today = new Date();
    expect(await getStreak(today)).toBe(1);
    const days = await getStudyDays(7, today);
    expect(days).toHaveLength(7);
    expect(days[days.length - 1]).toMatchObject({ studied: true, count: 2 });
  });
});
