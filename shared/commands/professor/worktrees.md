---
name: professor:worktrees
description: List all learning worktrees and archived courses
---

When user runs `professor:worktrees`, list all available learning courses.

> **Note:** non-programming courses (`**Kind**` = `quantitative` / `conceptual` / `skill`) are plain folders under `learning/{slug}/` (no worktree) — list them alongside worktree courses; the display stays the same.

**Steps:**

1. **Check for learning/ directory** (new worktree courses):
   - If `learning/` directory exists, scan for subdirectories containing `COURSE.md`
   - For each worktree found, extract:
     - Tech slug (directory name)
     - Topic name (from COURSE.md title)
     - Last active date (from COURSE.md)
     - Current section status (progress percentage)

2. **Check for archived courses**:
   - If `.course_archive/` directory exists, scan for archived courses
   - Display archived courses in a separate section

3. **Check for legacy courses/** directory:
   - If courses/ exists (legacy structure), scan for any remaining courses
   - Note: These are the old-style courses not in worktrees

4. **Display results**:
   
   If worktrees found:
   ```
   ## 📚 Learning Worktrees
   
   | # | Topic | Last Active | Progress |
   |---|-------|-------------|----------|
   | 1 | [topic-name] | [date] | X/Y sections |
   ...
   ```
   
   If archived courses found:
   ```
   ## 📦 Archived Courses
   
   | # | Topic | Archived Date |
   |---|-------|----------------|
   | 1 | [topic-name] | [date] |
   ...
   ```
   
   If nothing found:
   > "No learning worktrees or archived courses found. Start a new course with `professor:new-topic`."

5. **Handle edge cases**:
   - If learning/ doesn't exist: show helpful message about creating courses
   - If worktree contains incomplete data: skip gracefully, log warning

**File path reference:** All paths are relative to current working directory where user runs Claude.

