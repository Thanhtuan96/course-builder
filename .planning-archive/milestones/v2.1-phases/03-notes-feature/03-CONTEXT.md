# Phase 3: Notes Feature - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Add NOTES.md per-course file and implement `professor:note` command. Users can capture personal notes tied to a course, automatically available throughout learning. Notes are separate from the structured course progress tracking.

Success criteria:
1. When a new course starts via `professor:new-topic`, a NOTES.md file is automatically created in `courses/{slug}/`
2. User can run `professor:note` and the note is appended to the active course's NOTES.md with a timestamp

</domain>

<decisions>
## Implementation Decisions

### Note Structure

- **Format**: Flat format — timestamp + text only
- **File organization**: Single flat file per course (not organized by sections)
- **Timestamp format**: Obsidian-style link: `[[YYYY-MM-DD]]`
- **Note ordering**: Newest notes at top (like a feed)
- **Type tagging**: Note type included as tag after date, e.g., `[[2026-03-06]] [Question]`

### Note Input Method

- **Flow**: Uses AskUserQuestion to collect note type first, then saves
- **Questions**: Single AskUserQuestion with note type selection
- **Types**: 4 types — Question, Idea, Insight, To explore
- **Content**: Free-form text in the note (professor appends whatever user provides after type selection)

### Note Scope

- **Primary**: Per-course NOTES.md in `courses/{slug}/NOTES.md`
- **Fallback**: If no active course, notes go to `courses/notes.md` (global notes)
- **Multi-course detection**: Auto-detect from current course context (professor knows which course is active)

### Slash Command Behavior

- **Trigger**: `/professor:note` triggers AskUserQuestion flow
- **No active course**: Falls back to global notes file `courses/notes.md`
- **Confirmation**: Professor shows confirmation message with note preview

### Auto-Creation

- **new-topic**: NOTES.md created at the same time as COURSE.md and CAPSTONE.md (after user confirms syllabus)

</decisions>

<specifics>
## Specific Ideas

- AskUserQuestion flow for note input — explicitly requested, aligns with Phase 2 design decisions
- Obsidian-style timestamps — supports the Phase 5 export story (notes are already formatted for Obsidian import)
- Global fallback ensures users can always take notes even before starting a course

</specifics>

 区
## Existing Code Insights

### Reusable Assets

- `commands/professor/note.md` stub already exists at plugin root
- `plugin.json` already registers `professor:note` command
- `agents/professor.md` contains the agent brain — note behavior should be added there
- Course files: `courses/{slug}/COURSE.md`, `LECTURE.md`, `CAPSTONE.md` — NOTES.md follows same pattern

### Established Patterns

- Course files created after user confirms syllabus (not before)
- AskUserQuestion used for structured input in other commands (Phase 2 decision)
- All state in Markdown files — NOTES.md follows same pattern

### Integration Points

- `commands/professor/note.md` — routes to professor agent
- `agents/professor.md` — where note-taking logic lives
- `commands/professor/new-topic.md` — needs to create NOTES.md on course creation
- `courses/{slug}/` — where NOTES.md lives alongside other course files

</code_context>

<deferred>
## Deferred Ideas

- File-based Obsidian export as fallback — Phase 5
- `professor:export` destination selection — Phase 5

</deferred>

---

*Phase: 03-notes-feature*
*Context gathered: 2026-03-06*
