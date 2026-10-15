/**
 * DueBadge — STUB (Phase 24 owns this file; replace in place, keep export name/props).
 * Shows the number of flashcards due for review; rendered in the top nav.
 */
import { useEffect, useState } from 'react';
import { listDueCards, onChange } from '../../lib/repo/index.js';
import { Badge } from '../ui/Badge.jsx';

export function DueBadge({ className = '' }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () => listDueCards().then((cards) => alive && setCount(cards.length)).catch(() => {});
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
    <Badge tone="accent" className={className}>
      {count} due
    </Badge>
  );
}
