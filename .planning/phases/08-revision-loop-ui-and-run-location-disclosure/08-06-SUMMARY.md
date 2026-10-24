---
phase: 08-revision-loop-ui-and-run-location-disclosure
plan: 06
subsystem: ui
tags: [react, ssr, i18n, revision-loop, run-location, localStorage, vitest]

# Dependency graph
requires:
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 02
    provides: history.js (workspaceCriteria, workspacePassed, armRevision, consumeRevision, workspaceRevisionIntent) and the revision-link repo path
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 04
    provides: ReviewFeedback, AttemptHistory (prop-driven, SSR-safe)
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 05
    provides: the quiz/tutor surfaces already wired, and the runnerNotice + revision catalogs
provides:
  - "runner-notice.jsx: URL-scoped, SSR-safe acknowledgement storage helpers plus shouldBlockLocalRun"
  - "RunnerNotice/RunnerBadge: Browser / Local machine disclosure with the local-run acknowledgement"
  - "OutputPanel: honest runner badge, optional check criteria + revise CTA"
  - "CodeWorkspace: first-local-run gate, one-shot revisionOf, inline attempt history"
affects: [phase-09-capstone, verify-work]

actuals:
  tokens: 4757
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Run-location gate is a pure predicate called before any state change, so the first local click provably runs nothing"
    - "Acknowledgement scope is runnerBase(settings), not the raw bridge URL: one normalisation site, and a non-loopback bridge never prompts"
    - "Every storage helper takes an injectable storage and catches around getItem/setItem; a lazy useState initializer keeps SSR safe"
    - "Workspace CTA gate lives in the parent (lastRunId + checks.length > 0 + !workspacePassed); OutputPanel only mirrors whether a callback was passed"

key-files:
  created:
    - studio/src/components/revision/runner-notice.jsx
    - studio/src/components/revision/RunnerNotice.jsx
  modified:
    - studio/src/components/workspace/OutputPanel.jsx
    - studio/src/components/workspace/CodeWorkspace.jsx

key-decisions:
  - "The ack record is { url: 'http://localhost:3000/api/studio/run', acknowledgedAt: ISO } — scoped to runnerBase(), so a different runner URL re-prompts"
  - "shouldBlockLocalRun returns before setError/setRunning/runCode/saveRunResult; the blocked error carries runnerNotice.notice.blocked and its blockedHint"
  - "lastCriteria is recomputed on every run and cleared when a new run starts, so the previous attempt's rubric never sits under a fresh run"
  - "revision-surfaces.test.js and revision-wiring.test.js needed no edits: the workspace smoke case and all four source-order cases already asserted the contract and went green"

patterns-established:
  - "Runtime disclosure state is derived on first render from a guarded helper, then held in a ref for use inside memoized callbacks (ackRef) — no stale state, no effect"
  - "A run's criteria are derived from result.checks before the save so the review survives a failed write; the saved row id is captured for the revision intent"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03, LOOP-04]

coverage:
  - id: D1
    description: "The workspace and output panel say Browser / Local machine; the string 'Local server' is gone from both badges"
    requirement: "LOOP-04"
    verification:
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#OutputPanel labels the runner honestly"
        status: pass
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#RunnerNotice renders nothing machine-specific for browser runs"
        status: pass
      - kind: unit
        ref: "studio/test/revision-surfaces.test.js#CodeWorkspace renders its loading shell without a runner claim"
        status: pass
    human_judgment: false
  - id: D2
    description: "The first local Run/Check is intercepted until the learner acknowledges; browser runs are never blocked"
    requirement: "LOOP-04"
    verification:
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#shouldBlockLocalRun blocks only a local, unacknowledged run"
        status: pass
      - kind: unit
        ref: "studio/test/revision-wiring.test.js#CodeWorkspace checks the local-run acknowledgement gate before the run starts"
        status: pass
    human_judgment: false
  - id: D3
    description: "The acknowledgement persists under professor.runnerNotice.ack as {url, acknowledgedAt}, re-prompts for a different runner URL, and never throws on blocked storage"
    requirement: "LOOP-04"
    verification:
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#acknowledgeRunner persists url + acknowledgedAt under professor.runnerNotice.ack"
        status: pass
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#a different runner URL re-prompts"
        status: pass
      - kind: unit
        ref: "studio/test/revision-runner-notice.test.js#missing, null and throwing storage never throw"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failing check run shows its checks as rubric criteria with one Socratic question each and a Revise this attempt CTA that arms a one-shot revisionOf"
    requirement: "LOOP-01, LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/revision-history.test.js#workspaceCriteria slugs check names, falls back to checkN and suffixes collisions"
        status: pass
      - kind: unit
        ref: "studio/test/revision-history.test.js#passing predicates"
        status: pass
      - kind: unit
        ref: "studio/test/revision-wiring.test.js#CodeWorkspace declares the revise action before the history affordance"
        status: pass
    human_judgment: false
  - id: D5
    description: "Inline attempt history with the per-criterion delta renders in the workspace from decoded run results"
    requirement: "LOOP-03"
    verification:
      - kind: unit
        ref: "studio/test/revision-attempt-history.test.js (8 tests, delta + empty state + no diff text)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real local run on macOS shows the acknowledgement once, then runs on the next click; a real-provider Vietnamese tutor review returns rubric JSON with one question per unmet criterion"
    verification: []
    human_judgment: true
    rationale: "Both need a live local runner (spawned Node/Python process + browser click) or a real provider; SSR and node-only tests cannot exercise the first-click interception against a real run or a provider's JSON shape."

