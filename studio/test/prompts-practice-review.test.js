/**
 * Wave-0 contract for the quiz + workspace review builders in `studio/src/lib/prompts/practice.js`
 * (LOOP-02, D-02, D-04, D-20).
 *
 * The module exists but does not export these symbols yet, so this file is red today — it is the
 * specification plan 02 implements:
 * - strict review JSON (zod) with one Socratic question per unmet criterion and no code/solution key,
 * - learner answers and check output always wrapped as untrusted data,
 * - a programming review build that carries `<learner_code>` yet never a corrected solution.
 */
import { describe, it, expect } from 'vitest';
import {
  REVIEW_STATUSES,
  reviewCriterionSchema,
  reviewOutputSchema,
  validateReview,
  buildQuizReviewMessages,
  buildWorkspaceReviewMessages,
  validateReviewQuestions,
} from '../src/lib/prompts/practice.js';
import { NO_SOLUTION_RULE } from '../src/lib/prompts/tutor.js';

const FENCE = String.fromCharCode(96).repeat(3);

const course = { title: 'Programming 101', level: 'Beginner', lessons: [{ title: 'L1' }] };
const lesson = { id: 'l1', position: 1, title: 'L1', summary: 's' };

const metCriterion = { key: 'c1', label: 'Naming', status: 'met', question: null };
const unmetCriterion = { key: 'c2', label: 'Edge cases', status: 'not_met', question: 'What happens on an empty list?' };

const issueText = (result) =>
  result.success ? '' : result.error.issues.map((issue) => issue.message).join(' | ');

describe('review schema', () => {
  it('exposes the three review statuses', () => {
    expect(REVIEW_STATUSES).toEqual(['met', 'partial', 'not_met']);
    expect(typeof reviewCriterionSchema.safeParse).toBe('function');
  });

  it('reviewOutputSchema accepts a valid review', () => {
    const parsed = reviewOutputSchema.safeParse({ criteria: [metCriterion, unmetCriterion] });
    expect(parsed.success).toBe(true);
    expect(parsed.data.criteria).toHaveLength(2);
  });

  it('reviewOutputSchema rejects extra keys', () => {
    const withCode = reviewOutputSchema.safeParse({ criteria: [metCriterion], code: 'const x = 1;' });
    const withSolution = reviewOutputSchema.safeParse({ criteria: [metCriterion], solution: 'the answer' });

    expect(withCode.success).toBe(false);
    expect(withSolution.success).toBe(false);
    expect(issueText(withCode)).toContain('Unrecognized key');
    expect(issueText(withSolution)).toContain('Unrecognized key');
  });

  it('reviewOutputSchema enforces one question per unmet criterion', () => {
    const missingQuestion = reviewOutputSchema.safeParse({
      criteria: [{ key: 'c1', label: 'Edge cases', status: 'not_met', question: null }],
    });
    const questionOnMet = reviewOutputSchema.safeParse({
      criteria: [{ key: 'c1', label: 'Naming', status: 'met', question: 'Why?' }],
    });

    expect(missingQuestion.success).toBe(false);
    expect(issueText(missingQuestion)).toContain('every unmet criterion needs one Socratic question');
    expect(questionOnMet.success).toBe(false);
    expect(issueText(questionOnMet)).toContain('met criteria must not carry a question');
  });

  it('reviewOutputSchema rejects code fences in label or question', () => {
    const fencedLabel = reviewOutputSchema.safeParse({
      criteria: [{ key: 'c1', label: `bad ${FENCE}js`, status: 'met', question: null }],
    });
    const fencedQuestion = reviewOutputSchema.safeParse({
      criteria: [{ key: 'c1', label: 'Naming', status: 'not_met', question: `Try ${FENCE}code${FENCE}` }],
    });

    expect(fencedLabel.success).toBe(false);
    expect(issueText(fencedLabel)).toContain('reviews must not contain code fences');
    expect(fencedQuestion.success).toBe(false);
    expect(issueText(fencedQuestion)).toContain('reviews must not contain code fences');
  });

  it('validateReview checks the rubric keys exactly', () => {
    const rubric = [{ key: 'c1' }, { key: 'c2' }];
    const exact = { criteria: [metCriterion, unmetCriterion] };
    const drifted = {
      criteria: [metCriterion, { key: 'c3', label: 'Invented', status: 'not_met', question: 'Why?' }],
    };

    expect(validateReview(exact, { rubric })).toBe(true);
    const verdict = validateReview(drifted, { rubric });
    expect(typeof verdict).toBe('string');
    expect(verdict).toContain('criteria keys must be exactly: c1,c2');
  });
});

