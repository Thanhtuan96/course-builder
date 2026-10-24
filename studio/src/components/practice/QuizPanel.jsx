/**
 * QuizPanel — a 5-question multiple-choice self-check for a lesson (PRACTICE-01).
 *
 * Uses the lesson's `quiz_seed` when present (bundled demo course, no provider needed); otherwise
 * generates 5 questions with `generateJson` (repair retry built in) from the lesson content.
 * One question at a time; the correct/incorrect verdict and explanation appear after answering.
 * Every completed attempt is saved with `repo.saveQuizAttempt` and logged to the activity streak.
 *
 * This is retrieval practice, not a grade — the wording is always "Check your understanding".
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  getLessonContent,
  saveQuizAttempt,
  logActivity,
  appendChat,
  listQuizAttempts,
  listChat,
} from '../../lib/repo/index.js';
import { useSettings } from '../../lib/settings.js';
import { useT } from '../../lib/i18n/index.js';
import { getProvider, ProviderError } from '../../lib/ai/index.js';
import { useStream } from '../../lib/ai/useStream.js';
import {
  buildQuizMessages,
  normalizeQuiz,
  validateQuiz,
  quizReducer,
  initialQuizState,
  currentQuestion,
  scoreQuiz,
  buildQuizReviewMessages,
  validateReviewQuestions,
} from '../../lib/prompts/practice.js';
import {
  buildQuizReview,
  buildReviewRecord,
  parseReviewRecord,
  decodeQuizAttempt,
  quizPassed,
  mergeReviewQuestions,
  armRevision,
  consumeRevision,
  quizRevisionIntent,
} from '../revision/history.js';
import { ReviewFeedback } from '../revision/ReviewFeedback.jsx';
import { AttemptHistory } from '../revision/AttemptHistory.jsx';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Spinner.jsx';
import { ErrorNotice } from '../ui/ErrorNotice.jsx';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

/** Question enrichment is opportunistic — a slow provider must not delay the deterministic card. */
const REVIEW_TIMEOUT_MS = 6000;

/**
 * True when the active provider can plausibly run without further setup. Deliberately local: the
 * quiz surface does not import from the tutor surface (one-way).
 * @param {object} settings
 * @returns {boolean}
 */
function providerReady(settings) {
  switch (settings.provider) {
    case 'anthropic':
      return Boolean(settings.anthropic?.apiKey);
    case 'openai':
      return Boolean(settings.openai?.apiKey);
    case 'ollama':
    case 'bridge':
      return true;
    default:
      return false;
  }
}

/**
 * Ask the provider for one Socratic question per unmet quiz criterion (D-04). Any failure throws;
 * the caller keeps the deterministic fallback questions instead.
 * @param {{ course?: object, lesson?: object, settings: object, criteria: object[],
 *   answers: any[] }} input
 * @returns {Promise<object[]>} criteria with provider questions merged in
 */
async function enrichCriteria({ course, lesson, settings, criteria, answers }) {
  if (!providerReady(settings)) return criteria;
  const unmetKeys = criteria
    .filter((criterion) => criterion.status !== 'met')
    .map((criterion) => criterion.key);
  if (!unmetKeys.length) return criteria;

  const provider = await getProvider(settings);
  const { system, messages } = buildQuizReviewMessages({
    course,
    lesson,
    criteria,
    answers,
    language: course?.language ?? settings.language,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  try {
    // No `language` option: a locale retry would double the model budget (research Pitfall 4).
    const entries = await provider.generateJson({
      system,
      messages,
      signal: controller.signal,
      validate: (value) => validateReviewQuestions(value, { keys: unmetKeys }),
    });
    const byKey = {};
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.key && typeof entry.question === 'string' && entry.question.trim()) {
        byKey[entry.key] = entry.question;
      }
    }
    return mergeReviewQuestions(criteria, byKey);
  } finally {
    clearTimeout(timer);
  }
}

function seedQuestions(lesson) {
  if (!lesson?.quiz_seed) return null;
  try {
    const parsed = JSON.parse(lesson.quiz_seed);
    const questions = normalizeQuiz(parsed);
    return questions.length ? questions : null;
  } catch {
    return null;
  }
}

