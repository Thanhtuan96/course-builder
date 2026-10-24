---
phase: 08-revision-loop-ui-and-run-location-disclosure
verified: 2026-10-24T16:30:54Z
status: passed
score: 4/4 must-haves verified
re_verification: false
human_verification_disposition: accepted-deferred-to-phase-12-uat
human_verification:
  - test: "Real-provider Vietnamese tutor review"
    expected: "With the UI/course language set to `vi` and a real provider configured, pressing 'Nhận xét bài của tôi' (Review my attempt) persists a `mode:'review'` row whose parsed criteria show a met/partial/not_met chip per criterion and exactly one Vietnamese Socratic question for every unmet/partial criterion, with no code, diff or corrected answer rendered."
    why_human: "Requires a live model call. The schema, rubric reuse, one-repair budget, record shape and SSR rendering are unit-proven, but the provider's real JSON shape and Vietnamese prose cannot be exercised in node/SSR tests."
  - test: "Real local run on macOS shows the acknowledgement once"
    expected: "Open the workspace on a local-only language: the badge reads `Local machine`, 'Code runs on your machine' is visible, the first Run/Check is intercepted (nothing executes, blocked message shown), after 'I understand — run my code' the run executes, the notice stays as copy without the button, and a second run does not re-prompt. A fresh profile / different runner URL re-prompts."
    why_human: "Requires the local runner and a real browser session (`localStorage`, click interception against a spawned process). The gate predicate, ack scoping and storage helpers are unit-tested and the gate call site is source-order asserted, but the end-to-end click/run behaviour cannot be executed headlessly in this suite."
---

# Phase 8: Revision Loop UI and Run-Location Disclosure — Verification Report

**Phase Goal:** After feedback, revising is the obvious next step, the learner can see how each attempt improved, and local code execution is disclosed honestly.

