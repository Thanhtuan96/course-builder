/**
 * NewCourse (COURSE-01, COURSE-02, COURSE-05) — prompt → editable syllabus → kind → save.
 *
 * The AI proposes a JSON syllabus (validated + repaired by `generateJson`); the learner keeps full
 * control: rename, edit summaries, reorder, add, delete, regenerate, and change the proposed course
 * kind before starting. `useStream` supplies the streaming status, Stop button and error surface.
 */
import { useState } from 'react';
import { Link, navigate } from '../lib/router.js';
import { createCourse } from '../lib/repo/index.js';
import { LEVELS, COURSE_KINDS, COURSE_KIND_IDS } from '../lib/course.js';
import { getProvider, createGenerateJson } from '../lib/ai/index.js';
import { useStream } from '../lib/ai/useStream.js';
import { useSettings } from '../lib/settings.js';
import { useT } from '../lib/i18n/index.js';
import { uiLanguageOptions } from '../lib/i18n/languages.js';
import { buildSyllabusMessages, syllabusValidator } from '../lib/prompts/course.js';
import { generateCapstoneForCourse, capstoneCopy } from '../lib/capstone.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Textarea, Select } from '../components/ui/Input.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ErrorNotice } from '../components/ui/ErrorNotice.jsx';

function makeSyllabus(topic, level, goal) {
  return {
    title: topic,
    description: goal,
    kind: 'conceptual',
    kindReason: '',
    artifact: { title: '', deliverable: '', definitionOfDone: [] },
    lessons: [{ title: topic || 'Lesson 1', summary: '' }],
  };
}

