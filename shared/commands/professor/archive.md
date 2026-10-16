---
name: professor:archive
description: "Archive completed course with full learning context"
---

When user runs `professor:archive`, follow the instructions below.

## Archive Behavior

**Step 1: Detect course type**

Check if the current course is in:
- `learning/{slug}/` → **worktree archive mode**
- `courses/{slug}/` → **legacy archive mode** (existing behavior)

> **Note:** non-programming courses (`**Kind**` is `quantitative`, `conceptual`, or `skill`) are **plain folders** under `learning/{slug}/` — there is no worktree or branch. Archive them the same way but skip the `git worktree remove` / `git branch -D` steps and just delete the plain folder.

**Step 2: Worktree archive mode (learning/)**

If course is in `learning/{slug}/`:

a. **Read source files**:
   - `learning/{slug}/COURSE.md`
   - `learning/{slug}/NOTES.md` (if exists)
   - `learning/{slug}/CAPSTONE.md`

b. **Check for incomplete sections**:
   - Parse COURSE.md for ⬜ status
   - If incomplete sections exist: Use AskUserQuestion:
     > "You have X incomplete sections. Archive anyway?"
     > Options: "Yes, archive" / "No, go back"
   - If user chooses "No, go back": Exit gracefully

c. **Generate SUMMARY.md** retrospective with format:
   ```markdown
   # Learning Summary: {Topic Name}

   ## Course Overview
   - Level: {level}
   - Started: {start_date}
   - Archived: {current_date}

   ## Sections Completed
   - Section 1: {Title} ({date})
   ...

   ## Key Concepts Learned
   {extracted from progress log}

   ## Notes
   {summary of NOTES.md content or "No notes recorded"}

   ## Capstone Project
   {capstone title} - {completed/not completed}
   ```

d. **Determine archive path**:
   - Primary: `.course_archive/{slug}/`
   - If exists: `.course_archive/{slug}-{YYYY-MM-DD}/`

e. **Create archive directory**: Use Bash mkdir -p

f. **Write archive files**:
   - COURSE.md
   - NOTES.md (if exists)
   - CAPSTONE.md
   - SUMMARY.md

g. **Remove worktree**:
   ```bash
   git worktree remove learning/{slug}/ --force
   git branch -D learning/{slug}
   ```

h. **Success message**:
   > "Course archived! Your learning journey is saved to:
   > - .course_archive/{slug}/
   > 
   > The git worktree has been removed.
   > 
   > Start a new course anytime with professor:new-topic."

**Step 3: Legacy archive mode (courses/)**

If course is in `courses/{slug}/` (legacy structure):

a. Follow the existing archive behavior from agents/professor.md:
   - Read source files (COURSE.md, NOTES.md, CAPSTONE.md)
   - Check for incomplete sections
   - Generate SUMMARY.md
   - Copy to .course_archive/{slug}/
   - Delete original course folder
   - Preserve exercises/ folder if it exists

**Archive path handling:**
- Primary: `.course_archive/{slug}/`
- If exists: `.course_archive/{slug}-{YYYY-MM-DD}/`

**Rules:**
- Worktree mode: Always remove worktree and branch after archiving
- Legacy mode: Never delete the exercises/ folder
- Never include LECTURE.md in archive
- Always auto-version if archive already exists
