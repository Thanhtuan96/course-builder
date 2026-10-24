/**
 * ReviewFeedback — the rubric view for one review (LOOP-02, D-06, D-08).
 *
 * One row per criterion: a met / partly met / not met chip, the criterion label, and exactly one
 * Socratic question for each criterion that is *not* met. Plain text only — never corrected code,
 * a diff or model markdown.
 *
 * Prop-driven and SSR-safe: no state, no effects, no repo access.
 */
import { Badge } from '../ui/Badge.jsx';
import { useT } from '../../lib/i18n/index.js';
import { reviewPassed } from './history.js';
import { ReviseButton } from './ReviseButton.jsx';

/** Badge tone per criterion status (D-08: `partial` is deliberately non-passing). */
const TONES = { met: 'success', partial: 'warning', not_met: 'neutral' };

/**
 * Localised status label. The three calls are literal translation keys on purpose: the i18n key
 * scanner only sees literal `t()` arguments, so a `${status}` template would silently skip them.
 * @param {(key: string, params?: object) => string} t
 * @param {string} status
 * @returns {string}
 */
function statusLabel(t, status) {
  if (status === 'met') return t('revision.status.met');
  if (status === 'partial') return t('revision.status.partial');
  return t('revision.status.not_met');
}

/**
 * @param {object} props
 * @param {Array<{ key: string, label: string, status: string, question?: string|null }>}
 *   [props.criteria] already-normalised criteria (quiz, tutor and workspace share the shape)
 * @param {string|null} [props.title] optional section heading supplied by the surface
 * @param {boolean} [props.showRevise] whether the surface wants a revision affordance at all
 * @param {(() => void)|null} [props.onRevise]
 * @param {string|null} [props.reviseHint]
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
export function ReviewFeedback({
  criteria = [],
  title = null,
  showRevise = false,
  onRevise = null,
  reviseHint = null,
  className = '',
}) {
  const t = useT();
  const rows = Array.isArray(criteria) ? criteria : [];

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">{t('revision.review.empty')}</p>;
  }

  const passing = reviewPassed(rows);

  return (
    <div className={`space-y-3 ${className}`}>
      {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
      <ul className="space-y-2">
        {rows.map((criterion, index) => (
          <li key={criterion?.key ?? index} className="flex flex-wrap items-start gap-2">
            <Badge tone={TONES[criterion?.status] ?? 'neutral'}>
              {statusLabel(t, criterion?.status)}
            </Badge>
            <div className="min-w-0 flex-1 space-y-1">
              <span className="block">{criterion?.label}</span>
              {criterion?.status !== 'met' && criterion?.question ? (
                <div className="text-sm text-neutral-700 dark:text-neutral-300">
                  <span className="block text-xs font-medium text-neutral-500">
                    {t('revision.review.questionLabel')}
                  </span>
                  <span className="block">{criterion.question}</span>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {showRevise && !passing && typeof onRevise === 'function' ? (
        <ReviseButton onRevise={onRevise} hint={reviseHint} />
      ) : null}
    </div>
  );
}
