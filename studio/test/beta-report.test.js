import { describe, it, expect } from 'vitest';
import { buildBetaReport, reportSchema } from '../src/lib/beta/report.js';

function profile(activatedDay = '2026-01-01') {
  return { participant_id: crypto.randomUUID(), activated_day: activatedDay };
}

function base(overrides = {}) {
  return buildBetaReport({
    events: [
      {
        id: 'event-1',
        kind: 'quiz_completed',
        day: '2026-01-02',
        created_at: '2026-01-02T12:00:00.000Z',
      },
    ],
    profile: profile(),
    revisionLinks: [],
    now: new Date(2026, 0, 20, 12),
    app: { version: '0.1.0', storage: 'memory', provider: 'byok:openai' },
    capstone: { started: true, submissions: 2, externalEvidence: 1, verdict: 'needs_work' },
    ...overrides,
  });
}

function issueCodes(result) {
  const codes = [];
  const walk = (issues) => {
    for (const issue of issues || []) {
      codes.push(issue.code);
      if (issue.issues) walk(issue.issues);
      for (const group of issue.errors || []) walk(group);
    }
  };
  walk(result.error.issues);
  return codes;
}

describe('beta report schema v1', () => {
  it('parses the builder output and pins schemaVersion 1', () => {
    const report = base();
    const parsed = reportSchema.safeParse(report);

    expect(parsed.success).toBe(true);
    expect(report.schemaVersion).toBe(1);
    expect(report.participantId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(report.window.activeDayOffsets).toEqual([1]);
  });

  it('rejects an unknown top-level key instead of stripping it', () => {
    const result = reportSchema.safeParse({ ...base(), extraKey: 'nope' });

    expect(result.success).toBe(false);
    expect(issueCodes(result)).toContain('unrecognized_keys');
  });

  it('rejects unknown keys inside app, loops.byKind, retention and capstone', () => {
    const report = base();
    const nested = [
      { ...report, app: { ...report.app, apiKey: 'sk-live-nope' } },
      { ...report, loops: { ...report.loops, byKind: { ...report.loops.byKind, lesson_completed: 1 } } },
      { ...report, retention: { ...report.retention, streak: 4 } },
      { ...report, capstone: { ...report.capstone, notes: 'free text' } },
    ];

    for (const candidate of nested) {
      const result = reportSchema.safeParse(candidate);
      expect(result.success).toBe(false);
      expect(issueCodes(result)).toContain('unrecognized_keys');
    }
  });

  it('rejects unknown keys inside activation, window, loops and loops.revisions', () => {
    const report = base();
    const nested = [
      { ...report, activation: { ...report.activation, activatedAt: '2026-01-01' } },
      { ...report, window: { ...report.window, firstDay: '2026-01-01' } },
      { ...report, loops: { ...report.loops, total: 3 } },
      { ...report, loops: { ...report.loops, revisions: { ...report.loops.revisions, stale: 1 } } },
    ];

    for (const candidate of nested) {
      const result = reportSchema.safeParse(candidate);
      expect(result.success).toBe(false);
      expect(issueCodes(result)).toContain('unrecognized_keys');
    }
  });

  it('requires all six byKind keys', () => {
    const report = base();
    delete report.loops.byKind.quiz_completed;

    const result = reportSchema.safeParse(report);

    expect(result.success).toBe(false);
    expect(result.error.issues.some((issue) => issue.path.includes('quiz_completed'))).toBe(true);
  });

  it('rejects a wrong verdict, provider category and schema version', () => {
    const badVerdict = reportSchema.safeParse({
      ...base(),
      capstone: { ...base().capstone, verdict: 'great' },
    });
    expect(badVerdict.success).toBe(false);
    expect(issueCodes(badVerdict)).toContain('invalid_value');

    const badProvider = reportSchema.safeParse({
      ...base(),
      app: { ...base().app, provider: 'byok:unknown' },
    });
    expect(badProvider.success).toBe(false);
    expect(issueCodes(badProvider)).toContain('invalid_format');

    const badVersion = reportSchema.safeParse({ ...base(), schemaVersion: 2 });
    expect(badVersion.success).toBe(false);
    expect(issueCodes(badVersion)).toContain('invalid_value');
  });

  it('counts revisions by surface and link kind, ignoring deleted rows', () => {
    const report = base({
      revisionLinks: [
        { surface: 'quiz', link_kind: 'explicit' },
        { surface: 'tutor', link_kind: 'inferred' },
        { surface: 'workspace', link_kind: 'explicit' },
        { surface: 'capstone', link_kind: 'inferred' },
        { surface: 'quiz', link_kind: 'explicit', deleted_at: '2026-01-03T00:00:00.000Z' },
      ],
    });

    expect(report.loops.revisions).toEqual({
      quiz: 1,
      tutor: 1,
      workspace: 1,
      capstone: 1,
      explicit: 2,
      inferred: 2,
    });
  });

  it('only forwards allowlisted app and capstone category fields', () => {
    const report = base({
      app: {
        version: '0.1.0',
        storage: 'sqlite',
        provider: 'bridge:claude',
        baseUrl: 'https://example.test/v1',
        model: 'secret-model',
      },
      capstone: {
        started: true,
        submissions: 1,
        externalEvidence: 0,
        verdict: 'course_complete',
        notes: 'secret notes',
      },
    });

    expect(report.app).toEqual({ version: '0.1.0', storage: 'sqlite', provider: 'bridge:claude' });
    expect(report.capstone).toEqual({
      started: true,
      submissions: 1,
      externalEvidence: 0,
      verdict: 'course_complete',
    });
    expect(JSON.stringify(report)).not.toContain('example.test');
    expect(JSON.stringify(report)).not.toContain('secret-model');
  });

  it('requires a profile with a participant id', () => {
    expect(() => buildBetaReport({ events: [], profile: null })).toThrow(/participant_id/);
  });
});
