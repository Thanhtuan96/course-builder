---
phase: 21
slug: research-and-polish-current-agent-plan-to-work-in-real-world
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — pure Markdown/YAML file edits, no test runner |
| **Config file** | none |
| **Quick run command** | `cat agents/professor.md \| grep -c "AskUserQuestion"` (verify 0) |
| **Full suite command** | `bin/sync-shared.sh --dry-run` (verify sync targets) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Manual check — verify modified agent file loads correctly
- **After every plan wave:** Run compatibility checklist review
- **Before `/gsd:verify-work`:** All 4 platform compatibility checklists must be filled
- **Max feedback latency:** Manual review per agent file edit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | Claude Code compat | manual | `grep -c "AskUserQuestion" agents/professor.md` returns 0 | ✅ | ⬜ pending |
| 21-01-02 | 01 | 1 | Professor refactor | manual | `wc -l agents/professor.md` shrinks from current | ✅ | ⬜ pending |
| 21-02-01 | 02 | 2 | Coach subagent mode | manual | `grep "mode: subagent" agents/coach.md` | ✅ | ⬜ pending |
| 21-02-02 | 02 | 2 | Spotter subagent mode | manual | `grep "mode: subagent" agents/spotter.md` | ✅ | ⬜ pending |
| 21-02-03 | 02 | 2 | Navigator subagent mode | manual | `grep "mode: subagent" agents/navigator.md` | ✅ | ⬜ pending |
| 21-03-01 | 03 | 3 | Sync to shared/ | automated | `bash bin/sync-shared.sh && ls shared/agents/navigator.md` | ✅ | ⬜ pending |
| 21-03-02 | 03 | 3 | SKILL.md updated | manual | Review SKILL.md references multi-agent architecture | ✅ | ⬜ pending |
| 21-04-01 | 04 | 4 | Compat checklist | manual | All 4 platform rows filled in checklist | new | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (pure Markdown file edits, no test framework needed).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AskUserQuestion removed from professor.md body | Platform compat | No runtime test env | `grep -n "AskUserQuestion" agents/professor.md` returns 0 results |
| routing:/actions: blocks removed from frontmatter | Platform compat | YAML parsing manual | Open professor.md, confirm no routing: or actions: keys in frontmatter |
| Delegation language updated for non-CC platforms | Platform compat | Behavioral, not parseable | Read each agent's delegation section, confirm it uses generic "invoke X agent" not CC-specific syntax |
| navigator.md present in shared/agents/ | Sync completeness | File existence check | `ls shared/agents/navigator.md` |
| SKILL.md references multi-agent architecture | Spec accuracy | Content review | Open shared/commands/professor/SKILL.md, confirm Coach/Spotter/Navigator mentioned |
| Compatibility checklist complete | Phase done criteria | Manual smoke test | All 4 platform rows in checklist have ✓ or partial/known-gaps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
