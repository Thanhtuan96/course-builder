/**
 * Home (COURSE-03) — "Continue learning", course grid with progress, streak + due badges, and
 * soft-delete. Everything reads through the repository and refreshes on repository changes.
 */
import { useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import {
  listCourses,
  getCourse,
  deleteCourse,
  getBetaProfile,
  onChange,
} from '../lib/repo/index.js';
import { progress, nextLesson, statusIcon } from '../lib/course.js';
import { useT } from '../lib/i18n/index.js';
import { DEMO_COURSE_ID } from '../data/demo-course.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { StreakBadge } from '../components/practice/StreakBadge.jsx';
import { DueBadge } from '../components/practice/DueBadge.jsx';
import {
  BetaReportNudge,
  activationOffset,
  nudgeVisible,
  readNudgeMarkers,
  writeNudgeMarker,
} from '../components/data/BetaReportPanel.jsx';

export function Home() {
  const t = useT();
  const [courses, setCourses] = useState(null);
  const [nudge, setNudge] = useState(null);

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

  // INSTR-06: one read-through of the beta profile per mount. Deliberately NOT folded into the
  // repository `onChange` refresh above — that fires on every course write, while the profile is
  // created once. The read-through is allowed to create the singleton with `activated_at: null`
  // (D-14); a profile without `activated_day` simply shows no banner. No event is recorded and no
  // meaningful row is written here: the only side effect of the nudge is a localStorage marker.
  useEffect(() => {
    let alive = true;
    getBetaProfile()
      .then((profile) => {
        if (!alive) return;
        setNudge(nudgeVisible({ offset: activationOffset(profile), ...readNudgeMarkers() }));
      })
      .catch(() => {
        /* no profile, no banner */
      });
    return () => {
      alive = false;
    };
  }, []);

  const dismissNudge = () => {
    writeNudgeMarker('dismissed', nudge);
    setNudge(null);
  };

  const remove = async (course) => {
    if (!window.confirm(t('home.deleteConfirm', { title: course.title }))) return;
    await deleteCourse(course.id);
  };

  const continueWith = courses?.find((c) => c.source !== 'demo' && nextLesson(c)) || courses?.find((c) => nextLesson(c));
  const continueLesson = continueWith ? nextLesson(continueWith) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{t('home.title')}</h1>
          <StreakBadge />
          <DueBadge />
        </div>
        <Link to="/new">
          <Button>{t('home.newCourse')}</Button>
        </Link>
      </div>

      {nudge && <BetaReportNudge checkpoint={nudge} onDismiss={dismissNudge} />}

      {courses === null && <p className="text-sm text-neutral-500">{t('home.loading')}</p>}

      {courses?.length === 0 && (
        <EmptyState
          title={t('home.empty.title')}
          description={t('home.empty.description')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/new">
                <Button>{t('home.empty.createFirst')}</Button>
              </Link>
              <Link to={`/course/${DEMO_COURSE_ID}`}>
                <Button variant="secondary">{t('home.empty.openDemo')}</Button>
              </Link>
            </div>
          }
        />
      )}

      {continueWith && continueLesson && (
        <Card className="border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{t('home.continue')}</p>
              <p className="mt-1 truncate font-medium">{continueWith.title}</p>
              <p className="truncate text-sm text-neutral-600 dark:text-neutral-300">
                {statusIcon(continueLesson.status)}{' '}
                {t('home.lessonOf', { n: continueLesson.position, title: continueLesson.title })}
              </p>
            </div>
            <Button onClick={() => navigate(`/course/${continueWith.id}/lesson/${continueLesson.id}`)}>{t('home.continueButton')}</Button>
          </div>
        </Card>
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
                <div className="flex shrink-0 items-center gap-1">
                  {course.status === 'completed' && <Badge tone="success">🎓</Badge>}
                  <Badge tone="neutral">{course.level}</Badge>
                  {course.source === 'demo' && <Badge tone="accent">{t('home.demo')}</Badge>}
                </div>
              </div>
              {course.description && (
                <p className="line-clamp-2 text-sm text-neutral-600 dark:text-neutral-300">{course.description}</p>
              )}
              <Progress
                value={stats.pct}
                label={t('common.lessonsDoneShort', { done: stats.done, total: stats.total })}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-neutral-500">
                  {t('common.lessonsDone', { done: stats.done, total: stats.total })}
                </p>
                <button
                  type="button"
                  onClick={() => remove(course)}
                  className="text-xs text-neutral-400 underline hover:text-red-600"
                >
                  {t('home.delete')}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
