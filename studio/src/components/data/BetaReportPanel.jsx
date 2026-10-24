/**
 * BetaReportPanel — the learner-visible beta report export (INSTR-05, Phase 7 D-06/D-07/D-09/D-10).
 *
 * The report itself is Phase 5's frozen contract: `buildBetaReport` composes repository rows into a
 * strict, content-free schemaVersion 1 summary and `reportSchema` is the one validator Phase 10 will
 * reuse. This module only adds the four things Phase 5 deliberately left to its caller:
 *
 *   • `appVersion()`      — the build-injected app version, with a safe fallback outside Vite.
 *   • `providerCategory()` — a closed-enum category string, never a key, model name or URL.
 *   • `assembleCapstoneSummary()` — the capstone scalars, from the frozen repo read API.
 *   • `buildReportExport()` — the schema gate and the ONLY producer of downloadable bytes.
 *
 * Everything else composes: `buildBetaReportPayload` reads rows and hands them to `buildBetaReport`,
 * and `downloadReportPayload` is the single download seam, so the bytes written are exactly the
 * bytes the learner previewed.
 */
import { useState } from 'react';
import { buildBetaReport, reportSchema } from '../../lib/beta/report.js';
import { dayOffset } from '../../lib/beta/metrics.js';
import { dayKey } from '../../lib/course.js';
import {
  getAdapterInfo,
  getBetaProfile,
  getCapstone,
  listCapstoneSubmissions,
  listCourses,
  listEvents,
  listRevisionLinks,
} from '../../lib/repo/index.js';
import { download } from '../../lib/course-export.js';
import { Link } from '../../lib/router.js';
import { loadSettings } from '../../lib/settings.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { useT } from '../../lib/i18n/index.js';

/**
 * Build-time app version (D-03/D-04). The `typeof` guard is mandatory: the repository-root test
 * aggregate compiles Studio sources WITHOUT the Vite `define`, so a bare `__APP_VERSION__` would
 * throw `ReferenceError` in CI. `''` is schema-valid, so the report stays valid there.
 * @type {string}
 */
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';

/**
 * A local copy of report.js:13's closed provider enum (that file is frozen and not ours to export).
 * `providerCategory` validates against it so the schema can never reject the field.
 */
const PROVIDER_CATEGORY_RE =
  /^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$/;

/**
 * The app version for the report, never throwing and never truncating.
 * @param {unknown} [value]
 * @returns {string}
 */
export function appVersion(value = APP_VERSION) {
  return typeof value === 'string' ? value : '';
}

/**
 * Derive the report's provider category from ids only — never from a key, model or URL (D-08).
 * @param {object} [settings]
 * @returns {string|null} `bridge:<agent>` / `byok:<provider|preset>`, or null when unset/unknown
 */
export function providerCategory(settings = {}) {
  const provider = settings?.provider;
  let candidate = null;
  if (provider === 'bridge') candidate = `bridge:${settings?.bridge?.agent || 'claude'}`;
  else if (provider === 'openai') candidate = `byok:${settings?.openai?.preset || ''}`;
  else if (provider) candidate = `byok:${provider}`;
  return candidate && PROVIDER_CATEGORY_RE.test(candidate) ? candidate : null;
}

/**
 * Assemble the capstone scalars Phase 5 left to the caller (D-09).
 * Only four numbers/booleans/enums leave this function: course content, ids and URLs never do.
 * An out-of-enum stored verdict is coerced to null — otherwise `reportSchema` would reject every
 * future export for that learner with no way out.
 * @param {object[]} [courses] course rows from `listCourses()`
 * @returns {Promise<{ started: boolean, submissions: number, externalEvidence: number, verdict: string|null }>}
 */
export async function assembleCapstoneSummary(courses = []) {
  const summary = { started: false, submissions: 0, externalEvidence: 0, verdict: null };
  let latestAttempt = -1;
  for (const course of courses || []) {
    const capstone = await getCapstone(course.id);
    if (!capstone) continue;
    summary.started = true;
    for (const row of await listCapstoneSubmissions(capstone.id)) {
      summary.submissions += 1;
      if (row?.testResults?.source === 'external') summary.externalEvidence += 1;
      const attempt = Number(row?.attempt ?? 0);
      if (attempt >= latestAttempt) {
        latestAttempt = attempt;
        const verdict = row?.verdict;
        summary.verdict =
          verdict === 'course_complete' || verdict === 'needs_work' ? verdict : null;
      }
    }
  }
  return summary;
}

