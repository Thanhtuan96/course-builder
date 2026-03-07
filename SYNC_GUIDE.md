# Development Sync Guide

This document outlines how to keep the root (`agents/`, `commands/`, `hooks/`) and `shared/` directories in sync.

## Why This Matters

The `shared/` directory is used by the CLI (`bin/cli.js`) to set up the plugin for users. If `shared/` is out of sync, users who run `npx course-professor setup` will get outdated features.

## The Rule

**Every time you modify files in the root, you MUST also update `shared/`**

## Quick Sync Commands

```bash
# Sync all files
cp commands/professor/*.md shared/commands/professor/
cp agents/professor.md shared/agents/professor.md
cp hooks/pre-compact.js shared/hooks/pre-compact.js
```

Or use the sync script (if available):

```bash
# Will be created
./bin/sync-shared.sh
```

## Files That Must Stay in Sync

| Root Location | Shared Location | Purpose |
|---------------|-----------------|---------|
| `agents/professor.md` | `shared/agents/professor.md` | Main agent definition |
| `commands/professor/*.md` | `shared/commands/professor/` | All command stubs |
| `hooks/pre-compact.js` | `shared/hooks/pre-compact.js` | Session save hook |

## When to Sync

Sync immediately after:
- Adding a new command (e.g., `professor:archive`)
- Modifying existing command behavior
- Updating agent rules
- Enhancing hooks

## CI Check (Optional)

You can add a check to your CI:

```bash
# Check if shared is in sync
diff -rq commands/professor shared/commands/professor || echo "OUT OF SYNC"
```

## Summary

| Before Sync | After Sync |
|-------------|------------|
| commands: 14 files | commands: 15 files ✓ |
| agent: 528 lines | agent: 820 lines ✓ |
| hooks: 57 lines | hooks: 213 lines ✓ |
