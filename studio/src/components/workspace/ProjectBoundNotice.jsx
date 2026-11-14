/**
 * Shown instead of a run when the exercise cannot run inside Studio.
 *
 * Two cases: a project the learner has to run themselves (Spring Boot, Gradle, npm script…) and a
 * written exercise with nothing to execute. Both replace the raw runner error the learner used to
 * get, and both name the command when the file or lecture gave one.
 */
import { useT } from '../../lib/i18n/index.js';

/** @param {{ command?: string|null, reason?: string|null }} props */
export function ProjectBoundNotice({ command = null, reason = null }) {
  const t = useT();
  const written = reason === 'no-runner';
  return (
    <div className="space-y-1 rounded-lg border border-indigo-300 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
      <p className="font-medium">
        {written ? t('workspace.notRunnableTitle') : t('workspace.projectBoundTitle')}
      </p>
      <p>{written ? t('workspace.notRunnableBody') : command ? t('workspace.projectBoundCommand', { command }) : t('workspace.projectBoundFallback')}</p>
    </div>
  );
}
