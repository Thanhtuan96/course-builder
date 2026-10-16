---
created: 2026-03-25T00:00:00.000Z
title: update --all leaves stale files from prior skill versions
area: cli
files:
  - bin/cli.js
priority: P3
effort: S
---

## Problem

`update <skill-name>` and `update --all` re-download skill files but never remove files that existed in a previous version of the skill and were deleted upstream. A user who had v1 skill files and runs `update --all` will have both old and new files mixed in the skill directory.

## Solution

Change `update` to use a rm-then-reinstall strategy:
1. Download new files to a temp dir
2. Only if all downloads succeed: rm -rf destDir, move temp dir to destDir

This is atomic from the user's perspective and eliminates stale files. Partial download failure leaves the original install intact.

## Dependencies

- Depends on `installSkill()` being refactored as a named function (plan fix #6) — can reuse with a `{ cleanInstall: true }` flag

## Why deferred

Skills are currently v1 (no versioning in meta.json). Stale files only accumulate when a skill changes its file manifest, which requires deliberate registry action. Low urgency until skills see active maintenance cycles.
