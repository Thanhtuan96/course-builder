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
import { buildSyllabusMessages, syllabusValidator } from '../lib/prompts/course.js';
import { generateCapstoneForCourse, capstoneCopy } from '../lib/capstone.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Textarea, Select } from '../components/ui/Input.jsx';
import { Spinner } from '../components/ui/Spinner.jsx';
import { ErrorNotice } from '../components/ui/ErrorNotice.jsx';

const LANGUAGES = ['English', 'Vietnamese', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'];

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
  const [settings] = useSettings();
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [goal, setGoal] = useState('');
  const [language, setLanguage] = useState(settings.language || 'English');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const gen = useStream();
  const copy = capstoneCopy(language);

  const propose = async () => {
    if (!topic.trim()) return;
    setError(null);
    try {
      const { system, messages } = buildSyllabusMessages({ topic, level, goal, language });
      const proposed = await gen.start(async ({ signal }) => {
        const provider = await getProvider(settings);
        const generateJson = createGenerateJson(provider.streamText.bind(provider));
        return generateJson({ system, messages, signal, validate: syllabusValidator });
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
        language,
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
        <h1 className="text-xl font-semibold">New course</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Describe what you want to learn. Professor proposes a syllabus you can edit before starting.
        </p>
      </div>

      {!draft ? (
        <Card className="space-y-4">
          <Input
            label="What do you want to learn?"
            name="topic"
            placeholder="e.g. Kubernetes networking, Music theory, Linear algebra"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Level" name="level" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
            <Select label="Lesson language" name="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="Your goal"
            name="goal"
            placeholder="e.g. Pass the CKA exam, compose my first song"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />

          <ErrorNotice error={errorObj} onDismiss={() => setError(null)} />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={propose} disabled={busy || !topic.trim()}>
              {busy && <Spinner />}
              {busy ? 'Proposing…' : 'Propose syllabus'}
            </Button>
            {busy && (
              <Button variant="secondary" onClick={gen.stop}>
                Stop
              </Button>
            )}
            <button
              type="button"
              className="text-sm text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200"
              onClick={() => start(makeSyllabus(topic, level, goal))}
            >
              Skip AI — start an empty course
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            Using a no-key AI source? Configure it in{' '}
            <Link to="/settings" className="underline">
              Settings
            </Link>
            , or open the demo course first.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="space-y-3">
            <Input label="Course title" name="courseTitle" value={draft.title} onChange={(e) => patchSyllabus({ title: e.target.value })} />
            <Textarea
              label="Description"
              name="courseDescription"
              rows={2}
              value={draft.description}
              onChange={(e) => patchSyllabus({ description: e.target.value })}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold">Course kind</h2>
            {draft.kindReason && <p className="text-sm text-neutral-600 dark:text-neutral-300">Detected: {draft.kindReason}</p>}
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
                Add to “{copy.definitionOfDone}”
              </button>
            </div>
            <Input
              label="Artifact title"
              name="artifactTitle"
              value={draft.artifact?.title || ''}
              onChange={(e) => patchArtifact({ title: e.target.value })}
              placeholder="e.g. A deployed URL shortener + repo"
            />
            <Textarea
              label="What you'll ship"
              name="artifactDeliverable"
              rows={2}
              value={draft.artifact?.deliverable || ''}
              onChange={(e) => patchArtifact({ deliverable: e.target.value })}
              placeholder="The ONE concrete, real thing this course builds toward."
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
                    placeholder="A checkable finished-state bullet"
                  />
                  <Button variant="ghost" size="sm" aria-label="Remove item" onClick={() => removeArtifactDone(index)}>
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Syllabus · {draft.lessons.length} lesson{draft.lessons.length === 1 ? '' : 's'}
              </h2>
              <Button variant="ghost" size="sm" onClick={propose} disabled={busy}>
                Regenerate
              </Button>
            </div>
            <ol className="space-y-3">
              {draft.lessons.map((lesson, index) => (
                <li key={index} className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs text-neutral-500">{index + 1}</span>
                    <div className="flex-1 space-y-2">
                      <Input
                        label={`Lesson ${index + 1} title`}
                        name={`title-${index}`}
                        value={lesson.title}
                        onChange={(e) => patchLesson(index, { title: e.target.value })}
                      />
                      <Input
                        label="Summary"
                        name={`summary-${index}`}
                        value={lesson.summary}
                        onChange={(e) => patchLesson(index, { summary: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-col gap-1 pt-1">
                      <Button variant="ghost" size="sm" aria-label="Move up" disabled={index === 0} onClick={() => moveLesson(index, -1)}>
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Move down"
                        disabled={index === draft.lessons.length - 1}
                        onClick={() => moveLesson(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button variant="ghost" size="sm" aria-label="Delete lesson" onClick={() => removeLesson(index)}>
                        ✕
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="secondary" size="sm" onClick={addLesson}>
              Add lesson
            </Button>
          </Card>

          <ErrorNotice error={errorObj} onDismiss={() => setError(null)} />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => start()} disabled={saving || !draft.title.trim()}>
              {saving ? 'Starting…' : 'Start course'}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
