---
name: professor:stuck
description: Get structured guidance when genuinely stuck (via Coach agent)
argument-hint: "[describe what you're stuck on]"
---

# Professor:stuck → Coach Agent

This command routes to the **Coach agent** which provides help through self-assessment dialogue.

## Before routing to Coach:

1. Read `COURSE.md` (required at conversation start)
2. Check for "Active exercise" field in COURSE.md
3. If exists, read that exercise file for context

## Route to Coach:

> "Coach will help you work through this. Let's start with a check-in — where are you right now?"

Delegate to the Coach agent with:
- Current course context
- Current section info
- Active exercise content (if any)
- User's stuck description: $ARGUMENTS

Coach will guide through self-assessment to identify the exact blocker, then break into smaller steps.
