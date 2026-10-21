---
phase: 05-beta-data-foundation
plan: 02
subsystem: instrumentation
tags: [events, privacy, beta, repository, activation, instrumentation]

# Dependency graph
requires:
  - phase: 05-01
    provides: learning_events, revision_links and beta_profile tables plus the shared TABLES registry
provides:
  - frozen six-kind EVENT_KINDS vocabulary and one legal surface per kind
  - one learning_events row per meaningful quiz, recall, tutor review, workspace run, exercise and capstone checkpoint
  - beta_profile activation-once semantics plus getBetaProfile/listEvents read API
  - meta whitelist, enum-only strings, 512-character cap and sentinel-proof privacy invariant
affects: [05-03, 05-04, 05-05, 07, 08, 09, 10]

actuals:
  tokens: 7208
  tasks: 3
  commits: 3
  plan_head_before: 884dbb4
  plan_head_after: ddc571c

tech-stack:
  added: []
  patterns:
    - "Emission lives in repo/index.js write functions only; pages and components never emit"
    - "Pure events.js owns the enum, surface map, meta whitelist and row builder"
    - "Run kind is chosen by the inner checks array length, never by the outer checks object"
    - "Events activate beta_profile exactly once and never carry learner content"

key-files:
  created:
    - studio/src/lib/repo/events.js
    - studio/test/beta-events.test.js
    - studio/test/beta-privacy.test.js
  modified:
    - studio/src/lib/repo/index.js

key-decisions:
  - "Meta is validated before the learning_events put, so a rejected event leaves no row and no activation."
  - "saveQuizAttempt accepts revisionOf but deliberately stores no link yet; 05-03 owns revision linking."
  - "Workspace and exercise meta select explicit keys per kind so exit_code can never appear on exercise_completed."
  - "Answer and run events also carry resolved course_id/lesson_id; non-meaningful writes carry no event."

patterns-established:
  - "Adapter parity by indexed-only filters: listEvents forwards unknown filter keys so the adapter rejects non-indexed fields"
  - "Privacy gate is a pure whitelist plus a sentinel test over rows and the learning_events backup slice"

requirements-completed: [INSTR-01, INSTR-02]

coverage:
  - id: D1
    description: "Every meaningful action writes exactly one learning_events row with kind, surface, refs and local day; non-meaningful paths write none."
    requirement: INSTR-01
    verification:
      - kind: unit
        ref: "studio/test/beta-events.test.js#writes exactly one quiz_completed event for a quiz attempt"
        status: pass
      - kind: unit
        ref: "studio/test/beta-events.test.js#emits one recall_completed per graded card"
        status: pass
      - kind: unit
        ref: "studio/test/beta-events.test.js#discriminates workspace_run from exercise_completed by the inner checks array"
        status: pass
      - kind: unit
        ref: "studio/test/beta-events.test.js#emits one capstone_checkpoint per created submission and none on an externalId repeat"
        status: pass
      - kind: unit
        ref: "studio/test/beta-events.test.js#keeps lesson-done, notes, reflections, workspace files, activity and importAll event-free"
        status: pass
    human_judgment: false
  - id: D2
    description: "first meaningful event sets beta_profile.activated_at/activated_day once; getBetaProfile creates an inactive singleton."
    requirement: INSTR-01
    verification:
      - kind: unit
        ref: "studio/test/beta-events.test.js#activates the profile on the first meaningful event and never rewrites it"
        status: pass
      - kind: unit
        ref: "studio/test/beta-events.test.js#getBetaProfile creates one inactive profile with a UUID participant id"
        status: pass
    human_judgment: false
  - id: D3
    description: "Event rows and their backup slice never contain course text, lesson content, prompts, code, answers or API keys; meta rejects free strings, arrays, unknown keys and over-cap payloads before write."
    requirement: INSTR-02
    verification:
      - kind: unit
        ref: "studio/test/beta-privacy.test.js#never stores course, lesson, prompt, code, answer or key content in events"
        status: pass
      - kind: unit
        ref: "studio/test/beta-privacy.test.js#rejects free strings, arrays, unknown keys and over-512 meta without writing a row"
        status: pass
      - kind: unit
        ref: "studio/test/beta-privacy.test.js#rejects a non-indexed event filter through the adapter parity guard"
        status: pass
    human_judgment: false