/**
 * The D-07 gate and the only producer of downloadable bytes: validate, then serialise.
 * @param {object} report a report candidate (usually `buildBetaReport(...)`)
 * @returns {{ report: object, json: string, filename: string }}
 * @throws {Error & { code: 'beta_report_invalid' }} when the candidate fails `reportSchema`
 */
export function buildReportExport(report) {
  const parsed = reportSchema.safeParse(report);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw Object.assign(new Error(`Beta report failed schema validation — ${detail}`), {
      code: 'beta_report_invalid',
    });
  }
  const data = parsed.data;
  return {
    report: data,
    json: JSON.stringify(data, null, 2),
    filename: `professor-beta-report-${String(data.participantId).slice(0, 8)}-d${
      data.generatedAtDayOffset
    }.json`,
  };
}

/**
 * Compose repository rows into a validated, downloadable payload. Counting, offsets and retention
 * are never re-implemented here — they come from Phase 5's `buildBetaReport`.
 * @param {{ now?: Date, settings?: object }} [options]
 * @returns {Promise<{ report: object, json: string, filename: string }>}
 */
export async function buildBetaReportPayload({ now = new Date(), settings = loadSettings() } = {}) {
  const [events, profile, revisionLinks, adapter, courses] = await Promise.all([
    listEvents(),
    getBetaProfile(),
    listRevisionLinks(),
    getAdapterInfo(),
    listCourses(),
  ]);
  const capstone = await assembleCapstoneSummary(courses);
  return buildReportExport(
    buildBetaReport({
      events,
      profile,
      revisionLinks,
      now,
      app: {
        version: appVersion(),
        storage: adapter?.kind ?? 'memory',
        provider: providerCategory(settings),
      },
      capstone,
    })
  );
}

/**
 * THE single download seam. Nothing else in the beta-report feature may trigger a download.
 * The payload is never rebuilt here: the bytes written are the bytes the caller holds (D-06).
 *
 * This is also the one place the `exported` nudge marker is recorded (D-13): the preview's Download
 * control reaches this function through `createDownloadHandler`, so the learner-visible path and any
 * programmatic export share the marker by construction. Offsets 7 and 14 are the only ones the Home
 * banner checks, so a marker written on any other day is inert — and no repository row or learning
 * event is ever written here.
 * @param {{ report: object, json: string, filename: string }} payload
 * @returns {{ report: object, json: string, filename: string }} the same payload
 */
export function downloadReportPayload(payload) {
  download(payload.filename, payload.json, 'application/json');
  writeNudgeMarker('exported', payload?.report?.generatedAtDayOffset);
  return payload;
}

/**
 * Wrap a payload into the exact callable the preview's Download control receives.
 * @param {{ report: object, json: string, filename: string }} payload
 * @returns {() => { report: object, json: string, filename: string }}
 */
export function createDownloadHandler(payload) {
  return () => downloadReportPayload(payload);
}

/**
 * Presentational, SSR-safe preview of the exact bytes that will be saved (D-06).
 * The JSON is a React text child inside `<pre><code>` — never HTML, so no stored data can become
 * markup. The Download control only exists when a validated payload was passed in, which is D-07's
 * "never write a partial file" by construction.
 * @param {{ payload?: { report: object, json: string, filename: string }|null, onDownload?: () => void, busy?: boolean, error?: unknown }} props
 */