**Verified:** 2026-10-24T16:30:54Z
**Status:** passed (4/4 must-haves verified automatically; the two real-environment checks are accepted and deferred to the Phase 12 UAT checklist — see Human Verification below)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After non-passing feedback in a quiz, tutor review or workspace check, "Revise this attempt" is the primary action and the next attempt is recorded as an explicit revision of that feedback; a passing attempt has no CTA | ✓ VERIFIED | CTA gating: `ReviewFeedback.jsx:57,82-84` (renders only when `!reviewPassed` and a handler exists), `ReviseButton.jsx:33` uses `variant="primary"` → `Button.jsx:3` `bg-indigo-600`. Quiz: `QuizPanel.jsx:297,365-371` (`showRevise={!passing}`; secondary "New quiz" at 386-388), `:189-196` consumes the one-shot intent and passes `revisionOf` to `saveQuizAttempt`, `:300-310` arms `quizRevisionIntent({reviewId, attemptId})`. Tutor: `TutorPanel.jsx:159-165` consumes only in `check_answer`, `:315-319` arms `tutorRevisionIntent(rowId)`, `:429-443` renders `ReviewMessage` with `onRevise`; passing reviews hide the CTA via `ReviewMessage.jsx:45`. Workspace: `CodeWorkspace.jsx:323-335` passes `revisionOf` to `saveRunResult`, `:363-366` arms the run intent, `:478-481` gates the CTA on `lastRunId && checks.length > 0 && !workspacePassed`. Repo link path: `repo/index.js:274-293` writes `link_kind: 'explicit'`. Tests: `revision-wiring.test.js:69-118` (explicit rows in `revision_links`), `revision-review.test.js:54-67` (no CTA when passing, `bg-indigo-600` when not), `revision-history.test.js:334-342` (one-shot intent). |
| 2 | Feedback lists each rubric criterion as met / partial / not met with one Socratic question per unmet criterion, and review output for the learner's own task contains no corrected code | ✓ VERIFIED | Schemas: `prompts/practice.js:300-334` (`strictObject`, fence ban, "every unmet criterion needs one Socratic question", "met criteria must not carry a question"), `prompts/tutor.js:360-394`. Rubric key stability: `history.js:129-143` (`q1..qN`), `:166-178` (slugged `checkN` with suffixes), `:356-365` (persisted tutor rubric), `prompts/tutor.js:403-416` (drift rejected). One repair then `bad_json`: `review-request.js:58-74`. No corrected code: `prompts/practice.js:354-365` and `prompts/tutor.js:336-346` embed `NO_SOLUTION_RULE` and forbid code/diffs/fences; learner data only inside `wrapUntrusted`; tests `prompts-practice-review.test.js:46-82,195-222` (extra `code`/`solution` keys and fenced labels rejected; programming-task prompt has no fence/`"code"`/`"solution"`), `prompts-tutor-review.test.js:39-55,240-257` (fenced/extra-key reply rejected; accepted record has no fence or code/solution key), `revision-review.test.js:43-52` (exactly one question per unmet criterion). |
| 3 | The learner can open their attempt history and see which criteria changed between attempts (met-count summary + per-criterion transitions, no code diff) | ✓ VERIFIED | `AttemptHistory.jsx:51-116` renders `<details>` with `{from} → {to} of {total} met` and `criteriaDelta` transitions; `history.js:213-253` computes improved/worsened/added/removed/unchanged by stable key. Mounted inline on all three surfaces: `QuizPanel.jsx:390`, `TutorPanel.jsx:483-485`, `CodeWorkspace.jsx:570-572`. Tests: `revision-attempt-history.test.js:26-86` asserts "2 → 4 of 5 met", "q3: Not met → Met", `new`, `removed`, collapsible count, and no `<pre>`/diff lines; `revision-history.test.js:280-318` asserts the delta semantics. |
| 4 | The workspace shows a `Browser` or `Local machine` badge, states "Code runs on your machine" before the first local run with a one-time acknowledgement, and the word "sandbox" never describes the local runner | ✓ VERIFIED | Badge: `RunnerNotice.jsx:20-28` uses `runnerNotice.badge.browser` / `.local`; catalogs `en/runnerNotice.json:2-5` are exactly `Browser` / `Local machine`; wired in `CodeWorkspace.jsx:537` and `OutputPanel.jsx:131-138`. Notice + acknowledge: `RunnerNotice.jsx:39-58`, `runner-notice.jsx:88-98` persists `{url, acknowledgedAt}` under `professor.runnerNotice.ack` scoped to `runnerBase(settings)` (`:38-44,72-77`, URL change re-prompts). First-click interception before any state change: `CodeWorkspace.jsx:279-287` (gate before `setRunning`), predicate `runner-notice.jsx:107-109`. No "sandbox" copy: the only remaining `sandbox` tokens under `studio/src` are the HTML-preview iframe attribute (`OutputPanel.jsx:57`), its JSDoc, the browser worker's local `sandboxConsole`, and `runner/browser.js` comments — none are local-runner copy (D-15 explicitly excludes the preview iframe/source comments). Tests: `revision-runner-notice.test.js:46-123` (ack scope/key/re-prompt/throwing storage/gate), `:126-218` (badge + notice + pending-run honesty), `:221-256` (no `/sandbox/i` in catalogs or rendered local-runner text). |

**Score:** 4/4 ROADMAP success criteria verified automatically.

### Required Artifacts

