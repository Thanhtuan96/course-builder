/**
 * ReviewMessage — renders one stored review (`chat_messages` row with `mode: 'review'`).
 *
 * A valid record renders through `<ReviewFeedback>`; anything malformed falls back to plain text
 * (D-06): a legacy or corrupted row must never crash the transcript and must never be dressed up
 * as a rubric card. Parsing lives in `history.js` — this module never calls `JSON.parse`.
 *
 * Prop-driven and SSR-safe: no state, no effects, no repo access.
 */
import { parseReviewRecord } from './history.js';
import { ReviewFeedback } from './ReviewFeedback.jsx';

/**
 * The surface a stored review belongs to, or `null` when it is not a usable review record.
 * `TutorPanel` uses this to filter quiz reviews out of the tutor transcript (Pitfall 7).
 * @param {{ content?: unknown }|null|undefined} message
 * @returns {'quiz'|'tutor'|'workspace'|string|null}
 */
export function reviewSurface(message) {
  return parseReviewRecord(message?.content)?.surface ?? null;
}

/**
 * @param {object} props
 * @param {{ role?: string, mode?: string, content?: unknown }|null|undefined} props.message
 * @param {(() => void)|null} [props.onRevise]
 * @param {string|null} [props.reviseHint]
 * @param {string|null} [props.title]
 * @returns {JSX.Element}
 */
export function ReviewMessage({ message, onRevise = null, reviseHint = null, title = null }) {
  const content = typeof message?.content === 'string' ? message.content : '';
  const record = parseReviewRecord(content);

  if (!record) {
    return (
      <p className="whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300">{content}</p>
    );
  }

  return (
    <ReviewFeedback
      criteria={record.criteria}
      title={title}
      showRevise={!record.passing && typeof onRevise === 'function'}
      onRevise={onRevise}
      reviseHint={reviseHint}
    />
  );
}
