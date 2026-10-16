/**
 * Lesson page (final). Layout: breadcrumb + status, lesson content, Practice/Tutor tabs, and a
 * "Mark done" reflection dialog.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import {
  getCourse,
  getCapstone,
  getLatestCapstoneSubmission,
  updateLesson,
  saveReflection,
  logActivity,
  onChange,
} from '../lib/repo/index.js';
import { capstoneUnlocked } from '../lib/capstone.js';
import { useT } from '../lib/i18n/index.js';
import { Badge } from '../components/ui/Badge.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Textarea, Select } from '../components/ui/Input.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { LessonContent } from '../components/course/LessonContent.jsx';
import { LessonPractice } from '../components/practice/LessonPractice.jsx';
import { TutorPanel } from '../components/tutor/TutorPanel.jsx';

// CodeMirror, the language grammars and sql.js are heavy — only load the workspace for a
// programming course, and only when its tab is opened (brief §10, keeps the main chunk small).
const CodeWorkspace = lazy(() =>
  import('../components/workspace/CodeWorkspace.jsx').then((m) => ({ default: m.CodeWorkspace }))
);

const STATUS_TONE = { done: 'success', active: 'accent', todo: 'neutral' };

function ReflectionDialog({ lesson, onClose, onSaved }) {
  const t = useT();
  const [hardest, setHardest] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await saveReflection(lesson.id, { hardest, confidence });
    await updateLesson(lesson.id, { status: 'done' });
    await logActivity('lesson_done', lesson.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('reflection.aria')}>
      <Card className="w-full max-w-md space-y-4">
        <h2 className="font-semibold">{t('reflection.title', { title: lesson.title })}</h2>
        <Textarea
          label={t('reflection.hardest')}
          name="hardest"
          rows={3}
          value={hardest}
          onChange={(e) => setHardest(e.target.value)}
          placeholder={t('reflection.hardestPlaceholder')}
        />
        <Select label={t('reflection.confidence')} name="confidence" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} — {t(`reflection.confidenceLabels.${n}`)}
            </option>
          ))}
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('reflection.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? t('reflection.saving') : t('reflection.markDone')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function Lesson({ id, lessonId }) {
  const t = useT();
  const [course, setCourse] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('practice');
  const [reflecting, setReflecting] = useState(false);
  const [capstoneActive, setCapstoneActive] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      getCourse(id)
        .then((c) => alive && setCourse(c))
        .finally(() => alive && setLoaded(true));
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'lessons' || detail.table === 'lesson_versions' || detail.table === '*') refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [id]);

  const lesson = course?.lessons.find((l) => l.id === lessonId) || null;

  useEffect(() => {
    if (lesson && lesson.status === 'todo') updateLesson(lesson.id, { status: 'active' });
  }, [lesson?.id, lesson?.status]);

  // CAP-02: once the capstone is unlocked (all lessons done) and not yet completed, the tutor is
  // in capstone mode course-wide — concept discussion only, no hints/code/answers.
  useEffect(() => {
    let alive = true;
    if (!course || course.status === 'completed' || !capstoneUnlocked(course)) {
      setCapstoneActive(false);
      return () => {
        alive = false;
      };
    }
    (async () => {
      const capstone = await getCapstone(course.id).catch(() => null);
      const latest = capstone ? await getLatestCapstoneSubmission(capstone.id).catch(() => null) : null;
      if (alive) setCapstoneActive(Boolean(capstone) && latest?.verdict !== 'course_complete');
    })();
    return () => {
      alive = false;
    };
  }, [course]);

  if (!loaded) return <p className="text-sm text-neutral-500">{t('common.loading')}</p>;
  if (!course || !lesson) {
    return <EmptyState title={t('lesson.notFound')} action={<Link to={`/course/${id}`}><Button variant="secondary">{t('lesson.backToCourse')}</Button></Link>} />;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <nav className="text-xs text-neutral-500">
          <Link to="/" className="hover:underline">
            {t('lesson.home')}
          </Link>{' '}
          /{' '}
          <Link to={`/course/${course.id}`} className="hover:underline">
            {course.title}
          </Link>{' '}
          / {t('lesson.breadcrumb', { n: lesson.position })}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{lesson.title}</h1>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[lesson.status]}>{t(`lesson.status.${lesson.status}`)}</Badge>
            {lesson.status !== 'done' && <Button onClick={() => setReflecting(true)}>{t('lesson.markDone')}</Button>}
            {lesson.status === 'done' && (
              <Button variant="secondary" onClick={() => setReflecting(true)}>
                {t('lesson.revisit')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <LessonContent lesson={lesson} course={course} />

      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex gap-1">
          {[
            { id: 'practice', label: t('lesson.tabs.practice') },
            { id: 'tutor', label: t('lesson.tabs.tutor') },
            ...(course.kind === 'programming' ? [{ id: 'workspace', label: t('lesson.tabs.workspace') }] : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                tab === item.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'practice' && <LessonPractice lesson={lesson} course={course} />}
      {tab === 'tutor' && <TutorPanel lesson={lesson} course={course} capstone={capstoneActive} />}
      {tab === 'workspace' && course.kind === 'programming' && (
        <Suspense fallback={<p className="text-sm text-neutral-500">{t('lesson.loadingWorkspace')}</p>}>
          <CodeWorkspace lesson={lesson} course={course} />
        </Suspense>
      )}

      {reflecting && (
        <ReflectionDialog
          lesson={lesson}
          onClose={() => setReflecting(false)}
          onSaved={() => {
            setReflecting(false);
            navigate(`/course/${course.id}`);
          }}
        />
      )}
    </div>
  );
}
