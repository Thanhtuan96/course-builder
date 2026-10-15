/**
 * Bundled demo course (COURSE-04). Fully walkable with NO provider configured: lessons ship
 * pre-written Markdown, a pre-written 5-question quiz lives in `lesson.quiz_seed`, and three
 * flashcards enter the spaced-repetition queue on first run.
 *
 * `quiz_seed` is stored as a JSON string on the lesson row so Phase 24 can render it without
 * calling a model.
 */
import { createCourse, listCourses, addCards } from '../lib/repo/index.js';

export const DEMO_COURSE_ID = 'demo-how-to-learn';

const L1 = `# How learning actually works

## Concept

Learning is not reading — it is **retrieval**. Your brain strengthens a memory each time you pull
it back out, not each time you put it in. Two habits do most of the work:

- **Active recall** — close the page and try to reproduce the idea from memory.
- **Spaced repetition** — revisit it just as you are about to forget it.

Rereading feels productive because it feels *familiar*, but familiarity is not understanding.

## Real-world example

A med student rereads a chapter three times and blankly recalls nothing in the exam. A classmate
reads once, then covers the page and recites what she remembers out loud. The second student spends
less time and remembers far more — because she practised *retrieval*, not *input*.

## Exercise

Pick one idea you learned this week. Close everything and write down, from memory:

1. the idea in one sentence,
2. one concrete example,
3. one thing it does *not* mean.

Then open your notes and note what you missed. That gap is your real study list.`;

const L2 = `# Asking better questions

## Concept

The quality of what you learn tracks the quality of the questions you ask. Good questions are:

- **Specific** — "why does the loop skip the last item?" beats "how do loops work?"
- **Testable** — you can describe what an answer would even look like.
- **Layered** — they point at a concept first, then a pattern, then the details.

## Real-world example

Two learners debug the same failing function. One asks "why is this broken?" and waits for help.
The other asks "is the failure at the boundary — first iteration, last iteration, or empty input?" and
immediately narrows the search. Same problem, very different speed.

## Exercise

Take a topic you find confusing. Write three questions about it: one about the *concept*, one about
the *pattern* you would follow, and one about the *edge case* that would surprise you. Do not answer
them yet — just notice how much sharper your mental model already is.`;

const L3 = `# Learning from mistakes

## Concept

A mistake is a **signal**, not a verdict. When something fails, separate three things:

- the **goal** (what you wanted),
- the **attempt** (what you did),
- the **gap** (what reality did differently).

Most learning happens in the gap. Naming it turns a frustrating failure into a precise next step.

## Real-world example

A learner's flashcard app keeps scheduling cards too far in the future. Instead of "I'm bad at
code", she names the gap: "I update the interval but never recompute the due date." That single
sentence tells her exactly what to fix.

## Exercise

Recall your most recent mistake (in anything). Write the goal, the attempt, and the gap in one line
each. Then write the *smallest* next experiment that would test your explanation of the gap.`;

const L4 = `# Building a daily practice

## Concept

Consistency beats intensity. A short daily session keeps memories above the forgetting curve;
cramming rebuilds them from scratch each time. Aim for a **minimum viable session**: 10–15 minutes
of retrieval on due material, every day.

## Real-world example

Two learners both study ten hours total. One does one five-hour cram, the other does 15 minutes a
day. A month later the daily learner still recalls most of it; the crammer remembers fragments.

## Exercise

Design your minimum viable session. Answer:

1. What time of day will you do it, and what triggers it (after coffee, before lunch)?
2. What is the smallest version that still counts on a bad day (one flashcard? one recap)?
3. How will you mark that you did it — a streak, a tick on paper?

Keep it embarrassingly small. You can always do more, never less.`;

