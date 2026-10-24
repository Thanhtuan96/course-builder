---
phase: 08-revision-loop-ui-and-run-location-disclosure
plan: 03
subsystem: data
tags: [repo, events, revision-links, best-effort, d-16, d-17, vitest]

# Dependency graph
requires:
  - phase: 05-beta-data-foundation
    provides: recordEvent / ensureBetaProfile / buildRevisionLink / revision_links write path the four mutations already used
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 01
    provides: studio/test/revision-best-effort.test.js Wave-0 contract (toggleable failing adapter + seeded link cases)
provides:
  - bestEffort(label, run) module-private helper with a DEV-only console.warn and no retry
  - safeRecordEvent / safeMaybeLinkRevision call-site wrappers
  - all eight post-write emission/link call sites on the four D-16 write paths routed through them
  - nine-test repository proof that a metrics/link failure never rejects a learning action
affects: [08-04, 08-05, 08-06]

actuals:
  tokens: 1572
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Post-write side effects are best-effort: the primary adapter.put lands first, then emission/link failures are swallowed once with a labelled DEV warn"
    - "Named call-site wrappers (safeRecordEvent / safeMaybeLinkRevision) make every tolerant emission greppable instead of hiding a try/catch inside the validator"
    - "Failing-adapter proofs are armed only after seeding, and link cases resolve their feedback row first so the failure is genuinely exercised"

key-files:
  created: []
  modified:
    - studio/src/lib/repo/index.js
    - studio/test/revision-best-effort.test.js

key-decisions:
  - "bestEffort swallows and returns null (never rethrows, never retries) so a broken metrics write can never surface as a failed quiz/tutor/run/capstone action"
  - "Validation stays inside recordEvent/maybeLinkRevision untouched — only the call sites are tolerant, which keeps beta-privacy's loud rejection green"
  - "gradeCard's recall_completed emission is deliberately left raw: D-16 covers the four revision-loop write paths only, and beta-events keeps depending on that emission throwing"

patterns-established:
  - "Grep-able best-effort emission: 'await (recordEvent|maybeLinkRevision)(' must match exactly one line in repo/index.js — the intentionally-unwrapped recall emission"

requirements-completed: [LOOP-01]

coverage:
  - id: D1
    description: "A failing learning_events or revision_links write no longer rejects saveQuizAttempt, appendChat, saveRunResult or createCapstoneSubmission, and the primary row is still readable"
    requirement: "LOOP-01"
    verification:
      - kind: unit
        ref: "studio/test/revision-best-effort.test.js (8 failing-adapter cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Direct repo.recordEvent calls still throw on invalid meta and write nothing"
    requirement: "LOOP-01"
    verification:
      - kind: unit
        ref: "studio/test/revision-best-effort.test.js#recordEvent still rejects invalid meta loudly + studio/test/beta-privacy.test.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "The capstone explicit-link row shape is unchanged by the wrapper"
    requirement: "LOOP-01"
    verification:
      - kind: unit
        ref: "npx vitest run --project root test/studio-capstone-migration.test.js"
        status: pass
    human_judgment: false

duration: 6 min
completed: 2026-10-24
status: complete
---

# Phase 8 Plan 3: Best-effort event emission and revision linking Summary

**A metrics or revision-link write can no longer fail a learner's quiz attempt, tutor message, workspace run or capstone submission — eight post-write call sites now go through a greppable `bestEffort` wrapper while `recordEvent`'s validation still throws loudly.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-24T00:45:00Z (approx.)
- **Completed:** 2026-10-24T00:51:00Z
- **Tasks:** 2
- **Files modified:** 2 (`studio/src/lib/repo/index.js` +44/-8; `studio/test/revision-best-effort.test.js` +26)

## Accomplishments

- Added `bestEffort(label, run)` (11 lines, module-private, no retry, `null` on failure) plus the two named call-site wrappers `safeRecordEvent(label, input)` and `safeMaybeLinkRevision(label, input)`.
- Wrapped **all eight** D-16 call sites: four `recordEvent` emissions and four `maybeLinkRevision` links across `saveQuizAttempt`, `appendChat`, `saveRunResult` and `createCapstoneSubmission`. Argument objects were moved verbatim — no key, meta or surface change.
- Left every primary `adapter.put`, the returned row/`decodeCapstoneSubmission(row)`, `emit(...)`, `stampCreate` output, the `appendChat` user-mode guard and the idempotent `externalId` early return exactly as they were (D-17).
- Closed the Wave-0 contract: `revision-best-effort.test.js` now has one `it` per write path per failure table (4 `learning_events` + 4 seeded `revision_links`) plus the loud-validation regression — 9 tests, all green.

