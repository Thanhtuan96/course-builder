/**
 * RON-198 / RON-200 — a stored review row must never surface raw JSON, and a review message must
 * never surface a raw `tutor.mode.*` key, in the tutor transcript.
 *
 * Studio renders with `react-dom/server` only — no DOM, no effects — so the assertions target the
 * transcript row component and the chat bubble that own the behaviour.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { TutorTranscriptRow } from '../src/components/tutor/TutorPanel.jsx';
import { ChatMessage } from '../src/components/tutor/ChatMessage.jsx';
import { translate } from '../src/lib/i18n/index.js';

const CRITERIA = [
  { key: 'q1', label: 'Loops terminate', status: 'met', question: null },
  { key: 'q2', label: 'Variables are scoped', status: 'not_met', question: 'Why that scope?' },
];

const ATTEMPT_TABLE = {
  quiz: 'quiz_attempts',
  workspace: 'run_results',
  tutor: 'chat_messages',
};

/** A stored review record as the surfaces persist it (stringified into `content`). */
function reviewContent(surface) {
  return JSON.stringify({
    surface,
    attemptTable: ATTEMPT_TABLE[surface],
    attemptId: 'a1',
    passing: false,
    criteria: CRITERIA,
  });
}

function renderRow(surface, extra = {}) {
  return renderToString(
    createElement(TutorTranscriptRow, {
      message: { id: 'm1', role: 'assistant', mode: 'review', content: reviewContent(surface) },
      onRevise: () => {},
      ...extra,
    })
  );
}

beforeEach(() => {
  repo.useAdapter(createMemoryAdapter());
});

describe('RON-198 — quiz review row in the tutor transcript', () => {
  it('renders the criteria and a surface label, never the raw JSON, and no Revise CTA', () => {
    const html = renderRow('quiz');

    expect(html).toContain('Loops terminate');
    expect(html).toContain('Variables are scoped');
    expect(html).toContain('Why that scope?');
    expect(html).toContain('Quiz review');
    expect(html).not.toContain('{"surface"');
    expect(html).not.toContain('attemptTable');
    expect(html).not.toContain('Revise this attempt');
  });
});

describe('RON-198 — workspace review row in the tutor transcript', () => {
  it('renders the criteria read-only with the workspace surface label', () => {
    const html = renderRow('workspace');

    expect(html).toContain('Loops terminate');
    expect(html).toContain('Variables are scoped');
    expect(html).toContain('Workspace review');
    expect(html).not.toContain('{"surface"');
    expect(html).not.toContain('Revise this attempt');
  });
});

describe('RON-198 — unparseable review row', () => {
  it('shows the localised fallback instead of the stored JSON string', () => {
    const html = renderToString(
      createElement(TutorTranscriptRow, {
        message: {
          id: 'm1',
          role: 'assistant',
          mode: 'review',
          content: '{"surface":"quiz","criteria":',
        },
        onRevise: () => {},
      })
    );

    expect(html).toContain('This review could not be shown.');
    expect(html).not.toContain('{"surface"');
    expect(html).not.toContain('criteria');
  });
});

describe('RON-198 — tutor review row is unchanged', () => {
  it('keeps the criteria heading and the Revise CTA', () => {
    const html = renderRow('tutor');

    expect(html).toContain('Criteria');
    expect(html).toContain('Loops terminate');
    expect(html).toContain('Revise this attempt');
    expect(html).not.toContain('{"surface"');
  });
});

describe('RON-200 — review mode label', () => {
  it('defines tutor.mode.review in both the en and vi catalogs', () => {
    for (const language of ['en', 'vi']) {
      const label = translate(language, 'tutor.mode.review');
      expect(label, language).not.toBe('tutor.mode.review');
      expect(label.trim().length, language).toBeGreaterThan(0);
    }
  });

  it('renders the localised review chip instead of the raw key', () => {
    const html = renderToString(
      createElement(ChatMessage, {
        message: { id: 'm1', role: 'assistant', mode: 'review', content: 'Reviewed.' },
      })
    );

    expect(html).toContain('Review');
    expect(html).not.toContain('tutor.mode.review');
  });

  it('renders no chip at all for a mode missing from the catalogs', () => {
    const html = renderToString(
      createElement(ChatMessage, {
        message: { id: 'm1', role: 'assistant', mode: 'mystery_mode', content: 'Hello.' },
      })
    );

    expect(html).not.toContain('tutor.mode.');
    expect(html).not.toContain('mystery_mode');
    expect(html).toContain('Hello.');
  });
});