export function QuizPanel({ lesson, course, onAttemptSaved }) {
  const t = useT();
  const [settings] = useSettings();
  const seeded = useMemo(() => seedQuestions(lesson), [lesson?.quiz_seed]);
  const [state, dispatch] = useReducer(quizReducer, seeded, (initial) =>
    initial ? quizReducer(initialQuizState, { type: 'load', questions: initial, source: 'seed' }) : { ...initialQuizState }
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [historyKey, setHistoryKey] = useState(0);
  const revisionRef = useRef(null);
  const { status, error: streamError, start, stop } = useStream();

  useEffect(() => {
    setError(null);
    setReview(null);
    if (seeded) dispatch({ type: 'load', questions: seeded, source: 'seed' });
    else dispatch({ type: 'reset' });
  }, [seeded, lesson?.id]);

  const generate = useCallback(async () => {
    setError(null);
    setReview(null);
    dispatch({ type: 'reset' });
    const content = await getLessonContent(lesson.id).catch(() => null);
    if (!content?.content_md) {
      setError(
        new ProviderError('unknown', t('practice.quiz.noContent'), t('practice.quiz.noContentHint'))
      );
      return;
    }
    const language = course?.language ?? settings.language;
    const { system, messages } = buildQuizMessages({
      course,
      lesson,
      content: content.content_md,
      language,
    });
    try {
      const provider = await getProvider(settings);
      const result = await start(({ signal }) => provider.generateJson({ system, messages, signal, validate: validateQuiz, language }));
      const questions = normalizeQuiz(result);
      if (questions.length) dispatch({ type: 'load', questions, source: 'ai' });
    } catch {
      /* useStream surfaces the actionable error */
    }
  }, [lesson?.id, course, settings, start, t]);

  const persist = useCallback(
    async (questions, answers) => {
      setSaving(true);
      try {
        const score = scoreQuiz(questions, answers);
        // Consumed before the await so a failed write cannot double-apply the intent (D-07).
        const revisionOf = consumeRevision(revisionRef);
        const attempt = await saveQuizAttempt(lesson.id, {
          questions,
          answers,
          score,
          total: questions.length,
          revisionOf,
        });
        await logActivity('quiz', lesson.id);
        onAttemptSaved?.();

        // Deterministic first: the review exists even with no provider (D-04).
        const baseCriteria = buildQuizReview({
          questions,
          answers,
          questionText: (criterion) =>
            t('revision.quiz.fallbackQuestion', { label: criterion.label }),
        });
        setReview({
          rowId: null,
          record: buildReviewRecord({
            surface: 'quiz',
            attemptTable: 'quiz_attempts',
            attemptId: attempt.id,
            criteria: baseCriteria,
          }),
        });

        // A review-write failure must never hide the card the learner just earned, so it does NOT
        // go through `setError` (that renders the standalone error card instead of the review).
        try {
          const criteria = await enrichCriteria({
            course,
            lesson,
            settings,
            criteria: baseCriteria,
            answers,
          });
          const record = buildReviewRecord({
            surface: 'quiz',
            attemptTable: 'quiz_attempts',
            attemptId: attempt.id,
            criteria,
          });
          const reviewRow = await appendChat(lesson.id, {
            role: 'assistant',
            content: JSON.stringify(record),
            mode: 'review',
          });
          setReview({ rowId: reviewRow?.id ?? null, record });
          setHistoryKey((key) => key + 1);
        } catch (err) {
          if (import.meta.env?.DEV) console.warn('[quiz] review write failed', err);
        }
      } catch (err) {
        setError(err);
      } finally {
        setSaving(false);
      }
    },
    [course, lesson, onAttemptSaved, settings, t]
  );

  // Attempt history: stored attempts oldest first, each paired with its own quiz review when one
  // was persisted (D-10/D-11). The read API cannot filter by mode, so parse in JS.
  useEffect(() => {
    if (!lesson?.id) return undefined;
    let alive = true;
    Promise.all([listQuizAttempts(lesson.id), listChat(lesson.id)])
      .then(([rows, messages]) => {
        if (!alive) return;
        const reviews = (Array.isArray(messages) ? messages : [])
          .filter((message) => message?.role === 'assistant' && message?.mode === 'review')
          .map((message) => parseReviewRecord(message.content))
          .filter((record) => record?.surface === 'quiz');
        setAttempts(
          (Array.isArray(rows) ? rows : []).map((row, index) => {
            const decoded = decodeQuizAttempt(row);
            const matched = reviews.find((record) => record.attemptId === row.id);
            return {
              id: row.id,
              label: t('revision.history.attempt', { n: index + 1 }),
              criteria:
                matched?.criteria ??
                buildQuizReview({
                  questions: decoded.questions,
                  answers: decoded.answers,
                  questionText: (criterion) =>
                    t('revision.quiz.fallbackQuestion', { label: criterion.label }),
                }),
            };
          })
        );
      })
      .catch(() => {
        if (alive) setAttempts([]);
      });
    return () => {
      alive = false;
    };
  }, [lesson?.id, historyKey, t]);

  const question = currentQuestion(state);
  const total = state.questions.length;
  const isLast = state.current === total - 1;
  const chosen = state.answers[state.current];
  const score = state.stage === 'complete' ? scoreQuiz(state.questions, state.answers) : 0;
  const reviewCriteria = review?.record?.criteria ?? null;
  const passing = quizPassed({ score, total, criteria: reviewCriteria });
  const busy = status === 'streaming';

  const handleRevise = useCallback(() => {
    armRevision(
      revisionRef,
      quizRevisionIntent({
        reviewId: review?.rowId ?? null,
        attemptId: review?.record?.attemptId ?? null,
      })
    );
    setReview(null);
    dispatch({ type: 'retake' });
  }, [review]);

  const next = () => {
    const completing = state.revealed && isLast;
    dispatch({ type: 'next' });
    if (completing) persist(state.questions, state.answers);
  };

  if ((status === 'idle' || status === 'stopped') && state.stage === 'idle') {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('practice.quiz.intro')}</p>
        <div className="flex items-center gap-2">
          <Button onClick={generate}>
            <span className="sm:hidden">{t('practice.quiz.startShort')}</span>
            <span className="hidden sm:inline">{t('practice.quiz.start')}</span>
          </Button>
        </div>
      </Card>
    );
  }

  if (busy) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
          <Spinner label={t('practice.quiz.generating')} /> {t('practice.quiz.writing')}
        </span>
        <Button variant="danger" size="sm" onClick={stop}>
          {t('practice.quiz.stop')}
        </Button>
      </Card>
    );
  }

  if (error || streamError) {
    return (
      <Card className="space-y-3">
        <ErrorNotice error={error || streamError} onDismiss={() => setError(null)} />
        <Button variant="secondary" onClick={generate}>
          {t('practice.quiz.tryAgain')}
        </Button>
      </Card>
    );
  }

  if (state.stage === 'complete') {
    return (
      <Card className="space-y-4">
        <div className="space-y-1">
          <p className="font-semibold">{t('practice.quiz.youGot', { score, total })}</p>
          <p className="text-sm text-neutral-500">
            {saving ? t('practice.quiz.saving') : t('practice.quiz.saved')}
          </p>
        </div>
        <ReviewFeedback
          criteria={reviewCriteria ?? []}
          title={t('revision.quiz.criteriaTitle')}
          showRevise={!passing}
          onRevise={handleRevise}
          reviseHint={t('revision.quiz.reviseHint')}
        />
        <ul className="space-y-1.5 text-sm">
          {state.questions.map((q, i) => {
            const right = state.answers[i] === q.answerIndex;
            return (
              <li key={i} className="flex items-start gap-2">
                <span className={right ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {right ? '✓' : '✗'}
                </span>
                <span className="text-neutral-700 dark:text-neutral-300">{q.question}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={generate}>
            {t('practice.quiz.newQuiz')}
          </Button>
        </div>
        <AttemptHistory attempts={attempts} title={t('revision.history.title')} />
      </Card>
    );
  }

  if (!question) return null;

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{t('practice.quiz.questionOf', { n: state.current + 1, total })}</span>
        {state.source === 'seed' && <span>{t('practice.quiz.demoQuiz')}</span>}
      </div>

      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{question.question}</p>

      <div className="space-y-2">
        {question.options.map((option, i) => {
          const isCorrect = i === question.answerIndex;
          const isChosen = i === chosen;
          let tone =
            'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600';
          if (state.revealed && isCorrect) tone = 'border-green-500 bg-green-50 dark:bg-green-500/10';
          else if (state.revealed && isChosen && !isCorrect) tone = 'border-red-500 bg-red-50 dark:bg-red-500/10';
          return (
            <button
              key={i}
              type="button"
              disabled={state.revealed}
              onClick={() => dispatch({ type: 'answer', optionIndex: i })}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${tone}`}
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-semibold">
                {OPTION_LETTERS[i]}
              </span>
              <span className="text-neutral-800 dark:text-neutral-100">{option}</span>
            </button>
          );
        })}
      </div>

      {state.revealed && (
        <div className="space-y-3">
          <p
            className={`text-sm font-medium ${
              chosen === question.answerIndex ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
            }`}
          >
            {chosen === question.answerIndex
              ? t('practice.quiz.correct')
              : t('practice.quiz.notQuite', { letter: OPTION_LETTERS[question.answerIndex] })}
          </p>
          {question.explanation && (
            <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
              {question.explanation}
            </p>
          )}
          <div className="flex justify-end">
            <Button onClick={next}>{isLast ? t('practice.quiz.seeScore') : t('practice.quiz.nextQuestion')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
