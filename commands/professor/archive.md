---
name: professor:archive
description: "Archive a completed course without losing any work"
---

When user runs `professor:archive`, follow the instructions below.

## Archive Behavior

**Step 1: Find the course**

Every course lives in `learning/{slug}/`. Read `learning/{slug}/COURSE.md` for the topic name,
**Kind** and level. If no course exists, tell the learner to start one with
`professor:new-topic` and stop.

> Programming courses are git worktrees on branch `learning/{slug}`; other kinds are plain folders.
> The CLI step below handles both — this file never runs git commands itself.

**Step 2: Check for incomplete sections**

Parse COURSE.md for ⬜ status. If incomplete sections exist, ask one question (`AskUserQuestion`):

> "You have X incomplete sections. Archive anyway?"
> Options: "Yes, archive" / "No, go back"

If the learner chooses "No, go back", exit gracefully.

**Step 3: Generate SUMMARY.md**

Write `learning/{slug}/SUMMARY.md` before anything else, so the archive contains it:

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

**Step 4: Confirm**

Nothing is removed before the learner says yes. Ask for confirmation (`AskUserQuestion`):

> "Archive {Topic Name} now? Every file (lectures, learning log, exercises, notes, summary) is
> copied to `.course_archive/{slug}/`. A programming course keeps its commits on branch
> `archive/{slug}`."
> Options: "Yes, archive" / "No, cancel"

If the learner cancels, stop and leave the course untouched.

**Step 5: Archive through the CLI**

```bash
npx ronin-skillforce archive {slug}
```

The command copies the whole course directory except `.git` to `.course_archive/{slug}/` (or the
next free `-2`, `-3`, … target), then commits pending work, renames the branch to
`archive/{slug}` and removes the worktree — or removes the plain folder after verifying the copy.

Do not run `git worktree`, `git branch` or folder-deletion commands yourself. If the command exits
non-zero, show its message and stop: the course is still in `learning/{slug}/` unless the message
says otherwise.

**Step 6: Success message**

Use the result printed by the CLI (`archivedTo`, `branch`, `removed`):

> "Course archived! Your learning journey is saved to:
> - {archivedTo}/
>
> {History kept on branch archive/{slug}. | (plain-folder course: no branch)}
>
> Start a new course anytime with professor:new-topic."

**Rules:**
- Never overwrite or delete an existing archive — the CLI picks the next free suffix.
- Never remove anything before the CLI has verified the copy.
- Never run git worktree/branch commands in this file; the CLI owns them and never forces a removal.
- Everything except `.git` is preserved: `lectures/`, `exercises/`, `LEARNING-LOG.md`,
  `SCHEDULE.md`, `COMPLETION.md`, `SKILL.md`, `LECTURE.md`, `COURSE.md`, `CAPSTONE.md`, `NOTES.md`
  and `SUMMARY.md`.
