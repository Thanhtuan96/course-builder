/**
 * ReviseButton — the single source of the "Revise this attempt" primary action (LOOP-01, D-08).
 *
 * Prop-driven and render-safe: no state, no effects, no repo access. The calling surface decides
 * *when* a revision is possible by passing (or omitting) the click handler; this component only
 * guarantees the wording and that the affordance is the filled primary button.
 */
import { Button } from '../ui/Button.jsx';
import { useT } from '../../lib/i18n/index.js';

/**
 * @param {object} props
 * @param {(() => void)|null} [props.onRevise] click handler for the primary action
 * @param {(() => void)|null} [props.onClick] alias accepted for direct DOM-style call sites
 * @param {string|null} [props.hint] optional one-line explanation rendered under the button
 * @param {boolean} [props.disabled]
 * @param {string} [props.className]
 * @returns {JSX.Element|null} `null` when no handler is supplied — there is nothing to revise then
 */
export function ReviseButton({
  onRevise = null,
  onClick = null,
  hint = null,
  disabled = false,
  className = '',
}) {
  const t = useT();
  const handler = typeof onRevise === 'function' ? onRevise : onClick;
  if (typeof handler !== 'function') return null;

  return (
    <div className={className}>
      <Button variant="primary" size="sm" onClick={handler} disabled={disabled}>
        {t('revision.revise.label')}
      </Button>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}
