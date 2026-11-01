/**
 * The lesson's hands-on exercise area: one widget per exercise, resolved through the registry.
 * Exercises with an unknown type or an unusable spec are skipped, never thrown.
 *
 * The list is derived from the `exercises` prop when the parent supplies one, so a repository
 * refresh that hands down a new array reaches an already-mounted surface instead of being ignored.
 */
import { useEffect, useState } from 'react';
import { listLessonExercises } from '../../lib/repo/index.js';
import { useT } from '../../lib/i18n/index.js';
import { isRenderableExercise } from '../../lib/exercises/spec.js';
import { resolveWidget } from '../../lib/exercises/registry.js';

/**
 * Which exercises a surface renders. A supplied `provided` list always wins over fetched data —
 * the regression this helper exists for is a surface that captured its list at mount.
 * @param {{ provided?: object[], fetched?: object[] }} input
 * @returns {object[]}
 */
export function surfaceExercises({ provided, fetched } = {}) {
  const list = Array.isArray(provided) ? provided : Array.isArray(fetched) ? fetched : [];
  return list.filter(isRenderableExercise);
}

export function ExerciseSurface({ lesson, course, exercises: provided }) {
  const t = useT();
  const controlled = Array.isArray(provided);
  const [fetched, setFetched] = useState([]);
  const [loaded, setLoaded] = useState(controlled);

  useEffect(() => {
    if (controlled || !lesson?.id) return undefined;
    let alive = true;
    listLessonExercises(lesson.id)
      .then((rows) => {
        if (!alive) return;
        setFetched(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setFetched([]);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [controlled, lesson?.id]);

  const renderable = surfaceExercises({ provided: controlled ? provided : undefined, fetched });

  if (!loaded) return <p className="text-sm text-neutral-500">{t('common.loading')}</p>;
  if (renderable.length === 0) {
    return <p className="text-sm text-neutral-500">{t('exercises.surface.empty')}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('exercises.surface.title')}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          {t('exercises.surface.description')}
        </p>
      </div>
      {renderable.map((exercise) => {
        const widget = resolveWidget(exercise.type);
        if (!widget) return null;
        const { Component } = widget;
        return <Component key={exercise.id} exercise={exercise} lesson={lesson} course={course} />;
      })}
    </div>
  );
}
