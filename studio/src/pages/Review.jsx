/**
 * Review — the spaced-repetition queue (PRACTICE-03).
 *
 * Shows every due card across all courses, one at a time. Space flips, keys 1–4 (or the on-screen
 * buttons) grade Again / Hard / Good / Easy and reschedule the card with SM-2. A short session
 * summary follows, and an "All caught up" empty state shows when the next card is due.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router.js';
import { listDueCards, gradeCard, logActivity } from '../lib/repo/index.js';
import { useT } from '../lib/i18n/index.js';
import { nextDueAt } from '../components/practice/card-store.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorNotice } from '../components/ui/ErrorNotice.jsx';

const GRADES = [
  { grade: 0, key: 'again', labelKey: 'practice.review.again', hint: '1', tone: 'danger' },
  { grade: 1, key: 'hard', labelKey: 'practice.review.hard', hint: '2', tone: 'secondary' },
  { grade: 2, key: 'good', labelKey: 'practice.review.good', hint: '3', tone: 'primary' },
  { grade: 3, key: 'easy', labelKey: 'practice.review.easy', hint: '4', tone: 'secondary' },
];

const EMPTY_TALLY = { again: 0, hard: 0, good: 0, easy: 0 };

function formatDue(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Review() {
  const t = useT();
  const [cards, setCards] = useState(null); // null = loading
  const [nextDue, setNextDue] = useState(null);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [error, setError] = useState(null);
  const [grading, setGrading] = useState(false);
  const loggedRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [due, next] = await Promise.all([listDueCards(), nextDueAt()]);
      setCards(due);
      setNextDue(next);
      setPos(0);
      setFlipped(false);
      setTally(EMPTY_TALLY);
      loggedRef.current = false;
    } catch (err) {
      setError(err);
      setCards([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grade = useCallback(
    async (g) => {
      const card = cards?.[pos];
      if (!card || !flipped || grading) return;
      setGrading(true);
      setError(null);
      try {
        await gradeCard(card.id, g);
        if (!loggedRef.current) {
          loggedRef.current = true;
          await logActivity('review', card.id);
        }
        const key = GRADES.find((x) => x.grade === g).key;
        setTally((t) => ({ ...t, [key]: t[key] + 1 }));
        setFlipped(false);
        setPos((p) => p + 1);
      } catch (err) {
        setError(err);
      } finally {
        setGrading(false);
      }
    },
    [cards, pos, flipped, grading]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      const match = GRADES.find((x) => x.hint === e.key);
      if (match) grade(match.grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grade]);

  if (cards === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('practice.review.title')}</h1>
        <p className="text-sm text-neutral-500">{t('practice.review.loading')}</p>
      </div>
    );
  }

  const total = cards.length;
  const current = cards[pos];
  const done = pos >= total;

  if (total === 0) {
    const due = formatDue(nextDue);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('practice.review.title')}</h1>
        {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
        <EmptyState
          title={t('practice.review.allCaughtUp')}
          description={due ? t('practice.review.nextCard', { date: due }) : t('practice.review.noCards')}
          action={
            <Link to="/">
              <Button variant="secondary">{t('practice.review.backToCourses')}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (done) {
    const reviewed = total;
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{t('practice.review.title')}</h1>
        {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="font-semibold">{t('practice.review.sessionComplete')}</p>
            <p className="text-sm text-neutral-500">
              {t('practice.review.reviewed', { count: reviewed, cardWord: t('common.card', { count: reviewed }) })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <Badge key={g.key} tone={tally[g.key] ? 'accent' : 'neutral'}>
                {t(g.labelKey)}: {tally[g.key]}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={load}>{t('practice.review.checkForMore')}</Button>
            <Link to="/">
              <Button variant="secondary">{t('practice.review.backToCourses')}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('practice.review.title')}</h1>
        <span className="text-sm text-neutral-500">
          {t('practice.review.cardOf', { n: pos + 1, total })}
        </span>
      </div>

      {error && <ErrorNotice error={error} onDismiss={() => setError(null)} />}

      <Card
        as="button"
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-48 w-full cursor-pointer flex-col items-center justify-center gap-4 text-center"
      >
        <p className="text-xs uppercase tracking-wide text-neutral-400">
          {flipped ? t('practice.review.answer') : t('practice.review.question')}
        </p>
        <p className="text-lg font-medium text-neutral-900 dark:text-neutral-100">{current.front}</p>
        {flipped ? (
          <p className="text-base text-neutral-700 dark:text-neutral-300">{current.back}</p>
        ) : (
          <p className="text-sm text-neutral-400">{t('practice.review.tapFlip')}</p>
        )}
      </Card>

      {flipped ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GRADES.map((g) => (
            <Button key={g.key} variant={g.tone} onClick={() => grade(g.grade)} disabled={grading}>
              {t(g.labelKey)}
              <span className="ml-1 text-xs opacity-60">{g.hint}</span>
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-neutral-500">{t('practice.review.gradeAfter')}</p>
      )}
    </div>
  );
}
