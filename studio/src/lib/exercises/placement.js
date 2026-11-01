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

/**
 * Keep the tab strip and the content area in agreement. A learner can be on the workspace tab and
 * move to a lesson that has no workspace, so the tab must fall back to Practice instead of leaving
 * an empty pane behind a hidden tab.
 * @param {string} tab
 * @param {'exercise'|'code'|null} workspaceMode
 * @returns {string}
 */
export function resolveLessonTab(tab, workspaceMode) {
  if (tab === 'workspace' && !workspaceMode) return 'practice';
  return tab;
}
