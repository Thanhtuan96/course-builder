<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Warning but allow**: Users can archive incomplete courses (warning shows count)
- **Auto-version with date**: If archive exists, create `.course_archive/{slug}-YYYY-MM-DD/`
- **Auto-generate SUMMARY.md**: Created at archive time with full content bundle
- **Leave exercises as-is**: The `exercises/` folder stays in original location, not copied or deleted

### Claude's Discretion
- AskUserQuestion flow for confirmation (Phase 2/5 pattern)
- Auto-versioning similar to how export handles vault paths (Phase 5 pattern)
- Full content bundle ensures learning journey is fully preserved in archive

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ARCH-01 | Course folder can include `exercises/` subfolder for code artifacts | Standard file operations - no special research needed |
| ARCH-02 | User runs `professor:archive` after course completion to archive learning context | Command implementation pattern established in existing commands |
| ARCH-03 | Archive creates `.course_archive/{slug}/` with COURSE.md, NOTES.md, CAPSTONE.md, and SUMMARY.md | File I/O patterns from export feature |
</phase_requirements>

# Phase 6: Course Archive and Context Management - Research

**Researched:** 2026-03-07
**Domain:** Claude Code plugin command implementation, file system operations
**Confidence:** HIGH

## Summary

Phase 6 implements course archiving functionality allowing learners to preserve their learning journey while leaving code exercises behind. The implementation follows established patterns from the export feature (Phase 5) for file handling and uses the existing AskUserQuestion flow for user confirmation. Key components: new `professor:archive` command, auto-generated SUMMARY.md, and file organization from `courses/{slug}/` to `.course_archive/{slug}/`.

**Primary recommendation:** Implement as single plan 06-01 following existing command patterns, registering in plugin.json, creating command file, and adding behavior to professor.md agent.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Claude Code plugin structure | N/A | Command registration via plugin.json | Established in Phase 1 |
| Markdown file operations | N/A | Read/Write for COURSE.md, NOTES.md, CAPSTONE.md | Core to entire plugin |
| AskUserQuestion | Built-in | User confirmation flow | Used in Phase 2/5 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Bash (mkdir/rm) | N/A | Directory operations for archiving | Creating archive folders, cleaning up |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Auto-versioning timestamp format | `{slug}-v2`, `{slug}_backup` | Date format is more readable and sortable |

**Installation:**
No new packages required - uses existing Claude Code built-ins.

## Architecture Patterns

### Recommended Project Structure
```
courses/
└── {topic-slug}/
    ├── COURSE.md       ← Source: copied to archive
    ├── LECTURE.md      ← NOT copied (disposable)
    ├── NOTES.md        ← Source: copied to archive (if exists)
    ├── CAPSTONE.md     ← Source: copied to archive
    └── exercises/      ← Source: LEFT BEHIND (not copied)

.course_archive/        ← New top-level folder (hidden)
└── {slug}/             ← Primary archive
    ├── COURSE.md
    ├── NOTES.md
    ├── CAPSTONE.md
    └── SUMMARY.md      ← Auto-generated retrospective
└── {slug}-2026-03-07/  ← Versioned archive (if exists)
    └── ...
```

### Pattern 1: AskUserQuestion Confirmation Flow
**What:** User confirmation before destructive operation (archive + delete)
**When to use:** When operation has lasting impact and user should explicitly confirm
**Example:**
```markdown
Use AskUserQuestion with:
> "You have X incomplete sections. Archive anyway?"
> Options: "Yes, archive" / "No, go back"
```
**Source:** Established in Phase 2 (professor:stuck) and Phase 5 (professor:export destination choice)

### Pattern 2: Auto-Versioned Directory Naming
**What:** Date-based versioning when target already exists
**When to use:** When multiple archives of the same course may exist
**Example:**
```bash
# If .course_archive/react-fundamentals/ exists
# Create .course_archive/react-fundamentals-2026-03-07/
```
**Source:** Similar pattern to export's vault path handling in Phase 5

### Pattern 3: Summary Generation from Existing Content
**What:** Create SUMMARY.md by extracting and synthesizing from COURSE.md, NOTES.md, progress log
**When to use:** When archiving to preserve learning journey
**Example:**
```markdown
# Learning Summary: {Topic Name}

## Course Overview
- Level: {level}
- Started: {date}
- Completed: {date}

## Sections Completed
- Section 1: {Title} ({date})
...

## Key Concepts Learned
- {concept from progress log}

## Notes Summary
{summary of NOTES.md content}

## Capstone
{capstone title} - {status}
```
**Source:** Similar to export's summary generation (agents/professor.md lines 381-386)

