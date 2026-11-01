/**
 * @vitest-environment node
 *
 * RON-266 — workspace placement: an exercise lesson replaces the editor, everything else keeps its
 * previous behaviour.
 */
import { describe, it, expect } from 'vitest';
import { workspaceModeFor } from '../src/lib/exercises/placement.js';

const SPEC = {
  version: 1,
  type: 'journal-entry',
  id: 'l1-e1',
  prompt: 'p',
  promptGloss: 'g',
  accounts: ['現金', '売上', '普通預金', '仕入', '売掛金', '買掛金'].map((name) => ({
    name,
    gloss: `gloss-${name}`,
  })),
  answer: {
    debit: [{ account: '現金', amount: 100 }],
    credit: [{ account: '売上', amount: 100 }],
  },
  hints: ['h1'],
};

const exercise = { id: 'ex-1', type: 'journal-entry', spec: SPEC };

describe('RON-266 exercises: workspace placement', () => {
  it('RON-266 exercises: a lesson with exercises selects the exercise surface', () => {
    expect(workspaceModeFor({ kind: 'skill', exercises: [exercise] })).toBe('exercise');
    expect(workspaceModeFor({ kind: 'programming', exercises: [exercise] })).toBe('exercise');
  });

  it('RON-266 exercises: a programming lesson without exercises keeps the code editor', () => {
    expect(workspaceModeFor({ kind: 'programming', exercises: [] })).toBe('code');
    expect(workspaceModeFor({ kind: 'programming' })).toBe('code');
  });

  it('RON-266 exercises: a non-programming lesson without exercises offers no surface', () => {
    expect(workspaceModeFor({ kind: 'skill', exercises: [] })).toBeNull();
    expect(workspaceModeFor({ kind: 'conceptual' })).toBeNull();
    expect(workspaceModeFor()).toBeNull();
  });

  it('ignores exercises that cannot be rendered', () => {
    expect(workspaceModeFor({ kind: 'skill', exercises: [{ type: 'matching', spec: SPEC }] })).toBeNull();
    expect(workspaceModeFor({ kind: 'skill', exercises: [{ type: 'journal-entry', spec: null }] })).toBeNull();
    expect(
      workspaceModeFor({ kind: 'programming', exercises: [{ type: 'journal-entry', spec: null }] })
    ).toBe('code');
  });
});
