---
phase: 05-beta-data-foundation
verified: 2026-10-21T17:45:21Z
status: passed
score: 14/14 must-haves verified
roadmap_success_criteria: 5/5
covered_files:
  - ".planning/phases/05-beta-data-foundation/05-01-PLAN.md"
  - ".planning/phases/05-beta-data-foundation/05-01-SUMMARY.md"
  - ".planning/phases/05-beta-data-foundation/05-02-PLAN.md"
  - ".planning/phases/05-beta-data-foundation/05-02-SUMMARY.md"
  - ".planning/phases/05-beta-data-foundation/05-03-PLAN.md"
  - ".planning/phases/05-beta-data-foundation/05-03-SUMMARY.md"
  - ".planning/phases/05-beta-data-foundation/05-04-PLAN.md"
  - ".planning/phases/05-beta-data-foundation/05-04-SUMMARY.md"
  - ".planning/phases/05-beta-data-foundation/05-05-PLAN.md"
  - ".planning/phases/05-beta-data-foundation/05-05-SUMMARY.md"
  - ".planning/phases/05-beta-data-foundation/05-06-PLAN.md"
  - ".planning/phases/05-beta-data-foundation/05-06-SUMMARY.md"
  - "scripts/smoke-pack.mjs"
  - "studio/migrations/0005_beta_loop.sql"
  - "studio/src/lib/beta/metrics.js"
  - "studio/src/lib/beta/report.js"
  - "studio/src/lib/repo/events.js"
  - "studio/src/lib/repo/idb-adapter.js"
  - "studio/src/lib/repo/index.js"
  - "studio/src/lib/repo/schema.js"
  - "studio/test/adapter-contract.test.js"
  - "studio/test/beta-cli-parity.test.js"
  - "studio/test/beta-events.test.js"
  - "studio/test/beta-metrics.test.js"
  - "studio/test/beta-privacy.test.js"
  - "studio/test/beta-report.test.js"
  - "studio/test/beta-revisions.test.js"
  - "studio/test/idb-upgrade.test.js"
  - "studio/test/repo.test.js"
  - "test/fixtures/migrations.sha256.json"
  - "test/studio-api.test.js"
  - "test/studio-capstone-migration.test.js"
  - "web/studio-db.js"
covered_digest: "v3:sha256:4f6e727dbd8ca01f7d6df87322cd438b01bc5d64bd049b614d9eaa17956a8254"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 13/14
  gaps_closed:
    - "A quiz attempt saved with a valid revisionOf and a valid feedback row but no prior attempt persists exactly one explicit link with attempt_id null on memory, IndexedDB and SQLite."
  gaps_remaining: []
  regressions: []
---

# Phase 5: Beta Data Foundation Verification Report

**Phase Goal:** Studio records trustworthy, content-free learning events and revision links in every storage adapter, and can compute activation, retention and the beta report from them
**Verified:** 2026-10-21T17:45:21Z
**Status:** passed
**Re-verification:** Yes — after gap closure (05-06, commits `d13ec53`, `6a540c4`)

## Goal Achievement

The phase goal is achieved. The additive `0005_beta_loop.sql` creates `learning_events`, `revision_links` and `beta_profile` on SQLite and IndexedDB v5; the repository emits exactly one content-free event for each of the six meaningful actions and nothing for lesson-done/import; activation is once-only; revision links are explicit-first or inferred inside an inclusive 72-hour same-artifact window; and activation/retention/report computation is pure, local-calendar based and content-free. Both complete suites pass (root 347 tests, Studio 460 tests).

The previously failed MH-11 / G-01 is closed. The unreleased 0005 DDL now declares `attempt_id TEXT` (nullable) with a documenting comment while `maybeLinkRevision` and `buildRevisionLink` remain unchanged, and the case is proven on all three adapters. Independent reproduction confirms memory, IndexedDB and SQLite each store exactly one `explicit` link with `attempt_id: null`, one attempt row, exactly one `quiz_completed` event and zero inferred links when a valid `revisionOf` is supplied and no prior attempt exists.

## Success Criteria