### Anti-Patterns to Avoid
- **Deleting exercises/**: The exercises folder is user code and should remain in place - never delete or move it
- **Including LECTURE.md**: This is disposable content overwritten by each professor:next - not part of the learning archive
- **Prompting for archive name**: Auto-version handles conflicts seamlessly - no user input needed

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File copying | Custom copy logic | Claude Code Write tool | Built-in, handles all cases |
| Directory existence check | Custom glob | Bash test -d | Simple, reliable |
| Date formatting | Custom date logic | JavaScript Date or Bash date | Handles all locales |

**Key insight:** All file operations are standard Claude Code operations - no external libraries needed.

## Common Pitfalls

### Pitfall 1: Forgetting exercises/ Folder
**What goes wrong:** Accidentally deleting or including the exercises folder
**Why it happens:** Focus on "archive everything" misses the explicit requirement to leave exercises behind
**How to avoid:** Explicitly check for exercises/ folder and document that it remains untouched
**Warning signs:** Any code that mentions "delete exercises" or "copy exercises" is wrong

### Pitfall 2: Overwriting Existing Archive
**What goes wrong:** Losing previous archive when re-archiving
**Why it happens:** Not checking if archive directory already exists
**How to avoid:** Use auto-versioning with date suffix - always create new directory, never overwrite
**Warning signs:** Any code that would delete `.course_archive/{slug}/` is wrong

### Pitfall 3: Including LECTURE.md
**What goes wrong:** Archiving disposable lecture content
**Why it happens:** LECTURE.md exists in the course folder and seems relevant
**How to avoid:** Only copy explicitly listed files (COURSE.md, NOTES.md, CAPSTONE.md) - skip LECTURE.md
**Warning signs:** Any code that copies LECTURE.md to archive is wrong

### Pitfall 4: Not Validating Course Exists
**What goes wrong:** Running archive when no course exists
**Why it happens:** Missing pre-check similar to other commands
**How to avoid:** Check courses/ directory has at least one course before proceeding
**Warning signs:** No check for "no active course" scenario

## Code Examples

### Archive Command Implementation Pattern
```markdown
### `professor:archive`

Archive the completed course with full learning context, leaving exercises behind.

**Steps:**

1. **Check for active course** — Read courses/ directory, require exactly one active course
   - If no course: "No active course found. There's nothing to archive."

2. **Read source files** — Load content to be archived:
   - COURSE.md (syllabus + progress)
   - NOTES.md (if exists)
   - CAPSTONE.md (project brief)

3. **Check for incomplete sections** — Parse COURSE.md for ⬜ status
   - If incomplete sections exist: Use AskUserQuestion:
     > "You have X incomplete sections. Archive anyway?"
     > Options: "Yes, archive" / "No, go back"
   - If user chooses "No, go back": Exit gracefully

4. **Generate SUMMARY.md** — Create comprehensive retrospective:
   ```markdown
   # Learning Summary: {Topic Name}
   
   ## Course Overview
   - Level: {level}
   - Started: {start_date}
   - Archived: {current_date}
   
   ## Sections Completed
   - Section 1: {Title} ({date})
   - Section 2: {Title} ({date})
   ...
   
   ## Key Concepts Learned
   {extracted from progress log}
   
   ## Notes
   {summary of NOTES.md or "No notes recorded"}
   
   ## Capstone Project
   {capstone title} - {completed/not completed}
   ```

5. **Determine archive path**:
   - Primary: `.course_archive/{slug}/`
   - If exists: `.course_archive/{slug}-{YYYY-MM-DD}/`

6. **Create archive directory** — Use Bash mkdir -p

7. **Write archive files**:
   - COURSE.md
   - NOTES.md (if exists)
   - CAPSTONE.md
   - SUMMARY.md

8. **Delete original course folder** — Use Bash rm -rf courses/{slug}/
   - DO NOT delete exercises/ subfolder if it exists

9. **Success message**:
   > "Course archived! Your learning journey is saved to:
   > - .course_archive/{slug}/
   > 
   > The exercises/ folder remains in place at courses/{slug}/exercises/.
   > 
   > Start a new course anytime with professor:new-topic."

**Rules:**
- Never delete the exercises/ folder
- Never include LECTURE.md in archive
- Always auto-version if archive already exists
- Generate SUMMARY.md from existing content
```

**Source:** Pattern derived from export.md (lines 326-538) and context decisions

### Plugin Registration
```json
// Add to plugin.json commands array:
{ "name": "professor:archive", "file": "commands/professor/archive.md" }
```

**Source:** plugin.json existing structure

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No archive feature | Dedicated archive command with SUMMARY.md | Phase 6 (this phase) | Preserves learning journey |
| Export for preservation | Archive vs Export distinction | Phase 6 | Export = external, Archive = local |

**Deprecated/outdated:**
- None relevant to this phase

## Open Questions

1. **Should archived courses be listable?**
   - What we know: Archive folders exist in `.course_archive/`
   - What's unclear: Should `professor:progress` or new command show archived courses?
   - Recommendation: Out of scope for v1.0 - focus on archive creation only

2. **What happens if NOTES.md doesn't exist?**
   - What we know: NOTES.md is created by professor:note but not all users use it
   - What's unclear: Should we create empty NOTES.md or skip it?
   - Recommendation: Skip if doesn't exist, don't create empty file

## Validation Architecture

> Skip this section entirely if workflow.nyquist_validation is explicitly set to false in .planning/config.json. If the key is absent, treat as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | N/A - Claude Code plugin (no test runner) |
| Config file | None |
| Quick run command | N/A - Manual verification |
| Full suite command | N/A - Manual verification |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-01 | exercises/ folder remains after archive | Manual | Check courses/{slug}/exercises/ exists post-archive | ✅ |
| ARCH-02 | professor:archive command works | Manual | Run command, verify archive created | ✅ |
| ARCH-03 | Archive contains all 4 required files | Manual | Check .course_archive/{slug}/ has all files | ✅ |

### Sampling Rate
- **Per task commit:** Manual verification of command behavior
- **Per wave merge:** N/A
- **Phase gate:** Manual test of full archive flow

### Wave 0 Gaps
- None — no test infrastructure needed for Claude Code plugin commands

## Sources

### Primary (HIGH confidence)
- agents/professor.md - Command implementation patterns, AskUserQuestion usage
- plugin.json - Command registration pattern
- Phase 5 export.md - File handling patterns, SUMMARY generation

### Secondary (MEDIUM confidence)
- CONTEXT.md - User decisions for archive implementation

### Tertiary (LOW confidence)
- None required

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses existing Claude Code built-ins only
- Architecture: HIGH - Follows established patterns from Phase 2/5
- Pitfalls: HIGH - Clear anti-patterns identified from requirements

**Research date:** 2026-03-07
**Valid until:** 90 days (stable - no external dependencies)
