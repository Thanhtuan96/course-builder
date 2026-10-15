/**
 * Review page — STUB (Phase 24 owns this file; replace in place).
 */
import { EmptyState } from '../components/ui/EmptyState.jsx';

export function Review() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Review</h1>
      <EmptyState
        title="Spaced repetition — coming soon"
        description="Due flashcards and the SM-2 review queue arrive in the next update."
      />
    </div>
  );
}
