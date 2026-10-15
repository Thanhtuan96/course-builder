/**
 * Lesson page (final). Layout: breadcrumb + status, lesson content, Practice/Tutor tabs, and a
 * "Mark done" reflection dialog.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import { getCourse, updateLesson, saveReflection, logActivity, onChange } from '../lib/repo/index.js';
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
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Finish lesson">
      <Card className="w-full max-w-md space-y-4">
        <h2 className="font-semibold">Finish “{lesson.title}”</h2>
        <Textarea
          label="What was hardest?"
          name="hardest"
          rows={3}
          value={hardest}
          onChange={(e) => setHardest(e.target.value)}
          placeholder="The part that took the most effort…"
        />
        <Select label="Confidence" name="confidence" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} — {['Lost', 'Shaky', 'Okay', 'Solid', 'Could teach it'][n - 1]}
            </option>
          ))}
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Mark done'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function Lesson({ id, lessonId }) {
  const [course, setCourse] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('practice');
  const [reflecting, setReflecting] = useState(false);

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

  if (!loaded) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (!course || !lesson) {
    return <EmptyState title="Lesson not found" action={<Link to={`/course/${id}`}><Button variant="secondary">Back to course</Button></Link>} />;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <nav className="text-xs text-neutral-500">
          <Link to="/" className="hover:underline">
            Home
          </Link>{' '}
          /{' '}
          <Link to={`/course/${course.id}`} className="hover:underline">
            {course.title}
          </Link>{' '}
          / Lesson {lesson.position}
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">{lesson.title}</h1>
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[lesson.status]}>{lesson.status}</Badge>
            {lesson.status !== 'done' && <Button onClick={() => setReflecting(true)}>Mark done</Button>}
            {lesson.status === 'done' && (
              <Button variant="secondary" onClick={() => setReflecting(true)}>
                Revisit reflection
              </Button>
            )}
          </div>
        </div>
      </div>

      <LessonContent lesson={lesson} course={course} />

      <div className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex gap-1">
          {[
            { id: 'practice', label: 'Practice' },
            { id: 'tutor', label: 'Tutor' },
            ...(course.kind === 'programming' ? [{ id: 'workspace', label: 'Workspace' }] : []),
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'practice' && <LessonPractice lesson={lesson} course={course} />}
      {tab === 'tutor' && <TutorPanel lesson={lesson} course={course} />}
      {tab === 'workspace' && course.kind === 'programming' && (
        <Suspense fallback={<p className="text-sm text-neutral-500">Loading workspace…</p>}>
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
