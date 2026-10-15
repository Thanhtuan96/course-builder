/**
 * Guard + integration tests for the async `getProvider()` contract (brief §14).
 *
 * The scanner walks `studio/src/**` and fails if any `getProvider(` call is not awaited. The
 * integration tests exercise the real registry against a stubbed bridge stream so a regression in
 * the async plumbing breaks a test instead of every AI action in the browser.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProvider } from '../src/lib/ai/index.js';
import { createGenerateJson } from '../src/lib/ai/provider-utils.js';
import { buildSyllabusMessages, syllabusValidator } from '../src/lib/prompts/course.js';
import { buildLessonMessages } from '../src/lib/prompts/lesson.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

const DEFINITION = /(?:async\s+)?function\s+$/;
const AWAITED = /await\s+$/;

describe('getProvider() is always awaited', () => {
  it('no synchronous call sites in studio/src', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (isCommentLine(line)) return;
        let from = 0;
        let idx;
        while ((idx = line.indexOf('getProvider(', from)) !== -1) {
          const prefix = line.slice(0, idx);
          if (!DEFINITION.test(prefix) && !AWAITED.test(prefix)) {
            offenders.push(`${relative(SRC, file)}:${i + 1}: ${line.trim()}`);
          }
          from = idx + 'getProvider('.length;
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function bridgeSseResponse(chunks) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const BRIDGE_SETTINGS = {
  provider: 'bridge',
  bridge: { bridgeUrl: 'http://localhost:3000', bridgeToken: 'test-token' },
};

describe('getProvider integration: text flows through a fake bridge', () => {
  it('NewCourse syllabus generation returns validated JSON', async () => {
    const syllabus = {
      title: 'Async JavaScript',
      description: 'Promises and async/await.',
      kind: 'programming',
      kindReason: 'Code-heavy.',
      lessons: [
        { title: 'Promises' },
        { title: 'async/await' },
        { title: 'Error handling' },
        { title: 'Concurrency' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => bridgeSseResponse([JSON.stringify(syllabus)])));

    const { system, messages } = buildSyllabusMessages({ topic: 'async javascript', level: 'Beginner' });
    const provider = await getProvider(BRIDGE_SETTINGS);
    const generateJson = createGenerateJson(provider.streamText.bind(provider));
    const result = await generateJson({ system, messages, validate: syllabusValidator });

    expect(result.title).toBe('Async JavaScript');
    expect(result.lessons).toHaveLength(4);
  });

  it('LessonContent generation streams the lesson markdown', async () => {
    const chunks = ['# Loops\n\n', 'A loop repeats work.'];
    vi.stubGlobal('fetch', vi.fn(async () => bridgeSseResponse(chunks)));

    const course = { title: 'JS basics', level: 'Beginner', kind: 'programming' };
    const lesson = { id: 'l1', position: 2, title: 'Loops', summary: 'Repeat work' };
    const { system, messages } = buildLessonMessages({ course, lesson, level: course.level });

    const provider = await getProvider(BRIDGE_SETTINGS);
    let streamed = '';
    const text = await provider.streamText({ system, messages, onText: (t) => (streamed += t) });

    expect(text).toBe('# Loops\n\nA loop repeats work.');
    expect(streamed).toBe(text);
  });
});
