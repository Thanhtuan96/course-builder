/**
 * Where a lesson's hands-on area comes from (design D3).
 *
 * A lesson with a renderable exercise shows the exercise surface instead of the code editor; a
 * programming lesson without exercises keeps the editor; a lesson whose import attached workspace
 * files shows them whatever the course kind; anything else has no workspace at all.
 */
import { isRenderableExercise } from './spec.js';

/**
 * @param {{ kind?: string|null, exercises?: object[]|null, workspaceFiles?: object[]|null }} input
 * @returns {'exercise'|'code'|'files'|null}
 */
export function workspaceModeFor({ kind, exercises, workspaceFiles } = {}) {
  const list = Array.isArray(exercises) ? exercises : [];
  if (list.some(isRenderableExercise)) return 'exercise';
  if (kind === 'programming') return 'code';
  const files = Array.isArray(workspaceFiles) ? workspaceFiles : [];
  if (files.length) return 'files';
  return null;
}

/**
 * Keep the tab strip and the content area in agreement. A learner can be on the workspace tab and
 * move to a lesson that has no workspace, so the tab must fall back to Practice instead of leaving
 * an empty pane behind a hidden tab.
 * @param {string} tab
 * @param {'exercise'|'code'|'files'|null} workspaceMode
 * @returns {string}
 */
export function resolveLessonTab(tab, workspaceMode) {
  if (tab === 'workspace' && !workspaceMode) return 'practice';
  return tab;
}

/**
 * The tabs a lesson offers, in order. Any workspace mode adds the surface tab.
 * @param {'exercise'|'code'|'files'|null} workspaceMode
 * @returns {string[]}
 */
export function lessonTabIds(workspaceMode) {
  return workspaceMode ? ['practice', 'tutor', 'workspace'] : ['practice', 'tutor'];
}

/**
 * The i18n label key for the workspace tab: a code editor is a workspace, an exercise file is an
 * exercise.
 * @param {'exercise'|'code'|'files'|null} workspaceMode
 * @returns {string}
 */
export function workspaceTabLabelKey(workspaceMode) {
  return workspaceMode === 'code' ? 'lesson.tabs.workspace' : 'lesson.tabs.exercise';
}
