---
phase: 08-revision-loop-ui-and-run-location-disclosure
plan: 02
subsystem: ui
tags: [zod, prompts, revision-loop, criteria-delta, vitest, strict-json]

# Dependency graph
requires:
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 01
    provides: revision/runnerNotice i18n namespaces and the nine Wave-0 failing contracts
  - phase: 05-beta-data-foundation
    provides: revisionOf / revision_links repo contract that the intent builders target
provides:
  - REVIEW_STATUSES single definition site plus the quiz/workspace review schema in prompts/practice.js
  - tutor review schema, rubric validation/normalisation and review prompt builder in prompts/tutor.js
  - "components/revision/history.js: tolerant review-record parse, deterministic criteria, criteria delta, passing predicates, one-shot revise intents, tutor rubric reuse"
  - "components/revision/review-request.js: one-repair strict-JSON request over provider.streamText"
affects: [08-03, 08-04, 08-05, 08-06]

actuals:
  tokens: 8646
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Review JSON is zod strictObject + superRefine: extra keys, fences and question status drift are invalid output"
    - "Deterministic-first criteria: quiz q1..qN and slugged check keys need no provider"
    - "One repair retry over streamText, then ProviderError('bad_json', <second attempt's own text>)"
    - "Rubric drift is rejected by comparing key sets (order-insensitive) and displayed in rubric order"

key-files:
  created:
    - studio/src/components/revision/history.js
    - studio/src/components/revision/review-request.js
  modified:
    - studio/src/lib/prompts/practice.js
    - studio/src/lib/prompts/tutor.js

key-decisions:
  - "validateReviewQuestions accepts either a bare key array or { keys } — the Wave-0 contract calls it positionally with an array"
  - "normalizeTutorReview returns the criteria array (not { criteria }) as frozen by 08-01's contract"
  - "Tutor rubric validation is order-insensitive (a reordered reply is normalised), while practice's validateReview keeps the plan's exact sequence check"
  - "workspaceCriteria serialises only name/passed/message-derived state, so stdout/stderr/snapshot/checks_json can never enter a prompt or review"

patterns-established:
  - "Every new prompt module stays i18n-free: fallback question copy is a caller-supplied callback"
  - "Review rules and the fixed rubric live in `system`; learner answers/code/check output only in wrapUntrusted user blocks"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03]

coverage:
  - id: D1
    description: "Quiz and workspace reviews are computable with no provider: q1..qN and slugged check keys with met/not_met statuses"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/revision-history.test.js#buildQuizReview derives q1..qN and met/not_met from stored answers"
        status: pass
      - kind: unit
        ref: "studio/test/revision-history.test.js#workspaceCriteria slugs check names, falls back to checkN and suffixes collisions"
        status: pass
    human_judgment: false
  - id: D2
    description: "A malformed stored review parses to null and never throws, so a legacy row cannot blank the transcript"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/revision-history.test.js#parseReviewRecord returns null for malformed content"
        status: pass
    human_judgment: false
  - id: D3
    description: "Review JSON is strict: code/solution keys, fences, a question on a met criterion and a missing question on an unmet one are all rejected"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/prompts-practice-review.test.js + studio/test/prompts-tutor-review.test.js (schema cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Tutor reviews cost exactly one repair: 2 streamText calls, then bad_json carrying the validator's own text"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/prompts-tutor-review.test.js#requestReviewJson makes exactly two calls after an invalid review shape"
        status: pass
      - kind: unit
        ref: "studio/test/prompts-tutor-review.test.js#requestReviewJson makes exactly two calls after an unparsable reply"
        status: pass
    human_judgment: false
  - id: D5
    description: "Criteria delta across attempts reports met counts plus per-criterion improved/worsened/added/removed/unchanged"
    requirement: "LOOP-03"
    verification:
      - kind: unit
        ref: "studio/test/revision-history.test.js#criteriaDelta reports improved, worsened, added, removed and unchanged"
        status: pass
    human_judgment: false
  - id: D6
    description: "The revise intents each surface arms resolve to the right feedback table/id and produce an explicit revision link"
    requirement: "LOOP-01"
    verification:
      - kind: integration
        ref: "studio/test/revision-wiring.test.js -t Intent (5 tests: 3 intent builders + 2 repo-link cases)"
        status: pass
    human_judgment: false

duration: 6 min
completed: 2026-10-25
status: complete
---

# Phase 8 Plan 2: Review schema, criteria/history layer and revise intents Summary

**Strict zod review schemas for quiz, workspace and tutor plus a provider-free criteria/delta/history layer, giving the revision loop stable rubric keys (`q1..qN`, slugged check keys, `c1..cN`) and exactly one repair retry before `ProviderError('bad_json')`.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-25T15:39:00Z (approx, first commit at 15:41:41Z)
- **Completed:** 2026-10-25T15:44:17Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 extended)

