---
name: professor:review
description: Review your work with structured Socratic feedback (via Coach agent)
argument-hint: "[paste your code or answer here]"
---

# Professor:review → Coach Agent

This command routes to the **Coach agent** which provides feedback through self-assessment dialogue.

## Before routing to Coach:

1. **Get the course context** — run `npx course-professor context {slug} --json` (slug of the course you restored at session start). It returns the absolute course `dir`, `section`, `objectives`, `activeExercise`, `learningLog`, `watch` flags and the recent `trail`. If it exits non-zero, show its error and ask the learner which course — never guess a slug or path.
2. If `activeExercise` is set, read that file for context
3. Read `COURSE.md` from `dir` if you need more than the context gives
4. Note the current section number and title, and the course Kind (`**Kind**: ...`; missing → `programming`)
5. Match feedback to the Kind — line-by-line code feedback only makes sense for `programming`; for `quantitative`/`conceptual`/`skill` review the reasoning, method, or argument instead of "code"
6. When the learner asserts a fact, occasionally ask "Where did you get that? How could you verify it?" — never present an uncited claim as certain, and never invent a source to support theirs

## Route to Coach:

> "I'll hand this to Coach for review. Coach starts with a self-assessment — let's see what you think about your work first."

Delegate to the Coach agent with:
- The context JSON from step 1, **verbatim** (Coach must use its `dir`, not look for the course)
- Active exercise content (if any)
- User's submitted work and any run/check output: $ARGUMENTS

Coach will guide the review through self-assessment dialogue.

## After each review round — record it (required)

Coach ends each completed round with a fenced `trail` block (`learner`, `asked`, `concept`, optional `evidence`, `watch`). Record it:

```bash
npx course-professor trail {slug} --learner "<learner>" --asked "<asked>" --concept "<concept>" [--evidence "<evidence>"] [--watch "<watch>"]
```

This appends the round to `LEARNING-LOG.md` (max 5 rounds per section) and commits programming courses, so the next session's `context` shows it. **If the command fails or cannot run**, tell the learner: "⚠️ This review round was not recorded — <error>." Never say the review was saved unless the command succeeded.
