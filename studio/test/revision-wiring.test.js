/**
 * Wave-0 contract for LOOP-01 wiring: the revision intents each surface arms, the explicit link the
 * repo stores, and the source order each surface must end up in.
 *
 * The three intent builders and the two repo-link cases live in tests whose titles contain
 * "Intent", because plan 02 turns exactly those green (`-t "Intent"`).
 * The four source-order cases each assert a real wiring marker (never a bare identifier that would
 * also match the import line), so plans 05 and 06 can filter to their own surface.
 *
 * Every test here fails today: `history.js` does not exist yet and none of the surface markers do.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import {
  quizRevisionIntent,
  tutorRevisionIntent,
  workspaceRevisionIntent,
} from '../src/components/revision/history.js';

const BASE = '2026-10-20T09:00:00.000Z';

const REVIEW_RECORD = (surface) =>
  JSON.stringify({
    surface,
    attemptTable: 'chat_messages',
    attemptId: null,
    passing: false,
    criteria: [{ key: surface === 'tutor' ? 'c1' : 'q1', label: 'Criterion', status: 'not_met', question: 'Why?' }],
  });

async function seedLesson() {
  const course = await repo.createCourse({ title: 'C', lessons: [{ title: 'L1' }] });
  return course.lessons[0];
}

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BASE));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('revision intents', () => {
  it('quizRevisionIntent prefers the review message and falls back to the attempt', () => {
    expect(quizRevisionIntent({ reviewId: 'm1', attemptId: 'a1' })).toEqual({
      feedbackTable: 'chat_messages',
      feedbackId: 'm1',
    });
    expect(quizRevisionIntent({ reviewId: null, attemptId: 'a1' })).toEqual({
      feedbackTable: 'quiz_attempts',
      feedbackId: 'a1',
    });
  });

  it('tutorRevisionIntent always points at the chat message', () => {
    expect(tutorRevisionIntent('m1')).toEqual({ feedbackTable: 'chat_messages', feedbackId: 'm1' });
  });

  it('workspaceRevisionIntent points at the run result', () => {
    expect(workspaceRevisionIntent('r1')).toEqual({ feedbackTable: 'run_results', feedbackId: 'r1' });
  });

  it('an explicit revision Intent reaches the revision links table', async () => {
    const lesson = await seedLesson();
    const review = await repo.appendChat(lesson.id, {
      role: 'assistant',
      mode: 'review',
      content: REVIEW_RECORD('quiz'),
    });

    await repo.saveQuizAttempt(lesson.id, {
      questions: [],
      answers: [0],
      score: 1,
      total: 1,
      revisionOf: quizRevisionIntent({ reviewId: review.id, attemptId: null }),
    });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'quiz',
      feedback_table: 'chat_messages',
      feedback_id: review.id,
      link_kind: 'explicit',
    });
  });

  it('the tutor Intent links the next user message', async () => {
    const lesson = await seedLesson();
    const review = await repo.appendChat(lesson.id, {
      role: 'assistant',
      mode: 'review',
      content: REVIEW_RECORD('tutor'),
    });

    await repo.appendChat(lesson.id, {
      role: 'user',
      mode: 'check_answer',
      content: 'v2',
      revisionOf: tutorRevisionIntent(review.id),
    });

    const links = await repo.listRevisionLinks({ lessonId: lesson.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'tutor',
      feedback_table: 'chat_messages',
      feedback_id: review.id,
      link_kind: 'explicit',
    });
  });
});

describe('revision wiring — source order', () => {
  const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  const count = (source, marker) => source.split(marker).length - 1;

  it('QuizPanel declares the revise action before the New quiz affordance', () => {
    const source = read('../src/components/practice/QuizPanel.jsx');
    const marker = '<ReviewFeedback';

    expect(count(source, marker)).toBe(1);
    expect(source.indexOf(marker)).toBeGreaterThan(-1);
    expect(source.indexOf(marker)).toBeLessThan(source.indexOf("t('practice.quiz.newQuiz')"));
    // The CTA is rendered by ReviewFeedback (which owns ReviseButton) — no duplicate affordance.
    expect(source.indexOf('<ReviseButton')).toBe(-1);
  });

  it('TutorPanel declares the revise action before the capstone notice', () => {
    const source = read('../src/components/tutor/TutorPanel.jsx');
    const marker = '<ReviewMessage';

    expect(count(source, marker)).toBe(1);
    expect(source.indexOf(marker)).toBeGreaterThan(-1);
    expect(source.indexOf(marker)).toBeLessThan(source.indexOf("t('tutor.capstoneNotice')"));
    // The review row is wired to a revise handler.
    expect(count(source, 'onRevise=')).toBeGreaterThanOrEqual(1);
    expect(source.indexOf('<ReviseButton')).toBe(-1);
  });

  it('CodeWorkspace declares the revise action before the history affordance', () => {
    const source = read('../src/components/workspace/CodeWorkspace.jsx');

    expect(count(source, 'const onRevise =')).toBe(1);
    expect(source.indexOf('const onRevise =')).toBeGreaterThan(-1);
    expect(source.indexOf('const onRevise =')).toBeLessThan(source.indexOf("t('workspace.history')"));
    // Declared once and handed to OutputPanel, which renders ReviewFeedback → ReviseButton.
    expect(count(source, 'onRevise={onRevise}')).toBe(1);
    expect(source.indexOf('<ReviseButton')).toBe(-1);
  });

  it('CodeWorkspace checks the local-run acknowledgement gate before the run starts', () => {
    const source = read('../src/components/workspace/CodeWorkspace.jsx');
    const gate = 'shouldBlockLocalRun({';

    expect(count(source, gate)).toBe(1);
    expect(source.indexOf(gate)).toBeGreaterThan(-1);
    expect(source.indexOf(gate)).toBeLessThan(source.indexOf('setRunning(kind)'));
  });
});
