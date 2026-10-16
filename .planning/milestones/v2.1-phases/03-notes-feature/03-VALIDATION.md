---
phase: 03
slug: notes-feature
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual testing (Claude Code plugin — no automated test runner) |
| **Config file** | none |
| **Quick run command** | N/A (manual verification) |
| **Full suite command** | N/A (manual verification) |
| **Estimated runtime** | ~2-5 minutes per verification |

---

## Sampling Rate

- **After implementation:** Manual verification per test protocol below
- **Before `/gsd-verify-work`:** All manual verifications pass
- **Max feedback latency:** Immediate (human performs verification)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CMD-13 | manual | N/A | commands/professor/note.md | ⬜ pending |
| 03-01-02 | 01 | 1 | NOT-01 | manual | N/A | commands/professor/new-topic.md | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None — Claude Code plugin has no test framework per project constraint
- Manual testing protocol covers all requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|-----------|-------------------|
| professor:note command works | CMD-13 | Claude Code plugin — no automated test runner | See test protocol below |
| NOTES.md auto-created on new course | NOT-01 | Claude Code plugin — no automated test runner | See test protocol below |
| Fallback to global notes works | CMD-13 | Claude Code plugin — no automated test runner | See test protocol below |

---

## Manual Testing Protocols

### Test 1: professor:note command (CMD-13)

1. **Setup**: Start a course with `professor:new-topic` (choose any topic)
2. **Trigger**: Run `/professor:note`
3. **Input**: 
   - Select note type: Question / Idea / Insight / To explore
   - Enter note content: "This is a test note"
4. **Verify**:
   - ✅ `courses/{slug}/NOTES.md` exists
   - ✅ Contains timestamp: `[[YYYY-MM-DD]] [[HH:MM]]`
   - ✅ Contains note type tag: `[Question]`, `[Idea]`, `[Insight]`, or `[To explore]`
   - ✅ Contains note content after timestamp
5. **Additional notes**: Run `/professor:note` again, verify new note appears at TOP (newest first)

### Test 2: Auto-creation (NOT-01)

1. **Setup**: None (fresh state)
2. **Trigger**: Run `professor:new-topic`, provide a topic (e.g., "Python basics"), complete syllabus confirmation
3. **Verify**:
   - ✅ `courses/{slug}/NOTES.md` exists
   - ✅ File contains header: `# 📝 Notes: [Topic Name]`
   - ✅ File is otherwise empty

### Test 3: Fallback scenario

1. **Setup**: No active course (or run in directory without courses/)
2. **Trigger**: Run `/professor:note`
3. **Verify**:
   - ✅ `courses/notes.md` exists (global fallback)
   - ✅ Notes saved there instead of per-course

---

## Validation Sign-Off

- [ ] All tasks have verification defined (manual protocol)
- [ ] All requirements have test coverage
- [ ] Wave 0 is test framework for N/A (no Claude Code plugin)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

