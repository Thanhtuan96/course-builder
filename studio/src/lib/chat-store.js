/**
 * chat-store — per-lesson tutor state that is not stored in the repository.
 *
 * The chat transcript itself lives in `repo.chat_messages` (TUTOR-04). This module owns the
 * *hint ladder*: how far up the concept → pattern → pseudo-code ladder the learner has climbed
 * for each lesson, so "Give me a hint" advances at most one step and the UI can show "Hint 2 of 3".
 * It is intentionally tiny and localStorage-backed, with a pure core that is easy to test.
 */
import { useCallback, useState } from 'react';
import { MAX_HINT_LEVEL, HINT_LEVELS } from './prompts/tutor.js';

export { MAX_HINT_LEVEL };

const STORE_KEY = 'professor-studio:hint-levels';

/** @returns {{ [lessonId: string]: number }} */
function readAll() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {{ [lessonId: string]: number }} map */
function writeAll(map) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* storage full or blocked — the ladder just restarts next session */
  }
}

/** Clamp an in-progress level into the 0..MAX range (0 = no hint given yet). @param {unknown} level */
export function clampHintLevel(level) {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), MAX_HINT_LEVEL);
}

/** Advance the ladder by one step, never past the last hint. @param {number} current */
export function nextHintLevel(current) {
  return Math.min(clampHintLevel(current) + 1, MAX_HINT_LEVEL);
}

/** Human label for a level, e.g. "Hint 2 of 3" (or "Hint" before any hint). @param {number} level */
export function hintLevelLabel(level) {
  const n = clampHintLevel(level);
  return n > 0 ? `Hint ${n} of ${MAX_HINT_LEVEL}` : 'Hint';
}

/** The stage name for a level: concept | pattern | pseudo-code | ''. @param {number} level */
export function hintStage(level) {
  const n = clampHintLevel(level);
  return n > 0 ? HINT_LEVELS[n - 1].kind : '';
}

/** @param {string} lessonId */
export function getHintLevel(lessonId) {
  return clampHintLevel(readAll()[lessonId]);
}

/**
 * Persist a level for a lesson.
 * @param {string} lessonId
 * @param {number} level
 * @returns {number} the stored level
 */
export function setHintLevel(lessonId, level) {
  const next = clampHintLevel(level);
  const all = readAll();
  all[lessonId] = next;
  writeAll(all);
  return next;
}

/**
 * Advance one lesson's ladder by one step and persist it.
 * @param {string} lessonId
 * @returns {number} the new level
 */
export function advanceHintLevel(lessonId) {
  return setHintLevel(lessonId, nextHintLevel(getHintLevel(lessonId)));
}

/** @param {string} lessonId @returns {number} 0 after reset */
export function resetHintLevel(lessonId) {
  return setHintLevel(lessonId, 0);
}

/**
 * React binding for the hint ladder of one lesson.
 * @param {string} lessonId
 * @returns {{ level: number, label: string, stage: string, next: number, advance: () => number, reset: () => void }}
 */
export function useHintLevel(lessonId) {
  const [level, setLevel] = useState(() => getHintLevel(lessonId));
  const [activeId, setActiveId] = useState(lessonId);

  // Re-sync when the lesson changes (component may be reused across lessons).
  if (activeId !== lessonId) {
    setActiveId(lessonId);
    setLevel(getHintLevel(lessonId));
  }

  const advance = useCallback(() => {
    const next = advanceHintLevel(lessonId);
    setLevel(next);
    return next;
  }, [lessonId]);

  const reset = useCallback(() => {
    setLevel(resetHintLevel(lessonId));
  }, [lessonId]);

  return {
    level,
    label: hintLevelLabel(level),
    stage: hintStage(level),
    next: nextHintLevel(level),
    advance,
    reset,
  };
}