duration: 3 min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 02: Beta Data Foundation Summary

**Repository-layer instrumentation with six meaningful event kinds, activation-once beta profile handling, and a content-free event store proven by a sentinel privacy test.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-10-21T16:48:36Z
- **Completed:** 2026-10-21T16:51:24Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `events.js` freezes the six-kind vocabulary, the surface map and a pure row builder; the only import is `dayKey`, so the module has no adapter or repo dependency.
- `repo/index.js` records exactly one event after each successful create: quiz attempt, card grade, user `check_answer`/`review` message, workspace run or exercise, and capstone submission.
- `saveRunResult` classifies by the inner checks array, so `{ checks: [], snapshot }` emits `workspace_run` and a non-empty inner array emits `exercise_completed`, never both.
- `beta_profile` is created inactive by `getBetaProfile()` and activated once by the first meaningful event; a second event never rewrites `activated_at` or `activated_day`.
- Meta is key- and type-whitelisted per kind, arrays and free strings are rejected, serialized meta is capped at 512 characters, and validation runs before the event put.
- The sentinel test seeds course title/description, lesson content, tutor prompt/answer, quiz answer, run code and an `sk-live-…` key, then proves none appear in `listEvents()` or the `learning_events` backup slice.

## Task Commits

Each task was committed atomically:

1. **Task 1: Quiz event tracer + beta profile** — `8f43025` (feat)
2. **Task 2: Remaining emission points + matrix** — `3556c9e` (feat)
3. **Task 3: Privacy invariant + sentinel test** — `ddc571c` (feat)

**Plan metadata:** pending docs commit (this SUMMARY)

## Files Created/Modified

- `studio/src/lib/repo/events.js` — frozen enum/surface/builder, checks discriminator, meta whitelist and 512-char gate
- `studio/src/lib/repo/index.js` — `recordEvent`, `getBetaProfile`, `listEvents`, activation-once profile write and the five emission hooks
- `studio/test/beta-events.test.js` — tracer, activation and full emission/no-emission matrix
- `studio/test/beta-privacy.test.js` — sentinel privacy proof, meta rejection matrix and non-indexed filter guard

## Decisions Made

- Validated meta before the `learning_events` write inside `recordEvent`; `buildEventRow` also validates so a direct caller cannot bypass the gate.
- `saveQuizAttempt` accepts `revisionOf` in its options object but performs no linking, leaving 05-03 free to add it without changing callers.
- Workspace/exercise meta is built key-by-key per kind rather than spread, which makes `exit_code` unreachable on `exercise_completed` and `checks_passed` unreachable on `workspace_run`.
- Non-meaningful paths (`updateLesson` done, notes, reflections, workspace file saves, activity, `importAll`) were left untouched and are asserted event-free.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 05-03 can add `revision_links` writes inside the same write functions using the already-accepted `revisionOf` parameter.
- 05-04 can build metrics from `listEvents()` rows and the singleton `beta_profile` row.
- 05-05 can extend the adapter contract; all emission lives in the shared repo, so memory, IndexedDB and SQLite get identical events.
- Studio suite: 45 files / 387 tests passing; root suite: 14 files / 297 tests passing.

---
*Phase: 05-beta-data-foundation*
*Completed: 2026-10-22*

## Self-Check: PASSED

- Created/modified files present: `events.js`, `repo/index.js`, `beta-events.test.js`, `beta-privacy.test.js`
- Task commits exist: `8f43025`, `3556c9e`, `ddc571c`
- Measured commits: 3 (plan head `884dbb4` → `ddc571c`)
