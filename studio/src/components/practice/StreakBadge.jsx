/**
 * StreakBadge — STUB (Phase 24 owns this file; replace in place, keep export name/props).
 * Shows consecutive days studied, computed from the activity log.
 */
import { useEffect, useState } from 'react';
import { listActivity, onChange } from '../../lib/repo/index.js';
import { streak, dayKey } from '../../lib/course.js';
import { Badge } from '../ui/Badge.jsx';

export function StreakBadge({ className = '' }) {
  const [days, setDays] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listActivity()
        .then((rows) => {
          if (!alive) return;
          const activity = {};
          for (const row of rows) {
            const key = row.day || dayKey(row.created_at);
            activity[key] = (activity[key] || 0) + 1;
          }
          setDays(streak(activity));
        })
        .catch(() => {});
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'activity' || detail.table === '*') refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!days) return null;
  return (
    <Badge tone="success" className={className}>
      {days}-day streak
    </Badge>
  );
}
