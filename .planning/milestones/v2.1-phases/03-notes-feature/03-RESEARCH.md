# Phase 3: Notes Feature - Research

**Researched:** 2026-03-06
**Domain:** Claude Code plugin command implementation, file I/O in Markdown
**Confidence:** HIGH

## Summary

This phase implements personal notes functionality for the Professor plugin. The implementation requires two key files: updating `commands/professor/note.md` to handle user input via AskUserQuestion, and modifying `commands/professor/new-topic.md` to auto-create NOTES.md when a course starts. The professor agent already has session context restoration that detects active courses, which provides the foundation for note routing.

**Primary recommendation:** Implement `professor:note` as a command that routes to the professor agent, which handles the AskUserQuestion flow, active course detection, and file append operations. Update `new-topic.md` to create NOTES.md alongside COURSE.md and CAPSTONE.md.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Format**: Flat format — timestamp + text only
- **File organization**: Single flat file per course (not organized by sections)
- **Timestamp format**: Obsidian-style links: `[[YYYY-MM-DD]] [[HH:MM]]`
- **Note ordering**: Newest notes at top (like a feed)
- **Type tagging**: Note type included as tag in timestamp, e.g., `[[2026-03-06]] [[14:32]] [Question]`
- **Input Method**: Uses AskUserQuestion to collect note type first, then saves
- **Types**: 4 types — Question, Idea, Insight, To explore
- **Scope**: Per-course NOTES.md in `courses/{slug}/NOTES.md`, fallback to `courses/notes.md` if no active course
- **Auto-creation**: NOTES.md created at the same time as COURSE.md and CAPSTONE.md (after user confirms syllabus)

### Claude's Discretion
- Confirmation message format — can be adjusted as long as it shows note preview

### Deferred Ideas (OUT OF SCOPE)
- File-based Obsidian export as fallback — Phase 5
- `professor:export` destination selection — Phase 5

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CMD-13 | User can run `professor:note` to append a note to the current course's NOTES.md | Commands use AskUserQuestion for input (quiz.md, stuck.md patterns); professor agent has Read/Write tools and session context restoration |
| NOT-01 | NOTES.md file is automatically created in `courses/{slug}/` when a new course starts | new-topic.md creates COURSE.md and CAPSTONE.md after confirmation; same pattern applies to NOTES.md |

</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Claude Code plugin system | N/A | Command/agent framework | Required for plugin architecture |
| Markdown files | N/A | All data persistence | No external DB per project constraint |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| AskUserQuestion | Claude Code API | Collect structured user input | Note type selection in professor:note |
| Read tool | Claude Code API | Load course context | Detect active course, read NOTES.md |
| Write tool | Claude Code API | Append notes, create files | Write NOTES.md entries and auto-creation |

### Implementation Pattern
This is a **Claude Code plugin** — no npm packages, no build step. All functionality is implemented through:
- Command markdown files with frontmatter
- Agent markdown files with behavior instructions
- File I/O via Claude Code's Read/Write tools

---

## Architecture Patterns

### Recommended Project Structure

```
courses/
└── {topic-slug}/
    ├── COURSE.md       ← Syllabus + progress tracker
    ├── LECTURE.md     ← Current active section
    ├── CAPSTONE.md    ← Capstone project brief
    └── NOTES.md       ← Personal notes (NEW in Phase 3)
```

### Pattern 1: Command Routing to Agent

**What:** Commands delegate to professor agent for execution
**When to use:** All professor:* commands follow this pattern
**Example:**
```markdown
# commands/professor/note.md
---
name: professor:note
description: "Save a note to your course"
---

Route to the professor agent for note-taking flow.
The agent will:
1. Detect active course from session context
2. Use AskUserQuestion to collect note type
3. Append timestamped note to NOTES.md
4. Show confirmation with note preview
```

### Pattern 2: AskUserQuestion with Options

**What:** Collect structured input with predefined options
**When to use:** When user needs to select from known options
**Example (from quiz.md):**
```markdown
Use AskUserQuestion to ask the scope before generating questions:
> "What would you like to be quizzed on?"

Options: "Current section" / "Entire course so far" / "Specific concept (describe below)"
```

### Pattern 3: Active Course Detection

**What:** Professor agent automatically detects which course is active
**When to use:** Any command that needs course context
**Example (from professor.md session start):**
```markdown
## Session Start — Context Restoration

1. Check if a `courses/` folder exists in the current working directory
2. Depending on what you find, respond as follows:

**Scenario A — No `courses/` directory or directory is empty:**
> "No active course found..."

**Scenario B — Exactly one course found:**
Read `courses/{topic-slug}/COURSE.md` and greet with brief status
```

### Pattern 4: File Append with Prepend

