import { describe, it, expect, afterEach } from 'vitest';
import { dayKey } from '../src/lib/course.js';
import { dayOffset, computeMetrics } from '../src/lib/beta/metrics.js';

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function event(kind, date, extra = {}) {
  return {
    id: extra.id ?? `${kind}-${date.toISOString()}`,
    kind,
    day: dayKey(date),
    created_at: date.toISOString(),
    ...extra,
  };
}

describe('beta metrics: activation and the active-day window', () => {
  it('computes the UTC+7 tracer window and keeps byKind all-time', () => {
    process.env.TZ = 'Asia/Bangkok';

    const activatedDay = dayKey(new Date(2026, 0, 1, 6));
    const dates = [0, 1, 8, 14, 15].map((offset) => new Date(2026, 0, 1 + offset, 6));
    const events = dates.map((date) => event('quiz_completed', date));

    const result = computeMetrics({
      events,
      profile: { activated_day: activatedDay },
      now: new Date(2026, 0, 16, 12),
    });

    expect(result.activation).toEqual({ activated: true, firstEventKind: 'quiz_completed' });
    expect(result.window.activeDayOffsets).toEqual([0, 1, 8, 14]);
    expect(result.retention.week1Active).toBe(true);
    expect(result.retention.week2Return).toBe(true);
    expect(result.retention.week2MeaningfulDays).toBe(2);
    expect(Object.values(result.loops.byKind).reduce((sum, count) => sum + count, 0)).toBe(5);
  });

  it('never shifts a stored local day at 23:30 in UTC-8', () => {
    process.env.TZ = 'America/Los_Angeles';

    const firstDay = dayKey(new Date('2026-01-01T23:30:00'));
    const nextDay = dayKey(new Date('2026-01-02T23:30:00'));

    expect(firstDay).toBe('2026-01-01');
    expect(nextDay).toBe('2026-01-02');
    expect(dayOffset(firstDay, firstDay)).toBe(0);
    expect(dayOffset(nextDay, firstDay)).toBe(1);
  });

  it('returns the documented zeroed shape without activation', () => {
    process.env.TZ = 'UTC';
    const result = computeMetrics({
      events: [event('quiz_completed', new Date(2026, 0, 1, 12))],
      profile: { activated_day: null },
    });

    expect(result.activation).toEqual({ activated: false, firstEventKind: null });
    expect(result.generatedAtDayOffset).toBe(0);
    expect(result.window.activeDayOffsets).toEqual([]);
    expect(result.retention).toEqual({
      week1Active: false,
      week2Return: false,
      week2MeaningfulDays: 0,
    });
    expect(result.loops.byKind.quiz_completed).toBe(1);
  });
});

