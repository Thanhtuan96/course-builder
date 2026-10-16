/**
 * DueBadge — number of flashcards due for review (PRACTICE-03). Hidden at 0, reactive to card writes.
 * Rendered in the top nav beside the Review link.
 */
import { useEffect, useState } from 'react';
import { listDueCards, onChange } from '../../lib/repo/index.js';
import { useT } from '../../lib/i18n/index.js';
import { Badge } from '../ui/Badge.jsx';

export function DueBadge({ className = '' }) {
  const t = useT();
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
    <span
      className={className}
      title={t('practice.due.title', { count, cardWord: t('common.card', { count }) })}
    >
      <Badge tone="accent">{t('practice.due.badge', { count })}</Badge>
    </span>
  );
}