**What:** Add new content at top, preserve existing content
**When to use:** Notes feed pattern (newest first)
**Example:**
```typescript
// Read existing NOTES.md
const existing = await read("courses/{slug}/NOTES.md")

// Create new note entry
const timestamp = `[[${date}]] [[${time}]]`
const newEntry = `${timestamp} [${noteType}]\n${noteContent}\n\n`

// Write: new entry + existing content
await write(`courses/{slug}/NOTES.md`, newEntry + existing)
```

### Pattern 5: Fallback to Global Notes

**What:** When primary target unavailable, use secondary location
**When to use:** No active course scenario
**Example:**
```typescript
// If active course exists:
const notesPath = `courses/${activeCourseSlug}/NOTES.md`

// If no active course:
const notesPath = "courses/notes.md"
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User input collection | Custom input handling | AskUserQuestion API | Standard Claude Code API for structured input |
| Course detection | Custom context scanning | Professor agent's session restoration | Already implemented in agent |
| File storage | Database or external storage | Markdown files in courses/ | Project constraint: no external DB |

---

## Common Pitfalls

### Pitfall 1: Path Resolution Error
**What goes wrong:** Notes saved to wrong directory (plugin directory vs user cwd)
**Why it happens:** `courses/` must be relative to user's working directory, not plugin install path
**How to avoid:** Always resolve paths from `cwd`. The agent instructions explicitly state: "All `courses/` paths are relative to the current working directory"
**Warning signs:** Notes appear in `~/.claude/plugins/professor/` instead of user's project

### Pitfall 2: Timestamp Format Inconsistency
**What goes wrong:** Notes not sorted correctly, Obsidian-style links broken
**Why it happens:** Using different date formats across notes
**How to avoid:** Use exact format `[[YYYY-MM-DD]] [[HH:MM]]` per locked decision
**Warning signs:** Notes out of order when viewed in Obsidian

### Pitfall 3: Note Type Not Captured
**What goes wrong:** AskUserQuestion returns but note type not stored
**Why it happens:** Flow skips from question to content without storing type
**How to avoid:** Use two-phase AskUserQuestion: first type selection, then free-form content
**Warning signs:** Notes missing [Question]/[Idea]/[Insight]/[To explore] tags

### Pitfall 4: Empty Course Detection
**What goes wrong:** Fallback triggers even when course exists
**Why it happens:** Not reading COURSE.md to verify active course, only checking folder existence
**How to avoid:** The professor agent's session restoration already reads COURSE.md; rely on that context
**Warning signs:** Notes go to global even during active course

### Pitfall 5: Race Condition on First Note
**What goes wrong:** First note fails because NOTES.md doesn't exist
**Why it happens:** Append operation on non-existent file
**How to avoid:** Check if NOTES.md exists; if not, create with just the new note
**Warning signs:** "File not found" errors on first note to new course

---

## Code Examples

### Example 1: AskUserQuestion for Note Type

**Source:** Adapted from quiz.md and stuck.md patterns

```markdown
Use AskUserQuestion to collect the note type first:
> "What type of note would you like to add?"

Options: "Question" / "Idea" / "Insight" / "To explore"

After they select the type, ask for the note content:
> "What's your note?"
```

### Example 2: Active Course Detection Flow

**Source:** professor.md session restoration

```markdown
1. At session start, professor agent already reads courses/{slug}/COURSE.md
2. Store the active course slug in context
3. When professor:note runs, check stored context for active course
4. If context shows active course → use courses/{slug}/NOTES.md
5. If no active course → use courses/notes.md (global fallback)
```

### Example 3: Appending Note with Timestamp

**Source:** Based on project file patterns

```markdown
When saving the note:

1. Get current timestamp:
   - Date: [[YYYY-MM-DD]] (e.g., [[2026-03-06]])
   - Time: [[HH:MM]] (e.g., [[14:32]])

2. Build note entry:
   [[2026-03-06]] [[14:32]] [Question]
   Your note content here...

3. Read existing NOTES.md (if it exists)
4. Prepend new entry to existing content
5. Write back to NOTES.md
```

### Example 4: NOTES.md Auto-Creation in new-topic

**Source:** new-topic.md course creation flow

```markdown
After user confirms syllabus, write files:

1. COURSE.md — existing behavior
2. CAPSTONE.md — existing behavior
3. NOTES.md — NEW in Phase 3

   NOTES.md initial content:
   # 📝 Notes: [Topic Name]
   
   ---
   
   (empty — notes added via professor:note)
```

### Example 5: Confirmation Message

**Source:** User constraint: "Professor shows confirmation message with note preview"

```markdown
Note saved! 📝

[[2026-03-06]] [[14:32]] [Question]
Your note content here...

Saved to: courses/react-fundamentals/NOTES.md

