/**
 * AttemptHistory — collapsible attempt history with a met-count summary and a per-criterion delta
 * (LOOP-03, D-10, D-11).
 *
 * Deliberately counts and transitions only: no learner text, no code, no diff. Every surface feeds
 * the same already-normalised criteria arrays, so quiz, tutor and workspace render one component.
 *
 * Prop-driven and SSR-safe: no state, no effects, no repo access.
 */
import { useT } from '../../lib/i18n/index.js';
import { criteriaDelta, summarizeCriteria } from './history.js';

/**
 * Localised status label. Literal translation keys on purpose — the i18n key scanner only sees
 * literal `t()` arguments, so a `${status}` template would silently skip them.
 * @param {(key: string, params?: object) => string} t
 * @param {string|null} status
 * @returns {string}
 */
function statusLabel(t, status) {
  if (status === 'met') return t('revision.status.met');
  if (status === 'partial') return t('revision.status.partial');
  return t('revision.status.not_met');
}

/**
 * One transition row. `added`/`removed` name the change only; a status move names both sides.
 * @param {(key: string, params?: object) => string} t
 * @param {{ key: string, from: string|null, to: string|null, kind: string }} change
 * @returns {string}
 */
function changeText(t, change) {
  if (change.kind === 'added') return `${change.key}: ${t('revision.history.new')}`;
  if (change.kind === 'removed') return `${change.key}: ${t('revision.history.removed')}`;
  return t('revision.history.transition', {
    key: change.key,
    from: statusLabel(t, change.from),
    to: statusLabel(t, change.to),
  });
}

/**
 * @param {object} props
 * @param {Array<{ id?: string, label?: string, criteria?: object[] }>} [props.attempts]
 *   oldest → newest
 * @param {string|null} [props.title]
 * @param {boolean} [props.defaultOpen]
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export function AttemptHistory({ attempts = [], title = null, defaultOpen = false, className = '' }) {
  const t = useT();
  const list = Array.isArray(attempts) ? attempts : [];

  if (list.length === 0) {
    return <p className="text-sm text-neutral-500">{t('revision.history.empty')}</p>;
  }

  return (
    <>
      {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
      <details
        className={`rounded-lg border border-neutral-200 p-3 dark:border-neutral-800 ${className}`}
        open={defaultOpen}
      >
        <summary className="cursor-pointer text-sm font-medium">
          {t('revision.history.toggle', { count: list.length })}
        </summary>
        <ol className="mt-2 space-y-3 text-sm">
          {list.map((attempt, index) => {
            const criteria = Array.isArray(attempt?.criteria) ? attempt.criteria : [];
            const summary = summarizeCriteria(criteria);
            const previous = index === 0 ? null : list[index - 1];
            const previousCriteria = Array.isArray(previous?.criteria) ? previous.criteria : [];
            const changes =
              index === 0
                ? []
                : criteriaDelta(previousCriteria, criteria).changes.filter(
                    (change) => change.kind !== 'unchanged'
                  );

            return (
              <li key={attempt?.id ?? index}>
                <span className="block font-medium">
                  {attempt?.label || t('revision.history.attempt', { n: index + 1 })}
                </span>
                <span className="block text-xs text-neutral-500">
                  {index === 0
                    ? t('revision.history.firstSummary', {
                        to: summary.met,
                        total: criteria.length,
                      })
                    : t('revision.history.summary', {
                        from: summarizeCriteria(previousCriteria).met,
                        to: summary.met,
                        total: criteria.length,
                      })}
                </span>
                {index > 0 ? (
                  changes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-neutral-500">
                      {changes.map((change) => (
                        <li key={change.key}>{changeText(t, change)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-neutral-500">{t('revision.history.noChange')}</p>
                  )
                ) : null}
              </li>
            );
          })}
        </ol>
      </details>
    </>
  );
}
