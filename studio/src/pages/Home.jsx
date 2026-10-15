/**
 * Home — STUB (Phase 23 owns this file; replace in place). Minimally functional: lists courses
 * with progress and a "New course" action, so the app is usable before Phase 23 lands.
 */
import { useEffect, useState } from 'react';
import { Link } from '../lib/router.js';
import { listCourses, getCourse, onChange } from '../lib/repo/index.js';
import { progress } from '../lib/course.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { StreakBadge } from '../components/practice/StreakBadge.jsx';

export function Home() {
  const [courses, setCourses] = useState(null);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listCourses()
        .then((rows) => Promise.all(rows.map((c) => getCourse(c.id))))
        .then((full) => alive && setCourses(full.filter(Boolean)))
        .catch(() => alive && setCourses([]));
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'courses' || detail.table === 'lessons' || detail.table === '*') refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Your courses</h1>
          <StreakBadge />
        </div>
        <Link to="/new">
          <Button>New course</Button>
        </Link>
      </div>

      {courses === null && <p className="text-sm text-neutral-500">Loading…</p>}

      {courses?.length === 0 && (
        <EmptyState
          title="No courses yet"
          description="Create your first course, or open the bundled demo course to see how Studio works."
          action={
            <Link to="/new">
              <Button>New course</Button>
            </Link>
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {courses?.map((course) => {
          const stats = progress(course);
          return (
            <Card key={course.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/course/${course.id}`} className="font-medium hover:underline">
                  {course.title}
                </Link>
                {course.source === 'demo' && <span className="text-xs text-neutral-500">demo</span>}
              </div>
              {course.description && <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{course.description}</p>}
              <Progress value={stats.pct} label={`${stats.done}/${stats.total} lessons`} />
              <p className="text-xs text-neutral-500">
                {stats.done} of {stats.total} lessons done
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
