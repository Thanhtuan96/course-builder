---
phase: 17-auto-generate-excercise-files-that-user-can-work-on-directly-exclude-learning-framework-only-need-instructions
verified: 2026-03-15T14:30:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
gaps: []
---

# Phase 17: Auto-Generate Exercise Files Verification Report

**Phase Goal:** Generate self-contained exercise files that users can work on directly without needing LECTURE.md visible. Differentiate between coding exercises (skeleton code with TODOs) and non-coding exercises (pure instructions only).

**Verified:** 2026-03-15T14:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Users can work on exercise files directly without needing LECTURE.md visible | ✓ VERIFIED | Both command files contain: "Work on this file directly - you can complete it without the lecture visible." (commands/professor/next.md:80, shared/commands/professor/next.md:61) |
| 2   | Coding exercises contain skeleton code with TODO comments for user implementation | ✓ VERIFIED | Both files have skeleton code template with TODO placeholders at lines 64/83 and 69/88 |
| 3   | Non-coding exercises contain pure instructions without code scaffolding | ✓ VERIFIED | Both files have separate markdown template for non-coding (commands/professor/next.md:94-117, shared/commands/professor/next.md:75-98) |
| 4   | File extension is auto-detected from course technology type | ✓ VERIFIED | Technology detection logic covers .jsx, .js, .ts, .py, .sql, .go, .rs, .java, .md (commands/professor/next.md:48-56) |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `commands/professor/next.md` | Enhanced exercise generation logic with topic detection | ✓ VERIFIED | Contains: topic type detection (coding vs non-coding), technology auto-detection, skeleton code template with TODOs, pure instruction template for non-coding, self-contained message |
| `shared/commands/professor/next.md` | Web UI exercise generation synced with CLI | ✓ VERIFIED | Identical exercise generation logic to CLI version - synced for consistency |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `professor:next command` | `exercises/{NN}-{section-slug}.{ext}` | Auto-generated template files | ✓ WIRED | Pattern established at lines 58-61, COURSE.md updated with "Active exercise" field |

### Requirements Coverage

No requirements specified in PLAN frontmatter (requirements: []). N/A for this phase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | — | — | — | — |

**Note:** The TODO comments found in the grep search are template placeholders within the generated exercise file skeleton — this is intentional and correct behavior. They are not TODOs in the command logic itself.

### Human Verification Required

None — all verification can be performed programmatically.

---

## Verification Summary

All must-haves verified successfully:

1. **Self-contained exercises** - Both templates explicitly state "Work on this file directly - you can complete it without the lecture visible."

2. **Coding exercises** - Skeleton code template includes TODO comments for user implementation

3. **Non-coding exercises** - Pure markdown instruction template without code scaffolding

4. **Technology auto-detection** - File extension detection for 9+ languages (.jsx, .js, .ts, .py, .sql, .go, .rs, .java, .md)

5. **Files synced** - Both CLI (commands/professor/next.md) and Web UI (shared/commands/professor/next.md) have identical exercise generation logic

**Phase goal achieved.** Ready to proceed.

---

_Verified: 2026-03-15T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
