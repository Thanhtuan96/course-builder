# Phase 5: Export Feature - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can push their entire learning journey — notes, answers, summaries — to Notion or Obsidian for long-term retention via MCP.

Success criteria:
1. User runs `professor:export` and is prompted to choose Notion or Obsidian
2. Notion export: Creates parent page with course properties, child pages for each lecture, separate "Notes" child page, code referenced (not embedded), capstone + summary as child pages
3. Obsidian export: Creates folder per course with .md files, user provides/configures vault path
4. If MCP not available, show helpful setup instructions (link to README)

</domain>

<decisions>
## Implementation Decisions

### Destination Selection Flow

- Uses `AskUserQuestion` immediately when user runs `professor:export`
- Options: Notion / Obsidian / Cancel
- After destination selected, proceed to export immediately (no preview step)
- If user cancels, professor acknowledges and exits gracefully

### Notion Page Structure

- **Parent page**: Course title, description, progress status, link to CAPSTONE
- **Child pages**: One page per lecture, Notes page, Capstone page, Summary/Retrospective page
- Total 4 child page types: lectures + notes + capstone + summary
- **Code handling**: Reference only (link to code files or exercises folder) — no inline code blocks

### Obsidian Folder Structure

- **Vault path**: User configures in settings (persisted, not asked each time)
- **Folder structure**: `/{vault}/{course-slug}/` containing:
  - `course.md` (course overview + syllabus + progress)
  - `lecture-1.md`, `lecture-2.md`, ... (each lecture content)
  - `notes.md` (all NOTES.md content)
  - `capstone.md` (capstone brief)
  - `summary.md` (retrospective/summary)
- **YAML frontmatter**: Standard format — title, date, tags, course-slug, status

### Export Content Scope

- **Everything** exported: NOTES.md, all LECTURE.md content, CAPSTONE.md, COURSE.md (syllabus + progress), summary/retrospective
- **Include review answers**: User's answers from `professor:review` sessions are part of their learning journey and get exported
- Summary/retrospective is generated at export time (not pre-existing file)

### MCP Unavailability Handling

- Detect MCP availability before attempting export
- If MCP unavailable for chosen destination: Show setup instructions with link to README
- **Destination-specific error messages**: If Notion MCP unavailable → show Notion setup; if Obsidian MCP unavailable → show Obsidian setup
- No auto-fallback — user explicitly chooses destination and sees relevant setup help if needed

</decisions>

<specifics>
## Specific Ideas

- AskUserQuestion flow for destination selection — aligns with Phase 2 design decisions
- NOTES.md already uses Obsidian-style timestamps (`[[YYYY-MM-DD]]`) — Phase 3 already prepared for Obsidian compatibility
- Code is referenced, not embedded — aligns with success criteria in ROADMAP.md

</specifics>

 区
## Existing Code Insights

### Reusable Assets

- `commands/professor/export.md` stub already exists (Phase 2 placeholder)
- `plugin.json` registers `professor:export` command
- `professor-skill/SKILL.md` contains core behavior spec
- Phase 3 NOTES.md format is already Obsidian-compatible

### Established Patterns

- AskUserQuestion used for structured input (Phase 2 decision)
- All state in Markdown files — export converts to target format
- Course files created after user confirms (not before)

### Integration Points

- `commands/professor/export.md` — routes to professor agent
- `agents/professor.md` — where export logic will be added
- `courses/{slug}/` — source of export content (COURSE.md, LECTURE.md, NOTES.md, CAPSTONE.md)

</code_context>

<deferred>
## Deferred Ideas

- File-based Obsidian export as fallback when Obsidian MCP unavailable — noted in Phase 3 as future requirement (EXP-04)

</deferred>

---

*Phase: 05-export-feature*
*Context gathered: 2026-03-07*
