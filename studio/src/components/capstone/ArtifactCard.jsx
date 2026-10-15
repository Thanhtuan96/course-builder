/**
 * ArtifactCard — "Your artifact" + its Definition of Done. Reused on the Course page, the capstone
 * page and NewCourse ("What you'll ship"). Copy is localised by the caller via `copy`.
 */
import { Card } from '../ui/Card.jsx';

export function ArtifactCard({ artifact, copy = {}, className = '' }) {
  if (!artifact) return null;
  const title = String(artifact.title || '').trim();
  const deliverable = String(artifact.deliverable || '').trim();
  const done = Array.isArray(artifact.definitionOfDone) ? artifact.definitionOfDone.filter(Boolean) : [];
  if (!title && !deliverable && !done.length) return null;

  return (
    <Card className={`border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/5 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
        {copy.yourArtifact || 'Your artifact'}
      </p>
      {title && <p className="mt-1 font-medium">{title}</p>}
      {deliverable && <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-200">{deliverable}</p>}
      {done.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium">{copy.definitionOfDone || 'Definition of Done'}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
            {done.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
