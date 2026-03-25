---
name: professor:skill-export
description: "Encode your capstone into a reusable SKILL.md for the community registry"
---

When user runs `professor:skill-export`, follow these steps to encode your capstone project into a shareable SKILL.md:

## Step 1: Find Active Course Directory

Check both worktree and legacy structures:
- If already in `learning/{slug}/` or `courses/{slug}/` directory, use that.
- Otherwise, check for `COURSE.md` in `learning/` subdirectory.
- If not found there, check `courses/` subdirectory (legacy).
- If still not found, check for `COURSE.md` in the current working directory.
- If no active course is found, respond:
  > "No active course found. Run `/professor:new-topic` to start a course first."
- Stop here if no course exists.

## Step 2: Hard Gate — COMPLETION.md Must Exist

Read `COMPLETION.md` from the course directory. If it does not exist, stop and say:
> "Run `professor:capstone-review` to completion first — COMPLETION.md is required before you can export a skill. The verdict must be 'Course Complete'."

If `COMPLETION.md` exists but the `verdict` field is NOT `Course Complete`, stop and say:
> "Your capstone hasn't been marked complete yet. Finish the capstone review with a 'Course Complete' verdict first."

## Step 3: Read Source Files

Read all three files from the course directory:
- `COMPLETION.md` — contains `capstone_summary` (what the learner built)
- `CAPSTONE.md` — the original project brief and scope
- `NOTES.md` — if present, learner's notes and insights

Extract:
- `capstone_summary` from COMPLETION.md frontmatter
- The skills demonstrated (from CAPSTONE.md features and capstone_summary)
- Key patterns or techniques the learner used (inferred from their summary)

## Step 4: Generate SKILL.md

Write `learning/{slug}/SKILL.md` (or `courses/{slug}/SKILL.md` — same directory as COMPLETION.md) with 50–150 lines:

```markdown
---
name: {slug}
description: >
  {2-3 sentence description of what this skill does, derived from capstone_summary}
triggers:
  - "I want to {capstone_summary fragment}"
  - "Help me {key capability from capstone}"
  - "Review my {related work}"
---

# {slug}

You are a specialized assistant that {1-sentence description of the skill's purpose, derived from the learner's capstone}.

## Core Behavior Rules

1. **Focus area**: This skill specializes in {domain from capstone_summary}.
2. **Approach**: {Derived from what the learner demonstrated — e.g., "Starts by asking clarifying questions before diving into solutions"}
3. **Constraints**: {Learned constraints or standards from the capstone — e.g., "Always validates edge cases first"}
4. **Tone**: {Style demonstrated — e.g., "Socratic — guides with questions, never gives full solutions"}

## Example Prompts

- "I need help with {problem in skill domain}"
- "Review my approach to {skill topic}"
- "What's the best way to handle {specific challenge from capstone}?"
- "Can you spot any issues with this implementation?"
- "Walk me through the tradeoffs in this design decision"
```

**Guidelines for generating the SKILL.md:**
- Keep total length between 50–150 lines
- Frontmatter `name` should be the course slug (e.g., `react-hooks`)
- `description` should be concrete — what this skill helps with, not generic
- `triggers` should be 3-5 realistic prompts someone would actually type
- Core Behavior Rules should be derived from what the learner actually built and demonstrated — not invented
- Example Prompts should be specific to the skill domain, not generic

## Step 5: Confirm to User

After writing the file, say:
> "SKILL.md written to `{path}`. This encodes what you demonstrated in your capstone into a reusable skill format.
>
> When you're ready to share it with the community, run `professor:publish`."