duration: 8 min
completed: 2026-10-25
status: complete
---

# Phase 8 Plan 6: Run-Location Disclosure and the Workspace Revision Loop Summary

**The workspace now answers "where does my code run?" with a `Browser` / `Local machine` badge and a one-time, runner-URL-scoped acknowledgement that provably blocks the first local Run — then closes the loop with checks-as-criteria review, a one-shot `revisionOf` CTA and inline attempt history, taking the whole phase suite to 93 files / 1184 tests green.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-24T16:00:00Z
- **Completed:** 2026-10-24T16:07:30Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified); the two test files in scope needed no edits

## Accomplishments

- `runner-notice.jsx` adds `RUNNER_ACK_KEY`, `runnerAckScope`, `readRunnerAck`, `needsRunnerAck`, `acknowledgeRunner` and the pure `shouldBlockLocalRun`, imported through `lib/runner/index.js` so the URL is never re-derived. The ack record is `{ url, acknowledgedAt }` under `professor.runnerNotice.ack`, where `url` is `runnerBase(settings)` (`http://localhost:3000/api/studio/run` for the default settings). A different runner URL re-prompts; a non-loopback bridge yields `null` scope (no prompt, no record) because the run would fail with `loopback_required` before executing anything.
- `RunnerNotice` / `RunnerBadge` replace the old `workspace.localServer` badge on both surfaces with `runnerNotice.badge.local` ("Local machine") and `runnerNotice.badge.browser` ("Browser"). A local runner adds the amber "Code runs on your machine" notice with the acknowledge button; once acknowledged the copy stays and only the button disappears. Browser runs render the badge alone.
- `CodeWorkspace` gates the first local run: `shouldBlockLocalRun({ runnerKind, acknowledged: ackRef.current })` runs immediately after the `running || !files.length` guard and **before** `setRunning`, the abort controller and `runCode`, so a blocked click sets `runnerNotice.notice.blocked` + `blockedHint` and returns. Browser and acknowledged-local runs are untouched.
- A run with failing checks renders those checks as rubric criteria (`workspaceCriteria`) with one localized Socratic question per unmet check (no provider), and "Revise this attempt" is offered only when `lastRunId` exists, `output.checks.length > 0`, and `workspacePassed(output.checks)` is false — a zero-check compile/provider failure gets no CTA. The CTA arms `workspaceRevisionIntent(lastRunId)`; the next saved run consumes it before the await, so `revisionOf` is written to `revision_links` exactly once.
- Inline `AttemptHistory` is built from `listRunResults` + `decodeRunResult`, with the same criteria delta as the quiz and tutor surfaces.

## Run-location disclosure mechanics

| Piece | Value |
| --- | --- |
| Storage key | `professor.runnerNotice.ack` |
| Record | `{ url, acknowledgedAt }` — `url` = `runnerBase(settings)` |
| Scope for defaults | `http://localhost:3000/api/studio/run` |
| Re-prompt trigger | stored `url !== runnerAckScope(settings)` |
| No-scope case | non-loopback `bridgeUrl` → `runnerAckScope` `null` → no prompt, no record, no write |
| Throw cases | `getItem`/`setItem` throwing, malformed JSON, non-object record → `null` / session-only ack, never a throw |
| Gate predicate | `shouldBlockLocalRun({ runnerKind, acknowledged })` → `true` only for `'local'` + `acknowledged !== true` |
| Interception point | top of `start(kind)`, before `setError(null)`, `setRunning(kind)`, `new AbortController()` and `runCode` |
| What it prevents | spinner, abort controller, `runCode`, `saveRunResult`, `refreshHistory` — nothing runs and no row is written on the first local click |

