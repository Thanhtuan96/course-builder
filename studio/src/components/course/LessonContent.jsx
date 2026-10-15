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
import { useT } from '../../lib/i18n/index.js';
import { isEnglish, languageName, normalizeLanguage } from '../../lib/i18n/languages.js';
import { checkLanguage } from '../../lib/i18n/detect.js';
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

function versionLabel(v, t) {
  const time = timeLabel(v.created_at);
  const model = v.model || v.provider || '';
  return [`v${v.version}`, time && t('lesson.generated', { time }), model].filter(Boolean).join(' · ');
}

export function LessonContent({ lesson, course }) {
  const t = useT();
  const [settings] = useSettings();
  const [versions, setVersions] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [langNotice, setLangNotice] = useState(false);
  const gen = useStream();
  const courseLanguage = course?.language ?? settings.language;

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

  /** One generation run; `strict` adds the stronger post-retry language instruction (LANG-04). */
  const runGenerate = async (strict) => {
    const provider = await getProvider(settings);
    const { system, messages } = buildLessonMessages({
      course,
      lesson,
      level: course?.level,
      language: courseLanguage,
      strict,
    });
    return gen.start(({ onText, signal }) =>
      provider.streamText({ system, messages, onText, signal, effort: 'high', maxTokens: MAX_TOKENS.lesson })
    );
  };

  const store = async (text) => {
    const row = await addLessonVersion(lesson.id, {
      content_md: text,
      model: activeModel(settings),
      provider: settings.provider,
      language: courseLanguage,
    });
    return row;
  };

  const generate = async () => {
    setError(null);
    setLangNotice(false);
    try {
      const first = await runGenerate(false);
      if (!first || !first.trim()) return;
      const firstRow = await store(first);
      setSelectedId(firstRow.id);

      // LANG-04: enforce a non-English course language; if the model drifted, regenerate ONCE with
      // a stronger instruction and keep BOTH versions.
      if (!isEnglish(courseLanguage) && !checkLanguage(first, courseLanguage).ok) {
        setLangNotice(true);
        const second = await runGenerate(true);
        if (second && second.trim()) {
          const secondRow = await store(second);
          setSelectedId(secondRow.id);
        }
      }
    } catch (err) {
      setError(err);
    }
  };

  const regenerate = () => {
    const ok = window.confirm(t('lesson.regenerateConfirm'));
    if (ok) generate();
  };

  if (versions === null) return <p className="text-sm text-neutral-500">{t('lesson.loading')}</p>;

  const streaming = gen.status === 'streaming';
  const hasContent = Boolean(selected?.content_md);

  if (!hasContent && !streaming) {
    return (
      <div className="space-y-3">
        <EmptyState
          title={t('lesson.noContent.title')}
          description={t('lesson.noContent.description')}
          action={
            <Button onClick={generate}>
              {t('lesson.noContent.action')}
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
              <span className="sr-only">{t('lesson.version')}</span>
              <select
                value={selectedId || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
              >
                {[...versions].reverse().map((v) => (
                  <option key={v.id} value={v.id}>
                    {versionLabel(v, t)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            selected && <span className="text-xs text-neutral-500">{versionLabel(selected, t)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {streaming && <Spinner />}
          {streaming ? (
            <Button variant="secondary" onClick={gen.stop}>
              {t('common.stop')}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={regenerate}>
              {selected?.language && normalizeLanguage(selected.language) !== normalizeLanguage(courseLanguage)
                ? t('lesson.regenerateIn', { language: languageName(courseLanguage) })
                : t('common.regenerate')}
            </Button>
          )}
        </div>
      </div>

      {(error || gen.error) && <ErrorNotice error={error || gen.error} onDismiss={() => setError(null)} />}

      {langNotice && !streaming && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {t('lesson.languageNotice', { language: languageName(courseLanguage) })}
        </p>
      )}

      {streaming ? (
        <Card className="bg-neutral-50 dark:bg-neutral-900/50">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">{t('lesson.generating')}</p>
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