| # | Roadmap Success Criterion | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | Quiz, recall, answer-for-review, workspace run, exercise/self-check and capstone checkpoint each record exactly one event identically in browser and SQLite, including CLI `review`/`import`; lesson-done and app-open record nothing meaningful | ✓ VERIFIED | `events.js:11-31` freezes the six kinds; emission hooks in `repo/index.js:506,615,638,789,941`; `beta-events.test.js` emission/no-emission matrix; `beta-cli-parity.test.js` drives real `review`/`import` `run()` entry points; IDB emission case in `repo.test.js`; cross-adapter contract in `adapter-contract.test.js` |
| 2 | A sentinel-string test proves events and the built report never contain course text, prompts, code, answers or keys — only enum kinds, numbers and local calendar days | ✓ VERIFIED | Per-kind `META_WHITELIST`, enum-only strings, array/free-string rejection and 512-char cap in `events.js:142-229`; `validateMeta` runs before the put in `repo/index.js:1071`; sentinel event and report tests in `beta-privacy.test.js` (including `sk-live-...`, course/lesson/capstone ids, URL and model-name checks) |
| 3 | Activation is the first meaningful action (offset 0); pinned-clock tests in UTC+7, UTC−8 and a DST week show week-1 = offsets 1–7 and week-2 return = ≥1 meaningful action on offsets 8–14 in local calendar days | ✓ VERIFIED | `metrics.js:22-53` computes component-based `dayNumber`/`dayOffset` without re-parsing the stored day and clamps at 0; `beta-metrics.test.js` pins Asia/Bangkok, America/Los_Angeles and both 2026 DST transitions, with 7/8/14/15 boundaries |
| 4 | A retry after feedback is linked explicitly via `revisionOf` or inferred within 72 hours on the same artifact, explicit and inferred counted separately; negative tests create no link | ✓ VERIFIED | Explicit-first linker in `repo/index.js:220-283`; four-surface inference predicates; inclusive 72-hour gate and one-link-per-revised-id check; `beta-revisions.test.js` covers explicit on all four writes, inference on all four surfaces, 72h/72h+1s, timezones, eight negative shapes, invalid-explicit fallthrough and separate counting; `report.js:69-80` counts by surface and link kind. The previously open no-prior explicit edge is now proven on memory, IndexedDB and SQLite (MH-11) |
| 5 | `/api/studio/db/health` reports the schema version derived from applied migrations, and existing data upgrades to the new schema with backup/restore round-tripping the new tables | ✓ VERIFIED | `web/studio-db.js:136-148` derives the highest numeric `d1_migrations` prefix; `:193` falls back to the shared constant; `schemaVersion` used in `info()`/`exportAll()` at `:312,364,377`; 0005 hash pinned and matching; `studio-capstone-migration.test.js` fresh/0001–0004 upgrade plus five-row ledger; `idb-upgrade.test.js` real v4→v5 and v2→v5; adapter contract covers old/new backups, `clearAll` and `schemaVersion: 5` on memory/IDB/remote/CLI |

**Roadmap score:** 5/5 success criteria verified.

## Requirement Traceability

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| INSTR-01 | 05-02, 05-05 | ✓ SATISFIED | Six-kind emission matrix and activation tests (`beta-events.test.js`), real CLI parity (`beta-cli-parity.test.js`), IDB emission case (`repo.test.js`), cross-adapter contract (`adapter-contract.test.js`) |
| INSTR-02 | 05-02, 05-04 | ✓ SATISFIED | Meta whitelist/512-cap/reject-before-write (`events.js`, `repo/index.js`); sentinel over event rows, backup slice and full report (`beta-privacy.test.js`); strict report schema (`report.js`) |
| INSTR-03 | 05-04 | ✓ SATISFIED | Offset-0 activation, week-1 1–7, week-2 8–14, distinct local days, UTC+7/UTC−8/DST pins (`metrics.js`, `beta-metrics.test.js`) |
| INSTR-04 | 05-03, 05-04, 05-06 | ✓ SATISFIED | Explicit/inferred links, inclusive 72h same-artifact inference, explicit-wins, negatives and separate counts (`repo/index.js`, `beta-revisions.test.js`, `beta-report.test.js`). The no-prior explicit `revisionOf` case is now proven identical on memory, IndexedDB and SQLite (`repo.test.js`, `studio-capstone-migration.test.js`) and is also exercised through the remote adapter's underlying SQLite store by the shared contract |
| DEBT-03 | 05-01, 05-05, 05-06 | ✓ SATISFIED | Derived health `schemaVersion: 5` (`web/studio-db.js`, `test/studio-api.test.js`), appended 0005 hash re-pinned after the nullable-column edit, unchanged 0001–0004 hashes |

