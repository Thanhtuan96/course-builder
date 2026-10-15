/**
 * LessonPractice — STUB (Phase 24 owns this file; replace in place, keep export name/props).
 */
import { Card } from '../ui/Card.jsx';

export function LessonPractice({ lesson }) {
  return (
    <Card>
      <p className="font-medium">Practice — coming soon</p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        Quizzes and flashcards for “{lesson?.title}” arrive in the next update.
      </p>
    </Card>
  );
}
