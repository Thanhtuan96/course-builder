/**
 * "This exercise runs in your own project".
 *
 * Imported exercises can be multi-file projects (a Spring Boot app, a Gradle build) that Studio's
 * runners cannot execute, or written exercises with nothing to run at all. This module decides that
 * from plain text — no shell, no execution — so the Workspace can explain instead of attempting a
 * run and showing a raw runner error.
 */
import { isLocalLanguage, normalizeLanguage } from './languages.js';

/**
 * A build-tool command. `make` is deliberately absent: "make sure …" is ordinary English, and a
 * false positive would hide the Run button of a perfectly runnable exercise.
 */
export const BUILD_TOOL_COMMAND =
  /((?:\.\/)?(?:mvnw|gradlew|mvn|gradle)\b[^\n]*|(?:npm|pnpm|yarn|bun)\s+run\s+[^\s`'"|;]+|docker[ -]compose\b[^\n]*)/i;

/** Trim prose punctuation and quoting the command was wrapped in. */
function cleanCommand(text) {
  return String(text || '')
    .replace(/^[\s$>]+/, '')
    .replace(/[`'".,;:)\]]+$/, '')
    .trim()
    .slice(0, 120);
}

/**
 * First build-tool command in a block of text, or null.
 * An inline code span (`./mvnw spring-boot:run`) wins: that is how a lecture or comment quotes one.
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function findBuildToolCommand(text) {
  const source = String(text || '');
  const span = /`([^`\n]+)`/g;
  let inline;
  while ((inline = span.exec(source))) {
    const inner = inline[1].trim();
    if (BUILD_TOOL_COMMAND.test(inner)) return cleanCommand(inner) || null;
  }
  const match = BUILD_TOOL_COMMAND.exec(source);
  return match ? cleanCommand(match[1]) || null : null;
}

/**
 * Whether Studio can run the active exercise, and the command the learner should use instead.
 *
 * 1. no language (or an unknown one) → nothing to run;
 * 2. the exercise file names a build tool → its own project;
 * 3. a local-runtime language whose lecture names a build tool → its own project (a browser-runnable
 *    `.py`/`.js` exercise is self-contained by convention, so a lecture mention alone cannot stop it).
 *
 * @param {{ language?: string|null, file?: string|null, lecture?: string|null }} [input]
 * @returns {{ bound: boolean, reason: 'no-runner'|'build-tool'|'lecture-build-tool'|null, command: string|null }}
 */
export function detectProjectBound({ language = null, file = '', lecture = '' } = {}) {
  const lang = normalizeLanguage(language);
  const fileCommand = findBuildToolCommand(file);
  const lectureCommand = findBuildToolCommand(lecture);

  if (!lang) return { bound: true, reason: 'no-runner', command: fileCommand || lectureCommand };
  if (fileCommand) return { bound: true, reason: 'build-tool', command: fileCommand };
  if (isLocalLanguage(lang) && lectureCommand) {
    return { bound: true, reason: 'lecture-build-tool', command: lectureCommand };
  }
  return { bound: false, reason: null, command: fileCommand || lectureCommand };
}
