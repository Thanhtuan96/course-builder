---
created: 2026-03-06T11:20:58.807Z
title: Use AskUserQuestion tool in professor agent for context setup
area: general
files:
  - commands/professor/new-topic.md
  - agents/professor.md
  - professor-skill/SKILL.md
---

## Problem

When the professor agent gathers context from the user (e.g., during `professor:new-topic` — asking what topic to learn, current experience level, target level), it currently does so through plain conversational text. This results in a poor UX: the user has to type free-form answers without clear options, and Claude has to parse ambiguous input.

Claude Code provides an `AskUserQuestion` tool that renders structured multi-choice prompts natively in the UI. The professor should use this tool wherever it collects structured context from the learner.

## Solution

In `professor:new-topic` (and other commands that gather user input), replace conversational questions with `AskUserQuestion` calls:

- **Question 1**: "What do you want to learn?" — free text (Other option)
- **Question 2**: "What's your current experience with this topic?" — short free text
- **Question 3**: "What level are you aiming for?" — options: Beginner / Intermediate / Advanced / Expert

Extend to other commands as appropriate:
- `professor:stuck` — optionally ask what they've tried via structured prompt
- `professor:review` — ask what aspect to focus on

The agent/command files (Phase 2) should be written with `AskUserQuestion` as the default pattern for any structured input collection.
