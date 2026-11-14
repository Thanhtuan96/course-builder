---
name: professor:stuck
description: Get structured guidance when genuinely stuck (via Coach agent)
argument-hint: "[describe what you're stuck on]"
---

# Professor:stuck → Coach Agent

This command routes to the **Coach agent** which provides help through self-assessment dialogue.

## Before routing to Coach:

1. **Get the course context** — run `npx course-professor context {slug} --json`. If it exits non-zero, show its error and ask the learner which course — never guess a slug or path.
2. If `activeExercise` is set, read that file for context

## Route to Coach:

> "Coach will help you work through this. Let's start with a check-in — where are you right now?"

Delegate to the Coach agent with:
- The context JSON from step 1, **verbatim**
- Active exercise content (if any)
- User's stuck description: $ARGUMENTS

Coach will guide through self-assessment to identify the exact blocker, then break into smaller steps.

When Coach returns a `trail` block, record it with `npx course-professor trail {slug} --learner ".." --asked ".." --concept ".."` (same as `professor:review`). If that fails, say "⚠️ This round was not recorded" — never claim it was saved.