No orphaned Phase 5 requirements: REQUIREMENTS.md maps exactly INSTR-01..04 and DEBT-03, all declared by plans.

## Must-Haves

| # | Must-Have | Status | Evidence |
|---|-----------|--------|----------|
| MH-01 | Exactly six meaningful kinds are frozen; `lesson_completed` is not meaningful | ✓ VERIFIED | `events.js:11-18`; no production `lesson_completed` occurrence (grep over `studio/src`, `web`, `bin`); report schema rejects it as an unknown `byKind` key in `beta-report.test.js` |
| MH-02 | Each meaningful action writes exactly one event; lesson-done/import/assistant/non-meaningful writes emit none | ✓ VERIFIED | Emission matrix in `beta-events.test.js`; quiet paths and `importAll` also proven in `beta-cli-parity.test.js` |
| MH-03 | `saveRunResult` discriminates by the inner checks array, never both kinds, with kind-specific meta | ✓ VERIFIED | `events.js:129-133`; `repo/index.js:789`; `beta-events.test.js` asserts `workspace_run` vs `exercise_completed` and `exit_code` placement |
| MH-04 | First meaningful event activates `beta_profile` once; `getBetaProfile` creates an inactive singleton; non-meaningful paths never activate | ✓ VERIFIED | `repo/index.js:1022-1052`; `beta-events.test.js` activation/quiet-path tests |
| MH-05 | Meta is whitelisted per kind, enum/number only, capped at 512 chars, rejected before any row is written; sentinel proof over rows and report | ✓ VERIFIED | `events.js:142-229`; `repo/index.js:1071`; `beta-privacy.test.js` both describes |
| MH-06 | A valid explicit `revisionOf` stores one explicit link with the supplied feedback table/id on all four attempt-creating writes; explicit wins over inference | ✓ VERIFIED | `repo/index.js:220-253`; `beta-revisions.test.js` explicit quiz/tutor/workspace/capstone tests and explicit-plus-inferable test. The no-prior variant is MH-11 and is now verified |
| MH-07 | Inference is per surface, same artifact, later feedback, inclusive 72h; different artifact/before-feedback/missing feedback/over-72h create no link; invalid explicit falls through | ✓ VERIFIED | `repo/index.js:153-214,255-282`; `beta-revisions.test.js` positives, 72h boundaries, UTC+7/UTC−8 and all D-07 negatives |
| MH-08 | Explicit and inferred are countable separately; one revised attempt has at most one link; a revision writes no second event | ✓ VERIFIED | `repo/index.js:229-230`; `report.js:69-80`; `beta-revisions.test.js`; `beta-report.test.js` revision-count tests |
| MH-09 | Day math is local-calendar, activation offset 0, week-1 1–7, week-2 8–14, distinct local days, sorted unique 0–14 window, all-time byKind, DST-safe | ✓ VERIFIED | `metrics.js`; `beta-metrics.test.js` (UTC+7 tracer, UTC−8 23:30, spring/fall DST, 14-in/15-out, pre-activation clamp, earliest-kind tiebreak) |
| MH-10 | `buildBetaReport` returns a strict zod `schemaVersion: 1` object rejecting unknown keys at every level and stays content-free | ✓ VERIFIED | `report.js:24-62,87-133`; `beta-report.test.js` all strictness/error-code/revision-count tests; full-report sentinel in `beta-privacy.test.js` |
| MH-11 | A quiz attempt saved with a valid `revisionOf` stores exactly one explicit link with the supplied feedback table/id, including when no prior attempt exists, in every adapter | ✓ VERIFIED | `0005_beta_loop.sql:38-40` declares nullable `attempt_id` with the no-prior contract comment; linker/builder are unchanged (`repo/index.js:242`, `events.js:91`). Named tests: `studio/test/repo.test.js#memory: stores exactly one explicit link with a null attempt_id`, `#IndexedDB: ...`; `test/studio-capstone-migration.test.js#stores one explicit link with a null attempt_id when there is no prior attempt`, plus the fresh-DB DDL case. Independent repro below reproduces all three |
| MH-12 | Storage foundation: 0005 creates the three tables additively, IDB `DB_VERSION` 4→5, health derives the applied version, 0005 hash is pinned, no released migration changes | ✓ VERIFIED | `0005_beta_loop.sql`; `schema.js:88-110`; `idb-adapter.js:23`; `web/studio-db.js:136-193`; recomputed 0005 digest `c0fc1dfd8412139fcd3155616f515f3652c9b5765e859a4ec5f9b36470dcd543` equals `test/fixtures/migrations.sha256.json`; released 0001–0004 hashes identical to `develop` byte-for-byte |
| MH-13 | The three tables and every documented index behave identically on memory, IndexedDB, remote/SQLite and the CLI SQLite store; old/new backups and `clearAll` work | ✓ VERIFIED | `adapter-contract.test.js:140-284`; root `test/studio-api.test.js` and `test/cli-studio.test.js` reuse the contract; `repo.test.js` beta restore test |
| MH-14 | Real CLI `review`/`import` `run()` entry points emit the same events/profile, `importAll`/lesson-done emit nothing, and SQLite→memory restore yields an identical report | ✓ VERIFIED | `beta-cli-parity.test.js` all five tests |