## The helper (verbatim)

```js
async function bestEffort(label, run) {
  try {
    return await run();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[repo] ' + label + ' failed', err);
    return null;
  }
}

function safeRecordEvent(label, input) {
  return bestEffort(label, () => recordEvent(input));
}

function safeMaybeLinkRevision(label, input) {
  return bestEffort(label, () => maybeLinkRevision(input));
}
```

`import.meta.env?.DEV` is optional-chained because this module is imported by both the Vite build and Vitest's node environment.

## The eight wrapped call sites

| # | Function | Call | Label |
|---|----------|------|-------|
| 1 | `saveQuizAttempt` | `safeRecordEvent` | `'quiz_completed event'` |
| 2 | `saveQuizAttempt` | `safeMaybeLinkRevision` | `'quiz revision link'` |
| 3 | `appendChat` | `safeRecordEvent` | `'answer_sent_for_review event'` |
| 4 | `appendChat` | `safeMaybeLinkRevision` | `'tutor revision link'` |
| 5 | `saveRunResult` | `safeRecordEvent` | `'workspace run event'` |
| 6 | `saveRunResult` | `safeMaybeLinkRevision` | `'workspace revision link'` |
| 7 | `createCapstoneSubmission` | `safeRecordEvent` | `'capstone checkpoint event'` |
| 8 | `createCapstoneSubmission` | `safeMaybeLinkRevision` | `'capstone revision link'` |

Untouched (deliberately): `gradeCard`'s `await recordEvent({ kind: 'recall_completed', … })` — the only remaining raw emission in the file.

## Failing-adapter proofs (8 cases + 1 loud-validation case)

`failingAdapter()` keeps one memory adapter, seeds through it while healthy, then arms exactly one table:

| Table armed | Write path | Asserted |
|-------------|-----------|----------|
| `learning_events` | `saveQuizAttempt` | resolves, `row.id` truthy, `listQuizAttempts` length 1 |
| `learning_events` | `appendChat` | resolves, `row.id` truthy, `listChat` length 1 |
| `learning_events` | `saveRunResult` | resolves, `row.id` truthy, `listRunResults` length 1 |
| `learning_events` | `createCapstoneSubmission` | resolves, `attempt === 1`, `listCapstoneSubmissions` length 1 |
| `revision_links` | `saveQuizAttempt` (seeded assistant review chat row) | resolves, attempt readable, `listRevisionLinks({revisedId})` length 0 |
| `revision_links` | `appendChat` (seeded assistant review chat row) | resolves, `listChat` length 2, no link row |
| `revision_links` | `saveRunResult` (seeded prior run row) | resolves, `listRunResults` length 2, `listRevisionLinks({revisedId})` length 0 |
| `revision_links` | `createCapstoneSubmission` (seeded prior submission) | resolves, `attempt === 2`, 2 submissions, `listRevisionLinks({revisedId})` length 0 |
| — (healed) | `repo.recordEvent` with `meta:{ note:'nope' }` | **rejects** and `listEvents()` stays empty |

Every link case seeds a resolvable feedback row before arming, so `maybeLinkRevision` reaches `adapter.put('revision_links', …)` and the swallow is genuinely exercised (an unresolvable id returns earlier and would let the test pass without the wrapper).

**Non-vacuity check:** temporarily replacing the wrapper's `return null` with `throw err` made exactly those 8 cases fail (`Tests 8 failed | 1 passed (9)`) and the file was restored byte-for-byte afterwards — so no case passes merely because the failure never happened.

## Verification

| Command | Result |
|---------|--------|
| `npx vitest run --project studio test/revision-best-effort.test.js -t "quiz attempt"` | 2 passed \| 5 skipped (task 1) |
| `npx vitest run --project studio test/revision-best-effort.test.js -t "chat message"` | 2 passed \| 5 skipped (task 1) |
| `npx vitest run --project studio test/beta-privacy.test.js test/beta-revisions.test.js test/repo.test.js` | 3 files, 50 passed (task 1) |
| `npx vitest run --project studio test/revision-best-effort.test.js` | 1 file, **9 passed** |
| `npx vitest run --project studio test/beta-privacy.test.js test/beta-revisions.test.js` | 2 files, 29 passed |
| `npx vitest run --project root test/studio-capstone-migration.test.js` | 1 file, 7 passed |
| `npx vitest run --project studio test/repo.test.js test/beta-privacy.test.js test/beta-revisions.test.js test/beta-events.test.js test/adapter-contract.test.js` | 5 files, **94 passed** |
| `grep -c "safeRecordEvent(\|safeMaybeLinkRevision(" studio/src/lib/repo/index.js` | **10** (2 definitions + 8 call sites) |
| `grep -nE "await (recordEvent\|maybeLinkRevision)\(" studio/src/lib/repo/index.js` | exactly one line: `655:  await recordEvent({` (`gradeCard` `recall_completed`) |
| `grep -n "console\." studio/src/lib/repo/index.js` | one line: the DEV-guarded `console.warn` |

