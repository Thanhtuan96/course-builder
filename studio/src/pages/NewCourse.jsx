/**
 * NewCourse — STUB (Phase 23 owns this file; replace in place). Minimal manual course creation
 * so the app is usable without AI before Phase 23 adds prompt-driven syllabi.
 */
import { useState } from 'react';
import { navigate } from '../lib/router.js';
import { createCourse } from '../lib/repo/index.js';
import { LEVELS } from '../lib/course.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input, Textarea, Select } from '../components/ui/Input.jsx';
import { ErrorNotice } from '../components/ui/ErrorNotice.jsx';

export function NewCourse() {
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('Beginner');
  const [goal, setGoal] = useState('');
  const [lessonsText, setLessonsText] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const lessons = lessonsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ title: line }));
      const course = await createCourse({
        title: title.trim(),
        level,
        goal: goal.trim(),
        source: 'manual',
        lessons: lessons.length ? lessons : [{ title: title.trim() }],
      });
      navigate(`/course/${course.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New course</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Prompt-driven syllabi arrive in the next update. For now, add a course and its lessons manually.
      </p>
      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <Input label="Title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select label="Level" name="level" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Input label="Goal" name="goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <Textarea
            label="Lessons"
            name="lessons"
            rows={5}
            hint="One lesson title per line. Leave empty to start with a single lesson."
            value={lessonsText}
            onChange={(e) => setLessonsText(e.target.value)}
          />
          <ErrorNotice error={error} onDismiss={() => setError(null)} />
          <Button type="submit" disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Create course'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
