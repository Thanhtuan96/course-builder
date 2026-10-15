/**
 * DueBadge — number of flashcards due for review (PRACTICE-03). Hidden at 0, reactive to card writes.
 * Rendered in the top nav beside the Review link.
 */
import { useEffect, useState } from 'react';
import { listDueCards, onChange } from '../../lib/repo/index.js';
import { Badge } from '../ui/Badge.jsx';

export function DueBadge({ className = '' }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listDueCards()
        .then((cards) => alive && setCount(cards.length))
        .catch(() => {});
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'cards' || detail.table === '*') refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!count) return null;
  return (
    <span className={className} title={`${count} card${count === 1 ? '' : 's'} due for review`}>
      <Badge tone="accent">{count} due</Badge>
    </span>
  );
}
