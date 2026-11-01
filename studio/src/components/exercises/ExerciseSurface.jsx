/**
 * The lesson's hands-on exercise area: one widget per exercise, resolved through the registry.
 * Exercises with an unknown type or an unusable spec are skipped, never thrown.
 */
import { useEffect, useState } from 'react';
import { listLessonExercises } from '../../lib/repo/index.js';
import { useT } from '../../lib/i18n/index.js';
import { isRenderableExercise } from '../../lib/exercises/spec.js';
import { resolveWidget } from '../../lib/exercises/registry.js';

export function ExerciseSurface({ lesson, course, exercises: provided }) {
  const t = useT();
  const controlled = Array.isArray(provided);
  const [exercises, setExercises] = useState(controlled ? provided : []);
  const [loaded, setLoaded] = useState(controlled);

  useEffect(() => {
    if (controlled || !lesson?.id) return undefined;
    let alive = true;
    listLessonExercises(lesson.id)
      .then((rows) => {
        if (!alive) return;
        setExercises(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        setExercises([]);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [controlled, lesson?.id]);

  const renderable = exercises.filter(isRenderableExercise);

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
