# Phase 6: Course Archive and Context Management - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can archive completed courses with full learning context while leaving code exercises behind. Success criteria:
1. Course folder can include `exercises/` subfolder for code artifacts
2. User runs `professor:archive` after course completion to archive learning context
3. Archive creates `.course_archive/{slug}/` with COURSE.md, NOTES.md, CAPSTONE.md, and SUMMARY.md
4. Original course folder is deleted after successful archive
5. Exercises folder is left behind (user has code locally)

</domain>

<decisions>
## Implementation Decisions

### Archive Prerequisites
- **Warning but allow**: Users can archive incomplete courses
- **Warning content**: Shows count of incomplete sections ("You have X incomplete sections. Archive anyway?")
- User confirms to proceed with incomplete archive

### Conflict Handling
- **Auto-version with date**: If archive already exists, create new version with timestamp
- Format: `.course_archive/{slug}-YYYY-MM-DD/`
- No prompts needed — seamless versioning

### Summary Generation
- **Auto-generate**: SUMMARY.md created at archive time from existing content
- **Full content bundle**: Includes:
  - Course title and metadata
  - Sections completed count
  - NOTES.md content summary
  - Review session answers highlights
  - Capstone notes (if completed)
  - Timestamps for when course was started/archived

### Exercises Handling
- **Leave as-is**: The `exercises/` folder stays in original location
- No copy, no deletion of exercises
- Original course folder deleted but exercises remain

</decisions>

<specifics>
## Specific Ideas

- AskUserQuestion flow for confirmation (Phase 2/5 pattern)
- Auto-versioning similar to how export handles vault paths (Phase 5 pattern)
- Full content bundle ensures learning journey is fully preserved in archive

</specifics>

 区
## Existing Code Insights

### Reusable Assets

- `commands/professor/` — existing command structure for professor:*
- `agents/professor.md` — where archive logic will be added
- `courses/{slug}/` — source of content (COURSE.md, LECTURE.md, NOTES.md, CAPSTONE.md)

### Established Patterns

- AskUserQuestion for confirmation (Phase 2/5 decision)
- All state in Markdown files — archive is just file reorganization
- MCP unavailability handling (Phase 5 pattern) — not needed here since no external service

### Integration Points

- `commands/professor/archive.md` — new command file to create
- `plugin.json` — register new `professor:archive` command
- `agents/professor.md` — where archive logic lives

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-agent-able-to-get-and-manage-context-through-all-course*
*Context gathered: 2026-03-07*
