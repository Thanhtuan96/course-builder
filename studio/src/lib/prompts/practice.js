/**
 * Practice prompts + pure quiz/card logic (PRACTICE-01/02).
 *
 * Two artifacts are generated from a lesson's Markdown:
 *   - a 5-question multiple-choice self-check (`quiz`)
 *   - 5–8 flashcards ({ front, back })
 *
 * Everything here is pure and unit-tested. The lesson text is echoed back to the model, so it is
 * always wrapped with `wrapUntrusted` (prompt-injection aware — Pitfall 13). Quizzes are
 * **retrieval practice**, never a grade: wording is "Check your understanding".
 */
import { buildSystemPrompt, courseContext, wrapUntrusted, appendLanguageInstruction } from './base.js';

export const QUIZ_COUNT = 5;
export const FLASHCARD_MIN = 5;
export const FLASHCARD_MAX = 8;
export const FLASHCARD_DEFAULT = 6;

export const QUIZ_RULES = `You write short retrieval-practice self-checks, not exams.
- Every question must be answerable from the lesson content alone.
- Distractors must be plausible but clearly wrong to someone who understood the lesson.
- Never number or grade the learner; this is a self-check.
- Never include the words "grade", "test" or "exam" in the questions.`;

export const QUIZ_SHAPE = `Return ONLY a JSON array of exactly ${QUIZ_COUNT} objects, with no prose and no Markdown fences.
Each object must have exactly these keys:
  "question"    — a non-empty string
  "options"     — an array of exactly 4 short, non-empty, distinct strings
  "answerIndex" — the integer 0, 1, 2 or 3 identifying the single correct option
  "explanation" — one or two sentences explaining why the correct option is right
Example: [{"question":"…","options":["a","b","c","d"],"answerIndex":2,"explanation":"…"}]`;

export const FLASHCARD_RULES = `You write compact study flashcards for spaced repetition.
- One atomic idea per card; keep the front a single cue and the back a short answer.
- Fronts must be answerable without seeing the lesson; backs must be self-contained.
- Prefer the key definitions, distinctions and mistakes from the lesson.`;

export const FLASHCARD_SHAPE = `Return ONLY a JSON array of ${FLASHCARD_MIN} to ${FLASHCARD_MAX} objects, with no prose and no Markdown fences.
Each object must have exactly these keys:
  "front" — the prompt, a short non-empty string
  "back"  — the answer, a short non-empty string
Example: [{"front":"Active recall","back":"Reproducing an idea from memory instead of rereading it."}]`;

/**
 * Build the system + messages for quiz generation.
 * @param {{ course?: object, lesson?: object, content?: string, language?: string }} input
 */
export function buildQuizMessages({ course, lesson, content = '', language } = {}) {
  const resolvedLanguage = language ?? course?.language;
  return {
    system: buildSystemPrompt({
      rules: QUIZ_RULES,
      context: courseContext(course, lesson),
      extra: QUIZ_SHAPE,
      language: resolvedLanguage,
    }),
    messages: appendLanguageInstruction(
      [
        {
          role: 'user',
          content:
            `Write a ${QUIZ_COUNT}-question multiple-choice self-check for the lesson below. ` +
            `Cover the main ideas, not trivia.\n\n${wrapUntrusted(content, 'lesson_content')}`,
        },
      ],
      resolvedLanguage
    ),
  };
}

/**
 * Build the system + messages for flashcard generation.
 * @param {{ course?: object, lesson?: object, content?: string, count?: number, language?: string }} input
 */
export function buildFlashcardsMessages({ course, lesson, content = '', count = FLASHCARD_DEFAULT, language } = {}) {
  const n = clampCount(count);
  const resolvedLanguage = language ?? course?.language;
  return {
    system: buildSystemPrompt({
      rules: FLASHCARD_RULES,
      context: courseContext(course, lesson),
      extra: FLASHCARD_SHAPE,
      language: resolvedLanguage,
    }),
    messages: appendLanguageInstruction(
      [
        {
          role: 'user',
          content:
            `Create about ${n} flashcards for the lesson below. ` +
            `Return between ${FLASHCARD_MIN} and ${FLASHCARD_MAX} cards.\n\n${wrapUntrusted(content, 'lesson_content')}`,
        },
      ],
      resolvedLanguage
    ),
  };
}

function clampCount(count) {
  const n = Number.isFinite(count) ? Math.round(count) : FLASHCARD_DEFAULT;
  return Math.min(FLASHCARD_MAX, Math.max(FLASHCARD_MIN, n));
}

/* ------------------------------------------------------------------ validation */

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate one quiz item. Generated quizzes use `answerIndex`; the normaliser still tolerates a
 * legacy `answer` key on older demo seeds.
 * @param {any} item
 * @returns {true|string}
 */
export function validateQuizItem(item) {
  if (!item || typeof item !== 'object') return 'must be an object';
  if (!isNonEmptyString(item.question)) return 'is missing a question';
  if (!Array.isArray(item.options) || item.options.length !== 4) return 'must have exactly 4 options';
  if (!item.options.every(isNonEmptyString)) return 'has an empty option';
  const seen = new Set(item.options.map((o) => o.trim().toLowerCase()));
  if (seen.size !== 4) return 'has duplicate options';
  const answerIndex = answerIndexOf(item);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) {
    return 'must have an answerIndex between 0 and 3';
  }
  if (!isNonEmptyString(item.explanation)) return 'is missing an explanation';
  return true;
}

