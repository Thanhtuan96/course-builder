---
phase: "08"
slug: "revision-loop-ui-and-run-location-disclosure"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-24"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (root config, projects `root` + `studio`) |
| **Config file** | `vitest.config.js` |
| **Quick run command** | `npx vitest run --project studio test/revision- test/prompts-practice-review.test.js test/prompts-tutor-review.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds (quick), ~90 seconds (full) |

Positional arguments are **substring filters on the file path**, not globs: a literal `test/revision-*.test.js`
matches nothing, so vitest collects zero files and the run looks green while skipping every revision test. The
filter `test/revision-` selects all seven `studio/test/revision-*.test.js` files (verified: the same form
`test/beta-revision` collects `test/beta-revisions.test.js`). After Wave 0 the quick run must report
**9 test files** — `revision-history`, `revision-wiring`, `revision-best-effort`, `revision-review`,
`revision-attempt-history`, `revision-runner-notice`, `revision-surfaces`, plus `prompts-practice-review` and
`prompts-tutor-review`. If the reported file count is lower, a Wave-0 file is missing or misnamed; if it is 0,
the filter was written as a glob again.

---

## Sampling Rate

- **After every task commit:** Run the quick run command above (no network, no DOM)
- **After every plan wave:** Run `npm test` (root + studio; Studio baseline 55 files / 527 tests green)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Plan 01 is the **Wave-0 contract plan** (catalogs + failing tests); it executes as execution wave 1 and its rows
are marked `W0` in the *File Exists* column. Task IDs are `<plan>-<task>` for the plans as written:
plan 01 has 4 tasks (catalogs, unit contracts, prompt contracts, SSR contracts), plan 03 has 2 tasks, and plans
02, 04, 05 and 06 have 3 tasks each.

| Task ID | Plan | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 (W0) | LOOP-02, LOOP-04 | T-08-01, T-08-02 | Both catalogs exist in en+vi with identical key sets: 31 revision keys, 8 runnerNotice keys; no value matches /sandbox/i, /isolated/i or /\bsafe\b/i | catalog parity | `npx vitest run --project studio test/i18n-catalogs.test.js test/i18n-keys.test.js` | ❌ W0 | ✅ green |
| 08-01-02 | 01 (W0) | LOOP-01, LOOP-03 | T-08-03 | Wave-0 unit contracts for history/criteria, revise intents + explicit link, and D-16 best-effort exist, are collected and are red for the documented reason | unit + repo contract | `npx vitest run --project studio test/revision-history.test.js test/revision-wiring.test.js test/revision-best-effort.test.js` | ❌ W0 | ✅ green |
| 08-01-03 | 01 (W0) | LOOP-02 | T-08-01 | Wave-0 prompt contracts exist: strict JSON, no `code`/`solution`/fences, one question per unmet criterion, one-repair budget | unit contract | `npx vitest run --project studio test/prompts-practice-review.test.js test/prompts-tutor-review.test.js` | ❌ W0 | ✅ green |
| 08-01-04 | 01 (W0) | LOOP-01..LOOP-04 | T-08-01, T-08-02 | Wave-0 SSR contracts exist: review rows/chips/CTA rule, attempt history, ack helpers + `shouldBlockLocalRun`, surface smoke | SSR contract | `npx vitest run --project studio test/revision-review.test.js test/revision-attempt-history.test.js test/revision-runner-notice.test.js test/revision-surfaces.test.js` | ❌ W0 | ✅ green |
| 08-02-01 | 02 | LOOP-02 | T-08-01 | Quiz/workspace review schema rejects injected code, fences and a missing unmet question; learner data only inside `wrapUntrusted` | unit | `npx vitest run --project studio test/prompts-practice-review.test.js test/practice-prompt.test.js` | ❌ W0 | ✅ green |
| 08-02-02 | 02 | LOOP-01, LOOP-03 | T-08-03 | Deterministic `q1..qN` / slugged check keys, tolerant review parse, criteria delta, one-shot intents; explicit intent lands in `revision_links` | unit + repo | `npx vitest run --project studio test/revision-history.test.js && npx vitest run --project studio test/revision-wiring.test.js -t "Intent"` | ❌ W0 | ✅ green |
| 08-02-03 | 02 | LOOP-02 | T-08-01 | Tutor review rubric reuse/drift rejection; exactly two `streamText` calls then `bad_json`; no corrected code | unit | `npx vitest run --project studio test/prompts-tutor-review.test.js test/tutor.test.js test/no-sync-getprovider.test.js` | ❌ W0 | ✅ green |
| 08-03-01 | 03 | (D-16) | T-08-04 | A failing `learning_events`/`revision_links` write leaves the quiz attempt and the chat message saved and the call resolved | repo integration | `npx vitest run --project studio test/revision-best-effort.test.js -t "quiz attempt" && npx vitest run --project studio test/revision-best-effort.test.js -t "chat message"` | ❌ W0 | ✅ green |
| 08-03-02 | 03 | (D-16) | T-08-04 | Same for the run result and the capstone submission; direct `recordEvent` still rejects invalid meta loudly | repo integration | `npx vitest run --project studio test/revision-best-effort.test.js test/beta-privacy.test.js && npx vitest run --project root test/studio-capstone-migration.test.js` | ❌ W0 | ✅ green |
| 08-04-01 | 04 | LOOP-01, LOOP-02 | T-08-01 | `ReviewFeedback`/`ReviseButton`: one row+chip per criterion, exactly one question per unmet criterion and none for met, primary `bg-indigo-600` CTA only when non-passing | SSR | `npx vitest run --project studio test/revision-review.test.js -t "ReviewFeedback" && npx vitest run --project studio test/revision-review.test.js -t "ReviseButton"` | ❌ W0 | ✅ green |
| 08-04-02 | 04 | LOOP-02 | T-08-01 | Malformed stored review renders as plain text, never a chip and never a crash | SSR | `npx vitest run --project studio test/revision-review.test.js -t "ReviewMessage"` | ❌ W0 | ✅ green |
| 08-04-03 | 04 | LOOP-03 | — | Attempt history: met-count summary, per-criterion transitions, collapsible count, no `<pre>`/diff | SSR | `npx vitest run --project studio test/revision-attempt-history.test.js` | ❌ W0 | ✅ green |
| 08-05-01 | 05 | LOOP-01, LOOP-02, LOOP-03 | T-08-03 | Quiz: deterministic review persisted as `mode:'review'`, CTA rendered only via `ReviewFeedback` before the secondary New quiz button, next attempt carries `revisionOf` | SSR + source order | `npx vitest run --project studio test/revision-surfaces.test.js -t "QuizPanel" && npx vitest run --project studio test/revision-wiring.test.js -t "QuizPanel declares the revise action"` | ❌ W0 | ✅ green |
| 08-05-02 | 05 | LOOP-02, LOOP-03 | T-08-03 | Tutor: "Review my attempt" chip present, capstone mode has no review/hint affordance, `ReviewMessage` only for tutor-surface reviews | SSR + source order | `npx vitest run --project studio test/revision-surfaces.test.js -t "TutorPanel" && npx vitest run --project studio test/revision-wiring.test.js -t "TutorPanel declares the revise action" && npx vitest run --project studio test/tutor-panel.render.test.js` | ❌ W0 | ✅ green |
| 08-05-03 | 05 | LOOP-01, LOOP-02, LOOP-03 | T-08-03 | Tutor review flow: persisted rubric re-sent, drift rejected after one repair with a retry action, next `check_answer` message carries the review's `revisionOf`, tutor history renders | SSR + repo regression | `npx vitest run --project studio test/revision-surfaces.test.js && npx vitest run --project studio test/revision-wiring.test.js -t "Intent" && npx vitest run --project studio test/prompts-tutor-review.test.js test/tutor.test.js` | ❌ W0 | ✅ green |
| 08-06-01 | 06 | LOOP-04 | T-08-02 | Ack scoped to `runnerBase(settings)`, URL change re-prompts, missing/throwing storage tolerated, `shouldBlockLocalRun` blocks local+unacknowledged only, no "sandbox" copy | unit + SSR | `npx vitest run --project studio test/revision-runner-notice.test.js -t "runnerAck" && npx vitest run --project studio test/revision-runner-notice.test.js -t "shouldBlockLocalRun"` | ❌ W0 | ✅ green |
| 08-06-02 | 06 | LOOP-02, LOOP-04 | T-08-02 | `OutputPanel` badge says Local machine/Browser (never "Local server"); check criteria review renders with the parent-gated CTA | SSR | `npx vitest run --project studio test/revision-runner-notice.test.js && npx vitest run --project studio test/tutor-panel.render.test.js` | ❌ W0 | ✅ green |
| 08-06-03 | 06 | LOOP-01, LOOP-03, LOOP-04 | T-08-04 | `CodeWorkspace`: gate before `setRunning`, `const onRevise` gated on `checks.length > 0 && !workspacePassed`, one-shot `revisionOf` on the next saved run, inline history | SSR + source order | `npx vitest run --project studio test/revision-wiring.test.js && npx vitest run --project studio test/revision-surfaces.test.js && npx vitest run --project studio test/revision-runner-notice.test.js` | ❌ W0 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Attribution note:** rows 08-03-01/02 are the D-16 best-effort repo work owned by **plan 03** (they were previously
attributed to plan 06); rows 08-06-01/02 are the runner badge/ack work owned by **plan 06** (previously attributed to
plan 03). Rows 08-01-02/03/04, 08-02-03, 08-04-03, 08-05-02, 08-05-03 and 08-06-03 cover the tasks that had no row
(including the tutor review flow and the `CodeWorkspace` gate + one-shot `revisionOf`).

---

## Wave 0 Requirements

- [x] `studio/test/revision-history.test.js` — review parse/build, workspace criteria, `criteriaDelta`, passing predicates, revise-intent arm/consume
- [x] `studio/test/revision-review.test.js` — `ReviewFeedback` + revise CTA SSR
- [x] `studio/test/revision-attempt-history.test.js` — `AttemptHistory` SSR
- [x] `studio/test/revision-runner-notice.test.js` — ack helpers (fake/throwing storage, URL change), `shouldBlockLocalRun` predicate (local+unacknowledged blocked, browser/acknowledged allowed), notice/badge SSR, no-`sandbox` scan
- [x] `studio/test/revision-wiring.test.js` — intent builders + explicit-link repo integration (titles contain "Intent" so plan 02 can filter) plus four source-order cases: QuizPanel, TutorPanel, CodeWorkspace revise markers and the `shouldBlockLocalRun({…})` gate before `setRunning(kind)`
- [x] `studio/test/revision-best-effort.test.js` — failing-appender adapter, primary row preserved
- [x] `studio/test/revision-surfaces.test.js` — SSR smoke of the three surfaces
- [x] `studio/test/prompts-practice-review.test.js` — quiz + workspace review schemas/builders, no-code regression
- [x] `studio/test/prompts-tutor-review.test.js` — tutor schema, rubric persistence/drift, one-repair call count
- [x] `studio/src/lib/i18n/{en,vi}/{revision,runnerNotice}.json` — created in plan 01 task 1 (the Wave-0 contract plan); parity tests fail until both languages exist
- [x] No framework install needed (Vitest 5 and zod 4 already present); no config change needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-provider Vietnamese tutor review stays rubric JSON and asks one Socratic question per unmet criterion | LOOP-02 | Needs a real model | Run a review with the `vi` UI language and a real provider; confirm the rendered rows and copy |
| A real local run shows the acknowledgement once and then runs | LOOP-04 | Needs the local runner on macOS | Start `npx course-professor web`, run a local-only language once (notice, acknowledge), run again (no prompt) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-25

---

## Validation Audit

| Metric | Value |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Audited 2026-10-25 after all six plans executed. Quick run (`npx vitest run --project studio test/revision- test/prompts-practice-review.test.js test/prompts-tutor-review.test.js`) reports **9 files / 87 tests green**; the full suite reports **93 files / 1184 tests green** (root + Studio). All 18 tasks have an automated verify; every LOOP-01..LOOP-04 behavior maps to at least one green test. The two real-environment checks (real-provider Vietnamese tutor review, real local run on macOS after the acknowledgement) stay manual-only and are recorded for `/gsd-verify-work`.
