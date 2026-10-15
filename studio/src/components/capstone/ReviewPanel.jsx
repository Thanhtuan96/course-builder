/**
 * ReviewPanel (CAP-04) — the verdict, per-criterion feedback, test results and one next action.
 * The review never rewrites the learner's work; this component only presents it.
 */
import { Card } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { summarizeChecks } from '../../lib/capstone.js';

const RATING_TONE = { solid: 'success', partial: 'warning', missing: 'neutral' };
const RATING_LABEL = { solid: 'Solid', partial: 'Partial', missing: 'Missing' };

function TestResults({ testResults }) {
  if (!testResults || !Array.isArray(testResults.checks) || !testResults.checks.length) return null;
  const summary = summarizeChecks(testResults.checks);
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Automated checks</p>
        <Badge tone={summary.failed ? 'warning' : 'success'}>
          {summary.passed}/{summary.total} passed
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

export function ReviewPanel({ review, testResults = null, copy = {} }) {
  if (!review) return null;
  const complete = review.verdict === 'course_complete';
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{copy.reviewTitle || 'Review'}</h2>
        <Badge tone={complete ? 'success' : 'warning'}>
          {complete ? `🏆 ${copy.verdictComplete || 'Course Complete'}` : `🔄 ${copy.verdictNeedsWork || 'Needs work'}`}
        </Badge>
      </div>

      <TestResults testResults={testResults} />

      {Array.isArray(review.strengths) && review.strengths.length > 0 && (
        <div>
          <p className="text-sm font-medium">Strengths</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            {review.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-medium">{copy.rubric || 'Rubric'}</p>
        <ul className="mt-2 space-y-2">
          {(review.criteria || []).map((criterion, i) => (
            <li key={i} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{criterion.name}</p>
                <Badge tone={RATING_TONE[criterion.rating] || 'neutral'}>
                  {RATING_LABEL[criterion.rating] || criterion.rating}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{criterion.feedback}</p>
            </li>
          ))}
        </ul>
      </div>

      {review.nextAction && (
        <div className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <span className="font-medium">Next step: </span>
          {review.nextAction}
        </div>
      )}
    </Card>
  );
}
