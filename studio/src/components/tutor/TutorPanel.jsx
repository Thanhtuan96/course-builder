/**
 * TutorPanel — STUB (Phase 25 owns this file; replace in place, keep export name/props).
 */
import { Card } from '../ui/Card.jsx';

export function TutorPanel({ lesson }) {
  return (
    <Card>
      <p className="font-medium">Tutor — coming soon</p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        A lesson-scoped Socratic tutor for “{lesson?.title}” arrives in the next update.
      </p>
    </Card>
  );
}
