/**
 * CommandPills.jsx - Context-aware command buttons
 */
import { Button } from './ui/button.jsx';

/**
 * Command pills mapped to learning phases
 * Based on implementation doc and WEB-13, WEB-14 requirements
 */
export const COMMANDS_BY_PHASE = {
  idle: ['professor:new-topic'],
  lecture: ['professor:discuss', 'professor:hint', 'professor:review', 'professor:quiz'],
  exercise: ['professor:hint', 'professor:review', 'professor:stuck'],
  review: ['professor:done', 'professor:hint'],
};

/**
 * CommandPills component - displays context-aware command buttons
 * @param {Object} props
 * @param {string} props.phase - Current learning phase: 'idle' | 'lecture' | 'exercise' | 'review'
 * @param {Function} props.onCommandClick - Callback when a command is clicked
 * @param {boolean} [props.disabled] - Whether buttons are disabled
 */
export default function CommandPills({ phase = 'idle', onCommandClick, disabled = false }) {
  const commands = COMMANDS_BY_PHASE[phase] || COMMANDS_BY_PHASE.idle;

  function handleClick(command) {
    if (!disabled) {
      onCommandClick?.(command);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-800 bg-slate-900 px-3 py-2 md:px-4">
      {commands.map((cmd) => (
        <Button
          key={cmd}
          variant="outline"
          size="sm"
          className="h-7 rounded-full px-3 font-mono text-xs"
          onClick={() => handleClick(cmd)}
          disabled={disabled}
          title={`Send ${cmd} command`}
        >
          {cmd}
        </Button>
      ))}
    </div>
  );
}