export const DEMO_COURSE = {
  id: DEMO_COURSE_ID,
  title: 'How to learn anything with Professor',
  description: 'A four-lesson crash course in learning how to learn — active recall, good questions, learning from mistakes, and a daily practice.',
  level: 'Beginner',
  goal: 'Build a repeatable, evidence-based learning habit.',
  topics: ['learning', 'study skills', 'memory'],
  source: 'demo',
  lessons: [
    {
      title: 'How learning actually works',
      summary: 'Active recall and spaced repetition beat rereading.',
      content_md: L1,
      quiz_seed: [
        {
          question: 'What strengthens a memory the most?',
          options: ['Rereading the page several times', 'Pulling the idea back out of memory', 'Highlighting key sentences', 'Reading slowly'],
          answer: 1,
          explanation: 'Retrieval (active recall) strengthens memory far more than passive input.',
        },
        {
          question: 'Why does rereading feel productive but work poorly?',
          options: ['It is too slow', 'It creates familiarity, not recall', 'It uses the wrong eye muscles', 'It requires a quiet room'],
          answer: 1,
          explanation: 'Familiarity is mistaken for understanding; recall is what is tested.',
        },
        {
          question: 'Spaced repetition means revisiting material…',
          options: ['only once', 'right before you would forget it', 'every hour forever', 'only when you feel like it'],
          answer: 1,
          explanation: 'Reviews timed near the forgetting point are the most efficient.',
        },
        {
          question: 'The best study list after a recall attempt is…',
          options: ['everything you already knew', 'the gaps you missed', 'the full chapter', 'your friend’s notes'],
          answer: 1,
          explanation: 'What you could not retrieve is exactly what needs work.',
        },
        {
          question: 'Which pair does most of the work of learning?',
          options: ['Reading + highlighting', 'Active recall + spaced repetition', 'Speed + volume', 'Notes + colour coding'],
          answer: 1,
          explanation: 'Those two habits dominate the evidence.',
        },
      ],
    },
    {
      title: 'Asking better questions',
      summary: 'Specific, testable, layered questions speed up learning.',
      content_md: L2,
      quiz_seed: [
        {
          question: 'Which is the better question?',
          options: ['How do loops work?', 'Why does the loop skip the last item?', 'What is a loop?', 'Are loops important?'],
          answer: 1,
          explanation: 'Specific and testable questions narrow the search fastest.',
        },
        {
          question: 'A "testable" question is one where…',
          options: ['you already know the answer', 'you can say what an answer would look like', 'it is short', 'it is about code'],
          answer: 1,
          explanation: 'If you cannot describe a valid answer, the question is too vague.',
        },
        {
          question: 'Layered questions move in which order?',
          options: ['details → pattern → concept', 'concept → pattern → edge cases', 'edge cases → concept → pattern', 'randomly'],
          answer: 1,
          explanation: 'Start with the concept, then the pattern, then edge cases.',
        },
        {
          question: 'The two learners debugging: who narrows faster?',
          options: ['The one asking "why is this broken?"', 'The one asking where exactly the failure happens', 'The one asking a friend', 'They are equal'],
          answer: 1,
          explanation: 'Locating the failure beats asking for the fix.',
        },
        {
          question: 'A good study question should be…',
          options: ['vague enough to be flexible', 'specific, testable and layered', 'answerable by yes/no only', 'about many topics at once'],
          answer: 1,
          explanation: 'Those three properties keep the question useful.',
        },
      ],
    },
    {
      title: 'Learning from mistakes',
      summary: 'Name the gap between goal, attempt and reality.',
      content_md: L3,
      quiz_seed: [
        {
          question: 'A mistake is best treated as…',
          options: ['a verdict on ability', 'a signal to investigate', 'something to hide', 'a reason to stop'],
          answer: 1,
          explanation: 'Treat mistakes as information about the gap.',
        },
        {
          question: 'Which three things should you separate after a failure?',
          options: ['goal, attempt, gap', 'time, cost, effort', 'past, present, future', 'who, what, why'],
          answer: 0,
          explanation: 'Goal, attempt, gap turns failure into a next step.',
        },
        {
          question: '"I update the interval but never recompute the due date" is an example of…',
          options: ['an excuse', 'naming the gap precisely', 'a vague complaint', 'a goal'],
          answer: 1,
          explanation: 'Naming the gap points directly at the fix.',
        },
        {
          question: 'The next step after naming the gap is to…',
          options: ['redo everything', 'run the smallest experiment that tests your explanation', 'ask for the answer', 'move on'],
          answer: 1,
          explanation: 'Small experiments confirm or refute your explanation quickly.',
        },
        {
          question: 'Most learning happens in…',
          options: ['the goal', 'the attempt', 'the gap', 'the celebration'],
          answer: 2,
          explanation: 'The gap between expectation and reality is where understanding grows.',
        },
      ],
    },
    {
      title: 'Building a daily practice',
      summary: 'A minimum viable session beats occasional cramming.',
      content_md: L4,
      quiz_seed: [
        {
          question: 'Consistency beats intensity because…',
          options: ['it is more fun', 'it keeps memories above the forgetting curve', 'it takes more time', 'it needs no planning'],
          answer: 1,
          explanation: 'Short daily reviews prevent the decay that cramming must rebuild.',
        },
        {
          question: 'A minimum viable session is…',
          options: ['the longest session you can manage', 'the smallest session that still counts', 'a rest day', 'a group study'],
          answer: 1,
          explanation: 'A tiny floor keeps the streak alive on bad days.',
        },
        {
          question: 'A good trigger for the daily session is…',
          options: ['whenever you remember', 'an existing habit like after coffee', 'only on weekends', 'when you feel motivated'],
          answer: 1,
          explanation: 'Habit stacking on an existing routine makes it stick.',
        },
        {
          question: 'How will you mark that you did the session?',
          options: ['You will not', 'A streak or a tick on paper', 'A long journal entry', 'By telling a friend'],
          answer: 1,
          explanation: 'A visible, low-effort marker reinforces the habit.',
        },
        {
          question: 'The daily practice should be…',
          options: ['embarrassingly small', 'as long as possible', 'undocumented', 'done only when inspired'],
          answer: 0,
          explanation: 'Start small; you can always do more, never less.',
        },
      ],
    },
  ],
  flashcards: [
    {
      lessonPosition: 1,
      front: 'Active recall',
      back: 'Reproducing an idea from memory rather than rereading it — the strongest study technique.',
    },
    {
      lessonPosition: 2,
      front: 'What makes a good learning question?',
      back: 'Specific, testable, and layered (concept → pattern → edge cases).',
    },
    {
      lessonPosition: 3,
      front: 'Goal / attempt / gap',
      back: 'Separating what you wanted, what you did, and what reality did — the fastest route from failure to a fix.',
    },
  ],
};

let seeding = null;

/**
 * Seed the demo course on first run (idempotent: does nothing once any course exists).
 * The in-flight promise is memoised so React StrictMode's double-invoke cannot double-seed.
 * @returns {Promise<object|null>} the demo course, or null if seeding was skipped
 */
export function seedDemoCourse() {
  if (!seeding) seeding = doSeed();
  return seeding;
}

async function doSeed() {
  const existing = await listCourses();
  if (existing.length > 0) return existing.find((c) => c.id === DEMO_COURSE_ID) || null;

  const { flashcards = [], ...courseInput } = DEMO_COURSE;
  const course = await createCourse(courseInput);

  const byPosition = (pos) => course.lessons.find((l) => l.position === pos);
  for (const card of flashcards) {
    const lesson = byPosition(card.lessonPosition);
    if (lesson) await addCards(course.id, lesson.id, [{ front: card.front, back: card.back }]);
  }
  return course;
}
