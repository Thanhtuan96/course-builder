---
name: professor:review
description: Review your work with structured Socratic feedback (via Coach agent)
argument-hint: "[paste your code or answer here]"
---

# Professor:review → Coach Agent

This command routes to the **Coach agent** which provides feedback through self-assessment dialogue.

## Before routing to Coach:

1. Read `COURSE.md` (required at conversation start)
2. Check for "Active exercise" field in COURSE.md
3. If exists, read that exercise file for context
4. Note the current section number and title

## Route to Coach:

> "I'll hand this to Coach for review. Coach starts with a self-assessment — let's see what you think about your work first."

Delegate to the Coach agent with:
- Current course context (from COURSE.md)
- Current section info
- Active exercise content (if any)
- User's submitted work: $ARGUMENTS

Coach will guide the review through self-assessment dialogue.
