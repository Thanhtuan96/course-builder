/**
 * CapstoneCard (CAP-02) — the Course-page card. Locked with lesson progress until every lesson is
 * done, then "Start capstone" (or, for courses created before this phase, a one-off "Generate
 * capstone" action owned by the Course page).
 */
import { Link } from '../../lib/router.js';
import { capstoneProgress, capstoneUnlocked, artifactLabel } from '../../lib/capstone.js';
import { useT } from '../../lib/i18n/index.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Progress } from '../ui/Progress.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';

export function CapstoneCard({ course, capstone, generating = false, error = null, onGenerate, onDismissError }) {
  const t = useT();
  const unlocked = capstoneUnlocked(course);
  const progress = capstoneProgress(course);
  const artifact = artifactLabel(capstone?.artifact);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{t('capstone.cardTitle')}</h2>
          {unlocked ? <Badge tone="success">{t('capstone.unlocked')}</Badge> : <Badge tone="neutral">{t('capstone.locked')}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {capstone && unlocked && (
            <Link to={`/course/${course.id}/capstone`}>
              <Button size="sm">{t('capstone.start')}</Button>
            </Link>
          )}
          {!capstone && unlocked && (
            <Button size="sm" onClick={onGenerate} disabled={generating}>
              {generating ? t('capstone.generating') : t('capstone.generate')}
            </Button>
          )}
        </div>
      </div>

      {artifact && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          <span className="font-medium">{t('capstone.yourArtifact')}:</span> {artifact}
        </p>
      )}

      {!unlocked && (
        <div className="space-y-1">
          <Progress value={progress.pct} label={t('common.lessonsDoneShort', { done: progress.done, total: progress.total })} />
          <p className="text-xs text-neutral-500">
            {t('common.lessonsDone', { done: progress.done, total: progress.total })} — {t('capstone.lockedHint')}
          </p>
        </div>
      )}

      {!capstone && !unlocked && <p className="text-sm text-neutral-500">{t('capstone.readAnyway')}</p>}

      {error && <ErrorNotice error={error} onDismiss={onDismissError} />}
    </Card>
  );
}