export function BetaReportPreview({ payload, onDownload, busy = false, error = null }) {
  const t = useT();

  if (error) {
    const invalid = error?.code === 'beta_report_invalid';
    return (
      <p role="status" className="text-sm text-red-600 dark:text-red-400">
        {t('betaReport.error')} {invalid ? t('betaReport.invalid') : ''}
      </p>
    );
  }
  if (!payload) return null;

  const { report, json, filename } = payload;
  const yesNo = (value) => (value ? t('betaReport.values.yes') : t('betaReport.values.no'));
  const offsets = report.window.activeDayOffsets || [];
  const revisions = report.loops.revisions;
  const revisionsTotal = (revisions?.explicit ?? 0) + (revisions?.inferred ?? 0);
  const capstone = report.capstone;
  const capstoneStarted = capstone.started
    ? t('betaReport.values.started')
    : t('betaReport.values.notStarted');
  const capstoneVerdict =
    capstone.verdict === 'course_complete'
      ? t('betaReport.values.courseComplete')
      : capstone.verdict === 'needs_work'
        ? t('betaReport.values.needsWork')
        : t('betaReport.values.none');

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{t('betaReport.summaryTitle')}</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-neutral-500">{t('betaReport.summary.activation')}</dt>
          <dd>
            {report.activation.activated
              ? t('betaReport.values.activated')
              : t('betaReport.values.notActivated')}
          </dd>

          <dt className="text-neutral-500">{t('betaReport.summary.window')}</dt>
          <dd>{offsets.length ? offsets.join(', ') : t('betaReport.values.none')}</dd>

          <dt className="text-neutral-500">{t('betaReport.summary.loops')}</dt>
          <dd>
            <ul className="space-y-0.5">
              {Object.entries(report.loops.byKind || {}).map(([kind, count]) => (
                <li key={kind}>
                  {t(`betaReport.kinds.${kind}`)}: {count}
                </li>
              ))}
            </ul>
          </dd>

          <dt className="text-neutral-500">{t('betaReport.summary.revisions')}</dt>
          <dd>{revisionsTotal}</dd>

          <dt className="text-neutral-500">{t('betaReport.summary.retention')}</dt>
          <dd>
            {t('betaReport.values.week1')} {yesNo(report.retention.week1Active)} ·{' '}
            {t('betaReport.values.week2')} {yesNo(report.retention.week2Return)}
          </dd>

          <dt className="text-neutral-500">{t('betaReport.summary.capstone')}</dt>
          <dd>
            {capstoneStarted} · {capstone.submissions} · {capstone.externalEvidence} ·{' '}
            {capstoneVerdict}
          </dd>

          <dt className="text-neutral-500">{t('betaReport.summary.version')}</dt>
          <dd>{report.app.version || '—'}</dd>

          <dt className="text-neutral-500">{t('betaReport.summary.storage')}</dt>
          <dd>{t(`betaReport.storage.${report.app.storage}`)}</dd>
        </dl>
      </div>

      <p className="text-xs text-neutral-500">{t('betaReport.everythingInFile')}</p>

      <pre className="max-h-80 overflow-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800">
        <code>{json}</code>
      </pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onDownload} disabled={busy}>
          {t('betaReport.download')}
        </Button>
        <span className="text-xs text-neutral-500">{filename}</span>
      </div>
    </div>
  );
}

/**
 * The Home reminder for one checkpoint (D-11/D-12): a non-blocking inline banner, never a modal.
 *
 * It mirrors `Layout`'s durability banner — same amber palette, same plain dismiss button, no `role`,
 * no focus management and no navigation of its own. The action is a real `Link`, so middle-click and
 * copy-link keep working; it points at `/settings?report=1`, which `matchRoute` resolves to the
 * settings route (the query is stripped before matching).
 * @param {{ checkpoint: 7|14, onDismiss?: () => void }} props
 */
export function BetaReportNudge({ checkpoint, onDismiss }) {
  const t = useT();

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-start justify-between gap-3">
        <span>
          {checkpoint === 7 ? t('betaReport.nudge.day7') : t('betaReport.nudge.day14')}{' '}
          <Link to="/settings?report=1" className="underline">
            {t('betaReport.nudge.action')}
          </Link>
          .
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs opacity-70 hover:opacity-100"
        >
          {t('betaReport.nudge.dismiss')}
        </button>
      </div>
    </div>
  );
}

/**
 * The Settings ▸ Data export card. Nothing is read from the repository until the learner clicks:
 * the closed state is a single button, so importing this module and rendering it in Node stay free
 * of async work.
 */