**Score:** 14/14 must-haves verified (0 failed, 0 present-behavior-unverified, 0 overrides).

## Ownership

| Check | Result |
|-------|--------|
| Only Phase 5 Owns files changed | ✓ `git diff --name-only develop...HEAD` shows Phase 5 planning docs plus Owns files; no unrelated source changed |
| Authorized out-of-Owns edits exactly as D-13 | ✓ `test/fixtures/migrations.sha256.json` adds only the 0005 hash (re-pinned to the nullable DDL digest); `test/studio-api.test.js` changes only `/db/health` `schemaVersion` 1→5; `scripts/smoke-pack.mjs` changes only the stale "pinned at 1" comment wording |
| No second migration / no released-migration edits | ✓ Only `studio/migrations/0005_beta_loop.sql` added; 0001–0004 SHA-256 match `develop` byte-for-byte after the 05-06 edit |
| No STATE/ROADMAP/CLAUDE edits | ✓ No Phase 5 commit touches `.planning/STATE.md`, `.planning/ROADMAP.md` or `CLAUDE.md` |
| No push/merge | ✓ `HEAD` is on `gsd/phase-05-beta-data`; no remote branch contains it; `develop..HEAD` is 27 phase commits |

## Tests Run

| Command | Result |
|---------|--------|
| `npx vitest run` (root) | ✓ 14 files / 347 tests passed |
| `cd studio && npx vitest run` | ✓ 49 files / 460 tests passed |
| `cd studio && npx vitest run test/repo.test.js -t "null attempt_id"` | ✓ 2 passed (memory, IndexedDB) |
| `npx vitest run test/studio-capstone-migration.test.js -t "null attempt_id"` | ✓ 2 passed (fresh-DB DDL, real SQLite store) |
| `node -e "...sha256(0005_beta_loop.sql)"` | ✓ `c0fc1dfd8412139fcd3155616f515f3652c9b5765e859a4ec5f9b36470dcd543`, identical to the pinned fixture |
| `gsd-tools query check.decision-coverage-verify` | ✓ 13/13 CONTEXT decisions honored, none missing |
| Disabled-test scan over phase test files | ✓ No `skip`/`todo`/`xit` in `beta-*.test.js`, `repo.test.js`, `adapter-contract.test.js`, `idb-upgrade.test.js`, `studio-capstone-migration.test.js` |

### Independent Gap-01 Reproduction

