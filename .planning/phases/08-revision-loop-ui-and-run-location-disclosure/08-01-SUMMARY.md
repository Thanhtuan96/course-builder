---
phase: 08-revision-loop-ui-and-run-location-disclosure
plan: 01
subsystem: ui
tags: [i18n, vitest, ssr, zod, revision-loop, runner-disclosure]

# Dependency graph
requires:
  - phase: 05-beta-data-foundation
    provides: revisionOf / revision_links / learning_events repo contract the contracts encode
  - phase: 06-studio-beta-debt
    provides: per-namespace i18n loader (import.meta.glob auto-merge) and the studio Vitest project
provides:
  - revision namespace (en + vi, 31 keys) for review, revise, criteria and attempt history copy
  - runnerNotice namespace (en + vi, 8 keys) with the exact "Code runs on your machine" disclosure
  - nine collected-but-failing studio test files that are the executable contract for plans 02-06
affects: [08-02, 08-03, 08-04, 08-05, 08-06]

actuals:
  tokens: 16825
  tasks: 4
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Wave-0 red contracts: every new test file is written and collected before production code exists"
    - "i18n namespaces added as new files only (en+vi pair), never by editing an existing catalog"
    - "SSR component contract via createElement + react-dom/server; no DOM, no localStorage, no network"

key-files:
  created:
    - studio/src/lib/i18n/en/revision.json
    - studio/src/lib/i18n/vi/revision.json
    - studio/src/lib/i18n/en/runnerNotice.json
    - studio/src/lib/i18n/vi/runnerNotice.json
    - studio/test/revision-history.test.js
    - studio/test/revision-wiring.test.js
    - studio/test/revision-best-effort.test.js
    - studio/test/prompts-practice-review.test.js
    - studio/test/prompts-tutor-review.test.js
    - studio/test/revision-review.test.js
    - studio/test/revision-attempt-history.test.js
    - studio/test/revision-runner-notice.test.js
    - studio/test/revision-surfaces.test.js
  modified: []

key-decisions:
  - "criteriaDelta returns { from, to, total, changes } where changes carries every union key with kind added|improved|worsened|removed|unchanged"
  - "normalizeTutorReview(parsed, { rubric }) returns a criteria array: c1..cN in model order without a rubric, rubric order and rubric labels with one"
  - "ReviewFeedback/ReviseButton/Hint copy is asserted through the new revision namespace, so a missing key fails the test loudly"

patterns-established:
  - "A Wave-0 plan ships catalogs + failing contracts only: no production module under components/revision/** is created here"
  - "Source-order wiring assertions target a real marker ('<ReviewFeedback', 'const onRevise =', 'shouldBlockLocalRun({') rather than a bare identifier that would also match an import"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03, LOOP-04]

coverage:
  - id: D1
    description: "revision i18n namespace exists in English and Vietnamese with an identical 31-key tree"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/i18n-catalogs.test.js + studio/test/i18n-keys.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "runnerNotice namespace carries the exact 'Code runs on your machine' disclosure and Browser/Local machine badges with no sandbox wording"
    requirement: "LOOP-04"
    verification:
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#no runnerNotice catalog value says sandbox"
        status: unknown
        rationale: "the assertion is written and collected, but the file is red at Wave 0 by design"
    human_judgment: true
    rationale: "Wave-0 catalogs are proven today only by the parity suite; the disclosure copy itself is asserted by a contract that plan 06 turns green, so the phase verify step owns the final check"
  - id: D3
    description: "nine failing studio test files exist, are collected by --project studio, and encode the review/rubric/history/ack contracts"
    requirement: "LOOP-01, LOOP-02, LOOP-03, LOOP-04"
    verification:
      - kind: unit
        ref: "npx vitest run --project studio test/revision- test/prompts-practice-review.test.js test/prompts-tutor-review.test.js (9 files collected, 9 failed by design)"
        status: unknown
    human_judgment: true
    rationale: "red-by-design contracts cannot be 'passing' at authoring time; plans 02-06 turn them green and the phase gate re-runs them"

duration: 5 min
completed: 2026-10-24
status: complete
---

# Phase 8 Plan 1: Wave-0 i18n namespaces and failing test contracts Summary

