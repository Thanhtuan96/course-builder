/**
 * FlashcardGenerator — generate 5–8 flashcards from a lesson, preview/edit/delete them, then save
 * into the spaced-repetition queue (PRACTICE-02). Existing cards for the lesson are deduped so a
 * card never enters twice. Editing is non-destructive: nothing is written until the learner saves.
 */
import { useCallback, useState } from 'react';
import { getLessonContent, addCards, logActivity } from '../../lib/repo/index.js';
import { useSettings } from '../../lib/settings.js';
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
        new ProviderError('unknown', 'This lesson has no content yet.', 'Generate or open the lesson first, then try again.')
      );
      return;
    }
    const existing = await existingFronts(lesson.id);
    const { system, messages } = buildFlashcardsMessages({ course, lesson, content: content.content_md });
    try {
      const provider = await getProvider(settings);
      const result = await start(({ signal }) =>
        provider.generateJson({ system, messages, signal, validate: validateFlashcards })
      );
      const normalized = normalizeFlashcards(result);
      const fresh = dedupeCards(normalized, existing);
      setSkipped(normalized.length - fresh.length);
      setCards(fresh.map((c) => ({ ...c, key: (rowKey += 1) })));
    } catch {
      /* useStream surfaces the actionable error */
    }
  }, [lesson?.id, course, settings, start]);

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
            <Spinner label="Generating flashcards" /> Writing flashcards…
          </span>
          <Button variant="danger" size="sm" onClick={stop}>
            Stop
          </Button>
        </div>
      )}

      {(error || streamError) && <ErrorNotice error={error || streamError} onDismiss={() => setError(null)} />}

      {savedCount !== null && !busy && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Added {savedCount} card{savedCount === 1 ? '' : 's'} to your review queue.
        </p>
      )}

      {!cards && !busy && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Turn this lesson into a few flashcards and they will enter your spaced-repetition queue.
        </p>
      )}

      {cards && !busy && (
        <div className="space-y-3">
          {skipped > 0 && (
            <p className="text-xs text-neutral-500">{skipped} card{skipped === 1 ? '' : 's'} already in your deck were skipped.</p>
          )}
          {cards.length === 0 ? (
            <p className="text-sm text-neutral-500">Everything from this lesson is already in your deck.</p>
          ) : (
            cards.map((card) => (
              <div key={card.key} className="space-y-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <Input
                  label="Front"
                  name={`front-${card.key}`}
                  value={card.front}
                  onChange={(e) => update(card.key, { front: e.target.value })}
                />
                <Input
                  label="Back"
                  name={`back-${card.key}`}
                  value={card.back}
                  onChange={(e) => update(card.key, { back: e.target.value })}
                />
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => remove(card.key)}>
                    Delete
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
              {saving ? 'Saving…' : `Save ${cards.length} card${cards.length === 1 ? '' : 's'}`}
            </Button>
          )}
          <Button variant={cards ? 'secondary' : 'primary'} onClick={generate}>
            {cards ? 'Generate again' : 'Generate flashcards'}
          </Button>
        </div>
      )}
    </Card>
  );
}
