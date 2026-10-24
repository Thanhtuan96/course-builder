/**
 * AttemptDiff (PW-02, phase 9) — the per-criterion R1–R7 status transitions between two attempts.
 *
 * Pure derivation + a thin renderer. `criterionTransitions` never mutates its inputs and never
 * invents a criterion: it walks the current review's order and looks each key up in the previous
 * attempt. Legacy `{ name, rating }` rows are normalised first, so an old attempt still produces
 * transitions.
 *
 * Every stored string (label, status) is rendered as a React text child — the history is untrusted
 * data from earlier submissions (T-09-26).
 */
import { normalizeStoredReview } from '../../lib/capstone.js';
import { useT } from '../../lib/i18n/index.js';

/**
 * Stable identity for a criterion across attempts.
 *
 * Modern reviews carry a rubric `key`; legacy reviews only a `name`/`label`. The index is the last
 * resort so an anonymous entry still gets its own row instead of colliding with another.
 *
 * @param {object|null} criterion
 * @param {number} index
 * @returns {string}
 */
function criterionKey(criterion, index) {
  const key = criterion?.key;
  if (key != null && String(key).trim()) return String(key).trim();
  const label = criterion?.label || criterion?.name;
  if (label != null && String(label).trim()) return String(label).trim();
  return `#${index}`;
}

/**
 * The stored status of a (normalised) criterion, or null.
 * @param {object|null} criterion
 * @returns {string|null}
 */
function statusOf(criterion) {
  if (!criterion || typeof criterion !== 'object') return null;
  return criterion.status ?? null;
}

/**
 * Compare two stored reviews criterion by criterion.
 *
 * @param {object|null} previous the chronologically preceding attempt's review
 * @param {object|null} current this attempt's review
 * @returns {Array<{ key: string, label: string, from: string|null, to: string|null, changed: boolean }>}
 *   one entry per criterion of the current review (or of the previous one when the current review is
 *   absent/empty); `from` is null on the first attempt and for a key the previous attempt lacked.
 */
export function criterionTransitions(previous = null, current = null) {
  const before = normalizeStoredReview(previous);
  const after = normalizeStoredReview(current);
  const previousCriteria = Array.isArray(before?.criteria) ? before.criteria : [];
  const currentCriteria = Array.isArray(after?.criteria) ? after.criteria : [];

  const hasPrevious = previousCriteria.length > 0;
  const hasCurrent = currentCriteria.length > 0;
  const source = hasCurrent ? currentCriteria : previousCriteria;

  const previousByKey = new Map();
  previousCriteria.forEach((criterion, index) => {
    const key = criterionKey(criterion, index);
    if (!previousByKey.has(key)) previousByKey.set(key, criterion);
  });

  return source.map((criterion, index) => {
    const key = criterionKey(criterion, index);
    const prior = previousByKey.get(key) || null;
    const from = statusOf(prior);
    const to = hasCurrent ? statusOf(criterion) : null;
    return {
      key,
      label: String(criterion?.label || criterion?.name || key),
      from,
      to,
      changed: hasPrevious && hasCurrent && from !== to,
    };
  });
}

/**
 * Localised status caption (literal keys so the i18n key scanner sees every one).
 *
 * @param {(key: string, params?: object) => string} t
 * @param {string|null} status
 * @returns {string}
 */
function statusLabel(t, status) {
  const labels = {
    met: t('externalEvidence.status.met'),
    partial: t('externalEvidence.status.partial'),
    not_met: t('externalEvidence.status.not_met'),
  };
  return labels[status] || String(status ?? '');
}

/**
 * Render the changed criteria between two attempts.
 *
 * @param {object} props
 * @param {object|null} [props.previous] the preceding attempt's review
 * @param {object|null} [props.current] this attempt's review
 * @returns {import('react').ReactElement|null} null when there is no criterion to compare
 */
export function AttemptDiff({ previous = null, current = null }) {
  const t = useT();
  const transitions = criterionTransitions(previous, current);
  if (!transitions.length) return null;

  const changed = transitions.filter((entry) => entry.changed);

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-neutral-500">{t('externalEvidence.historyTransitions')}</p>
      {changed.length === 0 ? (
        <p className="text-xs text-neutral-500">{t('externalEvidence.historyNoChange')}</p>
      ) : (
        <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300">
          {changed.map((entry) => (
            <li key={entry.key}>
              <span className="font-medium">{entry.label}</span>
              {': '}
              {entry.from ? statusLabel(t, entry.from) : t('externalEvidence.historyFirstAttempt')}
              {' → '}
              {statusLabel(t, entry.to)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
