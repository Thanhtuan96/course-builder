---
phase: 08-when-initial-user-start-lecture-so-create-files-include-excercise-instead-of-make-user-create-new-one-exclude-coding
verified: 2026-03-08T03:30:00Z
status: passed
score: 7/7 must-haves verified
gaps: []
---

# Phase 8: Auto-Create Exercise Files Verification Report

**Phase Goal:** Automatically create exercise files when professor:next is called, and track the active exercise in COURSE.md. When user runs professor:review/hint/stuck, they read COURSE.md (which is always loaded first), find the "Active exercise" field, and load that specific file.

**Verified:** 2026-03-08T03:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When professor:next runs, exercise file is automatically created in exercises/ subfolder | ✓ VERIFIED | next.md lines 16-58 detail auto-creation after LECTURE.md |
| 2 | Exercise file is a template with comments/skeleton, not working code | ✓ VERIFIED | next.md lines 33-37: "DO NOT write working code - only skeleton"; template example shows TODO comments |
| 3 | "Active exercise" field is written to COURSE.md pointing to the created file | ✓ VERIFIED | next.md lines 39-44: Add/update "Active exercise" field in COURSE.md |
| 4 | professor:review/hint/stuck read COURSE.md, find "Active exercise" field, load that specific file | ✓ VERIFIED | review.md lines 7-14, hint.md lines 6-13, stuck.md lines 6-13 all check for "Active exercise" field |
| 5 | professor:done clears the "Active exercise" field from COURSE.md | ✓ VERIFIED | done.md lines 11-13: "Clear the 'Active exercise' field" |
| 6 | Framework courses get project scaffold in exercises/ on new-topic | ✓ VERIFIED | new-topic.md lines 48-67: framework detection and scaffolding (package.json, src/, README.md) |
| 7 | Backwards compatible with existing courses/ directory structure | ✓ VERIFIED | next.md lines 18-20: checks learning/{slug}/ first, falls back to courses/{slug}/; skips existing files |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| commands/professor/next.md | Auto-create exercise + write Active exercise | ✓ VERIFIED | Lines 16-58 implement exercise file creation and COURSE.md update |
| commands/professor/new-topic.md | Framework scaffolding | ✓ VERIFIED | Lines 48-67 implement framework detection and project scaffolding |
| commands/professor/review.md | Read Active exercise | ✓ VERIFIED | Lines 7-14 check for "Active exercise" field |
| commands/professor/hint.md | Read Active exercise | ✓ VERIFIED | Lines 6-13 check for "Active exercise" field |
| commands/professor/stuck.md | Read Active exercise | ✓ VERIFIED | Lines 6-13 check for "Active exercise" field |
| commands/professor/done.md | Clear Active exercise | ✓ VERIFIED | Lines 11-13 clear the "Active exercise" field |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| professor:next | exercises/{NN}-{section-slug}.js | Create template file, write "Active exercise" to COURSE.md | ✓ WIRED | Lines 16-58 implement full flow |
| COURSE.md | exercises/{NN}-{section-slug}.js | "Active exercise" field stores the path | ✓ WIRED | Field format: `**Active exercise**: exercises/01-intro.js` |
| professor:review/hint/stuck | exercises/{NN}-{section-slug}.js | Read COURSE.md → get Active exercise path → load file | ✓ WIRED | All three commands implement this flow |
| professor:done | COURSE.md | Clear "Active exercise" field when section completed | ✓ WIRED | done.md lines 11-13 implement clearing |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| EXER-01 | ROADMAP.md | Exercise files created automatically when professor:next runs | ✓ SATISFIED | next.md auto-creates exercises/{NN}-{section-slug}.js |
| EXER-02 | ROADMAP.md | Exercise files contain template/skeleton code, not working solutions | ✓ SATISFIED | next.md: "DO NOT write working code - only skeleton" |
| EXER-03 | ROADMAP.md | "Active exercise" field written to COURSE.md | ✓ SATISFIED | next.md lines 39-44 write the field |
| EXER-04 | ROADMAP.md | professor:review/hint/stuck read Active exercise from COURSE.md | ✓ SATISFIED | review/hint/stuck commands all check for field |

**Note:** EXER-01 through EXER-04 are referenced in ROADMAP.md but not defined in REQUIREMENTS.md. This is a documentation gap, but the implementation satisfies the implied requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | - |

**No anti-patterns detected.** The TODO comments found are in template examples (lines 36, 51, 56 in next.md and line 63 in new-topic.md), not placeholder implementations.

### Human Verification Required

None. All verification can be performed programmatically by examining command files.

### Gaps Summary

No gaps found. All must-haves are verified:
- Auto-creation of exercise files works correctly
- Template files contain skeleton code with TODO comments, not working solutions
- Active exercise tracking is properly implemented across all relevant commands
- Framework course scaffolding works for new-topic
- Backwards compatibility is maintained with learning/ and courses/ directories

---

_Verified: 2026-03-08T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