`runner-notice.jsx` has one import (`runnerBase`), no React/JSX and no module-level `localStorage` access; `CodeWorkspace` initialises `acknowledged` with a lazy `useState(() => !needsRunnerAck(settings))` and mirrors it into `ackRef` for the memoized `start`, so `renderToString` never touches storage.

## Workspace criteria + revision flow (failing run)

1. `runCode` returns `{ checks, runner, stdout, … }`; the result is merged into `outRef` and rendered.
2. `workspaceCriteria(result.checks, t('revision.workspace.fallbackQuestion'))` → `lastCriteria` is set **before** the save, so a failing write still shows the review.
3. `encodeRunPayload({ checks, files, entry, language })` → `revisionOf = consumeRevision(revisionRef)` (consumed before the await).
4. `const saved = await saveRunResult({ …, revisionOf })` → `setLastRunId(saved?.id ?? null)` → `refreshHistory()`.
5. `OutputPanel` renders `ReviewFeedback` with `criteriaTitle`, `reviseHint` and `onRevise`; `showRevise` mirrors `typeof onRevise === 'function'`.
6. `onRevise` is non-null only for `lastRunId && output.checks.length > 0 && !workspacePassed(output.checks)`; clicking it calls `armRevision(revisionRef, { feedbackTable: 'run_results', feedbackId: lastRunId })` and clears the error — it runs nothing.
7. A second run without re-arming calls `consumeRevision` on an empty ref → `revisionOf: null` (proved by `revision-history.test.js#armRevision / consumeRevision are one-shot`).

## `revision-wiring.test.js` source-order cases — all green (9/9 in the file)

1. `QuizPanel declares the revise action before the New quiz affordance`
2. `TutorPanel declares the revise action before the capstone notice`
3. `CodeWorkspace declares the revise action before the history affordance` — `'const onRevise ='` once, before `t('workspace.history')`, with exactly one `onRevise={onRevise}` on `OutputPanel` and no `<ReviseButton`
4. `CodeWorkspace checks the local-run acknowledgement gate before the run starts` — exactly one `shouldBlockLocalRun({` call site, ahead of `setRunning(kind)`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the ack storage helpers and the RunnerNotice/RunnerBadge components** — `249ee4d` (feat)
2. **Task 2: OutputPanel — honest badge, check criteria review and revise CTA** — `900491a` (feat)
3. **Task 3: CodeWorkspace — ack gate, one-shot revisionOf, checks review and attempt history** — `d3132fc` (feat)

## Files Created/Modified

- `studio/src/components/revision/runner-notice.jsx` (new, 109 lines) — ack key, scope, read/needs/acknowledge helpers, `shouldBlockLocalRun`.
- `studio/src/components/revision/RunnerNotice.jsx` (new, 60 lines) — `RunnerBadge` (`Browser` / `Local machine`) and `RunnerNotice` (badge + local-run notice + acknowledge action / acknowledged copy).
- `studio/src/components/workspace/OutputPanel.jsx` — `RunnerBadge` replaces the old badge keys; optional `criteria`/`criteriaTitle`/`reviseHint`/`onRevise` render `ReviewFeedback` after `CheckList`. Preview iframe untouched.
- `studio/src/components/workspace/CodeWorkspace.jsx` — ack state + `ackRef`, gate in `start`, `lastCriteria`/`lastRunId`, saved-run capture with `revisionOf`, `onRevise` gate, `runAttempts` memo, `RunnerNotice` and `AttemptHistory` in the render. Props stay `{ lesson, course }`.
- `studio/test/revision-surfaces.test.js`, `studio/test/revision-wiring.test.js` — unchanged; their workspace smoke case and four source-order cases now pass.

## Decisions Made