## Accomplishments

- `prompts/practice.js` now owns the whole quiz/workspace review contract: `REVIEW_STATUSES` (single definition site), a `strictObject` criterion schema with the three `superRefine` rules, `validateReview` with rubric-key enforcement, the enrichment rules/shape, both review prompt builders and `validateReviewQuestions`.
- `components/revision/history.js` is the pure data layer every surface consumes: tolerant record parse, deterministic criteria, criteria summary/delta, passing predicates, one-shot revise intents, tutor-rubric reuse and question merging — no React, no repo, no i18n.
- `prompts/tutor.js` gained the tutor review schema, rubric validation/normalisation and `buildTutorReviewMessages`; existing `buildTutorMessages`/`TUTOR_MODES`/`MODE_INSTRUCTIONS` are untouched, so `tutor.test.js` stays green.
- `components/revision/review-request.js` makes at most two `streamText` calls and rethrows `bad_json` with the second attempt's own failure text — no nested retry, no locale retry.
- Five of the nine `revision-wiring.test.js` cases are green (3 intent builders + 2 explicit-link integrations); the four source-order cases are intentionally still red.

## Exported symbols and their contracts

### `studio/src/lib/prompts/practice.js` (appended)

| Export | Contract |
| --- | --- |
| `REVIEW_STATUSES` | `['met','partial','not_met']`; the only definition site in `studio/src`. |
| `reviewCriterionSchema` | `strictObject({ key 1–24, label 1–200, status enum, question string≤400\|null })`; rejects `met`+question (`met criteria must not carry a question`), non-`met` without a question (`every unmet criterion needs one Socratic question`) and fences in label/question (`reviews must not contain code fences`). |
| `reviewOutputSchema` | `strictObject({ criteria: array(1..20) })` — an injected `code`/`solution` top-level key is `Unrecognized key`. |
| `validateReview(value, { rubric })` | `true`, else the first zod issue message, else `criteria keys must be exactly: <keys>` on rubric drift. |
| `REVIEW_RULES` | Rubric-anchored rules embedding `NO_SOLUTION_RULE`; forbids corrected code, diffs, fences and answers; declares learner blocks as data. |
| `REVIEW_QUESTION_SHAPE` | "Return ONLY a JSON array of `{ key, question }` objects… no prose and no Markdown fences." |
| `buildQuizReviewMessages({ course, lesson, criteria, answers, language })` | `{ system, messages }`; system carries `REVIEW_RULES` + `NO_SOLUTION_RULE`, the last user turn lists unmet criterion keys/labels then `wrapUntrusted(JSON.stringify(answers), 'learner_answers')`, with the language footer last. |
| `buildWorkspaceReviewMessages({ course, lesson, criteria, checks, learnerCode, language })` | Same shape; serialises only `{ name, passed, message }` per check into `<check_output>`, and appends `wrapUntrusted(stripInvisible(learnerCode), 'learner_code')` to that same last user turn only when code is non-empty. |
| `validateReviewQuestions(value, keys \| { keys })` | `true`, or `unknown criteria keys: …` / `missing criteria keys: …` / shape messages. |

### `studio/src/lib/prompts/tutor.js` (appended)