export function BetaReportPanel() {
  const t = useT();
  const [payload, setPayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const onBuild = async () => {
    setBusy(true);
    setError(null);
    try {
      setPayload(await buildBetaReportPayload());
    } catch (err) {
      setPayload(null);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="beta-report" className="space-y-4">
      <div>
        <p className="font-medium">{t('betaReport.title')}</p>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {t('betaReport.subtitle')}
        </p>
      </div>

      {!payload && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onBuild} disabled={busy}>
            {t('betaReport.open')}
          </Button>
          {busy && <span className="text-xs text-neutral-500">{t('betaReport.building')}</span>}
        </div>
      )}

      {payload && (
        <BetaReportPreview
          payload={payload}
          onDownload={createDownloadHandler(payload)}
          busy={busy}
          error={error}
        />
      )}
      {!payload && error && <BetaReportPreview error={error} busy={busy} />}
    </Card>
  );
}

/* ------------------------------------------------------------------ day-7 / day-14 nudge (INSTR-06)

The reminder is deliberately tiny and storage-only (D-11..D-14): two local calendar checkpoints, two
localStorage marker kinds, and no repository write of any sort. Everything below is a plain function so
the Node test harness can drive it without a DOM, a clock stub or a global.

----------------------------------------------------------------------------------------------- */

/** The only activation day offsets that ever show the reminder (D-11). */
export const NUDGE_CHECKPOINTS = Object.freeze([7, 14]);

/** The two marker kinds: dismissing a checkpoint vs. exporting on it (D-13). */
const MARKER_KINDS = Object.freeze(['dismissed', 'exported']);

const MARKER_PREFIX = 'professor-studio:beta-report';

/**
 * The per-checkpoint, per-kind localStorage key. Distinct keys are what make "dismissing day 7 never
 * suppresses day 14" true by construction.
 * @param {'dismissed'|'exported'} kind
 * @param {number} offset
 * @returns {string}
 */
export function markerKey(kind, offset) {
  return `${MARKER_PREFIX}-${kind}:${offset}`;
}

/**
 * The browser storage object, or `undefined` where there is none (Node, SSR, a hostile environment).
 * Never called at module scope: touching `localStorage` at import time warns in every Node test worker.
 * @returns {Storage|undefined}
 */
export function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Read both marker kinds for every checkpoint. A missing, corrupt or throwing storage yields empty
 * arrays — a tampered marker can only ever hide a reminder, never break the page (T-07-09).
 * @param {{ getItem?: (key: string) => string|null }|undefined} [storage]
 * @returns {{ dismissed: number[], exported: number[] }}
 */
export function readNudgeMarkers(storage = safeStorage()) {
  const markers = { dismissed: [], exported: [] };
  for (const kind of MARKER_KINDS) {
    for (const offset of NUDGE_CHECKPOINTS) {
      let value;
      try {
        value = storage?.getItem?.(markerKey(kind, offset));
      } catch {
        value = null;
      }
      if (value === '1') markers[kind].push(offset);
    }
  }
  return markers;
}

/**
 * Persist one marker. Swallows a missing storage and a quota/throwing `setItem`.
 * @param {'dismissed'|'exported'} kind
 * @param {number} offset
 * @param {{ setItem?: (key: string, value: string) => void }|undefined} [storage]
 * @returns {boolean} true only when the write was attempted and did not throw
 */
export function writeNudgeMarker(kind, offset, storage = safeStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(markerKey(kind, offset), '1');
    return true;
  } catch {
    return false;
  }
}

/**
 * The learner's local calendar-day offset from activation, or null when there is no valid activation
 * day. The day math is never re-implemented: `dayOffset` clamps a pre-activation clock to 0, so a
 * skewed clock can never produce a negative offset (and never a banner).
 * @param {{ activated_day?: string|null }|null} [profile]
 * @param {Date} [now]
 * @returns {number|null}
 */
export function activationOffset(profile, now = new Date()) {
  const activatedDay = profile?.activated_day;
  if (typeof activatedDay !== 'string' || !activatedDay) return null;
  return dayOffset(dayKey(now), activatedDay);
}

/**
 * Which checkpoint, if any, Home should show right now.
 * @param {{ offset?: number|null, dismissed?: number[], exported?: number[] }} [state]
 * @returns {7|14|null}
 */
export function nudgeVisible({ offset, dismissed = [], exported = [] } = {}) {
  if (!NUDGE_CHECKPOINTS.includes(offset)) return null;
  if (dismissed.includes(offset) || exported.includes(offset)) return null;
  return offset;
}
