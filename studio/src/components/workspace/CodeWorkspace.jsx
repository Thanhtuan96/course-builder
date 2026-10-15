/**
 * CodeWorkspace — STUB (Phase 29 owns this file; replace in place, keep export name/props).
 * Mounted as the "Workspace" tab of Lesson.jsx for programming courses only.
 */
import { Card } from '../ui/Card.jsx';

export function CodeWorkspace({ lesson }) {
  return (
    <Card>
      <p className="font-medium">Code workspace — coming soon</p>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        Write and run code for “{lesson?.title}” right here in a later update.
      </p>
    </Card>
  );
}
