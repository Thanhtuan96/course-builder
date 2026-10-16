# Phase 7: Git Worktree Courses - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Each technology learned = one git worktree. User's code lives in the worktree alongside learning files. When archived, learning context is preserved to `.course_archive/` before worktree is deleted. This is a new course structure - existing `courses/` directories continue to work as before.

</domain>

<decisions>
## Implementation Decisions

### Worktree location
- Git worktrees created at `learning/{tech-slug}/`
- Example: Learning React → `learning/react-fundamentals/`

### Course creation flow
- `professor:new-topic` automatically creates git worktree at `learning/{slug}/`
- No manual git worktree add required
- Seamless experience - user doesn't need to know git internals

### Worktree management
- New commands: `professor:worktrees` - list all learning worktrees
- New command: `professor:switch {tech}` - switch between worktrees
- Other management: create (via new-topic), archive (via professor:archive)

### Archive behavior
- When archiving: copy learning files to `.course_archive/{slug}/`, THEN delete entire worktree
- User's code is deleted with the worktree (user's choice)
- This differs from legacy archive behavior (which kept exercises)

### Existing courses
- `courses/` directory continues to work as before (backwards compatible)
- New worktree courses go to `learning/` - both coexist separately
- No auto-migration

</decisions>

<specifics>
## Specific Ideas

- Worktree location: `learning/{tech-slug}/` - keeps learning organized, separate from main repo
- Auto-create worktree on new-topic - seamless experience
- Delete entire worktree on archive - user's code goes with it (intentional, different from v1.0 behavior)

</specifics>

 <code_context>
## Existing Code Insights

### Reusable Assets
- `professor:archive` command already exists - will need modification for worktree support
- `.course_archive/{slug}/` path already established
- `courses/{slug}/` structure can inform learning/ structure

### Established Patterns
- Course files: COURSE.md, NOTES.md, CAPSTONE.md, LECTURE.md
- Archive creates SUMMARY.md from existing content
- Slug generation from topic names

### Integration Points
- `professor:new-topic` - add worktree creation
- `professor:archive` - adapt for worktree deletion
- New commands: `professor:worktrees`, `professor:switch`

</code_context>

<deferred>
## Deferred Ideas

- Phase 8: Auto-create exercise files when starting lecture (separate phase)

</deferred>

---

*Phase: 07-git-worktree-courses*
*Context gathered: 2026-03-08*
