/**
 * `journal-entry` widget (仕訳): debit/credit rows over the exercise's chart of accounts.
 *
 * All interaction goes through the pure reducer in `lib/exercises/journal-entry.js`, so grading and
 * the hint ladder are unit-tested without a DOM. Feedback is rendered from codes and the learner's
 * own totals — no key account or amount can reach this component.
 */
import { useEffect, useMemo, useReducer, useState } from 'react';
import { listExerciseAttempts, saveExerciseAttempt } from '../../lib/repo/index.js';
import { useT } from '../../lib/i18n/index.js';
import { normalizeExerciseSpec, MAX_ROWS_PER_SIDE } from '../../lib/exercises/spec.js';
import {
  gradeRows,
  initialJournalState,
  journalEntryReducer,
} from '../../lib/exercises/journal-entry.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { AttemptHistory } from './AttemptHistory.jsx';

const SIDES = ['debit', 'credit'];
const ROW_INPUT =
  'w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 ' +
  'focus:ring-indigo-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

function JournalRow({ side, index, row, accounts, disabled, t, onChange, onRemove }) {
  const accountId = `je-${side}-${index}-account`;
  const amountId = `je-${side}-${index}-amount`;
  return (
    <div className="flex items-start gap-2">
      <label htmlFor={accountId} className="sr-only">
        {t('exercises.journal.account')}
      </label>
      <select
        id={accountId}
        className={`${ROW_INPUT} min-w-0 flex-1`}
        value={row.account}
        disabled={disabled}
        onChange={(event) => onChange({ account: event.target.value })}
      >
        <option value="">{t('exercises.journal.accountPlaceholder')}</option>
        {accounts.map((account) => (
          <option key={account.name} value={account.name}>
            {account.name} — {account.gloss}
          </option>
        ))}
      </select>
      <label htmlFor={amountId} className="sr-only">
        {t('exercises.journal.amount')}
      </label>
      <input
        id={amountId}
        className={`${ROW_INPUT} w-28`}
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        placeholder={t('exercises.journal.amountPlaceholder')}
        value={row.amount}
        disabled={disabled}
        onChange={(event) => onChange({ amount: event.target.value })}
      />
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        aria-label={t('exercises.journal.removeRow', { n: index + 1 })}
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </Button>
    </div>
  );
}

function feedbackItems(result, t) {
  if (!result) return [];
  const items = [];
  for (const code of result.codes || []) {
    if (code === 'unbalanced') {
      items.push({ key: code, text: t('exercises.journal.issue.unbalanced') });
      continue;
    }
    if (code === 'needs_more_rows' || code === 'nothing_entered') {
      const side = SIDES.find((candidate) => result.sideIssues?.[candidate] === code) || 'debit';
      items.push({
        key: code,
        text: t(`exercises.journal.issue.${code}`, { side: t(`exercises.journal.side.${side}`) }),
      });
      continue;
    }
    const issue = (result.issues || []).find((candidate) => candidate.code === code) || {};
    const side = issue.side || 'debit';
    items.push({
      key: code,
      text: t(`exercises.journal.issue.${code}`, {
        n: (issue.index ?? 0) + 1,
        side: t(`exercises.journal.side.${side}`),
      }),
    });
  }
  return items;
}

function invalidItems(invalid, t) {
  const seen = new Set();
  const items = [];
  for (const issue of invalid || []) {
    const key = `${issue.code}:${issue.side}:${issue.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      key,
      text: t(`exercises.journal.issue.${issue.code}`, {
        n: issue.index + 1,
        side: t(`exercises.journal.side.${issue.side}`),
      }),
    });
  }
  return items;
}

export function JournalEntryWidget({ exercise, lesson }) {
  const t = useT();
  const spec = useMemo(() => normalizeExerciseSpec(exercise?.spec), [exercise?.spec]);
  const [state, dispatch] = useReducer(journalEntryReducer, undefined, initialJournalState);
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!exercise?.id) return undefined;
    let alive = true;
    listExerciseAttempts(exercise.id)
      .then((rows) => {
        if (alive) setHistory(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [exercise?.id]);

  if (!spec) return null;

  const answered = state.status === 'correct' || state.status === 'incorrect';
  const finished = state.status === 'correct';

  const check = async () => {
    if (saving || finished) return;
    const outcome = gradeRows(spec, state.rows);
    dispatch({ type: 'check', spec, outcome });
    if (outcome.invalid.length) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveExerciseAttempt(exercise.id, {
        courseId: lesson?.course_id ?? null,
        lessonId: lesson?.id ?? null,
        rows: outcome.submission,
        result: outcome.result,
      });
      setHistory(await listExerciseAttempts(exercise.id));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const items = answered ? feedbackItems(state.result, t) : invalidItems(state.invalid, t);

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <Badge tone="accent">{t('exercises.journal.badge')}</Badge>
        <p className="font-medium">{spec.prompt}</p>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{spec.promptGloss}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SIDES.map((side) => (
          <div key={side} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{t(`exercises.journal.${side}`)}</h4>
              <Button
                variant="ghost"
                size="sm"
                disabled={state.rows[side].length >= MAX_ROWS_PER_SIDE || finished}
                onClick={() => dispatch({ type: 'add-row', side })}
              >
                {t('exercises.journal.addRow')}
              </Button>
            </div>
            <div className="space-y-2">
              {state.rows[side].map((row, index) => (
                <JournalRow
                  key={`${side}-${index}`}
                  side={side}
                  index={index}
                  row={row}
                  accounts={spec.accounts}
                  disabled={finished}
                  t={t}
                  onChange={(patch) =>
                    dispatch({
                      type: patch.account !== undefined ? 'set-account' : 'set-amount',
                      side,
                      index,
                      ...patch,
                    })
                  }
                  onRemove={() => dispatch({ type: 'remove-row', side, index })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={check} disabled={saving || finished}>
          {saving ? t('exercises.journal.checking') : t('exercises.journal.check')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: 'reset' })}
          disabled={saving}
        >
          {t('exercises.journal.reset')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: 'hint', count: spec.hints.length })}
          disabled={state.hintLevel >= spec.hints.length}
        >
          {state.hintLevel >= spec.hints.length
            ? t('exercises.journal.hintExhausted')
            : t('exercises.journal.hintNext', {
                n: state.hintLevel + 1,
                total: spec.hints.length,
              })}
        </Button>
      </div>

      {state.hintLevel > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{t('exercises.journal.hintsTitle')}</h4>
          <ol className="space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
            {spec.hints.slice(0, state.hintLevel).map((hint, index) => (
              <li key={`hint-${index}`}>
                {index + 1}. {hint}
              </li>
            ))}
          </ol>
        </div>
      )}

      {state.status === 'invalid' && items.length > 0 && (
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {t('exercises.journal.invalid')}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
            {items.map((item) => (
              <li key={item.key}>{item.text}</li>
            ))}
          </ul>
        </div>
      )}

      {state.status === 'incorrect' && (
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            {t('exercises.journal.incorrect')}
          </p>
          <p className="text-xs text-neutral-500">
            {t('exercises.journal.totals', {
              debit: state.result.totals.debit,
              credit: state.result.totals.credit,
            })}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
            {items.map((item) => (
              <li key={item.key}>{item.text}</li>
            ))}
          </ul>
        </div>
      )}

      {state.status === 'correct' && (
        <p className="text-sm font-medium text-green-700 dark:text-green-300" role="status">
          {t('exercises.journal.correct')}
        </p>
      )}

      {saveFailed && (
        <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">
          {t('exercises.journal.saveFailed')}
        </p>
      )}

      <AttemptHistory attempts={history} />
    </Card>
  );
}
