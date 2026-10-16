/**
 * StreakBadge — consecutive days studied plus a small days-studied dot row (PRACTICE-04).
 * Flame-free by design: a calendar dot row + "N-day streak" label. Reactive to activity writes.
 */
import { useEffect, useState } from 'react';
import { onChange } from '../../lib/repo/index.js';
import { useT } from '../../lib/i18n/index.js';
import { getStreak, getStudyDays, STUDY_WINDOW_DAYS } from '../../lib/activity.js';

export function StreakBadge({ className = '' }) {
  const t = useT();
  const [streak, setStreak] = useState(0);
  const [days, setDays] = useState([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const [s, d] = await Promise.all([getStreak(), getStudyDays(STUDY_WINDOW_DAYS)]);
        if (!alive) return;
        setStreak(s);
        setDays(d);
      } catch {
        /* storage unavailable — show nothing */
      }
    };
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'activity' || detail.table === '*') refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const studied = days.some((d) => d.studied);
  if (!streak && !studied) return null;

  const label = streak === 0 ? t('practice.streak.none') : streak === 1 ? t('practice.streak.one') : t('practice.streak.many', { count: streak });
  const title = t('practice.streak.title', { studied: days.filter((d) => d.studied).length, total: days.length });

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 ${className}`}
      title={title}
      aria-label={label}
    >
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {days.map((d) => (
          <span
            key={d.day}
            className={`h-3 w-1.5 rounded-sm ${d.studied ? 'bg-indigo-500' : 'bg-neutral-200 dark:bg-neutral-700'}`}
          />
        ))}
      </span>
      <span className="font-medium">{label}</span>
    </span>
  );
}