describe('quiz and workspace review prompts', () => {
  it('buildQuizReviewMessages wraps the learner answers as untrusted data and keeps the no-solution rule', () => {
    const result = buildQuizReviewMessages({
      course,
      lesson,
      questions: [
        { question: 'Which one?', options: ['answer-leak-sentinel', 'b', 'c', 'd'], answerIndex: 1 },
        { question: 'And then?', options: ['e', 'f', 'g', 'h'], answerIndex: 0 },
      ],
      answers: [0, 1],
      criteria: [
        { key: 'q1', label: 'Which one?', status: 'not_met', question: null },
        { key: 'q2', label: 'And then?', status: 'not_met', question: null },
      ],
      language: 'en',
    });

    const last = result.messages[result.messages.length - 1].content;
    expect(result.system).toContain(NO_SOLUTION_RULE);
    expect(last).toContain('<learner_answers>');
    expect(last).toContain('q1');
    expect(last).toContain('q2');
    // The learner's answer text is reference data: never echoed raw into the authoritative system prompt.
    expect(result.system).not.toContain('answer-leak-sentinel');
  });

  it('buildWorkspaceReviewMessages wraps check output as untrusted data', () => {
    const result = buildWorkspaceReviewMessages({
      course,
      lesson,
      criteria: [
        { key: 'header-is-lowercase', label: 'Header is lowercase', status: 'not_met', question: null },
      ],
      checks: [{ name: 'Header is lowercase', passed: false }],
      language: 'en',
    });

    const last = result.messages[result.messages.length - 1].content;
    expect(last).toContain('<check_output>');
    expect(last).toContain('header-is-lowercase');
    expect(result.system).toContain(NO_SOLUTION_RULE);
    expect(result.system.toLowerCase()).toContain('review');
  });

  it('validateReviewQuestions accepts one question per key and rejects unknown keys', () => {
    expect(validateReviewQuestions([{ key: 'q1', question: 'Why?' }], ['q1'])).toBe(true);

    const unknown = validateReviewQuestions(
      [
        { key: 'q1', question: 'Why?' },
        { key: 'q9', question: 'Invented?' },
      ],
      ['q1']
    );
    const missing = validateReviewQuestions([{ key: 'q2', question: 'Not the rubric key?' }], ['q1']);

    expect(typeof unknown).toBe('string');
    expect(typeof missing).toBe('string');
  });

  it('validateReviewQuestions is strict about shape, fences and length (T-08-03)', () => {
    expect(validateReviewQuestions([{ key: 'q1', question: 'Why?' }], ['q1'])).toBe(true);

    const extraKey = validateReviewQuestions([{ key: 'q1', question: 'Why?', answer: 'b' }], ['q1']);
    expect(typeof extraKey).toBe('string');
    expect(extraKey).toContain('Unrecognized key');

    const fenced = validateReviewQuestions([{ key: 'q1', question: `Try ${FENCE}code${FENCE}` }], ['q1']);
    expect(typeof fenced).toBe('string');
    expect(fenced).toContain('code fences');

    const tooLong = validateReviewQuestions([{ key: 'q1', question: 'x'.repeat(401) }], ['q1']);
    expect(typeof tooLong).toBe('string');

    const duplicated = validateReviewQuestions(
      [
        { key: 'q1', question: 'Why?' },
        { key: 'q1', question: 'Again?' },
      ],
      ['q1']
    );
    expect(typeof duplicated).toBe('string');
    expect(duplicated).toContain('unique');

    expect(validateReviewQuestions({ key: 'q1', question: 'Why?' }, ['q1'])).toBe(
      'Expected a JSON array of criterion questions.'
    );
    expect(validateReviewQuestions([], ['q1'])).toBe('Expected a JSON array of criterion questions.');
  });

  it('validateReviewQuestions accepts the bare key list as well as { keys }', () => {
    const entries = [{ key: 'q1', question: 'Why?' }];
    expect(validateReviewQuestions(entries, ['q1'])).toBe(true);
    expect(validateReviewQuestions(entries, { keys: ['q1'] })).toBe(true);
    expect(validateReviewQuestions(entries)).toBe(true);
  });

  it('a review for a programming task never carries code', () => {
    const result = buildWorkspaceReviewMessages({
      course,
      lesson,
      criteria: [
        {
          key: 'header-is-lowercase',
          label: 'Header is lowercase',
          status: 'not_met',
          question: null,
        },
      ],
      checks: [{ name: 'Header is lowercase', passed: false }],
      learnerCode: 'const x = 1;',
      language: 'en',
    });

    const last = result.messages[result.messages.length - 1].content;
    const everything = result.system + '\n' + result.messages.map((message) => message.content).join('\n');

    expect(last).toContain('<learner_code>');
    expect(last).toContain('const x = 1;');
    expect(last).toContain('<check_output>');
    expect(result.system).toContain(NO_SOLUTION_RULE);
    expect(everything).not.toContain(FENCE);
    expect(everything).not.toContain('"solution"');
    expect(everything).not.toContain('"code"');
  });
});
