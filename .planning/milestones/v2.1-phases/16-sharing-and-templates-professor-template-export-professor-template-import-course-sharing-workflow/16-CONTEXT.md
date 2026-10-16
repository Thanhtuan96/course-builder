# Phase 16: Sharing and Templates - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable course syllabus sharing via exportable template files and one-command template import, so instructors and community members can share learning paths without sharing personal progress or notes.

</domain>

<decisions>
## Implementation Decisions

### Template Content Scope
- TEMPLATE.md contains: sections, objectives, capstone brief
- Minimal top-level metadata: course name, difficulty level, technology type (framework vs standalone)
- Each section includes: number, title, description, learning objectives (as bullet points)
- All sections start as Not Started (⬜)
- Capstone includes: project brief + suggested features + technical approach hints
- Include template version field for future compatibility

### Import Workflow
- Template-import creates a skeleton course; professor:next generates lectures (same flow as new-topic)
- Full metadata copied from template: name, difficulty, type, all extended metadata
- Auto-detect: check current directory first, prompt for path if not found
- Preview before create: show template preview to user before creating course

### Template Format/Schema
- JSON frontmatter at top of file for metadata
- Extended metadata fields: name, version, difficulty, type, author, description, tags, estimated hours, created date
- Sections structured as Markdown headers + lists (## 1. Section Title with bullet objectives)
- Validate on import: reject invalid templates with clear error messages
- Support migration: handle older template versions, convert to current format

### Sharing Mechanism (File-based)
- File-based export first; registry deferred to future phase
- professor:template-export auto-saves TEMPLATE.md to course folder
- User can share the .md file via email/chat/GitHub

### Template Ownership
- Imported template creates new course - user owns their copy
- Original creator credited in template metadata
- Imported courses keep author attribution in metadata

</decisions>

<specifics>
## Specific Ideas

- "Template should be valid Markdown readable without any tool"
- "Importable by any Professor installation"
- File sharing via standard channels (email, chat, GitHub)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Course file structure already exists: COURSE.md, LECTURE.md, CAPSTONE.md, NOTES.md, SCHEDULE.md
- Export command (professor:export) already handles Notion/Obsidian export - similar pattern for templates

### Established Patterns
- Git worktree courses at learning/{slug}/
- JSON/YAML frontmatter used elsewhere (export commands)
- Command structure: professor:{action} format

### Integration Points
- New commands: professor:template-export, professor:template-import
- Template files stored in course directory alongside COURSE.md

</code_context>

<deferred>
## Deferred Ideas

- Full template registry with upload/browse/search/install — future phase after v2.0
- URL-based template sharing — future phase

</deferred>

---

*Phase: 16-sharing-and-templates*
*Context gathered: 2026-03-15*
