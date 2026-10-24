# Phase 08 — Orchestrator Patch (shared planning docs)

> **Worker note.** Per ROADMAP § Execution Rules, `.planning/STATE.md`, `.planning/ROADMAP.md` and
> `CLAUDE.md` are edited only by the orchestrator at merge time. This worker therefore ran the whole
> GSD cycle but did **not** call `phase.complete` or write those files. Apply the changes below when
> merging `gsd/phase-08-revision-loop` into `develop`.

## ROADMAP.md

1. Phase checklist line:
   `- [ ] **Phase 8: Revision Loop UI and Run-Location Disclosure** - ...` → `- [x] ... (completed 2026-10-25)`
2. Phase 8 `**Plans**: TBD` → `**Plans**: 6/6 plans complete` (optionally list the plans).
3. Progress table row:
   `| 8. Revision Loop UI and Run-Location Disclosure | 2 | 0/TBD | Not started | - |`
   → `| 8. Revision Loop UI and Run-Location Disclosure | 2 | 6/6 | Complete | 2026-10-25 |`
4. Requirements traceability in `REQUIREMENTS.md`: LOOP-01 … LOOP-04 → `Complete` (the per-phase rows,
   and tick the checkboxes at lines 59–62).

## STATE.md

- `current_phase: 8`, `current_phase_name: Revision Loop UI and Run-Location Disclosure`
- `status: executed`, `completed_phases: 7`, `completed_plans: 26`, `percent: 54`
- `last_activity: 2026-10-25`,
  `last_activity_desc: Phase 8 Revision Loop UI and Run-Location Disclosure complete — npm test 93 files / 1194 tests green`
- Current Position: "Phase 8 complete (Wave 2 of 4 phases); next is Phase 9 (or the remaining Wave 2
  phases 7, 9, 10)". Progress bar at 54%.
- Accumulated Context → Decisions (add):
  - `[Phase 8] Review records ride on assistant chat_messages rows with mode:'review' and JSON content {surface, attemptTable, attemptId, passing, criteria} — no schema change`
  - `[Phase 8] Criterion keys are stable per task (quiz q1..qN, workspace slugged check ids, tutor c1..cN persisted on first review and reused)`
  - `[Phase 8] Best-effort emission in repo/index.js (D-16) — post-write recordEvent/maybeLinkRevision failures never reject the learner action; validation stays strict`
  - `[Phase 8] Runner acknowledgement is localStorage-scoped (`professor.runnerNotice.ack`, `{url, acknowledgedAt}`) because settings.js is Phase 6-owned`
- Blockers/Concerns (add): the two real-environment checks (live Vietnamese tutor review; real local
  run on macOS) are accepted and deferred to the Phase 12 manual UAT checklist.
- Session Continuity: `Stopped at: Phase 8 complete, verified; next is Phase 7/9/10 in Wave 2`.

## Merge notes

- Branch: `gsd/phase-08-revision-loop` (12 commits from `develop`).
- Dependency/lockfile/migration changes: **none**.
- Merge conflict risk: `studio/src/lib/repo/index.js` (D-16 wrapper) and `studio/src/lib/i18n/**` —
  this phase only *adds* `revision.json` / `runnerNotice.json`, so Wave-2 siblings must not edit them.
- Test gate on the merged result: `npm test` (baseline before this phase was 1097 root+studio tests;
  this phase ends at 93 files / 1194 tests green).