## Files Modified

- `studio/src/lib/repo/index.js` — `bestEffort` + the two named wrappers, and the eight call-site swaps (the only diff; no `recordEvent`/`maybeLinkRevision`/`buildRevisionLink`/`validateMeta` internals touched).
- `studio/test/revision-best-effort.test.js` — added the `learning_events` proof for `saveRunResult` and `createCapstoneSubmission`, and the no-link-row assertion for the capstone link case.

## Decisions Made

- **Swallow once, return `null`.** No retry and no rethrow: the emit/link result is never read by a caller, so returning `null` keeps the contract honest without inventing a partial-success shape.
- **Wrappers live at the call sites, not inside `recordEvent`.** That is what keeps `beta-privacy.test.js`'s "rejects invalid meta and writes nothing" behavior byte-identical while the post-write plumbing stays tolerant.
- **`gradeCard` stays raw.** It is outside D-16's four revision-loop write paths, and `beta-events` relies on the recall emission throwing through its own path.

## Deviations from Plan

None - plan executed exactly as written. No `package.json`, lockfile, migration, `DB_VERSION`, `settings.js`, catalog or other product/test file was touched; no schema, event kind, meta whitelist, `emit` behaviour or returned value changed.

## Issues Encountered

- **`recordEvent` also writes `beta_profile`** via `ensureBetaProfile`. Because the wrapper catches at the call site, a `beta_profile` write failure in that same chain is swallowed too — same intent (the primary row is already committed), no code change needed.
- **The `learning_events` cases cannot assert "no event row"** the way the loud-validation case does, because the failing table *is* the events table; the assertion is that the primary row survives and the promise resolved, which is the D-16 truth.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LOOP-01's explicit revision link can now be written from any of the four surfaces without risking the learner's action; plans 04-06 can wire UI to `saveQuizAttempt`/`appendChat`/`saveRunResult` revision calls without defensive try/catch of their own.
- Anyone adding a fifth meaningful write path should use `safeRecordEvent` / `safeMaybeLinkRevision`; the emission grep (`exactly one raw line`) stays a cheap regression guard.

## Self-Check

Command output, verbatim from this session:

1. `git branch --show-current` → `gsd/phase-08-revision-loop` — PASS (no branch switch, create, rebase, merge or push).
2. `grep -c "safeRecordEvent(\|safeMaybeLinkRevision(" studio/src/lib/repo/index.js` → `10` — PASS (2 definitions + 8 wrapped call sites).
3. `grep -nE "await (recordEvent|maybeLinkRevision)\(" studio/src/lib/repo/index.js` → `655:  await recordEvent({` (only the `gradeCard` `recall_completed` emission) — PASS.
4. `grep -n "console\." studio/src/lib/repo/index.js` → `60:    if (import.meta.env?.DEV) console.warn('[repo] ' + label + ' failed', err);` — PASS (no `console.log`).
5. `npx vitest run --project studio test/revision-best-effort.test.js` → `Test Files 1 passed (1)`, `Tests 9 passed (9)` — PASS.
6. `npx vitest run --project studio test/repo.test.js test/beta-privacy.test.js test/beta-revisions.test.js test/beta-events.test.js test/adapter-contract.test.js` → `Test Files 5 passed (5)`, `Tests 94 passed (94)` — PASS.
7. `npx vitest run --project root test/studio-capstone-migration.test.js` → `Test Files 1 passed (1)`, `Tests 7 passed (7)` — PASS.
8. Non-vacuity experiment (wrapper temporarily rethrowing): `Tests 8 failed | 1 passed (9)`, restored; `git diff --stat` afterwards shows only the 4 call-site lines for task 2 — PASS.
9. Diff scope `git diff --stat HEAD~2..HEAD` → `studio/src/lib/repo/index.js | 56 ++++--`, `studio/test/revision-best-effort.test.js | 26 +++`, 74 insertions / 8 deletions, 2 files — PASS (no schema, catalog, package, lockfile, migration or planning file).
10. Commits reachable on `gsd/phase-08-revision-loop`: `024e105` (task 1), `93eaa7f` (task 2) — PASS.
11. Files exist: `[ -f studio/src/lib/repo/index.js ]` and `[ -f studio/test/revision-best-effort.test.js ]` → both found — PASS.

## Self-Check: PASSED