All files declared in the plans' "Artifacts this phase produces" inventory exist and expose the declared symbols.

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `studio/src/lib/i18n/en/revision.json` | 31-key English revision namespace | ✓ VERIFIED | 31 flattened keys; `revise.label = "Revise this attempt"` |
| `studio/src/lib/i18n/vi/revision.json` | 31-key Vietnamese mirror | ✓ VERIFIED | 31 identical keys; `revise.label = "Làm lại bài này"` |
| `studio/src/lib/i18n/en/runnerNotice.json` | 8-key disclosure namespace | ✓ VERIFIED | `notice.title` exactly `Code runs on your machine`; badges `Browser` / `Local machine` |
| `studio/src/lib/i18n/vi/runnerNotice.json` | 8-key Vietnamese mirror | ✓ VERIFIED | `notice.title = "Mã chạy trên máy của bạn"`; no sandbox/safe/isolated wording |
| `studio/src/components/revision/history.js` | Pure review/criteria/delta/intent layer | ✓ VERIFIED | 384 lines; all 20 exports import cleanly (node import probe) |
| `studio/src/components/revision/review-request.js` | One-repair strict-JSON request | ✓ VERIFIED | 76 lines; `requestReviewJson` exported |
| `studio/src/components/revision/ReviewFeedback.jsx` | Criteria rows/chips/questions/CTA | ✓ VERIFIED | 87 lines; `ReviewFeedback` |
| `studio/src/components/revision/ReviewMessage.jsx` | Stored review → review card or text | ✓ VERIFIED | 50 lines; `ReviewMessage`, `reviewSurface` |
| `studio/src/components/revision/ReviseButton.jsx` | Primary revise button | ✓ VERIFIED | 39 lines; `ReviseButton` |
| `studio/src/components/revision/AttemptHistory.jsx` | Collapsible history + delta | ✓ VERIFIED | 117 lines; `AttemptHistory` |
| `studio/src/components/revision/RunnerNotice.jsx` | Badge + machine notice | ✓ VERIFIED | 60 lines; `RunnerNotice`, `RunnerBadge` |
| `studio/src/components/revision/runner-notice.jsx` | Ack helpers + gate predicate | ✓ VERIFIED | 109 lines; all 6 exports present |
| `prompts/practice.js` review exports | Schema/validators/builders | ✓ VERIFIED | `REVIEW_STATUSES`, `reviewCriterionSchema`, `reviewOutputSchema`, `validateReview`, both builders, `validateReviewQuestions` |
| `prompts/tutor.js` review exports | Schema/rubric/builder | ✓ VERIFIED | `TUTOR_REVIEW_RULES`, `tutorReviewSchema`, `validateTutorReview`, `normalizeTutorReview`, `buildTutorReviewMessages` |
| `repo/index.js` best-effort wrappers | `bestEffort` + named wrappers | ✓ VERIFIED | `safeRecordEvent` / `safeMaybeLinkRevision` at 8 call sites (`repo/index.js:72-84,546-556,678-688,829-839,981-991`) |
| 9 new test files | `revision-*` + `prompts-{practice,tutor}-review` | ✓ VERIFIED | All 9 collected by `--project studio`; 97 tests green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| QuizPanel | repo + revision intents | `consumeRevision` → `saveQuizAttempt({revisionOf})` | ✓ WIRED | `QuizPanel.jsx:189-196`; explicit link proven in `revision-wiring.test.js:69-93` |
| TutorPanel | repo + revision intents | `consumeRevision` (only `check_answer`) → `appendChat({revisionOf})` | ✓ WIRED | `TutorPanel.jsx:159-165`; explicit link proven in `revision-wiring.test.js:95-118` |
| CodeWorkspace | repo + revision intents | `consumeRevision` → `saveRunResult({revisionOf})` | ✓ WIRED | `CodeWorkspace.jsx:323-335`; repo explicit workspace link covered by `beta-revisions.test.js:368-396` |
| CodeWorkspace | runner notice gate | `shouldBlockLocalRun` before `setRunning`/`runCode` | ✓ WIRED | `CodeWorkspace.jsx:279-287`; source order asserted `revision-wiring.test.js:159-166` |
| ReviewMessage | history parser | `parseReviewRecord` → `ReviewFeedback` or plain text | ✓ WIRED | `ReviewMessage.jsx:31-49`; malformed case tested |
| ReviewFeedback | history | `reviewPassed(criteria)` decides CTA | ✓ WIRED | `ReviewFeedback.jsx:57,82`; passing case tested |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| LOOP-01 | 08-01, 08-02, 08-03, 08-04, 08-05, 08-06 | "Revise this attempt" as the primary action after non-passing feedback | ✓ SATISFIED | Primary CTA gating + explicit `revisionOf` on quiz/tutor/workspace (truth 1). Capstone surface is explicitly delegated to Phase 9 by ROADMAP "Touch points"; no capstone file was touched (verified by diff). |
| LOOP-02 | 08-01, 08-02, 08-04, 08-05, 08-06 | Rubric-anchored per-criterion feedback, one Socratic question per unmet criterion, never corrected code | ✓ SATISFIED (automated) | Truth 2; real-provider Vietnamese rendering listed for human verification. |
| LOOP-03 | 08-01, 08-02, 08-04, 08-05, 08-06 | Attempt history and criteria changed between attempts | ✓ SATISFIED | Truth 3 |
| LOOP-04 | 08-01, 08-04, 08-06 | Honest run location, one-time acknowledgement, never "sandbox" for the local runner | ✓ SATISFIED (automated) | Truth 4; real local run on macOS listed for human verification. |

