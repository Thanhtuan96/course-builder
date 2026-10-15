/**
 * Phase 26c — fixture-based stream-json parsers for every bridge agent.
 *
 * One fixture per agent (captured from the real CLI where it runs, otherwise its documented
 * stream-json shape) is fed through the parser the bridge uses, asserting the assistant text is
 * recovered and non-text frames (tool use, step markers, hook noise) are ignored.
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  extractClaudeText,
  extractOpencodeText,
  extractGeminiText,
  extractAntigravityText,
  opencodeErrorText,
  claudeErrorText,
  geminiErrorText,
  diagnoseAgentFailure,
  parseOpencodeModels,
  parseAntigravityModels,
  parseCursorModels,
  curatedAgentModels,
  AGENT_BINARIES,
  AGENT_PRIORITY,
} from '../../web/studio-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', 'agents', `${name}.jsonl`), 'utf-8');

/** Feed each line through `extract` (ignoring non-JSON noise) and join the emitted text. */
function streamText(source, extract) {
  let out = '';
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue; // hook/comment noise on stdout (Gemini prints some)
    }
    const text = extract(event);
    if (text) out += text;
  }
  return out;
}

describe('bridge agent stream-json parsers', () => {
  it('claude: reads text deltas and ignores the init/assistant/result frames', () => {
    expect(streamText(fixture('claude'), extractClaudeText)).toBe('hello world');
  });

  it('opencode: reads part.text for text events and ignores step/tool events', () => {
    expect(streamText(fixture('opencode'), extractOpencodeText)).toBe('hello world');
  });

  it('gemini: reads assistant message deltas; ignores the user echo and hook noise', () => {
    expect(streamText(fixture('gemini'), extractGeminiText)).toBe('hello');
  });

  it('antigravity: reads agent_response text_delta and ignores init/step markers', () => {
    expect(streamText(fixture('antigravity'), extractAntigravityText)).toBe('hello\n');
  });

  it('opencode extractor rejects non-text and malformed payloads', () => {
    expect(extractOpencodeText({ type: 'text', part: { type: 'text', text: '' } })).toBe('');
    expect(extractOpencodeText({ type: 'text', part: { type: 'reasoning', text: 'x' } })).toBeNull();
    expect(extractOpencodeText({ type: 'result', result: 'nope' })).toBeNull();
    expect(extractOpencodeText(null)).toBeNull();
  });

  it('gemini extractor ignores the user message and non-delta frames', () => {
    expect(extractGeminiText({ type: 'message', role: 'user', content: 'hi' })).toBeNull();
    expect(extractGeminiText({ type: 'message', role: 'assistant', content: 'x', delta: false })).toBeNull();
    expect(extractGeminiText({ type: 'result', status: 'success' })).toBeNull();
  });

  it('antigravity extractor ignores tool steps and the result frame', () => {
    expect(extractAntigravityText({ event: 'step_update', step_update: { step_type: 'tool', text_delta: 'x' } })).toBeNull();
    expect(extractAntigravityText({ event: 'result', result: { response: 'x' } })).toBeNull();
  });
});

describe('stdout error events (never-silent failures)', () => {
  it('opencode: reads the error message from a stdout error event', () => {
    const event = { type: 'error', error: { name: 'UnknownError', data: { message: 'Unexpected server error.' } } };
    expect(opencodeErrorText(event)).toBe('Unexpected server error.');
    expect(opencodeErrorText({ type: 'text', part: { type: 'text', text: 'x' } })).toBeNull();
  });

  it('claude/cursor: reads the message from an is_error result', () => {
    expect(claudeErrorText({ type: 'result', is_error: true, result: 'boom' })).toBe('boom');
    expect(claudeErrorText({ type: 'result', result: 'ok' })).toBeNull();
  });

  it('gemini: reads the message from an error event', () => {
    expect(geminiErrorText({ type: 'error', severity: 'error', message: 'loop detected' })).toBe('loop detected');
    expect(geminiErrorText({ type: 'message', role: 'assistant', content: 'x' })).toBeNull();
  });
});

describe('model list parsers', () => {
  it('opencode: keeps provider/model lines only', () => {
    const stdout = 'opencode/claude-opus-5-5\nopencode-go/deepseek-v4.1-flash\nnot-a-model\n';
    expect(parseOpencodeModels(stdout).map((m) => m.id)).toEqual(['opencode/claude-opus-5-5', 'opencode-go/deepseek-v4.1-flash']);
  });

  it('antigravity: splits id<TAB>label and skips the fetching notice', () => {
    const stdout = 'Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\n';
    expect(parseAntigravityModels(stdout)).toEqual([{ id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)' }]);
  });

  it('cursor: handles JSON and plain-line output', () => {
    expect(parseCursorModels('{"models":[{"id":"gpt-5","label":"GPT-5"}]}')).toEqual([{ id: 'gpt-5', label: 'GPT-5' }]);
    expect(parseCursorModels('gpt-5\nsonnet-4-thinking\n')).toEqual([
      { id: 'gpt-5', label: 'gpt-5' },
      { id: 'sonnet-4-thinking', label: 'sonnet-4-thinking' },
    ]);
  });

  it('curated lists always lead with "Default" (omit --model) except Claude', () => {
    expect(curatedAgentModels('opencode')[0]).toEqual({ id: '', label: 'Default' });
    expect(curatedAgentModels('antigravity')[0]).toEqual({ id: '', label: 'Default' });
    expect(curatedAgentModels('claude')).toEqual([]);
  });

  it('exposes all six agents in a stable priority order', () => {
    expect(Object.keys(AGENT_BINARIES)).toEqual(['claude', 'opencode', 'cursor', 'gemini', 'antigravity', 'ollama']);
    expect(AGENT_PRIORITY).toEqual(['claude', 'opencode', 'cursor', 'gemini', 'antigravity', 'ollama']);
  });
});

describe('agent failure diagnosis', () => {
  it('maps cursor auth failures to the login hint', () => {
    const err = diagnoseAgentFailure('cursor', {
      stderr: "Error: Authentication required. Please run 'agent login' first, or set CURSOR_API_KEY environment variable.",
      exitCode: 1,
    });
    expect(err.code).toBe('auth');
    expect(err.hint).toMatch(/agent login/);
    expect(err.message).toMatch(/Authentication required/);
  });

  it('maps gemini auth failures to the sign-in hint', () => {
    const err = diagnoseAgentFailure('gemini', {
      stderr: 'Keychain initialization encountered an error: Cannot find module\nError authenticating: IneligibleTierError: migrate to Antigravity',
      exitCode: 1,
    });
    expect(err.code).toBe('auth');
    expect(err.hint).toMatch(/gemini/);
  });

  it('maps ollama connection failures to the serve hint', () => {
    const err = diagnoseAgentFailure('ollama', { stderr: 'connect ECONNREFUSED 127.0.0.1:11434', exitCode: 1 });
    expect(err.code).toBe('not_running');
    expect(err.hint).toMatch(/ollama serve/);
  });

  it('maps unknown-model failures to the pick-a-model hint', () => {
    const err = diagnoseAgentFailure('opencode', { stderr: 'Error: unknown model "nope"', exitCode: 1 });
    expect(err.code).toBe('model_not_found');
    expect(err.hint).toMatch(/Pick a model/i);
  });

  it('falls back to a server error including the first meaningful stderr line', () => {
    const err = diagnoseAgentFailure('claude', { stderr: 'something exploded badly', exitCode: 3 });
    expect(err.code).toBe('server');
    expect(err.message).toMatch(/something exploded badly/);
  });
});
