/**
 * Run history drawer (CODE-05) — every Run/Check is stored with a code snapshot + result, so the
 * learner can look back (and restore) even after editing. Snapshots ride in the run result's
 * `checks_json` payload (see lib/runner/history.js) since the Phase 22 schema has no code column.
 */
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';

/** @param {string} iso */
function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HistoryDrawer({ runs, onRestore, onClose }) {
  const ordered = [...(runs || [])].reverse();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Run history</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {!ordered.length && <p className="text-sm text-neutral-500">No runs yet. Every Run and Check is saved here.</p>}
      <ul className="space-y-2">
        {ordered.map((run) => {
          const checkCount = run.checks?.length || 0;
          const passed = run.checks?.filter((c) => c.passed).length || 0;
          return (
            <li key={run.id} className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={run.runner === 'local' ? 'accent' : 'neutral'}>{run.runner === 'local' ? 'Local' : 'Browser'}</Badge>
                {typeof run.exitCode === 'number' && <Badge tone={run.exitCode === 0 ? 'success' : 'warning'}>exit {run.exitCode}</Badge>}
                {checkCount > 0 && (
                  <Badge tone={passed === checkCount ? 'success' : 'warning'}>
                    {passed}/{checkCount} checks
                  </Badge>
                )}
                <span className="text-xs text-neutral-500">{formatTime(run.createdAt)}</span>
                <span className="ml-auto flex items-center gap-2">
                  {run.hash && <code className="text-xs text-neutral-400">{run.hash}</code>}
                  {run.snapshot && (
                    <Button variant="secondary" size="sm" onClick={() => onRestore(run)}>
                      Restore
                    </Button>
                  )}
                </span>
              </div>
              {run.stdout ? <pre className="mt-2 max-h-24 overflow-auto font-mono text-xs text-neutral-600 dark:text-neutral-300">{run.stdout.slice(0, 400)}</pre> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
