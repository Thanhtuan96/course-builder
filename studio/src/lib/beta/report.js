/**
 * Beta report schema v1 and builder (D-11).
 *
 * The report is a strict, content-free summary: counts, local-day offsets and category strings
 * only. It never carries course text, prompts, code, answers, keys, provider URLs, model names,
 * repository ids or free-form meta. `buildBetaReport` returns `reportSchema.parse(...)` so the
 * producer and the Phase 10 validator share one contract.
 */
import { z } from 'zod';
import { EVENT_KINDS } from '../repo/events.js';
import { computeMetrics } from './metrics.js';

const PROVIDER_CATEGORY = /^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$/;

const byKind = z.strictObject(
  Object.fromEntries(EVENT_KINDS.map((kind) => [kind, z.number().int().nonnegative()]))
);

const revisionCount = z.number().int().nonnegative();

/**
 * Frozen schemaVersion 1 report shape (D-11). Every object is strict (P10).
 */
export const reportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  participantId: z.uuid(),
  generatedAtDayOffset: z.number().int().nonnegative(),
  app: z.strictObject({
    version: z.string().max(32),
    storage: z.enum(['indexeddb', 'sqlite', 'memory', 'remote']),
    provider: z.union([z.null(), z.string().regex(PROVIDER_CATEGORY)]),
  }),
  activation: z.strictObject({
    activated: z.boolean(),
    firstEventKind: z.union([z.null(), z.enum(EVENT_KINDS)]),
  }),
  window: z.strictObject({
    activeDayOffsets: z.array(z.number().int().min(0).max(14)),
  }),
  loops: z.strictObject({
    byKind,
    revisions: z.strictObject({
      quiz: revisionCount,
      tutor: revisionCount,
      workspace: revisionCount,
      capstone: revisionCount,
      explicit: revisionCount,
      inferred: revisionCount,
    }),
  }),
  retention: z.strictObject({
    week1Active: z.boolean(),
    week2Return: z.boolean(),
    week2MeaningfulDays: z.number().int().nonnegative(),
  }),
  capstone: z.strictObject({
    started: z.boolean(),
    submissions: z.number().int().nonnegative(),
    externalEvidence: z.number().int().nonnegative(),
    verdict: z.union([z.null(), z.enum(['course_complete', 'needs_work'])]),
  }),
});

/**
 * Count revision links by surface and link kind, all-time (D-11).
 * @param {object[]} revisionLinks
 * @returns {{ quiz: number, tutor: number, workspace: number, capstone: number, explicit: number, inferred: number }}
 */
function countRevisions(revisionLinks = []) {
  const counts = { quiz: 0, tutor: 0, workspace: 0, capstone: 0, explicit: 0, inferred: 0 };
  for (const link of revisionLinks || []) {
    if (!link || link.deleted_at) continue;
    const surface = link.surface;
    if (surface in counts) counts[surface] += 1;
    if (link.link_kind === 'explicit' || link.link_kind === 'inferred') {
      counts[link.link_kind] += 1;
    }
  }
  return counts;
}

/**
 * Build a content-free beta report from rows plus injected summaries.
 * @param {{ events?: object[], profile?: object|null, revisionLinks?: object[], now?: Date, app?: object, capstone?: object }} [input]
 * @returns {object} reportSchema-parsed schemaVersion 1 report
 */
export function buildBetaReport({
  events = [],
  profile = null,
  revisionLinks = [],
  now = new Date(),
  app = { version: '', storage: 'memory', provider: null },
  capstone = { started: false, submissions: 0, externalEvidence: 0, verdict: null },
} = {}) {
  if (!profile || profile.participant_id == null) {
    throw new Error('A beta profile with participant_id is required to build a report');
  }

  const metrics = computeMetrics({ events, profile, now });
  const candidate = {
    schemaVersion: 1,
    participantId: profile.participant_id,
    generatedAtDayOffset: metrics.generatedAtDayOffset,
    app: {
      version: app?.version ?? '',
      storage: app?.storage ?? 'memory',
      provider: app?.provider ?? null,
    },
    activation: {
      activated: metrics.activation.activated,
      firstEventKind: metrics.activation.firstEventKind,
    },
    window: {
      activeDayOffsets: metrics.window.activeDayOffsets,
    },
    loops: {
      byKind: metrics.loops.byKind,
      revisions: countRevisions(revisionLinks),
    },
    retention: {
      week1Active: metrics.retention.week1Active,
      week2Return: metrics.retention.week2Return,
      week2MeaningfulDays: metrics.retention.week2MeaningfulDays,
    },
    capstone: {
      started: capstone?.started ?? false,
      submissions: capstone?.submissions ?? 0,
      externalEvidence: capstone?.externalEvidence ?? 0,
      verdict: capstone?.verdict ?? null,
    },
  };

  return reportSchema.parse(candidate);
}
