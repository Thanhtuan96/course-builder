---
phase: "05"
slug: "beta-data-foundation"
status: approved
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-22"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (root 5.0.5, Studio 5.0.4) |
| **Config file** | `vitest.config.js`; `studio/vite.config.js` (`test` block) |
| **Quick run command** | `npx vitest run <file>` (root) · `cd studio && npx vitest run <file>` |
| **Full suite command** | `npx vitest run && (cd studio && npx vitest run)` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the one new/extended file for that task.
- **After every plan wave:** Run both suites (`npx vitest run` and `cd studio && npx vitest run`).
- **Before `/gsd-verify-work`:** Full suite must be green (root + Studio).
- **Max feedback latency:** 120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DEBT-03, INSTR-01 | T-05-01, T-05-04 | 0005 adds only the three tables; IDB v4/v2 upgrades create stores and preserve rows | integration | `npx vitest run test/studio-capstone-migration.test.js && (cd studio && npx vitest run test/idb-upgrade.test.js)` | ✅ | ✅ green |
| 05-01-02 | 01 | 1 | DEBT-03 | T-05-02, T-05-03 | Health derives the highest applied prefix (5); 0005 hash pinned; released migrations unchanged | integration | `npx vitest run test/migrations.test.js test/studio-api.test.js test/studio-capstone-migration.test.js && node -e "const m=require('./test/fixtures/migrations.sha256.json'); if(!m['0005_beta_loop.sql']){console.error('missing 0005 hash');process.exit(1);}"` | ✅ | ✅ green |
| 05-02-01 | 02 | 2 | INSTR-01 | T-05-05 | One quiz attempt writes one content-free event; activation set once | unit | `cd studio && npx vitest run test/beta-events.test.js` | ✅ | ✅ green |
| 05-02-02 | 02 | 2 | INSTR-01 | T-05-05 | Six emission points; inner-checks discriminator; never double-emits | unit | `cd studio && npx vitest run test/beta-events.test.js` | ✅ | ✅ green |
| 05-02-03 | 02 | 2 | INSTR-02 | T-05-07 | Meta whitelist per kind, 512-char cap, rejected writes leave no row | unit | `cd studio && npx vitest run test/beta-privacy.test.js test/beta-events.test.js` | ✅ | ✅ green |
| 05-03-01 | 03 | 3 | INSTR-04 | T-05-08 | Explicit link stored with frozen columns and feedback allowlist | unit | `cd studio && npx vitest run test/beta-revisions.test.js` | ✅ | ✅ green |
| 05-03-02 | 03 | 3 | INSTR-04 | T-05-08, T-05-13 | 72 h same-artifact inference per surface; explicit wins | unit | `cd studio && npx vitest run test/beta-revisions.test.js` | ✅ | ✅ green |
| 05-03-03 | 03 | 3 | INSTR-04 | T-05-08, T-05-13 | Negatives; invalid explicit falls through to inference | unit | `cd studio && npx vitest run test/beta-revisions.test.js test/beta-events.test.js` | ✅ | ✅ green |
| 05-04-01 | 04 | 4 | INSTR-03 | T-05-09 | Activation offset 0; UTC+7; UTC−8 23:30 local day; component offsets 0/1 | unit | `cd studio && npx vitest run test/beta-metrics.test.js` | ✅ | ✅ green |
| 05-04-02 | 04 | 4 | INSTR-03 | T-05-09 | Week boundaries 7/8/14/15; distinct-day counts; derived firstEventKind | unit | `cd studio && npx vitest run test/beta-metrics.test.js` | ✅ | ✅ green |
| 05-04-03 | 04 | 4 | INSTR-02, INSTR-04 | T-05-10, T-05-14 | Strict v1 schema; revision counts; sentinel report content-free | unit | `cd studio && npx vitest run test/beta-report.test.js test/beta-privacy.test.js test/beta-metrics.test.js` | ✅ | ✅ green |
| 05-05-01 | 05 | 5 | INSTR-01, INSTR-02, INSTR-04 | T-05-11 | New tables/indexes and backup restore across adapters; IDB emission once | integration | `cd studio && npx vitest run test/adapter-contract.test.js test/repo.test.js && cd .. && npx vitest run test/studio-api.test.js test/cli-studio.test.js` | ✅ | ✅ green |
| 05-05-02 | 05 | 5 | INSTR-01 | T-05-12 | Real CLI review/import entry points emit one event in temp PROFESSOR_HOME | integration | `cd studio && npx vitest run test/beta-cli-parity.test.js` | ✅ | ✅ green |
| 05-05-03 | 05 | 5 | DEBT-03, INSTR-01..04 | T-05-11, T-05-12 | Full suites green; 0005 hash matches; phase scope clean | integration | `npx vitest run && (cd studio && npx vitest run) && node -e "const m=require('./test/fixtures/migrations.sha256.json'); if(!m['0005_beta_loop.sql']){console.error('missing 0005 hash');process.exit(1);}"` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `studio/test/beta-events.test.js` — INSTR-01/02 emission matrix.
- [x] `studio/test/beta-privacy.test.js` — INSTR-02 sentinel + meta whitelist.
- [x] `studio/test/beta-revisions.test.js` — INSTR-04 explicit/inferred/negatives.
- [x] `studio/test/beta-metrics.test.js` — INSTR-03 pinned clocks.
- [x] `studio/test/beta-report.test.js` — strict report schema v1.
- [x] `studio/test/beta-cli-parity.test.js` — real CLI `review`/`import` entry points.
- [x] Extend `studio/test/adapter-contract.test.js`, `studio/test/idb-upgrade.test.js`, `studio/test/repo.test.js`, `test/studio-capstone-migration.test.js`.
- [x] Framework install: none — existing infrastructure covers everything.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | All phase behaviors have automated verification. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

## Nyquist Audit

- Audited 2026-10-22 against INSTR-01..04 and DEBT-03 plus every plan `must_haves` truth.
- Gap closed: 05-04 must-have "rejects unknown keys at every level" only sampled `app`,
  `loops.byKind`, `retention` and `capstone`. Added
  `studio/test/beta-report.test.js#rejects unknown keys inside activation, window, loops and loops.revisions`
  (commit `a925d06`), which proves `z.strictObject` at the remaining levels.
- Nyquist sampling rule: all 14 tasks declare an `<automated>` verify command; longest run without
  automated verification is 0 tasks.
- Post-fix suites: root 14 files / 345 tests green; Studio 49 files / 458 tests green; 0005 hash present.

**Approval:** approved 2026-10-22