describe('beta metrics: retention boundaries and local-day counting', () => {
  it('classifies the 1-7 and 8-14 windows exactly, with 14 in and 15 out', () => {
    process.env.TZ = 'UTC';
    const activatedDay = dayKey(new Date(2026, 0, 1, 12));
    const events = [0, 7, 8, 14, 15].map((offset) =>
      event(offset === 15 ? 'workspace_run' : 'quiz_completed', new Date(2026, 0, 1 + offset, 12))
    );

    const result = computeMetrics({
      events,
      profile: { activated_day: activatedDay },
      now: new Date(2026, 0, 15, 12),
    });

    expect(result.window.activeDayOffsets).toEqual([0, 7, 8, 14]);
    expect(result.retention.week1Active).toBe(true);
    expect(result.retention.week2Return).toBe(true);
    expect(result.retention.week2MeaningfulDays).toBe(2);
  });

  it('isolates week-1 and week-2 flags', () => {
    process.env.TZ = 'UTC';
    const activatedDay = dayKey(new Date(2026, 0, 1, 12));

    const week1 = computeMetrics({
      events: [event('quiz_completed', new Date(2026, 0, 8, 12))],
      profile: { activated_day: activatedDay },
    });
    expect(week1.retention).toMatchObject({ week1Active: true, week2Return: false });

    const week2 = computeMetrics({
      events: [event('quiz_completed', new Date(2026, 0, 9, 12))],
      profile: { activated_day: activatedDay },
    });
    expect(week2.retention).toMatchObject({ week1Active: false, week2Return: true });
  });

  it('counts distinct local days, not rows, in week 2', () => {
    process.env.TZ = 'Asia/Bangkok';
    const activatedDay = dayKey(new Date(2026, 0, 1, 6));
    const day = new Date(2026, 0, 9, 6);

    const result = computeMetrics({
      events: [
        event('quiz_completed', day, { id: 'a' }),
        event('recall_completed', day, { id: 'b' }),
      ],
      profile: { activated_day: activatedDay },
    });

    expect(result.retention.week2Return).toBe(true);
    expect(result.retention.week2MeaningfulDays).toBe(1);
  });

  it('clamps an event before activation to offset 0', () => {
    process.env.TZ = 'UTC';
    const activatedDay = dayKey(new Date(2026, 0, 10, 12));

    const result = computeMetrics({
      events: [event('quiz_completed', new Date(2026, 0, 5, 12))],
      profile: { activated_day: activatedDay },
    });

    expect(result.window.activeDayOffsets).toEqual([0]);
    expect(result.retention).toMatchObject({ week1Active: false, week2Return: false });
    expect(result.loops.byKind.quiz_completed).toBe(1);
  });

  it('derives firstEventKind from the earliest event, not the profile or row order', () => {
    process.env.TZ = 'UTC';
    const activatedDay = dayKey(new Date(2026, 0, 1, 12));
    const later = new Date(2026, 0, 3, 12);
    const earlier = new Date(2026, 0, 2, 12);

    const result = computeMetrics({
      events: [
        event('workspace_run', later, { id: 'later' }),
        event('recall_completed', earlier, { id: 'earlier' }),
      ],
      profile: { activated_day: activatedDay, first_event_kind: 'quiz_completed' },
    });

    expect(result.activation.firstEventKind).toBe('recall_completed');
  });

  it('breaks an identical created_at tie by the row id', () => {
    process.env.TZ = 'UTC';
    const activatedDay = dayKey(new Date(2026, 0, 1, 12));
    const at = new Date(2026, 0, 2, 12);

    const result = computeMetrics({
      events: [
        event('workspace_run', at, { id: 'row-b' }),
        event('quiz_completed', at, { id: 'row-a' }),
      ],
      profile: { activated_day: activatedDay },
    });

    expect(result.activation.firstEventKind).toBe('quiz_completed');
  });

  it('counts every kind all-time, including offset 0 and offset 15', () => {
    process.env.TZ = 'UTC';
    const activatedDay = dayKey(new Date(2026, 0, 1, 12));
    const kinds = [
      'quiz_completed',
      'recall_completed',
      'answer_sent_for_review',
      'workspace_run',
      'exercise_completed',
      'capstone_checkpoint',
    ];
    const events = kinds.map((kind, index) =>
      event(kind, new Date(2026, 0, 1 + (index === 5 ? 15 : 0), 12))
    );

    const result = computeMetrics({ events, profile: { activated_day: activatedDay } });

    expect(result.loops.byKind).toEqual(Object.fromEntries(kinds.map((kind) => [kind, 1])));
    expect(result.window.activeDayOffsets).toEqual([0]);
  });

  it('returns null for a malformed day instead of shifting it', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(dayOffset('2026-01-01', '2026-01-01')).toBe(0);
    expect(dayOffset('2026-02-31', '2026-01-01')).toBeNull();
    expect(dayOffset('01/01/2026', '2026-01-01')).toBeNull();
    expect(dayOffset('2026-01-01', null)).toBeNull();
  });
});

describe('beta metrics: DST transitions never skip or repeat a calendar day', () => {
  it('walks every local day across the spring-forward week', () => {
    process.env.TZ = 'America/Los_Angeles';
    const activatedDay = dayKey(new Date(2026, 2, 7, 12));
    const events = [1, 2, 3].map((offset) => event('quiz_completed', new Date(2026, 2, 7 + offset, 23, 30)));

    events.forEach((item, index) => {
      expect(dayOffset(item.day, activatedDay)).toBe(index + 1);
    });

    const result = computeMetrics({ events, profile: { activated_day: activatedDay } });
    expect(result.window.activeDayOffsets).toEqual([1, 2, 3]);
  });

  it('walks every local day across the fall-back week', () => {
    process.env.TZ = 'America/Los_Angeles';
    const activatedDay = dayKey(new Date(2026, 9, 31, 12));
    const events = [1, 2].map((offset) => event('recall_completed', new Date(2026, 9, 31 + offset, 23, 30)));

    const result = computeMetrics({ events, profile: { activated_day: activatedDay } });
    expect(result.window.activeDayOffsets).toEqual([1, 2]);
    expect(result.retention.week1Active).toBe(true);
  });
});
