/**
 * LessonContent (LESSON-01, LESSON-02, LESSON-05) — renders the selected lesson version's safe
 * Markdown, or streams a freshly generated lesson. Regenerating always ADDS a version via
 * `repo.addLessonVersion`, so nothing a learner already has is ever overwritten.
 */
import { useEffect, useMemo, useState } from 'react';
import { getLessonContent, listLessonVersions, addLessonVersion, onChange } from '../../lib/repo/index.js';
import { getProvider, MAX_TOKENS } from '../../lib/ai/index.js';
import { useStream } from '../../lib/ai/useStream.js';
import { useSettings, activeModel } from '../../lib/settings.js';
import { buildLessonMessages } from '../../lib/prompts/lesson.js';
import { Markdown } from '../ui/Markdown.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';

function timeLabel(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function versionLabel(v) {
  const time = timeLabel(v.created_at);
  const model = v.model || v.provider || '';
  return [`v${v.version}`, time && `generated ${time}`, model].filter(Boolean).join(' · ');
}

export function LessonContent({ lesson, course }) {
  const [settings] = useSettings();
  const [versions, setVersions] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const gen = useStream();

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      Promise.all([listLessonVersions(lesson.id), getLessonContent(lesson.id)])
        .then(([list, current]) => {
          if (!alive) return;
          setVersions(list);
          setSelectedId((prev) => {
            if (prev && list.some((v) => v.id === prev)) return prev;
            return current?.id || list[list.length - 1]?.id || null;
          });
        })
        .catch(() => alive && setVersions([]));
    refresh();
    const off = onChange((detail) => {
      if (detail.table === 'lesson_versions' && (detail.id == null || detail.type === 'create')) refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, [lesson.id]);

  const selected = useMemo(() => versions?.find((v) => v.id === selectedId) || null, [versions, selectedId]);

  const generate = async () => {
    setError(null);
    try {
      const provider = getProvider(settings);
      const { system, messages } = buildLessonMessages({
        course,
        lesson,
        level: course?.level,
        language: settings.language,
      });
      const text = await gen.start(({ onText, signal }) =>
        provider.streamText({ system, messages, onText, signal, effort: 'high', maxTokens: MAX_TOKENS.lesson })
      );
      if (text && text.trim()) {
        const row = await addLessonVersion(lesson.id, {
          content_md: text,
          model: activeModel(settings),
          provider: settings.provider,
        });
        setSelectedId(row.id);
      }
    } catch (err) {
      setError(err);
    }
  };

  const regenerate = () => {
    const ok = window.confirm(
      'Regenerate this lesson? This calls the AI again and costs tokens. Your current version is kept.'
    );
    if (ok) generate();
  };

  if (versions === null) return <p className="text-sm text-neutral-500">Loading lesson…</p>;

  const streaming = gen.status === 'streaming';
  const hasContent = Boolean(selected?.content_md);

  if (!hasContent && !streaming) {
    return (
      <div className="space-y-3">
        <EmptyState
          title="No lesson content yet"
          description="Generate this lesson from the course context and your level. You can regenerate later — older versions are never overwritten."
          action={
            <Button onClick={generate}>
              Generate lesson
            </Button>
          }
        />
        <ErrorNotice error={error || gen.error} onDismiss={() => setError(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {versions.length > 1 ? (
            <label className="text-sm">
              <span className="sr-only">Lesson version</span>
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                {[...versions].reverse().map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            selected && <span className="text-xs text-neutral-500">{versionLabel(selected)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {streaming && <Spinner />}
          {streaming ? (
            <Button variant="secondary" onClick={gen.stop}>
              Stop
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={regenerate}>
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {(error || gen.error) && <ErrorNotice error={error || gen.error} onDismiss={() => setError(null)} />}

      {streaming ? (
        <Card className="bg-neutral-50 dark:bg-neutral-900/50">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">Generating lesson…</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm text-neutral-700 dark:text-neutral-200">
            {gen.text || '…'}
          </pre>
        </Card>
      ) : (
        <Markdown>{selected.content_md}</Markdown>
      )}
    </div>
  );
}
