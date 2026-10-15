/**
 * Course (COURSE-03) — header with level/kind/goal/progress, the lesson list with statuses and
 * Start/Continue actions, and completion date + reflection snippets for finished lessons.
 * The header action area has "Export COURSE.md" (shared with the DataPanel) and Delete.
 */
import { useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import { getCourse, getLessonHistory, deleteCourse, onChange } from '../lib/repo/index.js';
import { progress, statusIcon, COURSE_KINDS } from '../lib/course.js';
import { exportCourseMarkdown } from '../lib/course-export.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function Course({ id }) {
  const [course, setCourse] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [reflections, setReflections] = useState({});

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

  useEffect(() => {
    let alive = true;
    const done = (course?.lessons || []).filter((l) => l.status === 'done');
    Promise.all(done.map((l) => getLessonHistory(l.id).then((h) => [l.id, h.reflection])))
      .then((pairs) => {
        if (!alive) return;
        setReflections(Object.fromEntries(pairs.filter(([, r]) => r && r.hardest)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [course]);

  if (!loaded) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        description="It may have been deleted."
        action={<Link to="/"><Button variant="secondary">Back home</Button></Link>}
      />
    );
  }

  const stats = progress(course);
  const kindLabel = COURSE_KINDS.find((k) => k.id === course.kind)?.label;

  const remove = async () => {
    if (!window.confirm(`Delete “${course.title}”? This cannot be undone.`)) return;
    await deleteCourse(course.id);
    navigate('/');
  };

  const exportMd = async () => {
    try {
      await exportCourseMarkdown(course);
    } catch {
      /* nothing destructive — a failed export leaves the course untouched */
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{course.title}</h1>
            <Badge tone="neutral">{course.level}</Badge>
            {kindLabel && <Badge tone="accent">{kindLabel}</Badge>}
          </div>
          {course.goal && <p className="text-sm text-neutral-600 dark:text-neutral-300">Goal: {course.goal}</p>}
          {course.description && <p className="text-sm text-neutral-500">{course.description}</p>}
          <Progress value={stats.pct} label={`${stats.done}/${stats.total} lessons`} />
          <p className="text-xs text-neutral-500">
            {stats.done} of {stats.total} lessons done
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={exportMd}>
            Export COURSE.md
          </Button>
          <Button variant="danger" size="sm" onClick={remove}>
            Delete
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {course.lessons.map((lesson) => {
          const reflection = reflections[lesson.id];
          const label = lesson.status === 'done' ? 'Reopen' : lesson.status === 'active' ? 'Continue' : 'Start';
          return (
            <Card key={lesson.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span aria-hidden="true" className="mt-0.5">
                  {statusIcon(lesson.status)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">
                    {lesson.position}. {lesson.title}
                  </p>
                  {lesson.summary && <p className="text-sm text-neutral-500">{lesson.summary}</p>}
                  {lesson.status === 'done' && lesson.completed_at && (
                    <p className="mt-1 text-xs text-neutral-400">Completed {formatDate(lesson.completed_at)}</p>
                  )}
                  {reflection?.hardest && (
                    <p className="mt-1 text-xs text-neutral-500 italic">Hardest: {reflection.hardest}</p>
                  )}
                </div>
              </div>
              <Link to={`/course/${course.id}/lesson/${lesson.id}`}>
                <Button variant={lesson.status === 'active' ? 'primary' : 'secondary'} size="sm">
                  {label}
                </Button>
              </Link>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
