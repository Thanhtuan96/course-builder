# Phase 8: Auto-Create Exercise Files - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

When user runs `professor:next` to start a lecture, automatically create the exercise files they'll need — instead of making them create files manually. The exercise is described in LECTURE.md but currently users have to manually create their working files.

This applies to both standalone courses (algorithms, scripts, SQL) and framework/library courses (Next.js, Express, Django).

</domain>

<decisions>
## Implementation Decisions

### Exercise file location
- `exercises/` subfolder in course root (e.g., `learning/react-fundamentals/exercises/`)
- Simple file naming: `exercises/01-intro.js`, `exercises/02-state.js` or just `exercises/exercise.js`
- Structure inside exercises/ determined by professor based on topic type:
  - Standalone: `exercises/01-intro.js`, `exercises/02-state.js`
  - Framework: `exercises/` is a project scaffold

### Active Exercise Field in COURSE.md
- **NEW** field: `**Active exercise**: exercises/01-intro.js`
- Written by professor:next when creating exercise file
- professor:review/hint/stuck read COURSE.md → see Active exercise → load that file
- professor:done clears the Active exercise field

### Why this approach?
- COURSE.md is always loaded first at conversation start
- No need to scan entire codebase
- Minimal changes - leverages existing COURSE.md loading pattern

### Trigger timing
- **Automatic on `professor:next`** — Seamless, files ready immediately when lecture loads
- No extra command needed from user

### File content
- **Template files** — Professor decides detail level based on topic
- Standalone courses: skeleton with comments (function signature, task description, hint references)
- Framework courses: full project scaffold on new-topic, then just add section files with TODO comments

### File naming
- **section-{N} subfolder** — `exercises/section-1/exercise.js`, `exercises/section-2/exercise.js`
- Maps directly to section numbers in COURSE.md

</decisions>

<specifics>
## Specific Ideas

- "professor:next làm hai việc: 1. Tạo skeleton file tại exercises/section-{N}/exercise.{ext} 2. Ghi path vào COURSE.md field mới: **Active exercise**"
- "Khi learner dùng professor:review/hint/stuck: Đọc COURSE.md → thấy Active exercise field → chỉ đọc file đó"
- "professor:done → xóa Active exercise field khỏi COURSE.md"
- Framework detection: professor:new-topic detects if topic is framework/library → scaffold project; otherwise → single file templates

</specifics>

 @n
## Existing Code Insights

### Reusable Assets
- `professor:next` command exists - will need modification for file creation
- LECTURE.md format includes exercise section - can extract exercise description from there
- SKILL.md references `/exercises/{section-file}.{ext}` pattern - aligns with this decision

### Established Patterns
- Course files: COURSE.md, NOTES.md, CAPSTONE.md, LECTURE.md
- Section numbering: uses emoji status (⬜ Not started, 🔄 In progress, ✅ Done)
- Sequential naming exists in COURSE.md section IDs

### Integration Points
- `professor:next` - create exercise file, write "Active exercise" field to COURSE.md
- `professor:new-topic` - for framework courses, scaffold project in exercises/
- `professor:review` - read COURSE.md, get Active exercise path, load that file
- `professor:hint` - same as review, load Active exercise file
- `professor:stuck` - same as review, load Active exercise file
- `professor:done` - clear "Active exercise" field from COURSE.md

</code_context>

<deferred>
## Deferred Ideas

- None - this phase covers auto-creation of exercise files

</deferred>

---

*Phase: 08-when-initial-user-start-lecture*
*Context gathered: 2026-03-08*