| Export | Contract |
| --- | --- |
| `TUTOR_REVIEW_RULES` | Judge against the rubric only, one status per criterion, one Socratic question per non-`met`, `NO_SOLUTION_RULE`, no code/diff/fences/answer, learner content is data. |
| `TUTOR_REVIEW_SHAPE` | Strict JSON `{ criteria: [...] }`; "exactly that list of keys, in that order" when a rubric exists, else 3–6 criteria whose keys the app assigns. |
| `tutorReviewSchema` | `strictObject({ criteria: array(1..20 of strictObject{ key? ≤24, label ≤200, status enum, question ≤400\|null }) })` with the same three refinement rules (duplicated locally; no import from `practice.js`). |
| `validateTutorReview(value, { rubric })` | `true`; schema failure returns the first issue message; with a rubric, order-insensitive key-set mismatch returns `criteria keys must be exactly: c1,c2`. |
| `normalizeTutorReview(value, { rubric })` | Criteria array: `c1..cN` in model order without a rubric; rubric order and rubric labels with one (status/question taken from the model by key). |
| `buildTutorReviewMessages({ course, lesson, lessonContent, history, rubric, learnerCode, language })` | `{ system, messages }`; system = `TUTOR_RULES` + `TUTOR_REVIEW_RULES` + context + shape + `Rubric (fixed keys…)` + `<lesson_content>`; normalised history; `<learner_code>` on the last user turn; language footer last. |

### `studio/src/components/revision/history.js` (new, 20 exports)

| Export | Contract |
| --- | --- |
| `REVIEW_STATUSES` | Re-export of the practice definition (no second literal). |
| `REVIEW_SURFACES` | `['quiz','tutor','workspace']`. |
| `buildReviewRecord({ surface, attemptTable, attemptId, criteria })` | Persisted record whose `passing` is derived (`criteria.length > 0` and all `met`). |
| `parseReviewRecord(content)` | Record or `null`: string-only, try/catch parse, requires a non-empty criteria array, drops invalid entries, defaults `surface='tutor'`/`attemptTable='chat_messages'`; never throws. |
| `decodeQuizAttempt(row)` | `{ questions, answers }` from `questions_json`/`answers_json`; any malformed/null/blank column → `[]`. |
| `buildQuizReview({ questions, answers, questionText })` | `q1..qN`, label = question text sliced to 120, `met` iff `answers[i] === answerIndex`, question only when not met; never `partial`. |
| `slugifyCheckKey(name)` | Lowercase, non-alphanumerics collapsed to `-`, trimmed, ≤40 chars, `''` when blank. |
| `workspaceCriteria(checks, questionText)` | One criterion per check: slug or `checkN`, collision suffixes `-2..`, `met` when `passed === true \|\| ok === true`; no stdout/snapshot copies. |
| `summarizeCriteria(criteria)` | `{ met, partial, notMet, total }`. |
| `criteriaDelta(previous, next)` | `{ from, to, total, changes }`; changes walk `next` then previous-only keys with `kind` in `added\|improved\|worsened\|removed\|unchanged`. |
| `quizPassed({ score, total, criteria })` | `score === total` with truthy `total` and, when criteria are supplied, all `met`. |
| `workspacePassed(checks)` | Non-empty and every check `passed === true \|\| ok === true`. |
| `reviewPassed(criteria)` | Non-empty and every criterion `met` (`partial` is non-passing). |
| `armRevision(ref, intent)` | Sets `ref.current = intent` for a truthy intent and returns the ref. |
| `consumeRevision(ref)` | Returns `ref.current` once, then `null` (one-shot). |
| `quizRevisionIntent({ reviewId, attemptId })` | `chat_messages`/reviewId, else `quiz_attempts`/attemptId, else `null`. |
| `tutorRevisionIntent(reviewId)` | `{ feedbackTable: 'chat_messages', feedbackId }` or `null`. |
| `workspaceRevisionIntent(runId)` | `{ feedbackTable: 'run_results', feedbackId }` or `null`. |
| `tutorRubricFromReviews(messages)` | `{ key, label }[]` of the earliest assistant `mode:'review'` message whose record is `surface:'tutor'`; `[]` otherwise (quiz reviews skipped). |
| `mergeReviewQuestions(criteria, questions)` | Only non-`met` criteria with a non-empty question are replaced; `met` stays `null`; missing/unknown keys keep the fallback. |

