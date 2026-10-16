---
phase: 2
slug: professor-agent-and-core-commands
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — Markdown-only plugin; no executable code in this phase |
| **Config file** | none |
| **Quick run command** | `bash .planning/phases/02-professor-agent-and-core-commands/check-files.sh` |
| **Full suite command** | Same as quick run (file existence + frontmatter check) |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `test -f [created-file] && echo "PASS: [file]" || echo "FAIL: [file] missing"`
- **After every plan wave:** Run full file existence check script
- **Before `/gsd:verify-work`:** Install plugin locally and smoke-test `professor:new-topic` end-to-end
- **Max feedback latency:** ~2 seconds (file existence checks are instant)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AGT-01 | manual | `test -f agents/professor.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | CMD-01 | manual | `test -f commands/professor/new-topic.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | CMD-02 | manual | `test -f commands/professor/next.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | CMD-03 | manual | `test -f commands/professor/review.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 1 | CMD-04 | manual | `test -f commands/professor/done.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-02-05 | 02 | 1 | CMD-07 | manual | `test -f commands/professor/syllabus.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-02-06 | 02 | 1 | CMD-08 | manual | `test -f commands/professor/progress.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | CMD-05 | manual | `test -f commands/professor/hint.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | CMD-06 | manual | `test -f commands/professor/stuck.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | CMD-09 | manual | `test -f commands/professor/discuss.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-03-04 | 03 | 2 | CMD-10 | manual | `test -f commands/professor/quiz.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | CMD-11 | manual | `test -f commands/professor/capstone.md && echo PASS` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 2 | CMD-12 | manual | `test -f commands/professor/capstone-review.md && echo PASS` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `agents/professor.md` — agent brain file (only `.gitkeep` exists currently)
- [ ] `commands/professor/new-topic.md` — CMD-01
- [ ] `commands/professor/next.md` — CMD-02
- [ ] `commands/professor/done.md` — CMD-04
- [ ] `commands/professor/review.md` — CMD-03
- [ ] `commands/professor/syllabus.md` — CMD-07
- [ ] `commands/professor/progress.md` — CMD-08
- [ ] `commands/professor/hint.md` — CMD-05
- [ ] `commands/professor/stuck.md` — CMD-06
- [ ] `commands/professor/discuss.md` — CMD-09
- [ ] `commands/professor/quiz.md` — CMD-10
- [ ] `commands/professor/capstone.md` — CMD-11
- [ ] `commands/professor/capstone-review.md` — CMD-12
- [ ] `commands/professor/note.md` — stub (pre-registered, Phase 3 scope)
- [ ] `commands/professor/export.md` — stub (pre-registered, Phase 5 scope)

*All files are Wave 0 gaps — none exist yet.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Professor agent auto-delegates on `professor:*` commands | AGT-01 | Claude behavior is not unit-testable from Markdown | Install plugin, run `/professor:new-topic` in a project dir, verify professor agent responds |
| `professor:new-topic` proposes syllabus inline before writing COURSE.md | CMD-01 | Interaction flow depends on Claude following instructions | Run `/professor:new-topic`, confirm no `courses/` dir is created until after user confirms |
| `professor:hint` gives Layer 1 first, Layer 2 second, Layer 3 third | CMD-05 | Requires session context to validate layer progression | Run `/professor:hint` three times in a session; verify layers progress in order |
| `professor:stuck` asks what user tried before breakdown | CMD-06 | AskUserQuestion behavior is not testable statically | Run `/professor:stuck`, verify AskUserQuestion appears before structured breakdown |
| `professor:capstone-review` blocked until all sections ✅ | CMD-12 | Gate check requires reading COURSE.md state at runtime | Run `/professor:capstone-review` with a COURSE.md that has ⬜ sections; verify refusal |
| Context auto-restoration on session start | AGT-01 | Session lifecycle is not testable from static files | Start a new session in a dir with `courses/`, verify professor reads state without explicit command |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
