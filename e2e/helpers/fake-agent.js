/**
 * Deterministic fake `claude` agent (RON-168).
 *
 * The real bridge spawns `fixtures/fake-agent/claude`, so pairing token, Origin guard, PATH
 * resolution, stream-json parsing and SSE all run as they do for a real learner. Replies are
 * selected from stable markers in the system prompt and the flattened conversation.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPLIES = join(HERE, '..', 'fixtures', 'fake-agent', 'replies');

const REVIEW_SHAPE = 'Return ONLY a JSON object of the shape { "criteria"';
const EXTERNAL_CAPSTONE_REVIEW =
  "You review a learner's capstone submission for a Playwright end-to-end test";
const CAPSTONE_GENERATION = 'You design the FINAL capstone for a Socratic learning course.';

/**
 * Pick a reply fixture name from the prompt class. Pure and ordered: the most specific prompt wins.
 * @param {string} system
 * @param {string} prompt
 * @returns {string}
 */
export function matchReply(system = '', prompt = '') {
  const sys = String(system);
  const user = String(prompt);
  const both = `${sys}\n${user}`;

  if (both.includes(EXTERNAL_CAPSTONE_REVIEW)) return 'external-capstone-review.json';
  if (both.includes(CAPSTONE_GENERATION)) return 'capstone.json';
  if (both.includes(REVIEW_SHAPE)) {
    return /\bREVISED-ATTEMPT\b/.test(user) ? 'tutor-review-met.json' : 'tutor-review.json';
  }
  if (both.includes('Review this quiz attempt')) return 'quiz-review.json';
  if (both.includes('Review this programming attempt')) return 'workspace-review.json';
  if (both.includes('multiple-choice self-check for the lesson below')) return 'quiz.json';
  if (both.includes('flashcards for the lesson below')) return 'flashcards.json';
  if (both.includes('Create a course syllabus')) return 'syllabus.json';
  // RON-197: lesson.md has no column-0 "#" comment inside its fence; see replies/README.md.
  if (both.includes('Write the full lesson "')) return 'lesson.md';
  return 'tutor.txt';
}

/**
 * Read the committed reply fixture.
 * @param {string} name
 * @returns {string}
 */
export function readReply(name) {
  return readFileSync(join(REPLIES, name), 'utf8');
}

/**
 * Build the Claude stream-json frames for one text reply.
 * @param {string} text
 * @param {{ chunkSize?: number }} [opts]
 * @returns {object[]}
 */
export function buildFrames(text, { chunkSize = 24 } = {}) {
  const full = String(text ?? '');
  const frames = [
    {
      type: 'system',
      subtype: 'init',
      cwd: process.cwd(),
      session_id: 'ron-168-e2e',
      tools: [],
      model: 'fake-claude',
    },
    {
      type: 'stream_event',
      event: { type: 'message_start', message: { role: 'assistant', content: [] } },
      session_id: 'ron-168-e2e',
    },
    {
      type: 'stream_event',
      event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      session_id: 'ron-168-e2e',
    },
  ];

  for (let i = 0; i < full.length; i += chunkSize) {
    frames.push({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: full.slice(i, i + chunkSize) },
      },
      session_id: 'ron-168-e2e',
    });
  }

  frames.push(
    {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: full }] },
      session_id: 'ron-168-e2e',
    },
    {
      type: 'stream_event',
      event: { type: 'message_stop' },
      session_id: 'ron-168-e2e',
    },
    {
      type: 'result',
      subtype: 'success',
      result: full,
      is_error: false,
      num_turns: 1,
    }
  );
  return frames;
}

/**
 * Parse the fake CLI argv (Claude-style flags, prompt last).
 * @param {string[]} argv
 * @returns {{ system: string, prompt: string }}
 */
export function parseArgv(argv = []) {
  let system = '';
  let prompt = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--system-prompt') {
      system = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--system-prompt=')) {
      system = arg.slice('--system-prompt='.length);
      continue;
    }
    if (!arg.startsWith('--')) prompt = arg;
  }
  return { system, prompt };
}

/** Run one fake CLI invocation. */
export function run() {
  const { system, prompt } = parseArgv(process.argv.slice(2));
  const name = matchReply(system, prompt);
  const text = readReply(name);

  for (const frame of buildFrames(text)) {
    process.stdout.write(`${JSON.stringify(frame)}\n`);
  }
}
