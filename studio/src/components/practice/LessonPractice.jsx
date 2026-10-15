/**
 * LessonPractice — the Practice tab (PRACTICE-01/02).
 *
 * Two sections — a retrieval self-check (QuizPanel) and flashcards (FlashcardGenerator) — plus a
 * list of past quiz attempts read from the repository history.
 */
import { useCallback, useEffect, useState } from 'react';
import { listQuizAttempts, onChange } from '../../lib/repo/index.js';
import { QuizPanel } from './QuizPanel.jsx';
import { FlashcardGenerator } from './FlashcardGenerator.jsx';
import { Card } from '../ui/Card.jsx';

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function LessonPractice({ lesson, course }) {
  const [attempts, setAttempts] = useState([]);

  const refresh = useCallback(
    () => listQuizAttempts(lesson.id).then(setAttempts).catch(() => {}),
    [lesson.id]
  );

  useEffect(() => {
    let alive = true;
    const load = () => listQuizAttempts(lesson.id).then((rows) => alive && setAttempts(rows)).catch(() => {});
    load();
    const off = onChange((detail) => {
      if (detail.table === 'quiz_attempts' || detail.table === '*') load();
    });
    return () => {
      alive = false;
      off();
    };
  }, [lesson.id]);

  const past = [...attempts].reverse();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Check your understanding</h2>
          <p className="text-sm text-neutral-500">Five quick questions, explained as you go.</p>
        </div>
        <QuizPanel lesson={lesson} course={course} onAttemptSaved={refresh} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Flashcards</h2>
          <p className="text-sm text-neutral-500">Add cards from this lesson to your review queue.</p>
        </div>
        <FlashcardGenerator lesson={lesson} course={course} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Past attempts</h2>
        {past.length === 0 ? (
          <p className="text-sm text-neutral-500">No attempts yet — finish a self-check to see it here.</p>
        ) : (
          <Card className="divide-y divide-neutral-200 p-0 dark:divide-neutral-800">
            {past.map((attempt) => (
              <div key={attempt.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-neutral-500">{formatWhen(attempt.created_at)}</span>
                <span className="font-medium">
                  {attempt.score ?? '—'} / {attempt.total ?? '—'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
