/**
 * SubmissionHistory (CAP-03) — every attempt with its verdict. Nothing is ever overwritten, so the
 * learner can see their whole trajectory.
 */
import { Card } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { verdictLabel } from '../../lib/capstone.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso).slice(0, 16);
  }
}

export function SubmissionHistory({ submissions = [], copy = {} }) {
  if (!submissions.length) return null;
  const ordered = [...submissions].reverse();
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">
        {copy.attempts || 'Attempts'} · {submissions.length}
      </h2>
      <ul className="space-y-2">
        {ordered.map((submission) => {
          const complete = submission.verdict === 'course_complete';
          return (
            <li
              key={submission.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <div className="min-w-0">
                <p className="font-medium">Attempt {submission.attempt}</p>
                <p className="text-xs text-neutral-500">{formatDate(submission.created_at)}</p>
              </div>
              <Badge tone={complete ? 'success' : submission.verdict ? 'warning' : 'neutral'}>
                {submission.verdict ? verdictLabel(submission.verdict) : 'No verdict'}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
