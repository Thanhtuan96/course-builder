/**
 * ReviewPanel (CAP-04) — the verdict, per-criterion statuses, test/evidence results and one next
 * action. The review never rewrites the learner's work; this component only presents it.
 *
 * Two review shapes are stored in the wild (Pitfall 9): the modern
 * `{ criteria: [{ key, label, status, question }] }` from the external review and the legacy
 * `{ verdict, criteria: [{ name, rating, feedback }] }` from earlier versions. `normalizeStoredReview`
 * maps the legacy `rating` onto `status`, so both render with the same badges.
 *
 * The verdict is an explicit prop: the page stores `computeCapstoneVerdict(...)` and passes it in, and
 * the review's own `verdict` is only a fallback for legacy rows (T-09-27). There is deliberately no
 * revise action here — the page renders the one primary revise callout (A2).
 */
import { Card } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { summarizeChecks, normalizeStoredReview } from '../../lib/capstone.js';
import { useT } from '../../lib/i18n/index.js';
import { EvidenceSummary } from './EvidenceSummary.jsx';

/** Tone per stored status. */
const STATUS_TONE = { met: 'success', partial: 'warning', not_met: 'neutral' };

function TestResults({ testResults }) {
  const t = useT();
  if (!testResults || !Array.isArray(testResults.checks) || !testResults.checks.length) return null;
  const summary = summarizeChecks(testResults.checks);
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t('capstone.automatedChecks')}</p>
        <Badge tone={summary.failed ? 'warning' : 'success'}>
          {t('capstone.passedOf', { passed: summary.passed, total: summary.total })}
        </Badge>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {testResults.checks.map((check, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden="true">{check.passed ? '✅' : '❌'}</span>
            <span className={check.passed ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-800 dark:text-neutral-100'}>
              {check.name}
              {check.message && !check.passed ? <span className="text-neutral-500"> — {check.message}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewPanel({ review, testResults = null, verdict = null }) {
  const t = useT();
  if (!review) return null;

  const normalized = normalizeStoredReview(review);
  const shownVerdict = verdict ?? normalized?.verdict ?? null;
  const complete = shownVerdict === 'course_complete';
  const criteria = Array.isArray(normalized?.criteria) ? normalized.criteria : [];
  const external = testResults?.source === 'external';

  // Literal translation calls, one per key, so `i18n-keys.test.js` still sees every rubric label.
  const RUBRIC_LABELS = {
    R1: () => t('playwrightTemplate.rubric.r1'),
    R2: () => t('playwrightTemplate.rubric.r2'),
    R3: () => t('playwrightTemplate.rubric.r3'),
    R4: () => t('playwrightTemplate.rubric.r4'),
    R5: () => t('playwrightTemplate.rubric.r5'),
    R6: () => t('playwrightTemplate.rubric.r6'),
    R7: () => t('playwrightTemplate.rubric.r7'),
  };

  const STATUS_LABELS = {
    met: () => t('externalEvidence.status.met'),
    partial: () => t('externalEvidence.status.partial'),
    not_met: () => t('externalEvidence.status.not_met'),
  };

  /**
   * Localized rubric label with a `label || name` fallback.
   *
   * `translate()` returns the key itself when it is missing, so `text !== key` is the real fallback
   * check rather than `||` alone (D-07).
   *
   * @param {object} criterion
   * @returns {string}
   */
  const rubricLabel = (criterion) => {
    const read = RUBRIC_LABELS[criterion?.key];
    const text = read ? read() : null;
    const key = `playwrightTemplate.rubric.${String(criterion?.key ?? '').toLowerCase()}`;
    return text && text !== key ? text : criterion?.label || criterion?.name || '';
  };

  /**
   * Localized status label, falling back to the raw stored value.
   * @param {unknown} status
   * @returns {string}
   */
  const statusLabel = (status) => {
    const read = STATUS_LABELS[status];
    return read ? read() : String(status ?? '');
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t('capstone.reviewTitle')}</h2>
        <Badge tone={complete ? 'success' : 'warning'}>
          {complete ? `🏆 ${t('capstone.verdictComplete')}` : `🔄 ${t('capstone.verdictNeedsWork')}`}
        </Badge>
      </div>

      {external ? <EvidenceSummary evidence={testResults} /> : <TestResults testResults={testResults} />}

      {Array.isArray(normalized?.strengths) && normalized.strengths.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t('capstone.strengths')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            {normalized.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-medium">{t('capstone.rubric')}</p>
        <ul className="mt-2 space-y-2">
          {criteria.map((criterion, i) => (
            <li key={`${String(criterion?.key ?? criterion?.name ?? '')}-${i}`} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{rubricLabel(criterion)}</p>
                <Badge tone={STATUS_TONE[criterion?.status] || 'neutral'}>
                  {statusLabel(criterion?.status)}
                </Badge>
              </div>
              {criterion?.question ? (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{criterion.question}</p>
              ) : null}
              {criterion?.feedback ? (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{criterion.feedback}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {normalized?.nextAction && (
        <div className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          {t('capstone.nextStep', { text: normalized.nextAction })}
        </div>
      )}
    </Card>
  );
}
