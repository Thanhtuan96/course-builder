import { describe, it, expect } from 'vitest';
import { parseSSEStream, extractLine, parseEventData } from '../src/lib/ai/sse.js';

function bodyFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function collect(stream) {
  const out = [];
  for await (const event of parseSSEStream(stream)) out.push(event);
  return out;
}

describe('SSE parser', () => {
  it('extracts complete lines across LF, CRLF and lone CR', () => {
    expect(extractLine('a\nb')).toEqual(['a', 'b']);
    expect(extractLine('a\r\nb')).toEqual(['a', 'b']);
    expect(extractLine('a\rb')).toEqual(['a', 'b']);
    expect(extractLine('a\r')).toBeNull(); // possible split CRLF — wait
    expect(extractLine('abc')).toBeNull();
  });

  it('joins multi-line data fields and ignores comments/other fields', () => {
    expect(parseEventData(['data: {', 'data: a:1}', ': keep-alive', 'event: x'])).toBe('{\na:1}');
    expect(parseEventData([': comment', 'event: ping'])).toBeNull();
  });

  it('parses a simple stream with [DONE]', async () => {
    const stream = bodyFromChunks(['data: {"text":"hi"}\n\n', 'data: [DONE]\n\n']);
    expect(await collect(stream)).toEqual(['{"text":"hi"}', '[DONE]']);
  });

  it('handles multiple events in one chunk and comments', async () => {
    const stream = bodyFromChunks([': ping\n\ndata: one\n\ndata: two\n\ndata: three\n\n']);
    expect(await collect(stream)).toEqual(['one', 'two', 'three']);
  });

  it('is chunk-boundary independent (split at EVERY byte)', async () => {
    const text =
      'data: {"t":"héllo"}\n\n' +
      'event: message\ndata: {"t":"🌍 naïve"}\n\n' +
      ': keep-alive\n\n' +
      'data: [DONE]\n\n';
    const bytes = new TextEncoder().encode(text);
    const expected = await collect(bodyFromChunks([text]));

    // one byte per chunk: the parser must reconstruct byte-identical events
    const oneByteChunks = Array.from(bytes, (_, j) => bytes.slice(j, j + 1));
    const split = await collect(bodyFromChunks(oneByteChunks));
    expect(split).toEqual(expected);
    expect(split[0]).toBe('{"t":"héllo"}');
    expect(split[1]).toBe('{"t":"🌍 naïve"}');
    expect(split[2]).toBe('[DONE]');

    // and at a spread of arbitrary split points
    for (const at of [1, 5, 12, 21, 30, 41, bytes.length - 1]) {
      const got = await collect(bodyFromChunks([bytes.slice(0, at), bytes.slice(at)]));
      expect(got).toEqual(expected);
    }
  });

  it('handles CRLF event boundaries split across chunks', async () => {
    const stream = bodyFromChunks(['data: one\r', '\n\r\ndata: two\r\n\r\n']);
    expect(await collect(stream)).toEqual(['one', 'two']);
  });

  it('flushes a final event with no trailing blank line', async () => {
    const stream = bodyFromChunks(['data: tail']);
    expect(await collect(stream)).toEqual(['tail']);
  });

  it('ignores unknown event types and empty events', async () => {
    const stream = bodyFromChunks(['event: ping\n\n\n\ndata: real\n\n']);
    expect(await collect(stream)).toEqual(['real']);
  });
});
