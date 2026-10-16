# Phase Context: CLI Auto-Setup Feature

## Overview

Add CLI auto-setup feature enabling `npx course-professor init` to auto-detect and configure for any supported AI agent (Claude Code, OpenCode, Gemini CLI, etc.).

## What Changed

- Added `bin/cli.js` - CLI entry point with auto-detection
- Added `package.json` - npm package enabling npx usage
- Added `templates/` - Agent-specific settings templates
- Added `shared/` - Centralized files for all agents

## Scope

- CLI commands: `init`, `setup`, `list`, `help`
- Auto-detection of Claude/OpenCode/Gemini/Agent
- Copy templates to `.agent/` directory in user project
- Agent-specific settings.json per platform

## Test Commands

```bash
npx course-professor init              # Auto-detect and setup
npx course-professor setup claude      # Manual setup
npx course-professor setup opencode    # OpenCode
npx course-professor setup gemini      # Gemini CLI
npx course-professor list             # List supported agents
```
