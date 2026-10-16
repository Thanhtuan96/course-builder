/**
 * Syllabus prompt + validator (COURSE-01, COURSE-02, COURSE-05).
 *
 * The model is asked to return JSON only; `validateSyllabus` is the schema gate used both by the
 * provider's repair retry (via `generateJson`) and by the NewCourse page before saving. Small
 * local models fence/invent JSON (Pitfall 5), so validation is tolerant: unknown/missing `kind`
 * falls back to `conceptual` rather than failing the whole proposal.
 */
import { COURSE_KIND_IDS } from '../course.js';
import { withLanguage, languageHeadline, appendLanguageInstruction } from './base.js';

export const MIN_LESSONS = 4;
export const MAX_LESSONS = 10;

export const SYLLABUS_SHAPE = `{
  "title": "string",
  "description": "one or two sentences",
  "kind": "programming | quantitative | conceptual | skill",
  "kindReason": "one short sentence explaining the kind",
  "artifact": {
    "title": "string",
    "deliverable": "one sentence naming the ONE concrete thing the learner will ship",
    "definitionOfDone": ["3 to 6 checkable finished-state bullets"]
  },
  "lessons": [
    { "title": "string", "summary": "one line describing what this lesson teaches" }
  ]
}`;

const RULES = `You design course syllabi for a Socratic learning app.
Return ONLY a single JSON object — no prose, no Markdown fences, no trailing commentary.
The JSON must match exactly this shape:
${SYLLABUS_SHAPE}

Hard rules:
- Between ${MIN_LESSONS} and ${MAX_LESSONS} lessons, ordered as a learning path (prerequisites first).
- Every "title" is short (2–6 words); every "summary" is one clear line.
- Choose exactly one "kind" from: programming, quantitative, conceptual, skill.
  * programming — the learner writes and runs code.
  * quantitative — math, statistics or data the learner computes.
  * conceptual — ideas, theory and mental models.
  * skill — a practical ability practised in repeated drills.
- "kindReason" is one short sentence referring to the topic (e.g. "Detected: Conceptual — a history topic").
- "artifact" names the ONE real, shippable deliverable the course builds toward (not an exam). Make it
  concrete and portfolio-ready, e.g. a deployed mini-app + repo (programming), a 1,500-word analysis
  memo with sources (conceptual), a data notebook + report on a public dataset (quantitative), or a
  recorded performance (skill). "definitionOfDone" is 3–6 bullets describing the finished state —
  each one checkable ("repo has a README and a working demo link", not "understand the topic").`;

/**
 * Tolerant normalisation of the syllabus `artifact` block. Missing/blank fields degrade gracefully
 * so a small model returning a partial object never fails the whole proposal.
 * @param {any} obj
 * @returns {{ title: string, deliverable: string, definitionOfDone: string[] }}
 */
export function normalizeArtifact(obj) {
  const source = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  const definitionOfDone = (Array.isArray(source.definitionOfDone) ? source.definitionOfDone : [])
    .map((item) => (typeof item === 'string' ? item.trim() : item && typeof item.title === 'string' ? item.title.trim() : ''))
    .filter(Boolean);
  return {
    title: typeof source.title === 'string' ? source.title.trim() : '',
    deliverable: typeof source.deliverable === 'string' ? source.deliverable.trim() : '',
    definitionOfDone,
  };
}

/**
 * Build the system + messages for the syllabus generation call.
 * @param {{ topic: string, level?: string, goal?: string, language?: string, existingLessons?: string[] }} input
 * @returns {{ system: string, messages: { role: string, content: string }[] }}
 */
export function buildSyllabusMessages({ topic, level = 'Beginner', goal = '', language, existingLessons = [] } = {}) {
  const lines = [
    `Create a course syllabus for the following request.`,
    ``,
    `Topic: ${String(topic || '').trim() || '(unspecified)'}`,
    `Level: ${level}`,
  ];
  if (goal) lines.push(`Learner goal: ${String(goal).trim()}`);
  if (Array.isArray(existingLessons) && existingLessons.length) {
    lines.push(
      `The learner already suggested these lessons — keep the same spirit and fill gaps rather than starting over:`,
      ...existingLessons.map((l) => `- ${l}`)
    );
  }
  lines.push('', 'Return only the JSON object.');

  const head = languageHeadline(language);
  const body = withLanguage(RULES, language);
  return {
    system: head ? `${head}\n\n${body}` : body,
    messages: appendLanguageInstruction([{ role: 'user', content: lines.join('\n') }], language),
  };
}

/**
 * Validate and normalise a proposed syllabus. Tolerant by design: a missing or unrecognised
 * `kind` becomes `conceptual`, string lessons are accepted, blank lessons are dropped.
 * @param {any} obj
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateSyllabus(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Syllabus must be a JSON object' };
  }
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return { ok: false, error: 'Syllabus is missing a title' };

  if (!Array.isArray(obj.lessons)) return { ok: false, error: 'Syllabus is missing a lessons array' };

  const lessons = [];
  for (const raw of obj.lessons) {
    const lesson = typeof raw === 'string' ? { title: raw } : raw;
    if (!lesson || typeof lesson !== 'object') continue;
    const lessonTitle = typeof lesson.title === 'string' ? lesson.title.trim() : '';
    if (!lessonTitle) continue;
    lessons.push({
      title: lessonTitle,
      summary: typeof lesson.summary === 'string' ? lesson.summary.trim() : '',
    });
  }

  if (lessons.length < MIN_LESSONS || lessons.length > MAX_LESSONS) {
    return { ok: false, error: `Expected ${MIN_LESSONS}–${MAX_LESSONS} lessons, got ${lessons.length}` };
  }

  const kind = COURSE_KIND_IDS.includes(obj.kind) ? obj.kind : 'conceptual';
  return {
    ok: true,
    value: {
      title,
      description: typeof obj.description === 'string' ? obj.description.trim() : '',
      kind,
      kindReason: typeof obj.kindReason === 'string' ? obj.kindReason.trim() : '',
      artifact: normalizeArtifact(obj.artifact),
      lessons,
    },
  };
}

/**
 * A `validate` callback for `generateJson` that throws a readable message on failure.
 * @param {any} obj
 * @returns {true | string}
 */
export function syllabusValidator(obj) {
  const result = validateSyllabus(obj);
  return result.ok ? true : result.error;
}
