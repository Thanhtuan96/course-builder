/**
 * FlashcardGenerator — generate 5–8 flashcards from a lesson, preview/edit/delete them, then save
 * into the spaced-repetition queue (PRACTICE-02). Existing cards for the lesson are deduped so a
 * card never enters twice. Editing is non-destructive: nothing is written until the learner saves.
 */
import { useCallback, useState } from 'react';
import { getLessonContent, addCards, logActivity } from '../../lib/repo/index.js';
import { useSettings } from '../../lib/settings.js';
import { useT } from '../../lib/i18n/index.js';
import { getProvider, ProviderError } from '../../lib/ai/index.js';
import { useStream } from '../../lib/ai/useStream.js';
import { buildFlashcardsMessages, normalizeFlashcards, validateFlashcards } from '../../lib/prompts/practice.js';
import { dedupeCards, existingFronts } from './card-store.js';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';

let rowKey = 0;

export function FlashcardGenerator({ lesson, course }) {
  const t = useT();
  const [settings] = useSettings();
  const [cards, setCards] = useState(null); // preview list or null before generation
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(null);
  const { status, error: streamError, start, stop } = useStream();

  const generate = useCallback(async () => {
    setError(null);
    setSavedCount(null);
    setSkipped(0);
    const content = await getLessonContent(lesson.id).catch(() => null);
    if (!content?.content_md) {
      setError(
        new ProviderError('unknown', t('practice.flashcards.noContent'), t('practice.flashcards.noContentHint'))
      );
      return;
    }
    const existing = await existingFronts(lesson.id);
    const language = course?.language ?? settings.language;
    const { system, messages } = buildFlashcardsMessages({
      course,
      lesson,
      content: content.content_md,
      language,
    });
    try {
      const provider = await getProvider(settings);
      const result = await start(({ signal }) =>
        provider.generateJson({ system, messages, signal, validate: validateFlashcards, language })
      );
      const normalized = normalizeFlashcards(result);
      const fresh = dedupeCards(normalized, existing);
      setSkipped(normalized.length - fresh.length);
      setCards(fresh.map((c) => ({ ...c, key: (rowKey += 1) })));
    } catch {
      /* useStream surfaces the actionable error */
    }
  }, [lesson?.id, course, settings, start, t]);

  const update = (key, patch) => setCards((rows) => rows.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const remove = (key) => setCards((rows) => rows.filter((c) => c.key !== key));

  const save = async () => {
    const clean = dedupeCards(cards || []);
    if (!clean.length) return;
    setSaving(true);
    setError(null);
    try {
      await addCards(course.id, lesson.id, clean);
      await logActivity('flashcards', lesson.id);
      setSavedCount(clean.length);
      setCards(null);
      setSkipped(0);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const busy = status === 'streaming';

  return (
    <Card className="space-y-4">
      {busy && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <Spinner label={t('practice.flashcards.generating')} /> {t('practice.flashcards.writing')}
          </span>
          <Button variant="danger" size="sm" onClick={stop}>
            {t('practice.flashcards.stop')}
          </Button>
        </div>
      )}

      {(error || streamError) && <ErrorNotice error={error || streamError} onDismiss={() => setError(null)} />}

      {savedCount !== null && !busy && (
        <p className="text-sm text-green-700 dark:text-green-400">
          {t('practice.flashcards.added', { count: savedCount, cardWord: t('common.card', { count: savedCount }) })}
        </p>
      )}

      {!cards && !busy && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('practice.flashcards.intro')}</p>
      )}

      {cards && !busy && (
        <div className="space-y-3">
          {skipped > 0 && (
            <p className="text-xs text-neutral-500">
              {t('practice.flashcards.skipped', { count: skipped, cardWord: t('common.card', { count: skipped }) })}
            </p>
          )}
          {cards.length === 0 ? (
            <p className="text-sm text-neutral-500">{t('practice.flashcards.alreadyInDeck')}</p>
          ) : (
            cards.map((card) => (
              <div key={card.key} className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <Input
                  label={t('practice.flashcards.front')}
                  name={`front-${card.key}`}
                  value={card.front}
                  onChange={(e) => update(card.key, { front: e.target.value })}
                />
                <Input
                  label={t('practice.flashcards.back')}
                  name={`back-${card.key}`}
                  value={card.back}
                  onChange={(e) => update(card.key, { back: e.target.value })}
                />
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => remove(card.key)}>
                    {t('practice.flashcards.delete')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {!busy && (
        <div className="flex flex-wrap gap-2">
          {cards && cards.length > 0 && (
            <Button onClick={save} disabled={saving}>
              {saving
                ? t('common.saving')
                : t('practice.flashcards.save', { count: cards.length, cardWord: t('common.card', { count: cards.length }) })}
            </Button>
          )}
          <Button variant={cards ? 'secondary' : 'primary'} onClick={generate}>
            {cards ? t('practice.flashcards.generateAgain') : t('practice.flashcards.generate')}
          </Button>
        </div>
      )}
    </Card>
  );
}
