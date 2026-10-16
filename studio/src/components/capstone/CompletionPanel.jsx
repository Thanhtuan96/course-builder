/**
 * CompletionPanel (CAP-05) — shown once a submission earns the Course Complete verdict. Shows the
 * artifact, when it was completed, how many attempts it took and a rubric summary, and offers the
 * plugin-compatible COMPLETION.md export so the result is portfolio-ready.
 */
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { artifactLabel } from '../../lib/capstone.js';
import { useT } from '../../lib/i18n/index.js';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

const RATING_TONE = { solid: 'success', partial: 'warning', missing: 'neutral' };

export function CompletionPanel({ course, capstone, submission, attempts = 0, onExport, exporting = false }) {
  const t = useT();
  if (!submission) return null;
  const artifact = capstone?.artifact || null;
  const criteria = Array.isArray(submission.review?.criteria) ? submission.review.criteria : [];

  return (
    <Card className="space-y-4 border-green-200 bg-green-50/60 dark:border-green-500/30 dark:bg-green-500/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">🎓 {t('capstone.completion')}: {course?.title}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {t('capstone.completedOn', {
              date: formatDate(submission.created_at),
              count: attempts,
              attemptWord: t('common.attempt', { count: attempts }),
            })}
          </p>
        </div>
        <Badge tone="success">{t('capstone.verdictComplete')}</Badge>
      </div>

      {artifact && (
        <p className="text-sm">
          <span className="font-medium">{t('capstone.yourArtifact')}: </span>
          {artifactLabel(artifact)}
          {submission.repo_url ? (
            <>
              {' · '}
              <a className="underline" href={submission.repo_url} target="_blank" rel="noreferrer">
                {t('capstone.link')}
              </a>
            </>
          ) : null}
        </p>
      )}

      {criteria.length > 0 && (
        <div>
          <p className="text-sm font-medium">{t('capstone.rubric')}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {criteria.map((c, i) => (
              <li key={i}>
                <Badge tone={RATING_TONE[c.rating] || 'neutral'}>
                  {c.name}: {c.rating}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-neutral-700 dark:text-neutral-200">{t('capstone.builtYourself')}</p>

      <div>
        <Button onClick={onExport} disabled={exporting}>
          {exporting ? t('capstone.exporting') : t('capstone.exportCompletion')}
        </Button>
      </div>
    </Card>
  );
}
