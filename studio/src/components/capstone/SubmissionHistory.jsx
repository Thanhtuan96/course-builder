/**
 * SubmissionHistory (CAP-03) — every attempt with its verdict, the self-reported evidence it came
 * with, and what changed in the rubric since the previous attempt. Nothing is ever overwritten, so
 * the learner can see their whole trajectory.
 *
 * External attempts (`testResults.source === 'external'`) render the compact `EvidenceSummary` block;
 * in-app attempts keep the verdict-only row they had before. The diff walks the chronologically
 * preceding attempt, which is the next item in the newest-first display order.
 *
 * Every stored value is a React text child — an attempt title, spec path or criterion label from an
 * older submission is untrusted data (T-09-26).
 */
import { Card } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { useT } from '../../lib/i18n/index.js';
import { EvidenceSummary } from './EvidenceSummary.jsx';
import { AttemptDiff } from './AttemptDiff.jsx';

/**
 * Human date for an attempt; falls back to the ISO date when `toLocaleString` cannot format it.
 *
 * @param {unknown} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso).slice(0, 16);
  }
}

/**
 * Literal-key copy for a stored verdict: tone plus label. A row with no verdict is neutral and says
 * so — it is never shown as "needs work" before a review exists.
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string|null} verdict
 * @returns {{ tone: string, text: string }}
 */
function verdictCopy(t, verdict) {
  if (verdict === 'course_complete') {
    return { tone: 'success', text: t('capstone.verdictComplete') };
  }
  if (verdict === 'needs_work') {
    return { tone: 'warning', text: t('capstone.verdictNeedsWork') };
  }
  return { tone: 'neutral', text: t('capstone.noVerdict') };
}

/**
 * One attempt row: attempt number, date, verdict, evidence (external only) and the diff.
 *
 * @param {object} props
 * @param {object} props.submission a decoded `capstone_submissions` row
 * @param {object|null} props.previous the chronologically preceding submission (or null)
 * @returns {import('react').ReactElement}
 */
function AttemptRow({ submission, previous = null }) {
  const t = useT();
  const verdict = verdictCopy(t, submission.verdict);
  const external = submission.testResults?.source === 'external';

  return (
    <li className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{t('capstone.attemptN', { n: submission.attempt })}</p>
          <p className="text-xs text-neutral-500">{formatDate(submission.created_at)}</p>
        </div>
        <Badge tone={verdict.tone}>{verdict.text}</Badge>
      </div>

      {external && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-neutral-500">{t('externalEvidence.historyEvidence')}</p>
          <EvidenceSummary evidence={submission.testResults} compact />
        </div>
      )}

      <AttemptDiff previous={previous?.review ?? null} current={submission.review} />
    </li>
  );
}

/**
 * The whole attempt trajectory, newest attempt first.
 *
 * @param {object} props
 * @param {object[]} [props.submissions] decoded submissions, oldest attempt first (repo order)
 * @returns {import('react').ReactElement|null} null when there is no attempt
 */
export function SubmissionHistory({ submissions = [] }) {
  const t = useT();
  if (!submissions.length) return null;

  // Newest-first display order; the preceding attempt is therefore the next item.
  const ordered = [...submissions].reverse();
  const hasExternal = ordered.some((submission) => submission.testResults?.source === 'external');

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">
        {hasExternal ? t('externalEvidence.historyTitle') : t('capstone.attempts')} · {submissions.length}
      </h2>
      <ul className="space-y-2">
        {ordered.map((submission, index) => (
          <AttemptRow key={submission.id} submission={submission} previous={ordered[index + 1] || null} />
        ))}
      </ul>
    </Card>
  );
}
