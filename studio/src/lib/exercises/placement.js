/**
 * Where a lesson's hands-on area comes from (design D3).
 *
 * A lesson with a renderable exercise shows the exercise surface instead of the code editor; a
 * programming lesson without exercises keeps the editor; anything else has no workspace at all.
 */
import { isRenderableExercise } from './spec.js';

/**
 * @param {{ kind?: string|null, exercises?: object[]|null }} input
 * @returns {'exercise'|'code'|null}
 */
export function workspaceModeFor({ kind, exercises } = {}) {
  const list = Array.isArray(exercises) ? exercises : [];
  if (list.some(isRenderableExercise)) return 'exercise';
  if (kind === 'programming') return 'code';
  return null;
}