Add another note? Run `/professor:note` anytime.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual notes via text editor | Integrated professor:note command | Phase 3 (this phase) | Notes automatically tied to courses, timestamped |
| No notes feature | Per-course NOTES.md | Phase 3 (this phase) | Structured note-taking integrated into learning flow |
| Global notes only | Course-aware + global fallback | Phase 3 (this phase) | Context-aware note storage |

**Current state:** Phase 3 implements the notes feature as described in requirements. No deprecated approaches.

---

## Open Questions

1. **How does the professor agent persist active course context across messages?**
   - What we know: Session restoration reads COURSE.md at conversation start; the agent has tools=Read,Write,Bash,WebSearch
   - What's unclear: Whether the active course is stored in a variable or re-detected each time
   - Recommendation: Use the session restoration pattern — re-read COURSE.md at note command time to detect active course

2. **What happens if NOTES.md exists but is corrupted/empty?**
   - What we know: File operations use Read/Write tools
   - What's unclear: Error handling approach
   - Recommendation: Wrap in try/catch; if Read fails or returns empty, treat as new file

3. **Should there be a limit on note size?**
   - What we know: No requirement specified
   - What's unclear: Whether very large notes could cause issues
   - Recommendation: No limit for Phase 1; monitor for issues

---

## Validation Architecture

> This section included because workflow.nyquist_validation is true in .planning/config.json

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (Claude Code plugin — no automated test runner) |
| Config file | N/A |
| Quick run command | N/A (manual verification) |
| Full suite command | N/A (manual verification) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Manual Verification | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| CMD-13 | User runs professor:note, note appended to NOTES.md | Manual | 1. Start a course with professor:new-topic 2. Run /professor:note 3. Select note type 4. Enter note content 5. Verify NOTES.md contains timestamped entry | ✅ |
| NOT-01 | NOTES.md auto-created when new course starts | Manual | 1. Run professor:new-topic 2. Confirm syllabus 3. Check courses/{slug}/NOTES.md exists | ✅ |

### Manual Testing Protocol

**For CMD-13 (professor:note):**

1. **Setup**: Start a course with `professor:new-topic`
2. **Trigger**: Run `/professor:note`
3. **Input**: 
   - Select note type from options
   - Enter note content
4. **Verify**:
   - NOTES.md created in correct location
   - Timestamp format correct: `[[YYYY-MM-DD]] [[HH:MM]]`
   - Note type tag present: `[Question]`, `[Idea]`, `[Insight]`, or `[To explore]`
   - Note content appears after timestamp
5. **Additional notes**: Repeat steps 2-4; verify new notes prepend (appear at top)

**For NOT-01 (auto-creation):**

1. **Setup**: None (fresh state)
2. **Trigger**: Run `professor:new-topic`, provide topic, confirm syllabus
3. **Verify**:
   - courses/{slug}/NOTES.md exists
   - File contains header: `# 📝 Notes: [Topic Name]`
   - File is otherwise empty (ready for notes)

**For fallback scenario:**

1. **Setup**: No active course
2. **Trigger**: Run `/professor:note`
3. **Verify**:
   - Notes go to courses/notes.md (global fallback)
   - File created if doesn't exist

### Wave 0 Gaps
- None — Phase 3 is a self-contained feature with no infrastructure dependencies
- Manual testing covers all requirements
- No test framework setup needed (Claude Code plugin constraint)

---

## Sources

### Primary (HIGH confidence)
- **agents/professor.md** — Session restoration, file paths, command behaviors
- **commands/professor/new-topic.md** — Course creation flow (to add NOTES.md)
- **commands/professor/quiz.md** — AskUserQuestion pattern with options
- **commands/professor/stuck.md** — AskUserQuestion with structured options
- **plugin.json** — Command registration (professor:note already registered)

### Secondary (MEDIUM confidence)
- **CLAUDE.md** — Project context, plugin structure, no build step constraint

### Tertiary (LOW confidence)
- None required — implementation follows established patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Claude Code plugin architecture is well-defined
- Architecture: HIGH — Command→agent routing pattern established in existing commands
- Pitfalls: HIGH — Path resolution and timestamp format are clear from documentation
- AskUserQuestion: HIGH — Multiple examples in existing commands (quiz, stuck)

**Research date:** 2026-03-06
**Valid until:** 30 days (stable plugin architecture, no fast-moving changes expected)

---

## Implementation Checklist

Based on research, the following tasks need to be planned:

- [ ] Update `commands/professor/note.md` — implement AskUserQuestion flow, note routing
- [ ] Update `commands/professor/new-topic.md` — add NOTES.md auto-creation
- [ ] Test: Create new course → verify NOTES.md created
- [ ] Test: Run professor:note → verify note appended with correct format
- [ ] Test: No course scenario → verify global fallback works
- [ ] Test: Multiple notes → verify newest at top (feed order)
