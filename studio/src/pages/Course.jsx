/**
 * Course — STUB (Phase 23 owns this file; replace in place). Shows the syllabus with statuses,
 * progress and a delete action so the app is usable before Phase 23 lands.
 */
import { useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import { getCourse, deleteCourse, onChange } from '../lib/repo/index.js';
import { progress, statusIcon } from '../lib/course.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

export function Course({ id }) {
  const [course, setCourse] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      getCourse(id)
        .then((c) => alive && setCourse(c))
        .finally(() => alive && setLoaded(true));
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'courses' || detail.table === 'lessons' || detail.table === '*') refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  if (!loaded) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!course) {
    return <EmptyState title="Course not found" description="It may have been deleted." action={<Link to="/"><Button variant="secondary">Back home</Button></Link>} />;
  }

  const stats = progress(course);

  const remove = async () => {
    if (!window.confirm(`Delete “${course.title}”? This cannot be undone.`)) return;
    await deleteCourse(course.id);
    navigate('/');
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{course.title}</h1>
          <Badge tone="neutral">{course.level}</Badge>
        </div>
        {course.goal && <p className="text-sm text-neutral-600 dark:text-neutral-300">Goal: {course.goal}</p>}
        <Progress value={stats.pct} label={`${stats.done}/${stats.total} lessons`} />
      </div>

      <div className="space-y-2">
        {course.lessons.map((lesson) => (
          <Card key={lesson.id} className="flex items-center justify-between gap-3 py-3">
            <Link to={`/course/${course.id}/lesson/${lesson.id}`} className="flex items-center gap-3 hover:underline">
              <span aria-hidden="true">{statusIcon(lesson.status)}</span>
              <span>
                <span className="font-medium">
                  {lesson.position}. {lesson.title}
                </span>
                {lesson.summary && <span className="block text-sm text-neutral-500">{lesson.summary}</span>}
              </span>
            </Link>
            <Badge tone={lesson.status === 'done' ? 'success' : lesson.status === 'active' ? 'accent' : 'neutral'}>
              {lesson.status}
            </Badge>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="danger" onClick={remove}>
          Delete course
        </Button>
      </div>
    </div>
  );
}
