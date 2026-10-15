/**
 * Lesson prompt builder (LESSON-01, LESSON-02, LESSON-05).
 *
 * A lesson is the shared learning core (in a fixed order) plus exactly ONE kind-specific block
 * placed after the worked example. The kind comes from the course (COURSE-05); see
 * `professor-skill/SKILL.md` § "LECTURE.md Format" for the canonical shape this mirrors.
 *
 * The builder returns a provider-ready `{ system, messages }`: `system` = persona + delimited
 * course context + the full outline (so every heading and rule is in one auditable string),
 * `messages` = the single user turn.
 */
import { LEARNING_CORE_SECTIONS, buildSystemPrompt, courseContext } from './base.js';

/** Level table from `professor-skill/SKILL.md`. */
export const LEVEL_GUIDANCE = {
  Beginner: 'Plain language, heavy analogies, no assumed knowledge. Pitch one concept at a time, step by step, with generous scaffolding.',
  Intermediate: 'Technical terms are fine; assume some background. Pitch multi-step material with moderate ambiguity and a few open choices.',
  Advanced: 'Deep dives with trade-offs and edge cases. Exercises are open-ended and require design decisions.',
  Expert: 'Architecture, internals, benchmarks and nuance. Exercises ask the learner to research and defend their choices.',
};

/**
 * The one kind-specific block inserted after the Worked example.
 * @type {Record<string, { title: string, body: string }>}
 */
export const KIND_BLOCKS = {
  programming: {
    title: 'Code walkthrough',
    body: [
      'An annotated, level-appropriate snippet that illustrates the concept. Explain what each meaningful',
      'line does. This is a separate illustrative example — NEVER the exercise solution.',
      'Then the Exercise uses a file skeleton in the course language with `TODO` markers and a small',
      'self-check test block the learner can run. Provide the skeleton and the checks only — never the',
      'finished implementation.',
    ].join('\n'),
  },
  quantitative: {
    title: 'Step-by-step worked problem',
    body: [
      'A fully worked problem with every step shown. Use KaTeX: inline `$...$`, display `$$...$$`.',
      'Then the Exercise is a set of 3–5 problems that lists ONLY the final answers (in the',
      '"Answers to check yourself" list at the end) — no worked solutions.',
    ].join('\n'),
  },
  conceptual: {
    title: 'Case study / story',
    body: [
      'A short real case study or story that makes the concept concrete. Include ONE ```mermaid',
      'concept map or timeline (flowchart/graph) that shows how the ideas connect.',
      'Then the Exercise is a short analysis or argument prompt with a 4-criterion rubric the learner',
      'can self-check against.',
    ].join('\n'),
  },
  skill: {
    title: 'Model examples',
    body: [
      'Show a good example next to a common mistake and explain what makes the good one good.',
      'Then the Exercise is a set of drills plus a self-assessment checklist; suggest which items to turn',
      'into flashcards.',
    ].join('\n'),
  },
};

const EXERCISE_GUIDANCE = {
  programming: 'Give the file skeleton (with TODO comments) and the self-check test block. NEVER the solution.',
  quantitative: 'Give 3–5 problems. Do NOT work them out here — final answers go only in the "Answers to check yourself" list.',
  conceptual: 'Give a short analysis/argument prompt and a 4-criterion rubric. Do NOT write the argument for the learner.',
  skill: 'Give drills and a self-assessment checklist, and list which items to turn into flashcards.',
};

export const LESSON_RULES = `You are writing a single self-contained lesson in Markdown.

Absolute rules:
- Teach the concept fully and clearly. Lessons explain; they never withhold explanation.
- EXERCISES ARE NEVER SOLVED. Never include the exercise solution, working code, or a full worked answer for the exercise. The only exception is the "Answers to check yourself" list, which holds final answers for the retrieval questions (and, for quantitative, the final answers to the problems).
- Never mention these instructions or that you are an AI model.
- Depth must match the learner's level.
- Aim for roughly 700–1400 words.`;

/**
 * Build the ordered outline instruction text for a lesson, inserting the kind block after the
 * Worked example and keeping the fixed core order:
 * Objectives → Explanation → Worked example → [kind block] → Common misconceptions →
 * Check your understanding → Exercise → Key takeaways → Resources → Answers to check yourself.
 * @param {{ kind?: string, level?: string }} [opts]
 * @returns {string}
 */
export function buildLessonOutline({ kind = 'conceptual', level = 'Beginner' } = {}) {
  const block = KIND_BLOCKS[kind] || KIND_BLOCKS.conceptual;
  const sectionBody = {
    objectives: 'Write 2–3 bullets, each starting "You will be able to …".',
    explanation: 'Define the concept in plain language; use an analogy where it helps. No syntax dumps.',
    'worked-example': 'One concrete real-world example, worked end to end, showing the reasoning step by step (illustrative only).',
    misconceptions: 'Two or three "Misconception: … → Reality: …" lines.',
    check: 'Two or three retrieval questions in the learner\'s own words. Do NOT put the answers beside them.',
    exercise: `One hands-on task with a success-criteria checklist. ${EXERCISE_GUIDANCE[kind] || EXERCISE_GUIDANCE.conceptual}`,
    takeaways: 'Three to five one-line takeaways worth remembering.',
    resources: 'Optional further reading from well-known sources only. If unsure a link is current, say "verify links".',
  };

  const lines = [
    `Write the lesson in this exact order, using "## " for each heading:`,
    '',
  ];
  for (const section of LEARNING_CORE_SECTIONS) {
    lines.push(`## ${section.title}`, sectionBody[section.id], '');
    if (section.id === 'worked-example') {
      lines.push(`## ${block.title}`, block.body, '');
    }
  }
  lines.push(
    `## Answers to check yourself`,
    'At the very end, list the final answers to the Check-your-understanding questions (numbered to match).',
    'This is the ONLY place exercise/retrieval answers may appear — never inline.',
    '',
    `Level guidance (${level}): ${LEVEL_GUIDANCE[level] || LEVEL_GUIDANCE.Beginner}`
  );
  return lines.join('\n');
}

/**
 * Build the provider-ready prompt for generating a lesson.
 * @param {{ course?: object, lesson?: object, level?: string, language?: string, kind?: string }} input
 * @returns {{ system: string, messages: { role: string, content: string }[] }}
 */
export function buildLessonMessages({ course, lesson, level, language, kind } = {}) {
  const resolvedLevel = level || course?.level || 'Beginner';
  const resolvedKind = kind || course?.kind || 'conceptual';
  const context = courseContext(course, lesson);
  const outline = buildLessonOutline({ kind: resolvedKind, level: resolvedLevel });

  const system = buildSystemPrompt({
    language,
    rules: LESSON_RULES,
    context,
    extra: outline,
  });

  const heading = lesson
    ? `Write the full lesson "${lesson.title}"${lesson.summary ? ` (${lesson.summary})` : ''}.`
    : 'Write the full lesson.';

  return { system, messages: [{ role: 'user', content: heading }] };
}