A standalone script imported the real repo and adapters (no Vitest, no mocks) and ran the exact
explicit-without-prior sequence — assistant `chat_messages` row with `mode: 'review'`, then one
`saveQuizAttempt` with `revisionOf` and no seeded `quiz_attempts` row:

```json
{
  "memory":    { "attempts": 1, "events": ["quiz_completed"], "links": 1, "cols": { "attempt_id": null, "link_kind": "explicit" }, "inferred": 0 },
  "indexeddb": { "attempts": 1, "events": ["quiz_completed"], "links": 1, "cols": { "attempt_id": null, "link_kind": "explicit" }, "inferred": 0 },
  "sqlite":    { "attempts": 1, "events": ["quiz_completed"], "links": 1, "cols": { "attempt_id": null, "link_kind": "explicit" }, "inferred": 0 }
}
```

Each adapter returned the supplied feedback table/id, `revised_id` equal to the saved attempt, and
no `NOT NULL` error. The temporary script was removed; the worktree is clean.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `beta-events.test.js` | INSTR-01 | 10 | 0 | No | Behavioral (emission matrix, activation-once, quiet paths) | PASS |
| `beta-privacy.test.js` | INSTR-02 | 4 | 0 | No | Value + behavioral (sentinel absence, rejected writes leave no row) | PASS |
| `beta-revisions.test.js` | INSTR-04 | 20 | 0 | No | Value + behavioral (link ids, kinds, 72h boundaries, negatives) | PASS |
| `beta-metrics.test.js` | INSTR-03 | 12 | 0 | No | Value (pinned clocks, exact offsets/flags) | PASS |
| `beta-report.test.js` | INSTR-02/04 | 10 | 0 | No | Value (strict schema codes, revision counts) | PASS |
| `beta-cli-parity.test.js` | INSTR-01 | 5 | 0 | No | Behavioral (real CLI entry points + report equality after restore) | PASS |
| `adapter-contract.test.js` | INSTR-01/DEBT-03 | 17 | 0 | No | Behavioral (every index, old/new backup, clearAll) | PASS |
| `idb-upgrade.test.js` | DEBT-03 | 6 | 0 | No | Behavioral (real v2/v4 fixtures, store usability) | PASS |
| `studio-capstone-migration.test.js` | DEBT-03/INSTR-04 | 7 | 0 | No | Behavioral (fresh/upgrade/ledger/derived version, real SQLite null-attempt link) | PASS |
| `repo.test.js` (explicit-without-prior) | INSTR-04 | 2 | 0 | No | Value (exact link columns on memory/IDB) | PASS |

**Disabled tests on requirements:** 0 → no BLOCKER. **Circular patterns:** 0 (no expected value generated by the system under test). **Insufficient assertions:** 0.

### Decision Coverage

All trackable CONTEXT.md decisions are honored by shipped artifacts (13/13).

## Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | AR-05-01: `bin/studio-store.js` has no adapter-level `clearAll` (`clearAll` still clears every table through the inner SQLite DB) | Later phase (accepted risk) | 05-SECURITY.md Accepted Risks Log, accepted by orchestrator 2026-10-22; contract gap, not a phase-goal failure |

## Advisory (New Scope, Unevidenced)

None. The re-verification pass produced no new-scope findings; the only changes since the previous
pass are the unreleased 0005 DDL column, its hash pin and the regression tests.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None (no `TBD`/`FIXME`/`XXX`, no placeholder implementations in phase-modified source) | — | — |

## Human Verification

N/A — infrastructure/foundation phase with no user-facing elements; all acceptance criteria are programmatic. No truth is present-but-behavior-unverified (`behavior_unverified: 0`).

## Gaps Summary

No gaps. G-01 (MH-11) is closed by the nullable `revision_links.attempt_id` in the unreleased 0005
DDL, the matching hash re-pin, and real cross-adapter tests. Independently reproduced on memory,
IndexedDB and SQLite with one explicit link, `attempt_id: null`, one attempt and one
`quiz_completed` event on each. All five ROADMAP success criteria, all 14 must-haves and all five
requirements verify; both suites are green and ownership matches the Phase 5 contract.

---

_Verified: 2026-10-21T17:45:21Z_
_Verifier: the agent (gsd-verifier)_
