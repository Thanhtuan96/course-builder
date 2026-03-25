---
name: professor:publish
description: "Publish your course or skill to the community registry via GitHub PR"
---

When user runs `professor:publish`, follow these steps to share your course or skill with the community.

## Step 1: Find Active Course Directory

Check both worktree and legacy structures:
- If already in `learning/{slug}/` or `courses/{slug}/` directory, use that.
- Otherwise, check for `COURSE.md` in `learning/` subdirectory.
- If not found there, check `courses/` subdirectory (legacy).
- If still not found, check for `COURSE.md` in the current working directory.
- If no active course is found, respond:
  > "No active course found. Run `/professor:new-topic` to start a course first."
- Stop here if no course exists.

## Step 2: Multi-Course Disambiguation

If multiple course directories exist in `learning/` (e.g., `learning/react-hooks/` and `learning/sql-auditor/`), ask the user which one to publish:
> "You have multiple courses. Which would you like to publish?"
List all `learning/` directories that contain `COURSE.md`.

## Step 3: Ask Content Type

Ask the user what they want to publish:
> "What would you like to publish — a course template or a skill you built?"
- **Course template**: A syllabus template anyone can learn from (no gate).
- **Skill I built**: A specialized skill you earned by completing a course + capstone.

Do NOT auto-detect from file presence — use the user's explicit choice.

## Step 4: Skill Gate Checks

If the user chose "Skill I built":
- Check that `COMPLETION.md` exists in the course directory. If missing, stop and say:
  > "Run `professor:capstone-review` to completion first — COMPLETION.md is required to publish a skill."
- Check that `SKILL.md` exists (from a prior `professor:skill-export`). If missing, stop and say:
  > "Run `professor:skill-export` first to generate your SKILL.md before publishing."

## Step 5: Extract and Collect Metadata

Read COURSE.md (for courses) or SKILL.md + COMPLETION.md (for skills) to extract available metadata.

Extract:
- **title**: from COURSE.md frontmatter `name` or SKILL.md frontmatter `name`
- **description**: from SKILL.md frontmatter `description` (skills) or COURSE.md
- **level**: from COURSE.md frontmatter (Beginner / Intermediate / Advanced / Expert)

Ask the user for any missing required fields:
- **GitHub username**: AskUserQuestion — "What is your GitHub username?"
- **description**: AskUserQuestion — "Give a 1-2 sentence description of this [course/skill]."
- **topics**: AskUserQuestion — "What topics does this cover?" (comma-separated list)

If level is missing from frontmatter, ask: "What difficulty level?" (Beginner / Intermediate / Advanced / Expert)

## Step 6: Confirm

> "About to open a PR to professor-skills-hub/courses-skills-registry. Proceed?"

If the user says no: stop and say "No problem — run `professor:publish` again when ready."

## Step 7: Version Check

Run Bash to check the CLI version:
```
npx course-professor --version
```
If the version is significantly older than expected, warn the user:
> "You may need to update: `npm install -g course-professor`"

## Step 8: Shell Out to CLI

Run via Bash tool:
```
npx course-professor publish --type [course|skill] --name [slug]
```

Capture stdout. Parse for the PR URL — look for a bare `https://github.com/` URL on its own line. On non-zero exit, surface stderr verbatim.

## Step 9: Report Result

If a PR URL was found in stdout:
> "Your [course/skill] has been submitted! PR: {PR_URL}"

If gh was unavailable (browser fallback):
> "gh CLI not available — here's your manual submission link: {URL}
> Your packaged files are staged at: {staging-path}
> Upload them to the PR after opening the browser."

If the command failed:
Surface the error message from stderr directly.