No orphaned requirements: `REQUIREMENTS.md:160-163` maps LOOP-01..LOOP-04 to Phase 8, and every plan's `requirements` field claims at least one of them (08-01..08-06 collectively cover all four).

### Prohibitions & Ownership

| Check | Result | Evidence |
| ----- | ------ | -------- |
| No migration / `DB_VERSION` / `package.json` / lockfile change | ✓ HOLDS | `git diff --name-only "$(git merge-base HEAD develop)"..HEAD` contains no such path |
| No capstone file edits | ✓ HOLDS | No `components/capstone/**` or `pages/Capstone.jsx` in the diff |
| No existing i18n catalog edits | ✓ HOLDS | Only the 4 new `revision.json` / `runnerNotice.json` files; no edit to `i18n/index.js` |
| No "sandbox" in local-runner copy | ✓ HOLDS | Catalog scan + rendered scan tests; remaining tokens are preview iframe/browser-worker/comments |
| No corrected code in reviews | ✓ HOLDS | Strict schemas reject `code`/`solution`/fences; `NO_SOLUTION_RULE` in both rule sets; regression tests green |
| Ownership | ✓ HOLDS | Diff names only Phase 8 Owns files + approved `studio/src/lib/repo/index.js` exception + `.planning/phases/08-*` artifacts |

### Test Gates (actual counts)

| Gate | Command | Result |
| ---- | ------- | ------ |
| Phase revision/prompt gate | `npx vitest run --project studio test/revision- test/prompts-practice-review.test.js test/prompts-tutor-review.test.js` | **9 files / 97 tests passed** |
| Full suite | `npm test` | **93 files / 1194 tests passed** (Studio + root) |

Verification probes run in this session:

- `git diff --name-only "$(git merge-base HEAD develop)"..HEAD` — only Phase 8 Owns files, the approved `repo/index.js` exception, and `.planning/phases/08-*`; working tree clean.
- Node import probe: `history.js` and `review-request.js` export every declared symbol; JSX export lines confirmed by inspection.
- Catalog probe: `revision` 31 keys / `runnerNotice` 8 keys in both `en` and `vi`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None blocking. `grep` finds no TODO/FIXME/XXX/HACK or stub placeholder copy in the new/changed production modules (the only `placeholder` hits are the real tutor `<textarea placeholder=…>` attribute and its i18n key); no empty handlers or static "not implemented" returns | — | — |

Note: `buildWorkspaceReviewMessages` is exported and tested but not called by the production workspace flow — this is intentional per D-04 (workspace review is deterministic-first from checks; provider enrichment is optional). Not a gap.

### Human Verification Required

#### 1. Real-provider Vietnamese tutor review

**Test:** Set the UI/course language to `vi`, configure a real provider, send an attempt in the tutor, then press "Nhận xét bài của tôi".
**Expected:** A review row renders with one met/partial/not_met chip per criterion, exactly one Vietnamese Socratic question for each unmet/partial criterion, no code block/diff/corrected answer; a second review of the same lesson keeps the same criterion keys.
**Why human:** Live model call; the JSON shape and Vietnamese prose cannot be produced or judged by the node/SSR suite.

#### 2. Real local run on macOS shows `Local machine` and the acknowledgement once

**Test:** Open the workspace on a local-only language; observe the badge and notice, click Run/Check before acknowledging, acknowledge, then run again and reload.
**Expected:** Badge `Local machine`; "Code runs on your machine" before the first run; first click is intercepted with nothing executed; after "I understand — run my code" the run executes and the notice stays as copy without the button; a second run does not re-prompt. A different runner URL or a fresh profile re-prompts.
**Why human:** Requires the local runner, a real browser (`localStorage`) and a click path that cannot run in SSR/node.

### Gaps Summary

No gaps found. The four ROADMAP success criteria are demonstrably met in the codebase and by the passing test suite. The only outstanding items are the two real-environment checks above, which are inherently non-automatable in this harness.

The `08-VALIDATION.md` quick-run figure (9 files / 87 tests) is 10 tests behind the current code — the security fix-up commits added tests after that document was written; the actual result is 9 files / 97 tests and the full suite is 93 / 1194 (matching `08-SECURITY.md`).

---

_Verified: 2026-10-24T16:30:54Z_
_Verifier: Claude (gsd-verifier)_
