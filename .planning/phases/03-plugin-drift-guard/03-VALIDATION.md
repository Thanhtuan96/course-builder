---
phase: "03"
slug: "plugin-drift-guard"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-22"
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 |
| **Config file** | `vitest.config.js` (root; `test/**/*.test.js`, node environment) |
| **Quick run command** | `npx vitest run test/shared-drift.test.js` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/shared-drift.test.js`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 03-01 | 1 | BOUND-02 | T-03-01, T-03-02, T-03-03, T-03-05 | Sync is byte-for-byte, read-only in `--check`, path-safe, orphan-scoped and idempotent | integration/unit | `node scripts/sync-shared.mjs --check && bash bin/sync-shared.sh --check` | ✅ | ✅ green |
| 03-01-02 | 03-01 | 1 | BOUND-02 | T-03-04 | All four manifest versions equal `package.json` without renaming or reordering entries | unit | `npx vitest run test/shared-drift.test.js -t "aligns all four manifest versions"` | ✅ | ✅ green |
| 03-01-03 | 03-01 | 1 | BOUND-02 | T-03-01, T-03-02, T-03-04 | Changed/missing/orphan/non-regular/symlink drift fails; manifest command/agent/hook parity holds both ways | integration/unit | `npx vitest run test/shared-drift.test.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/shared-drift.test.js` — 17 tests covering committed tree, every drift class, write-mode orphan removal, manifest parity and version alignment
- [x] No framework install needed — Vitest already configured in the root package

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|

No manual-only verifications — all phase behaviors have automated verification.

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-22
