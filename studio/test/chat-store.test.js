import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  advanceHintLevel,
  clampHintLevel,
  getHintLevel,
  hintLevelLabel,
  hintStage,
  MAX_HINT_LEVEL,
  nextHintLevel,
  resetHintLevel,
  setHintLevel,
} from '../src/lib/chat-store.js';

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hint ladder (pure)', () => {
  it('advances one step at a time and stops at the last hint', () => {
    expect(nextHintLevel(0)).toBe(1);
    expect(nextHintLevel(1)).toBe(2);
    expect(nextHintLevel(2)).toBe(3);
    expect(nextHintLevel(3)).toBe(MAX_HINT_LEVEL);
    expect(nextHintLevel(99)).toBe(MAX_HINT_LEVEL);
  });

  it('clamps to the 0..MAX range', () => {
    expect(clampHintLevel(-4)).toBe(0);
    expect(clampHintLevel(2.6)).toBe(3);
    expect(clampHintLevel(undefined)).toBe(0);
    expect(clampHintLevel('x')).toBe(0);
  });

  it('labels levels for the UI', () => {
    expect(hintLevelLabel(0)).toBe('Hint');
    expect(hintLevelLabel(1)).toBe('Hint 1 of 3');
    expect(hintLevelLabel(2)).toBe('Hint 2 of 3');
    expect(hintLevelLabel(3)).toBe('Hint 3 of 3');
  });

  it('maps levels to their stage', () => {
    expect(hintStage(0)).toBe('');
    expect(hintStage(1)).toBe('concept');
    expect(hintStage(2)).toBe('pattern');
    expect(hintStage(3)).toBe('pseudo-code');
  });
});

describe('hint ladder (persistence)', () => {
  it('defaults to no hint and advances through 1..3 per lesson', () => {
    expect(getHintLevel('lesson-a')).toBe(0);
    expect(advanceHintLevel('lesson-a')).toBe(1);
    expect(advanceHintLevel('lesson-a')).toBe(2);
    expect(advanceHintLevel('lesson-a')).toBe(3);
    expect(advanceHintLevel('lesson-a')).toBe(3);
    expect(getHintLevel('lesson-a')).toBe(3);
  });

  it('keeps each lesson independent', () => {
    advanceHintLevel('lesson-a');
    advanceHintLevel('lesson-a');
    expect(getHintLevel('lesson-a')).toBe(2);
    expect(getHintLevel('lesson-b')).toBe(0);
  });

  it('clamps set values and can reset', () => {
    expect(setHintLevel('lesson-c', 9)).toBe(MAX_HINT_LEVEL);
    expect(setHintLevel('lesson-c', -3)).toBe(0);
    advanceHintLevel('lesson-c');
    expect(resetHintLevel('lesson-c')).toBe(0);
    expect(getHintLevel('lesson-c')).toBe(0);
  });

  it('degrades gracefully without localStorage', () => {
    vi.unstubAllGlobals();
    // @ts-ignore - node test environment has no localStorage
    delete globalThis.localStorage;
    expect(getHintLevel('lesson-d')).toBe(0);
    expect(advanceHintLevel('lesson-d')).toBe(1);
    expect(getHintLevel('lesson-d')).toBe(0); // nothing persisted, but no crash
  });
});
