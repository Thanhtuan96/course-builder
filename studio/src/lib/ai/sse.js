/**
 * Chunk-boundary-independent SSE reader. One TextDecoder({stream:true}) per response, a string
 * buffer that only dispatches on a complete blank-line-delimited event, and a line splitter that
 * understands LF / CRLF / lone CR (including a CR that straddles two reads).
 *
 * Yields the joined `data:` payload of each event (multi-line data joined with '\n').
 * Comments (`:`), `event:` and `id:` fields are ignored; events with no `data:` field are skipped.
 */

/**
 * Split off the first complete line, or null if the buffer has no terminator yet.
 * A lone trailing `\r` is held back because it may be half of a CRLF.
 * @param {string} buf
 * @returns {[string, string] | null}
 */
export function extractLine(buf) {
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (ch === '\n') return [buf.slice(0, i), buf.slice(i + 1)];
    if (ch === '\r') {
      if (i + 1 >= buf.length) return null; // possible split CRLF — wait for the next chunk
      const next = buf[i + 1] === '\n' ? i + 2 : i + 1;
      return [buf.slice(0, i), buf.slice(next)];
    }
  }
  return null;
}

/**
 * Turn an array of raw event lines into a data payload, or null if the event carries no data.
 * @param {string[]} lines
 * @returns {string|null}
 */
export function parseEventData(lines) {
  const data = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) {
      let value = line.slice(5);
      if (value.startsWith(' ')) value = value.slice(1);
      data.push(value);
    }
  }
  return data.length ? data.join('\n') : null;
}

/**
 * @param {ReadableStream<Uint8Array>} body
 * @returns {AsyncGenerator<string>}
 */
export async function* parseSSEStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventLines = [];

  const drain = function* () {
    let split;
    while ((split = extractLine(buffer))) {
      const [line, rest] = split;
      buffer = rest;
      if (line === '') {
        const data = parseEventData(eventLines);
        eventLines = [];
        if (data !== null) yield data;
      } else {
        eventLines.push(line);
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      yield* drain();
    }
    buffer += decoder.decode();
    // flush a final unterminated line/event
    if (buffer.length) {
      eventLines.push(buffer);
      buffer = '';
    }
    const tail = parseEventData(eventLines);
    if (tail !== null) yield tail;
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * Convenience: iterate SSE events from a fetch Response.
 * @param {{ body: ReadableStream<Uint8Array> | null }} response
 */
export async function* parseSSE(response) {
  if (!response?.body) throw new Error('Response has no body to stream');
  yield* parseSSEStream(response.body);
}
