/**
 * LessonContent — STUB (Phase 23 owns this file; replace in place, keep export name/props).
 * Renders the current lesson version's Markdown, or a placeholder until Phase 23 adds generation.
 */
import { useEffect, useState } from 'react';
import { getLessonContent } from '../../lib/repo/index.js';
import { Markdown } from '../ui/Markdown.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Button } from '../ui/Button.jsx';

export function LessonContent({ lesson }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLessonContent(lesson.id)
      .then((row) => alive && setContent(row))
      .catch(() => alive && setContent(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [lesson.id, lesson.current_version_id]);

  if (loading) return <p className="text-sm text-neutral-500">Loading lesson…</p>;

  if (!content?.content_md) {
    return (
      <EmptyState
        title="No lesson content yet"
        description="Lesson generation arrives in the next update. The demo course ships with pre-written lessons you can read now."
        action={
          <Button variant="secondary" disabled title="Available after Phase 23">
            Generate lesson
          </Button>
        }
      />
    );
  }

  return <Markdown>{content.content_md}</Markdown>;
}
