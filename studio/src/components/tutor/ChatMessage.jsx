/**
 * ChatMessage — one tutor turn. Assistant replies render through the shared safe `<Markdown>`
 * pipeline (Pitfall 12); the learner's own text stays literal. A mode chip labels which quick
 * action produced the reply.
 */
import { Markdown } from '../ui/Markdown.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { modeLabel } from '../../lib/prompts/tutor.js';

export function ChatMessage({ message, streaming = false }) {
  const isUser = message.role === 'user';
  const label = message.mode ? modeLabel(message.mode) : '';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-indigo-600 text-white'
            : 'rounded-bl-sm border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
        }`}
      >
        {!isUser && label && (
          <div className="mb-1">
            <Badge tone="accent">{label}</Badge>
          </div>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <Markdown className="text-sm">{message.content}</Markdown>
        )}
        {streaming && (
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <Spinner label="Tutor is replying" />
            <span>thinking…</span>
          </span>
        )}
      </div>
    </div>
  );
}