export function NewCourse() {
  const t = useT();
  const [settings] = useSettings();
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [goal, setGoal] = useState('');
  // LANG-01: the course uses the single learning language by default; the disclosure opts out.
  const [useDifferentLanguage, setUseDifferentLanguage] = useState(false);
  const [language, setLanguage] = useState(settings.language);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const effectiveLanguage = useDifferentLanguage ? language : settings.language;

  const gen = useStream();
  const copy = capstoneCopy(effectiveLanguage);

  const propose = async () => {
    if (!topic.trim()) return;
    setError(null);
    try {
      const { system, messages } = buildSyllabusMessages({ topic, level, goal, language: effectiveLanguage });
      const proposed = await gen.start(async ({ signal }) => {
        const provider = await getProvider(settings);
        const generateJson = createGenerateJson(provider.streamText.bind(provider));
        return generateJson({ system, messages, signal, validate: syllabusValidator, language: effectiveLanguage });
      });
      if (proposed) setDraft(proposed);
    } catch {
      /* gen.error renders below */
    }
  };

  const patchSyllabus = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const patchArtifact = (patch) =>
    setDraft((d) => ({ ...d, artifact: { title: '', deliverable: '', definitionOfDone: [], ...(d.artifact || {}), ...patch } }));
  const patchArtifactDone = (patch, index) =>
    setDraft((d) => {
      const current = d.artifact?.definitionOfDone || [];
      const definitionOfDone = current.map((item, i) => (i === index ? patch(item) : item));
      return { ...d, artifact: { ...d.artifact, definitionOfDone } };
    });
  const addArtifactDone = () =>
    setDraft((d) => ({
      ...d,
      artifact: { ...d.artifact, definitionOfDone: [...(d.artifact?.definitionOfDone || []), ''] },
    }));
  const removeArtifactDone = (index) =>
    setDraft((d) => ({
      ...d,
      artifact: { ...d.artifact, definitionOfDone: (d.artifact?.definitionOfDone || []).filter((_, i) => i !== index) },
    }));
  const patchLesson = (index, patch) =>
    setDraft((d) => ({ ...d, lessons: d.lessons.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
  const moveLesson = (index, dir) =>
    setDraft((d) => {
      const next = [...d.lessons];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, lessons: next };
    });
  const addLesson = () => setDraft((d) => ({ ...d, lessons: [...d.lessons, { title: '', summary: '' }] }));
  const removeLesson = (index) =>
    setDraft((d) => ({ ...d, lessons: d.lessons.filter((_, i) => i !== index) }));

  const start = async (input) => {
    const syllabus = input || draft;
    if (!syllabus || !syllabus.title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const course = await createCourse({
        title: syllabus.title.trim(),
        description: syllabus.description || '',
        level,
        goal: goal.trim(),
        language: effectiveLanguage,
        kind: COURSE_KIND_IDS.includes(syllabus.kind) ? syllabus.kind : 'conceptual',
        source: input ? 'manual' : 'ai',
        lessons: syllabus.lessons
          .filter((l) => l.title.trim())
          .map((l) => ({ title: l.title.trim(), summary: l.summary || '' })),
      });

      // The capstone is generated as a second JSON call at creation (CAP-01). If it fails the course
      // is already saved, so the learner can retry from the Course page's "Generate capstone" action.
      if (!input) {
        try {
          await generateCapstoneForCourse({ course, artifact: syllabus.artifact, settings });
        } catch {
          /* non-fatal — the Course page offers a one-off "Generate capstone" */
        }
      }

      navigate(`/course/${course.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const errorObj = error || gen.error;
  const busy = gen.status === 'streaming';

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('newCourse.title')}</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('newCourse.subtitle')}</p>
      </div>

      {!draft ? (
        <Card className="space-y-4">
          <Input
            label={t('newCourse.topic.label')}
            name="topic"
            placeholder={t('newCourse.topic.placeholder')}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label={t('newCourse.level')} name="level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
            {useDifferentLanguage && (
              <Select
                label={t('newCourse.language')}
                name="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {uiLanguageOptions().map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={useDifferentLanguage}
              onChange={(e) => setUseDifferentLanguage(e.target.checked)}
            />
            {t('newCourse.useDifferent')}
          </label>
          <Input
            label={t('newCourse.goal.label')}
            name="goal"
            placeholder={t('newCourse.goal.placeholder')}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />

          <ErrorNotice error={errorObj} onDismiss={() => setError(null)} />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={propose} disabled={busy || !topic.trim()}>
              {busy && <Spinner />}
              {busy ? t('newCourse.proposing') : t('newCourse.propose')}
            </Button>
            {busy && (
              <Button variant="secondary" onClick={gen.stop}>
                {t('newCourse.stop')}
              </Button>
            )}
            <button
              type="button"
              className="text-sm text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
              onClick={() => start(makeSyllabus(topic, level, goal))}
            >
              {t('newCourse.skipAi')}
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            {t('newCourse.hint.before')}{' '}
            <Link to="/settings" className="underline">
              {t('newCourse.hint.settingsLink')}
            </Link>
            {t('newCourse.hint.after')}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3">
            <Input label={t('newCourse.courseTitle')} name="courseTitle" value={draft.title} onChange={(e) => patchSyllabus({ title: e.target.value })} />
            <Textarea
              label={t('newCourse.description')}
              name="courseDescription"
              rows={2}
              value={draft.description}
              onChange={(e) => patchSyllabus({ description: e.target.value })}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">{t('newCourse.courseKind')}</h2>
            {draft.kindReason && (
              <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('newCourse.detected', { reason: draft.kindReason })}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {COURSE_KINDS.map((k) => {
                const active = draft.kind === k.id;
                return (
                  <button
                    key={k.id}
                    type="button"
                    title={k.description}
                    onClick={() => patchSyllabus({ kind: k.id, kindReason: '' })}
                    className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300'
                        : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {k.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-neutral-500">
              {COURSE_KINDS.find((k) => k.id === draft.kind)?.description}
            </p>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{copy.yourArtifact}</h2>
              <button
                type="button"
                onClick={addArtifactDone}
                className="text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                {t('newCourse.addToDo', { label: copy.definitionOfDone })}
              </button>
            </div>
            <Input
              label={t('newCourse.artifactTitle')}
              name="artifactTitle"
              value={draft.artifact?.title || ''}
              onChange={(e) => patchArtifact({ title: e.target.value })}
              placeholder={t('newCourse.artifactTitlePlaceholder')}
            />
            <Textarea
              label={t('newCourse.deliverable')}
              name="artifactDeliverable"
              rows={2}
              value={draft.artifact?.deliverable || ''}
              onChange={(e) => patchArtifact({ deliverable: e.target.value })}
              placeholder={t('newCourse.deliverablePlaceholder')}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">{copy.definitionOfDone}</p>
              {(draft.artifact?.definitionOfDone || []).map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    name={`artifact-done-${index}`}
                    className="flex-1"
                    value={item}
                    onChange={(e) => patchArtifactDone(() => e.target.value, index)}
                    placeholder={t('newCourse.doneBulletPlaceholder')}
                  />
                  <Button variant="ghost" size="sm" aria-label={t('newCourse.removeItem')} onClick={() => removeArtifactDone(index)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t('newCourse.syllabus', {
                  count: draft.lessons.length,
                  lessonWord: t('common.lesson', { count: draft.lessons.length }),
                })}
              </h2>
              <Button variant="ghost" size="sm" onClick={propose} disabled={busy}>
                {t('common.regenerate')}
              </Button>
            </div>
            <ol className="space-y-3">
              {draft.lessons.map((lesson, index) => (
                <li key={index} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs text-neutral-500">{index + 1}</span>
                    <div className="flex-1 space-y-2">
                      <Input
                        label={t('newCourse.lessonNTitle', { n: index + 1 })}
                        name={`title-${index}`}
                        value={lesson.title}
                        onChange={(e) => patchLesson(index, { title: e.target.value })}
                      />
                      <Input
                        label={t('newCourse.summary')}
                        name={`summary-${index}`}
                        value={lesson.summary}
                        onChange={(e) => patchLesson(index, { summary: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1 pt-1">
                      <Button variant="ghost" size="sm" aria-label={t('newCourse.moveUp')} disabled={index === 0} onClick={() => moveLesson(index, -1)}>
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('newCourse.moveDown')}
                        disabled={index === draft.lessons.length - 1}
                        onClick={() => moveLesson(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button variant="ghost" size="sm" aria-label={t('common.delete')} onClick={() => removeLesson(index)}>
                        ✕
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="secondary" size="sm" onClick={addLesson}>
              {t('newCourse.addLesson')}
            </Button>
          </Card>

          <ErrorNotice error={errorObj} onDismiss={() => setError(null)} />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => start()} disabled={saving || !draft.title.trim()}>
              {saving ? t('newCourse.starting') : t('newCourse.start')}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t('common.back')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