**Two new i18n namespaces (31 revision + 8 runnerNotice keys, en/vi) plus nine collected failing studio contracts that freeze the review schema, rubric keys, criteria delta, revise intents, D-16 best-effort emission, runner acknowledgement and surface wiring before any production code exists.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-24T15:31:15Z
- **Completed:** 2026-10-24T15:36:48Z
- **Tasks:** 4
- **Files modified:** 13 created (4 catalogs + 9 test files); 0 existing files modified

## Accomplishments

- Added `studio/src/lib/i18n/{en,vi}/revision.json` — 31 identical keys per language (status 3, review 7, revise 1, quiz 3, tutor 4, workspace 3, history 10), including the exact `history.summary` = `{from} → {to} of {total} met`.
- Added `studio/src/lib/i18n/{en,vi}/runnerNotice.json` — 8 identical keys per language (badge 2, notice 6), `notice.title` character-for-character `Code runs on your machine`, badges `Browser` / `Local machine`, and no value matching /sandbox/i, /isolated/i or /\bsafe\b/i.
- Landed the complete Wave-0 contract set: review record parse/build, `q1..qN` and slugged-check criteria with `checkN` fallback and collision suffixes, `criteriaDelta`, passing predicates, one-shot intents, tutor rubric reuse, one-repair call budget, acknowledgement scoping, `shouldBlockLocalRun`, the `/sandbox/i` copy scan, and four per-surface source-order markers.
- Every new test file is collected by `--project studio` (9/9 files collected) and fails for the documented reason; the pre-existing studio suite is untouched and green.

## Task Commits

Each task was committed atomically:

1. **Task 1: revision + runnerNotice i18n namespaces** — `35fe604` (feat)
2. **Task 2: unit contracts (history, wiring, best-effort)** — `f4eaacc` (test)
3. **Task 3: prompt contracts (practice, tutor)** — `65c1bb3` (test)
4. **Task 4: SSR contracts (review, history, runner notice, surfaces)** — `ca92899` (test)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `studio/src/lib/i18n/en/revision.json` — English review/revise/criteria/history copy (31 keys)
- `studio/src/lib/i18n/vi/revision.json` — Vietnamese mirror (31 keys)
- `studio/src/lib/i18n/en/runnerNotice.json` — Browser/Local machine badges + machine notice (8 keys)
- `studio/src/lib/i18n/vi/runnerNotice.json` — Vietnamese mirror (8 keys)
- `studio/test/revision-history.test.js` — 16 tests: parse/build, quiz + workspace criteria, delta, predicates, intents, rubric
- `studio/test/revision-wiring.test.js` — 9 tests: three intents, two repo-link integrations, four source-order markers
- `studio/test/revision-best-effort.test.js` — 7 tests: toggleable failing adapter over events/links per surface
- `studio/test/prompts-practice-review.test.js` — 10 tests: strict schema, rubric validation, wrapped learner data, no-code regression
- `studio/test/prompts-tutor-review.test.js` — 10 tests: tutor schema, rubric reuse/drift, 2-call repair budget, no-code record
- `studio/test/revision-review.test.js` — 8 tests: criteria rows/chips, one question per unmet, primary CTA, malformed fallback
- `studio/test/revision-attempt-history.test.js` — 6 tests: summary, transitions, collapsible count, empty state, no diff
- `studio/test/revision-runner-notice.test.js` — 13 tests: ack key/scope/storage, `shouldBlockLocalRun`, badge/notice SSR, no-sandbox scan
- `studio/test/revision-surfaces.test.js` — 4 tests: QuizPanel question screen, TutorPanel review chip, capstone exclusion, CodeWorkspace shell

## Decisions Made

- **`criteriaDelta` shape frozen** as `{ from, to, total, changes }`, where `changes` covers every key in the union (next order first, removed keys appended) with `kind` in `added | improved | worsened | removed | unchanged`. Including `unchanged` honours D-10's "which criteria changed" question while letting `AttemptHistory` filter it out.
- **`normalizeTutorReview(parsed, { rubric })` returns a criteria array.** Without a rubric it reassigns `c1..cN` in model order; with a rubric it preserves rubric order and the persisted rubric labels, which is what makes drift rejection and label stability testable.
- **Assertions target catalog copy, not raw keys.** Every SSR assertion reads the English catalog through `useT`, so a missing key (raw dotted key rendered) fails loudly instead of passing silently.
- **Source-order markers are call-site shaped** (`'<ReviewFeedback'`, `'<ReviewMessage'`, `'const onRevise ='`, `'onRevise={onRevise}'`, `'shouldBlockLocalRun({'`) so an import line can never satisfy them.