- **One guarded default storage accessor.** `defaultStorage()` wraps the `globalThis.localStorage` read in try/catch, so a throwing getter (Safari private mode) behaves like a missing store instead of breaking render.
- **Clear `lastCriteria` when a new run starts.** Keeps the previous attempt's rubric from rendering under the fresh empty output while the new run is in flight.
- **`workspacePassed(output?.checks)` with the length gate in the parent.** `workspacePassed([])` is `false`, so the CTA needed the explicit `checks.length > 0` term rather than a change to `history.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale criteria could outlive their run**
- **Found during:** Task 3 (CodeWorkspace)
- **Issue:** The plan reset `outRef`/`output` at run start but not `lastCriteria`, so the previous attempt's rubric stayed visible (with no CTA, since the new output has zero checks) until the new result arrived — misleading on a slow local run.
- **Fix:** `setLastCriteria([])` alongside the output reset at the top of `start`, before the run begins.
- **Files modified:** `studio/src/components/workspace/CodeWorkspace.jsx`
- **Verification:** `revision-surfaces.test.js` + `revision-wiring.test.js` + the full suite stay green; the criteria/CTA gate is unchanged.
- **Committed in:** `d3132fc` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cosmetic correctness only — no prop, catalog, schema or dependency change and no extra provider call. No scope creep.

## Issues Encountered

- **Task 1's `-t "RunnerNotice"` filter also matches the `OutputPanel` label case.** Both cases live in the single `describe('RunnerNotice and runner badges')` block, so that filter is red until task 2 lands (as the plan anticipated by deferring the `OutputPanel` cases). Task 1 was verified with the three `RunnerNotice`-specific titles plus `-t runnerAck`, `-t shouldBlockLocalRun` and `-t sandbox`, then the whole file went 13/13 green after task 2.
- **Node's `ExperimentalWarning: localStorage is not available`** appears in test output because Node 22 exposes `globalThis.localStorage` as a warning-only stub. It is harmless: `readRunnerAck` returns `null` and no test relies on ambient storage.

## Phase Gate

| Gate | Command | Result |
| --- | --- | --- |
| Quick revision set | `npx vitest run --project studio test/revision-*… test/prompts-*-review.test.js` (9 files) | **87 passed (87)** |
| i18n | `npx vitest run --project studio test/i18n-catalogs.test.js test/i18n-keys.test.js test/i18n-render.test.js` | **9 passed (9)** |
| Regression | `test/tutor-panel.render.test.js test/tutor.test.js test/practice-prompt.test.js test/beta-privacy.test.js test/beta-revisions.test.js test/runner-selection.test.js test/no-sync-getprovider.test.js` | **88 passed (88)** |
| Studio project | `npx vitest run --project studio` | **Test Files 64 passed (64) · Tests 614 passed (614)** |
| Root project | `npx vitest run --project root` | **Test Files 29 passed (29) · Tests 570 passed (570)** |
| Full suite | `npm test` | **Test Files 93 passed (93) · Tests 1184 passed (1184)** |
| Root migration guard | `npx vitest run --project root test/migrations.test.js` | **5 passed (5)** |
| Ownership | `git diff --name-only $(git merge-base HEAD develop)..HEAD` | only 01–06 plan files; no `studio/migrations/`, `settings.js`, capstone, `ChatMessage.jsx`, `package.json`/lockfile; i18n diff is only `revision.json` + `runnerNotice.json` in en/vi |

## Manual Checks Handed to Verification

1. **Real local run on macOS:** a local-only language (e.g. Go/Python via the local server) shows "Code runs on your machine" with the acknowledge button; the first Run shows the blocked error and runs nothing; after acknowledging, Run executes and the notice stays as copy without the button; the same click sequence in another browser profile re-prompts.
2. **Real-provider Vietnamese tutor review:** a `vi` tutor review returns rubric JSON validated against the persisted rubric, with exactly one question per unmet criterion and no markdown/code in the review body.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- LOOP-01..04 are implemented and unit-proven end to end on all three surfaces; the two manual checks above are the only remaining UAT items for this phase.
- The `runnerNotice` namespace and `runner-notice.jsx` helpers are reusable: any future surface that can start a local run can call `shouldBlockLocalRun` without re-deriving the URL or the storage key.
- Nothing blocks phase 9: `CodeWorkspace` keeps its `{ lesson, course }` contract, and no schema, migration, dependency or catalog namespace changed.

---

*Phase: 08-revision-loop-ui-and-run-location-disclosure*
*Completed: 2026-10-25*

## Self-Check: PASSED

1. **Files exist** — `runner-notice.jsx`, `RunnerNotice.jsx`, `OutputPanel.jsx`, `CodeWorkspace.jsx`, `08-06-SUMMARY.md` → FOUND.
2. **Commits reachable** — `249ee4d`, `900491a`, `d3132fc` on `gsd/phase-08-revision-loop` → FOUND.
3. **Full suite** — `npm test` → 93 files / 1184 tests passed; studio 64/614, root 29/570.
4. **No STATE/ROADMAP/REQUIREMENTS edits** — only this SUMMARY was written under `.planning/` (orchestrator owns the rest).
