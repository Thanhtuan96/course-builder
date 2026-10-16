# Phase 17: Auto-generate Exercise Files - Context

**Gathered:** 2026-03-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-generate exercise files for each section that users can work on independently. Exercises should be usable without the learning framework scaffolding — pure practice files with instructions users complete themselves.

**Phase 8 context:** Already creates exercise files with skeleton code (function signatures, TODO comments). This phase enhances/generates exercises that work standalone.

</domain>

<decisions>
## Implementation Decisions

### Exercise Format
- **Coding exercises**: Generate skeleton code with function signatures and TODO comments — user fills in the implementation
- **Non-coding exercises** (marking, math, conceptual): Pure instructions only, no code scaffolding
- Decision made per-section based on topic type detection

### File Structure
- One exercise file per section
- Naming pattern: `exercises/{NN}-{section-slug}.{ext}`
- Example: `exercises/01-intro-javascript.js`, `exercises/02-variables.py`

### Technology Templates
- Auto-detect from course/topic type:
  - React/JS → `.jsx` or `.js`
  - Python → `.py`
  - SQL → `.sql`
  - Non-coding → `.md` (instructions only)
- Default to `.js` if unclear

### Lecture Integration
- Exercises are separate files in `exercises/` directory
- LECTURE.md contains concept explanation
- Exercise files contain practice tasks only
- Active exercise reference in COURSE.md links to exercises/

### Claude's Discretion
- Exact TODO comment phrasing
- How to detect coding vs non-coding topics
- Skeleton code complexity level (minimal vs moderate)

</decisions>

<specifics>
## Specific Ideas

- "If related to coding, generate skeleton code and let user fill out. If not related to coding (marking, math, etc.), then pure instructions only"
- Exercises should be self-contained — user can open the file and work without needing LECTURE.md visible

</specifics>

\code_context
## Existing Code Insights

### Reusable Assets
- `commands/professor/next.md`: Contains existing exercise file creation logic (Phase 8)
- Pattern: `exercises/{NN}-{section-slug}.{ext}` already established
- COURSE.md has "Active exercise" field already

### Established Patterns
- Exercise files created on `professor:next` 
- Active exercise tracked in COURSE.md frontmatter
- Web UI already has exercises panel (LecturePanel.jsx)

### Integration Points
- Extend existing `professor:next` exercise creation logic
- Reuse same file path pattern and COURSE.md field updates
- Exercises API already exists in web/server.js

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-auto-generate-exercise-files*
*Context gathered: 2026-03-15*
