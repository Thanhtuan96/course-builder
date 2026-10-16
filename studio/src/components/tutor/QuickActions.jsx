/**
 * QuickActions — tutor-mode chips (TUTOR-03). Hidden affordances made concrete; there is
 * deliberately no "reveal solution" control anywhere (FEATURES anti-feature).
 *
 * The hint chip shows the current ladder position, e.g. "Give me a hint · Hint 2 of 3".
 */
import { TUTOR_MODES } from '../../lib/prompts/tutor.js';
import { hintLevelLabel } from '../../lib/chat-store.js';
import { useT } from '../../lib/i18n/index.js';
import { Button } from '../ui/Button.jsx';

export function QuickActions({ onAction, disabled = false, hintLevel = 0, pendingMode = null }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('tutor.quickAria')}>
      {TUTOR_MODES.map((mode) => {
        const active = pendingMode === mode.id;
        const suffix = mode.id === 'hint' && hintLevel > 0 ? ` · ${hintLevelLabel(hintLevel)}` : '';
        return (
          <Button
            key={mode.id}
            size="sm"
            variant={active ? 'primary' : 'secondary'}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onAction(mode.id)}
          >
            {t(`tutor.mode.${mode.id}`)}
            {suffix}
          </Button>
        );
      })}
    </div>
  );
}
