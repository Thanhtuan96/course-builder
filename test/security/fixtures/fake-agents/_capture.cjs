#!/usr/bin/env node
/**
 * Fake agent implementation used by the security suite.
 *
 * It appends one JSON line describing how the bridge invoked it ({ agent, argv, env, cwd }) to
 * `PROFESSOR_CAPTURE_FILE`, then emits one protocol-valid success event and exits 0.
 */
const fs = require('fs');

const agent = process.argv[2];
const argv = process.argv.slice(3);
const captureFile = process.env.PROFESSOR_CAPTURE_FILE;

if (captureFile) {
  fs.appendFileSync(
    captureFile,
    `${JSON.stringify({ agent, argv, env: process.env, cwd: process.cwd() })}\n`
  );
}

const events = {
  claude: {
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok-claude' } },
  },
  agent: {
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok-cursor' } },
  },
  opencode: { type: 'text', part: { type: 'text', text: 'ok-opencode' } },
  gemini: { type: 'message', role: 'assistant', content: 'ok-gemini', delta: true },
  agy: {
    event: 'step_update',
    step_update: { step_type: 'agent_response', text_delta: 'ok-agy', state: 'DONE' },
  },
};

process.stdout.write(`${JSON.stringify(events[agent] || events.claude)}\n`);
if (agent === 'agy') {
  process.stdout.write(`${JSON.stringify({ event: 'result', result: { response: 'ok-agy' } })}\n`);
}
