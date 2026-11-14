/**
 * @vitest-environment node
 *
 * RON-266 — workspace placement: an exercise lesson replaces the editor, everything else keeps its
 * previous behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  lessonTabIds,
  resolveLessonTab,
  workspaceModeFor,
  workspaceTabLabelKey,
} from '../src/lib/exercises/placement.js';

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

  it('RON-266 exercises: the workspace tab falls back to practice when a lesson has no workspace', () => {
    expect(resolveLessonTab('workspace', 'exercise')).toBe('workspace');
    expect(resolveLessonTab('workspace', 'code')).toBe('workspace');
    expect(resolveLessonTab('workspace', null)).toBe('practice');
    expect(resolveLessonTab('practice', null)).toBe('practice');
    expect(resolveLessonTab('tutor', null)).toBe('tutor');
  });

  it('ignores exercises that cannot be rendered', () => {
    expect(workspaceModeFor({ kind: 'skill', exercises: [{ type: 'matching', spec: SPEC }] })).toBeNull();
    expect(workspaceModeFor({ kind: 'skill', exercises: [{ type: 'journal-entry', spec: null }] })).toBeNull();
    expect(
      workspaceModeFor({ kind: 'programming', exercises: [{ type: 'journal-entry', spec: null }] })
    ).toBe('code');
  });
});

describe('RON-372 imported workspace files get a surface', () => {
  const file = { id: 'wf-1', path: '01-balance-the-ledger.md', language: null, content: '# Balance' };

  it('RON-372 a conceptual lesson with a markdown exercise offers the exercise tab', () => {
    expect(workspaceModeFor({ kind: 'conceptual', exercises: [], workspaceFiles: [file] })).toBe('files');
    expect(lessonTabIds('files')).toContain('workspace');
    expect(workspaceTabLabelKey('files')).toBe('lesson.tabs.exercise');
  });

  it('RON-372 a lesson without exercises or files keeps no surface', () => {
    expect(workspaceModeFor({ kind: 'conceptual', exercises: [], workspaceFiles: [] })).toBeNull();
    expect(lessonTabIds(null)).toEqual(['practice', 'tutor']);
  });

  it('RON-372 interactive exercises still win over imported files', () => {
    expect(workspaceModeFor({ kind: 'conceptual', exercises: [exercise], workspaceFiles: [file] })).toBe(
      'exercise'
    );
  });

  it('RON-372 a programming lesson keeps the code editor and its label', () => {
    expect(workspaceModeFor({ kind: 'programming', workspaceFiles: [file] })).toBe('code');
    expect(workspaceTabLabelKey('code')).toBe('lesson.tabs.workspace');
  });

  it('RON-372 the workspace tab still falls back for a lesson with no surface', () => {
    expect(resolveLessonTab('workspace', 'files')).toBe('workspace');
    expect(resolveLessonTab('workspace', null)).toBe('practice');
  });
});
