import { expect, test } from '@playwright/test';
import { buildFrames, matchReply, parseArgv } from '../helpers/fake-agent.js';

test.describe('RON-168 fake agent contract', () => {
  test('RON-168 selects the external capstone review before the generic review shape', () => {
    const system =
      'You review a learner\'s capstone submission for a Playwright end-to-end test they ran in their own project. ' +
      'Return ONLY a JSON object of the shape { "criteria" }';
    expect(matchReply(system, 'Review this capstone submission and return the JSON.')).toBe(
      'external-capstone-review.json'
    );
  });

  test('RON-168 selects each prompt class and falls back to tutor text', () => {
    expect(matchReply('You design the FINAL capstone for a Socratic learning course.', 'Go')).toBe(
      'capstone.json'
    );
    expect(
      matchReply('Return ONLY a JSON object of the shape { "criteria" }', 'Review my attempt')
    ).toBe('tutor-review.json');
    expect(
      matchReply(
        'Return ONLY a JSON object of the shape { "criteria" }',
        'REVISED-ATTEMPT: because the run exited 1'
      )
    ).toBe('tutor-review-met.json');
    expect(matchReply('', 'Review this quiz attempt')).toBe('quiz-review.json');
    expect(matchReply('', 'Review this programming attempt')).toBe('workspace-review.json');
    expect(matchReply('', 'Write a 5-question multiple-choice self-check for the lesson below.')).toBe(
      'quiz.json'
    );
    expect(matchReply('', 'Create about 5 flashcards for the lesson below.')).toBe('flashcards.json');
    expect(matchReply('', 'Create a course syllabus for the following request.')).toBe('syllabus.json');
    expect(matchReply('', 'Write the full lesson "Your first Bash script".')).toBe('lesson.md');
    expect(matchReply('', 'I think exit codes matter.')).toBe('tutor.txt');
  });

  test('RON-168 parses Claude-style argv and builds the stream-json frame contract', () => {
    const parsed = parseArgv([
      '--print',
      '--output-format',
      'stream-json',
      '--system-prompt',
      'system text',
      'prompt text',
    ]);
    expect(parsed).toEqual({ system: 'system text', prompt: 'prompt text' });

    const frames = buildFrames('hello world', { chunkSize: 4 });
    expect(frames[0]).toMatchObject({ type: 'system', subtype: 'init' });
    const deltas = frames
      .filter((frame) => frame.type === 'stream_event' && frame.event.type === 'content_block_delta')
      .map((frame) => frame.event.delta.text);
    expect(deltas.join('')).toBe('hello world');
    expect(frames.at(-1)).toMatchObject({ type: 'result', is_error: false });
  });
});