/**
 * @param {any} value
 * @param {{ count?: number }} [opts]
 * @returns {true|string}
 */
export function validateQuiz(value, { count = QUIZ_COUNT } = {}) {
  if (!Array.isArray(value)) return 'Expected a JSON array of questions.';
  if (value.length !== count) return `Expected exactly ${count} questions, got ${value.length}.`;
  for (let i = 0; i < value.length; i++) {
    const verdict = validateQuizItem(value[i]);
    if (verdict !== true) return `Question ${i + 1} ${verdict}.`;
  }
  return true;
}

/**
 * @param {any} value
 * @returns {true|string}
 */
export function validateFlashcards(value) {
  if (!Array.isArray(value)) return 'Expected a JSON array of flashcards.';
  if (value.length < FLASHCARD_MIN || value.length > FLASHCARD_MAX) {
    return `Expected between ${FLASHCARD_MIN} and ${FLASHCARD_MAX} flashcards, got ${value.length}.`;
  }
  for (let i = 0; i < value.length; i++) {
    const card = value[i];
    if (!card || typeof card !== 'object') return `Card ${i + 1} must be an object.`;
    if (!isNonEmptyString(card.front)) return `Card ${i + 1} is missing a front.`;
    if (!isNonEmptyString(card.back)) return `Card ${i + 1} is missing a back.`;
  }
  return true;
}

/* ------------------------------------------------------------------ normalisation */

function answerIndexOf(item) {
  if (Number.isInteger(item?.answerIndex)) return item.answerIndex;
  if (Number.isInteger(item?.answer)) return item.answer;
  return null;
}

function asArray(raw, key) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw[key])) return raw[key];
  return [];
}

/**
 * Coerce one raw quiz item to `{ question, options, answerIndex, explanation }`, or null if it is
 * structurally unusable. Tolerates a legacy `answer` key from older seeds.
 * @param {any} raw
 */
export function normalizeQuizItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isNonEmptyString(raw.question)) return null;
  if (!Array.isArray(raw.options) || raw.options.length !== 4) return null;
  if (!raw.options.every(isNonEmptyString)) return null;
  const answerIndex = answerIndexOf(raw);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) return null;
  return {
    question: raw.question.trim(),
    options: raw.options.map((o) => o.trim()),
    answerIndex,
    explanation: isNonEmptyString(raw.explanation) ? raw.explanation.trim() : '',
  };
}

/**
 * @param {any} raw
 * @returns {Array<{ question: string, options: string[], answerIndex: number, explanation: string }>}
 */
export function normalizeQuiz(raw) {
  return asArray(raw, 'questions')
    .map(normalizeQuizItem)
    .filter(Boolean);
}

/**
 * @param {any} raw
 * @returns {Array<{ front: string, back: string }>}
 */
export function normalizeFlashcards(raw) {
  return asArray(raw, 'cards')
    .filter((c) => c && typeof c === 'object' && isNonEmptyString(c.front) && isNonEmptyString(c.back))
    .map((c) => ({ front: c.front.trim(), back: c.back.trim() }));
}

/* ------------------------------------------------------------------ quiz reducer (pure) */

export const initialQuizState = {
  questions: [],
  answers: [],
  current: 0,
  revealed: false,
  stage: 'idle', // idle | active | complete
  source: null, // 'seed' | 'ai'
};

/**
 * Pure state machine for one quiz attempt. UI-independent so it can be unit-tested.
 * @param {typeof initialQuizState} state
 * @param {{ type: string, questions?: any[], source?: string, optionIndex?: number }} action
 */
export function quizReducer(state, action) {
  switch (action.type) {
    case 'load': {
      const questions = Array.isArray(action.questions) ? action.questions : [];
      return {
        questions,
        answers: questions.map(() => null),
        current: 0,
        revealed: false,
        stage: questions.length ? 'active' : 'idle',
        source: action.source || null,
      };
    }
    case 'answer': {
      if (state.stage !== 'active' || state.revealed) return state;
      if (!Number.isInteger(action.optionIndex)) return state;
      const answers = state.answers.slice();
      answers[state.current] = action.optionIndex;
      return { ...state, answers, revealed: true };
    }
    case 'next': {
      if (state.stage !== 'active' || !state.revealed) return state;
      if (state.current < state.questions.length - 1) {
        return { ...state, current: state.current + 1, revealed: false };
      }
      return { ...state, stage: 'complete' };
    }
    case 'retake': {
      if (!state.questions.length) return state;
      return { ...state, answers: state.questions.map(() => null), current: 0, revealed: false, stage: 'active' };
    }
    case 'reset':
      return { ...initialQuizState };
    default:
      return state;
  }
}

/** The question currently on screen, or null. */
export function currentQuestion(state) {
  return state.questions[state.current] || null;
}

/** Number of correct answers. */
export function scoreQuiz(questions = [], answers = []) {
  return questions.reduce((n, q, i) => n + (answers[i] === q.answerIndex ? 1 : 0), 0);
}
