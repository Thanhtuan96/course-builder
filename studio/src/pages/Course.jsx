/**
 * Course (COURSE-03) — header with level/kind/goal/progress, the lesson list with statuses and
 * Start/Continue actions, and completion date + reflection snippets for finished lessons.
 * The header action area has "Export COURSE.md" (shared with the DataPanel) and Delete.
 */
import { useEffect, useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import { getCourse, getCapstone, getLessonHistory, deleteCourse, updateCourse, onChange } from '../lib/repo/index.js';
import { progress, statusIcon, COURSE_KINDS } from '../lib/course.js';
import { useT } from '../lib/i18n/index.js';
import { languageName, uiLanguageOptions } from '../lib/i18n/languages.js';
import { generateCapstoneForCourse } from '../lib/capstone.js';
import { exportCourseMarkdown } from '../lib/course-export.js';
import { useSettings } from '../lib/settings.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Input.jsx';
import { Progress } from '../components/ui/Progress.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { CapstoneCard } from '../components/capstone/CapstoneCard.jsx';

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/** LANG-05: change the course language; existing lesson versions stay, future ones use it. */
function LanguageDialog({ course, onClose, onSaved, t }) {
  const [value, setValue] = useState(course.language || 'en');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const updated = await updateCourse(course.id, { language: value });
    setSaving(false);
    onSaved(updated);
  };

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={t('course.languageDialog.title')}>
      <Card className="w-full max-w-md space-y-4">
        <h2 className="font-semibold">{t('course.languageDialog.title')}</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('course.languageDialog.body')}</p>
        <Select label={t('course.languageDialog.label')} name="courseLanguage" value={value} onChange={(e) => setValue(e.target.value)}>
          {uiLanguageOptions().map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t('course.languageDialog.confirm')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function Course({ id }) {
  const t = useT();
  const [settings] = useSettings();
  const [course, setCourse] = useState(null);
  const [capstone, setCapstone] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [reflections, setReflections] = useState({});
  const [generating, setGenerating] = useState(false);
  const [capstoneError, setCapstoneError] = useState(null);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const c = await getCourse(id);
      const cp = c ? await getCapstone(id) : null;
      if (!alive) return;
      setCourse(c);
      setCapstone(cp);
    };
    refresh().finally(() => alive && setLoaded(true));
    const off = onChange((detail) => {
      if (['courses', 'lessons', 'capstones', '*'].includes(detail.table)) refresh().catch(() => {});
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

  if (!loaded) return <p className="text-sm text-neutral-500">{t('common.loading')}</p>;
  if (!course) {
    return (
      <EmptyState
        title={t('course.notFound.title')}
        description={t('course.notFound.description')}
        action={<Link to="/"><Button variant="secondary">{t('course.notFound.back')}</Button></Link>}
      />
    );
  }

  const stats = progress(course);
  const kindLabel = COURSE_KINDS.find((k) => k.id === course.kind)?.label;

  const remove = async () => {
    if (!window.confirm(t('course.deleteConfirm', { title: course.title }))) return;
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

  const generateCapstone = async () => {
    setGenerating(true);
    setCapstoneError(null);
    try {
      const created = await generateCapstoneForCourse({ course, artifact: capstone?.artifact, settings });
      setCapstone(created);
    } catch (err) {
      setCapstoneError(err);
    } finally {
      setGenerating(false);
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
            <Badge tone="neutral">{languageName(course.language)}</Badge>
            {course.status === 'completed' && <Badge tone="success">{t('course.complete')}</Badge>}
          </div>
          {course.goal && <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('course.goal', { goal: course.goal })}</p>}
          {course.description && <p className="text-sm text-neutral-500">{course.description}</p>}
          <Progress value={stats.pct} label={t('common.lessonsDoneShort', { done: stats.done, total: stats.total })} />
          <p className="text-xs text-neutral-500">{t('common.lessonsDone', { done: stats.done, total: stats.total })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setLangOpen(true)}>
            {t('course.changeLanguage')}
          </Button>
          <Button variant="secondary" size="sm" onClick={exportMd}>
            {t('course.exportMd')}
          </Button>
          <Button variant="danger" size="sm" onClick={remove}>
            {t('course.delete')}
          </Button>
        </div>
      </div>

      <CapstoneCard
        course={course}
        capstone={capstone}
        generating={generating}
        error={capstoneError}
        onGenerate={generateCapstone}
        onDismissError={() => setCapstoneError(null)}
      />

      <div className="space-y-2">
        {course.lessons.map((lesson) => {
          const reflection = reflections[lesson.id];
          const label = t(`course.lessonLabel.${lesson.status === 'done' ? 'done' : lesson.status === 'active' ? 'active' : 'todo'}`);
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
                    <p className="mt-1 text-xs text-neutral-400">
                      {t('course.completedOn', { date: formatDate(lesson.completed_at) })}
                    </p>
                  )}
                  {reflection?.hardest && (
                    <p className="mt-1 text-xs text-neutral-500 italic">
                      {t('course.hardest', { text: reflection.hardest })}
                    </p>
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

      {langOpen && (
        <LanguageDialog
          course={course}
          t={t}
          onClose={() => setLangOpen(false)}
          onSaved={(updated) => {
            setCourse((c) => ({ ...c, ...updated }));
            setLangOpen(false);
          }}
        />
      )}
    </div>
  );
}
