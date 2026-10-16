---
phase: 6
slug: agent-able-to-get-and-manage-context-through-all-course
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-07
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | N/A — Claude Code plugin (no test runner) |
| **Config file | None |
| **Quick run command | N/A - Manual verification |
| **Full suite command | N/A - Manual verification |
| **Estimated runtime | ~2-5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Manual verification of command behavior
- **After every plan wave:** N/A — single wave
- **Before `/gsd-verify-work`:** Manual test of full archive flow
- **Max feedback latency:** N/A (manual)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | ARCH-01 | Manual | Check exercises/ folder exists post-archive | ✅ | ⬜ pending |
| 6-01-02 | 01 | 1 | ARCH-02 | Manual | Run professor:archive, verify archive created | ✅ | ⬜ pending |
| 6-01-03 | 01 | 1 | ARCH-03 | Manual | Check .course_archive/{slug}/ has all files | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None — No test infrastructure needed for Claude Code plugin commands. All verification is manual.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| exercises/ folder remains after archive | ARCH-01 | File system state | After running archive, verify courses/{slug}/exercises/ still exists |
| professor:archive command works | ARCH-02 | Interactive command | Run the command, verify success message and archive created |
| Archive contains all 4 required files | ARCH-03 | File existence | Check .course_archive/{slug}/ contains COURSE.md, NOTES.md, CAPSTONE.md, SUMMARY.md |

---

## Validation Sign-Off

- [x] All tasks have manual verification
- [x] Wave 0 covers all requirements (N/A - manual verification)
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

