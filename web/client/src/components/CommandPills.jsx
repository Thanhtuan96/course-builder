/**
 * CommandPills.jsx - Context-aware command buttons
 */

import './CommandPills.css';

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
    <div className="command-pills">
      {commands.map((cmd) => (
        <button
          key={cmd}
          className="command-pill"
          onClick={() => handleClick(cmd)}
          disabled={disabled}
          title={`Send ${cmd} command`}
        >
          {cmd}
        </button>
      ))}
    </div>
  );
}