### `studio/src/components/revision/review-request.js` (new)

| Export | Contract |
| --- | --- |
| `requestReviewJson({ provider, system, messages, signal, validate })` | `extractJson` + `validate`; one repair turn carrying the rejection text; second failure → `providerError('bad_json', <second attempt's own message>)`. Never calls the shared JSON helper, never passes a locale option, never makes a third call. |

## Retry-budget proof

- `'{}'` reply with `validate: () => 'bad shape'` → `streamText` called **2** times, rejected with `ProviderError{ code: 'bad_json', message: 'bad shape' }` (message is the validator's own text).
- `'not json'` reply with `validate: () => true` → `streamText` called **2** times, `code: 'bad_json'`, message contains `Could not find valid JSON` (from `extractJson`, not a generic rewrite).
- A valid first reply → `streamText` called **1** time and the parsed value returned.
- The repair call's last message contains the validator rejection text (`bad shape`).
- `grep -rn "generateJson" studio/src/components/revision/` → no matches, so no nested retry path exists.

## Rubric-drift rejection message

`validateTutorReview({ criteria: [c1, c3] }, { rubric: [c1, c2] })` → `criteria keys must be exactly: c1,c2`; a missing key yields the same message; the exact key set (including reversed order) returns `true`, and `normalizeTutorReview` then restores rubric order and rubric labels.

## Deliberately red source-order tests (unchanged by this plan)

`studio/test/revision-wiring.test.js` still contains its `revision wiring — source order` block, untouched:

| Test | Turns green in |
| --- | --- |
| `QuizPanel declares the revise action before the New quiz affordance` (`<ReviewFeedback`) | 08-05 |
| `TutorPanel declares the revise action before the capstone notice` (`<ReviewMessage`, `onRevise=`) | 08-05 |
| `CodeWorkspace declares the revise action before the history affordance` (`const onRevise =`, `onRevise={onRevise}`) | 08-06 |
| `CodeWorkspace checks the local-run acknowledgement gate before the run starts` (`shouldBlockLocalRun({`) | 08-06 |

Unfiltered run today: **4 failed | 5 passed (9)** — exactly the four above fail, and `-t "Intent"` selects the five that must pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: quiz/workspace review schema + enrichment builders** — `5fd6757` (feat)
2. **Task 2: pure history/criteria/delta/intents layer** — `3a3cd90` (feat)
3. **Task 3: tutor review schema + one-repair request** — `b4b5f78` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `studio/src/lib/prompts/practice.js` — +208 lines: `REVIEW_STATUSES`, criterion/output schema, `validateReview`, `REVIEW_RULES`, `REVIEW_QUESTION_SHAPE`, both review builders, `validateReviewQuestions`.
- `studio/src/lib/prompts/tutor.js` — +172 lines: `TUTOR_REVIEW_RULES`, `TUTOR_REVIEW_SHAPE`, `tutorReviewSchema`, `validateTutorReview`, `normalizeTutorReview`, `buildTutorReviewMessages`.
- `studio/src/components/revision/history.js` — 373 lines / 20 exports, pure.
- `studio/src/components/revision/review-request.js` — 76 lines, one export.

## Decisions Made

- **`validateReviewQuestions` accepts a bare key array as well as `{ keys }`.** The Wave-0 contract calls it positionally (`validateReviewQuestions(entries, ['q1'])`) while the plan documented an options object; supporting both keeps the contract authoritative without weakening the validator.
- **`normalizeTutorReview` returns the criteria array.** 08-01 froze this shape and both tutor tests consume it with `.map`, so the array wins over the plan's prose `{ criteria }`.
- **Rubric comparison is order-insensitive for the tutor and sequence-exact for practice.** The tutor test requires a reversed reply to validate (the reply is normalised into rubric order anyway); the practice contract only exercises drift, and the plan explicitly asked for a sequence check there.
- **Fence detection avoids literal backticks in source** via `new RegExp(String.fromCharCode(96) + '{3}')`, so the module that forbids fences does not itself contain one.

## Deviations from Plan

None - plan executed exactly as written; the only shape adjustments (bare-array key list, tutor criteria array) are the ones the Wave-0 contracts already demanded.

No auto-fixes, no auth gates, no architectural changes. `studio/test/revision-wiring.test.js` needed no edit, so it was left byte-identical.

## Issues Encountered

- **`-t "Intent"` also filters other files.** Running `test/revision-history.test.js test/revision-wiring.test.js -t "Intent"` in one command skips the entire history suite (no history test title contains "Intent"), so the two files were verified separately: 16/16 history tests and 5 intent/link tests.
- **Line-length housekeeping.** New code was wrapped to the AGENTS.md 100-column limit; the pre-existing long lines in `practice.js` (e.g. `buildFlashcardsMessages`' signature) were left untouched as out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 03/04 can consume `parseReviewRecord`/`criteriaDelta`/`buildQuizReview`/`workspaceCriteria` directly; they are pure and DOM-free.
- Plan 05/06 wire the surfaces: `quizRevisionIntent`/`tutorRevisionIntent`/`workspaceRevisionIntent` already produce the exact `revisionOf` shape the repo turns into a `link_kind: 'explicit'` row (proven by the two integration cases).
- Review flows should call `requestReviewJson` with `validateTutorReview` (tutor) or `validateReview` (quiz/workspace enrichment) — never the shared JSON helper, to keep the two-call budget.

## Verification Evidence

1. `npx vitest run --project studio test/prompts-practice-review.test.js` → **Test Files 1 passed (1), Tests 10 passed (10)** — PASS
2. `npx vitest run --project studio test/practice-prompt.test.js` → **Test Files 1 passed (1), Tests 11 passed (11)** — PASS
3. `npx vitest run --project studio test/revision-history.test.js` → **Test Files 1 passed (1), Tests 16 passed (16)** — PASS
4. `npx vitest run --project studio test/revision-wiring.test.js -t "Intent"` → **Test Files 1 passed (1), Tests 5 passed | 4 skipped (9)** — PASS
5. `npx vitest run --project studio test/prompts-tutor-review.test.js` → **Test Files 1 passed (1), Tests 10 passed (10)** — PASS
6. `npx vitest run --project studio test/tutor.test.js` → **Test Files 1 passed (1), Tests 38 passed (38)** — PASS
7. `npx vitest run --project studio test/no-sync-getprovider.test.js` → **Test Files 1 passed (1), Tests 3 passed (3)** — PASS
8. Full contract run `test/prompts-practice-review.test.js test/prompts-tutor-review.test.js test/revision-history.test.js` → **Test Files 3 passed (3), Tests 36 passed (36)** — PASS
9. Regression `test/practice-prompt.test.js test/tutor.test.js test/tutor-panel.render.test.js test/no-sync-getprovider.test.js test/ai.test.js` → **Test Files 5 passed (5), Tests 76 passed (76)** — PASS
10. `npx vitest run --project studio test/revision-wiring.test.js` (unfiltered) → **Tests 4 failed | 5 passed (9)** — expected: only the four source-order markers fail.
11. `grep -rn "generateJson" studio/src/components/revision/` → no output; `grep -rn "REVIEW_STATUSES =" studio/src` → exactly one line (`practice.js:291`).
12. Diff scope `git diff --stat` across the three commits → exactly 4 files, 829 insertions, 0 deletions; no test file, package.json, lockfile, migration, `DB_VERSION`, `settings.js` or planning file touched.

## Self-Check

- Files exist: `studio/src/components/revision/history.js` (373 lines, 20 `^export` lines), `studio/src/components/revision/review-request.js` (76 lines) — FOUND.
- Commits reachable on `gsd/phase-08-revision-loop`: `5fd6757`, `3a3cd90`, `b4b5f78` — FOUND.
- No `.planning/STATE.md`, `.planning/ROADMAP.md` or `.planning/REQUIREMENTS.md` edit (orchestrator owns them) — CONFIRMED (`git status` clean apart from this SUMMARY).

## Self-Check: PASSED
