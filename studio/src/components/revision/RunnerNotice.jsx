/**
 * RunnerNotice / RunnerBadge — the honest answer to "where does my code run?" (LOOP-04, D-12,
 * D-13).
 *
 * `RunnerBadge` is the only badge copy for a runner: `Browser` or `Local machine`, never the old
 * "Local server" key. `RunnerNotice` renders the badge plus, for a local runner only, the
 * "Code runs on your machine" notice with its acknowledge action. Once acknowledged the copy stays
 * visible and the button disappears.
 *
 * Prop-driven and SSR-safe: no state, no effects, no storage access.
 */
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { useT } from '../../lib/i18n/index.js';

/**
 * @param {{ runnerInfo?: { kind?: string|null }|null, className?: string }} props
 * @returns {JSX.Element|null}
 */
export function RunnerBadge({ runnerInfo = null, className = '' }) {
  const t = useT();
  if (!runnerInfo?.kind) return null;
  const local = runnerInfo.kind === 'local';
  return (
    <Badge tone={local ? 'accent' : 'neutral'} className={className}>
      {local ? t('runnerNotice.badge.local') : t('runnerNotice.badge.browser')}
    </Badge>
  );
}

/**
 * @param {object} props
 * @param {{ kind?: string|null, ready?: boolean, command?: string }|null} [props.runnerInfo]
 * @param {boolean} [props.acknowledged]
 * @param {(() => void)|null} [props.onAcknowledge]
 * @param {string} [props.className]
 * @returns {JSX.Element|null}
 */
export function RunnerNotice({ runnerInfo = null, acknowledged = false, onAcknowledge = null, className = '' }) {
  const t = useT();
  if (!runnerInfo?.kind) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <RunnerBadge runnerInfo={runnerInfo} />
      {runnerInfo.kind === 'local' ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <strong className="block font-medium">{t('runnerNotice.notice.title')}</strong>
          <p>{t('runnerNotice.notice.body')}</p>
          {!acknowledged && typeof onAcknowledge === 'function' ? (
            <Button size="sm" variant="secondary" className="mt-2" onClick={onAcknowledge}>
              {t('runnerNotice.notice.acknowledge')}
            </Button>
          ) : null}
          {acknowledged ? <p className="mt-1">{t('runnerNotice.notice.acknowledged')}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
