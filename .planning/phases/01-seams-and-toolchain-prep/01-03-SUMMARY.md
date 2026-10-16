---
phase: 1
plan: 3
plan_name: Extract the web command into bin/commands/web.js
status: complete
commits:
  - c58ae91 refactor(01): extract web case into bin/commands/web.js
  - d83c966 fix(01): preserve positional web port after cli split
---

# Plan 01-03: Extract the web command into bin/commands/web.js — Summary

- `bin/cli.js` `web` case body moved to `bin/commands/web.js` behind `run({ args, cwd, chalk, style })`; `cli.js` delegates in one line.
- Fixed the positional port regression introduced by the slice (`web 4123` → port 4123, `web` → 3000).
- Removed the now-unused `canResolveFrom` helper; CLI output of `--help`, `list`, `status --json`, `doctor` identical to develop.

Split out of the combined `01-SUMMARY.md` by the orchestrator so each plan has its completion record.
Verification for the whole phase: `01-VERIFICATION.md` (passed 4/4).
