---
name: professor:switch
description: Switch between learning worktrees
argument-hint: "[tech-slug]"
---

When user runs `professor:switch`, switch context to a different learning worktree.

**Steps:**

1. **Parse the argument**:
   - If user provides `{tech-slug}` as argument: use it directly
   - If no argument provided: scan learning/ for available worktrees

2. **If no argument provided (interactive selection)**:
   - Scan `learning/` directory for subdirectories containing `COURSE.md`
   - If only one worktree found: use it automatically
   - If multiple worktrees found: Use `AskUserQuestion` to let user choose:
     > "Which course would you like to switch to?"
     > Options: List each worktree with topic name and progress

3. **If argument provided (direct switch)**:
   - Validate worktree exists at `learning/{slug}/`
   - If not found: Show available worktrees and prompt user to choose
   - If found: proceed with switching

4. **Switch context**:
   - Read `learning/{slug}/COURSE.md` to get current course state
   - Extract: topic name, current section, progress, last active date
   - Update agent's understanding of active course

5. **Display course status**:
   > "Switched to **[Topic Name]**
   > - Progress: X/Y sections complete
   > - Current: [Section Name] ([Status])
   > - Last active: [date]
   >
   > Run `professor:next` to continue where you left off."

**Edge cases:**
- If learning/ directory doesn't exist: Show message to create a course first
- If specified worktree doesn't exist: Show available worktrees list
- If no COURSE.md in worktree: Skip that worktree, warn user

**File path reference:** All paths are relative to current working directory where user runs Claude.

**Note:** Claude Code always operates from the user's current working directory. This command primarily updates the agent's context about which course is active — file operations still happen relative to cwd.