## Deviations from Plan

None - plan executed exactly as written. No production file outside the four catalogs was touched; no existing catalog, `i18n/index.js`, `package.json`, lockfile, migration or `DB_VERSION` changed.

## Issues Encountered

- **Red-signature wording differs slightly for `prompts-practice-review.test.js`.** The plan predicted both prompt files would fail on "Failed to resolve import" / "does not provide an export named". In practice the tutor file fails on the missing `review-request.js` module (as predicted), while the practice file loads `practice.js` and fails *assertions* because the named exports do not exist yet (`REVIEW_STATUSES` is `undefined`). Same root cause, same expected file-level result (2 failed files, 0 passed); no action taken.
- **`grep -c "it("` over-counts by one in three files** because `source.split(` / `text.split(` contain the substring `it(`. Real counts are 9 (wiring), 8 (review) and 6 (attempt history) — all above their minimums (16/10/7/8/6/13/4/10/10 `it` blocks across the nine files).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can implement `components/revision/history.js`, `review-request.js`, the review schema exports and the three revision intents directly against the green-able half of this contract (`-t "Intent"` selects the five wiring tests that must turn green).
- The two new namespaces are already merged by the eager glob, so plans 04-06 can use literal `t('revision.*')` / `t('runnerNotice.*')` keys with no catalog conflict.
- The studio suite is red by design (9 files). Do not run `npm test` as a gate until plan 06 lands; the plan-level gates used here (catalogs parity + the two pre-existing-suite runs) are green.

## Self-Check

Verification evidence from the plan's own commands:

1. `npx vitest run --project studio test/i18n-catalogs.test.js test/i18n-keys.test.js` → **Test Files 2 passed (2), Tests 7 passed (7)** — PASS
2. `npx vitest run --project studio test/revision-history.test.js test/revision-wiring.test.js test/revision-best-effort.test.js` → **Test Files 3 failed (3)**, Tests 6 failed | 1 passed — PASS (expected red; both module files on "Cannot find module", best-effort on assertions)
3. `npx vitest run --project studio test/prompts-practice-review.test.js test/prompts-tutor-review.test.js` → **Test Files 2 failed (2)**, Tests 10 failed (10) — PASS (expected red; missing module/export)
4. `npx vitest run --project studio test/revision-review.test.js test/revision-attempt-history.test.js test/revision-runner-notice.test.js test/revision-surfaces.test.js` → **Test Files 4 failed (4)**, Tests 1 failed | 3 passed — PASS (expected red; 3 missing-component suites + TutorPanel "Review my attempt")
5. `npx vitest run --project studio test/tutor-panel.render.test.js test/practice-prompt.test.js test/tutor.test.js test/beta-privacy.test.js test/i18n-catalogs.test.js test/i18n-keys.test.js` → **Test Files 6 passed (6), Tests 62 passed (62)** — PASS
6. `npx vitest run --project studio test/tutor-panel.render.test.js test/practice-prompt.test.js test/tutor.test.js test/beta-privacy.test.js test/runner-selection.test.js test/no-sync-getprovider.test.js` → **Test Files 6 passed (6), Tests 63 passed (63)** — PASS
7. Quick-run collection probe `npx vitest run --project studio test/revision- test/prompts-practice-review.test.js test/prompts-tutor-review.test.js` → **Test Files 9 failed (9)** (9/9 collected, 0 silently skipped) — PASS
8. Files: all 4 catalogs and all 9 test files exist on disk; `studio/test/*.test.jsx` → none. `git status --porcelain` clean after the four task commits.
9. Diff scope: `git diff --stat HEAD~4..HEAD` → exactly 13 files, 1669 insertions, 0 deletions; no `package.json`, lockfile, migration, `settings.js`, `i18n/index.js`, `DB_VERSION` or planning file touched.
10. Commit presence: `35fe604`, `f4eaacc`, `65c1bb3`, `ca92899` all reachable on `gsd/phase-08-revision-loop`.

## Self-Check: PASSED
