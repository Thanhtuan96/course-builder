# Phase 01b Plan: CLI Auto-Setup Feature

## Phase Overview

**Goal**: Enable users to run `npx course-professor` to auto-setup the plugin for their preferred AI agent

**Depends on**: Phase 1 (Plugin Scaffold)

## Requirements

- CLI-01: Support `npx course-professor init` for auto-detection
- CLI-02: Support `npx course-professor setup <agent>` for manual selection
- CLI-03: Support multiple agents: claude, opencode, gemini, agent
- CLI-04: Create agent-specific config directory with templates
- CLI-05: Copy shared commands, agents, hooks to target directory

## Success Criteria (what must be TRUE)

1. User can run `npx course-professor init` and get prompted/auto-detected setup
2. User can specify agent explicitly: `npx course-professor setup claude`
3. Setup creates proper directory structure in user's project
4. All 14 professor commands are available after setup
5. Works without requiring manual file copying

## Tasks

### Task 1: Create package.json with CLI entry point

- Add `"bin"` field pointing to `bin/cli.js`
- Set `"type": "module"` for ESM support
- Configure `"files"` to include all required directories

### Task 2: Create bin/cli.js

- Implement `init` command: detect installed agents
- Implement `setup <agent>` command: copy templates
- Implement `list` command: show supported agents
- Implement `help` command: show usage
- Auto-detect: check for `.claude`, `.opencode`, `.gemini` directories

### Task 3: Create templates/

- `templates/claude/settings.json` - Claude Code permissions
- `templates/claude/plugin.json` - Plugin manifest copy
- `templates/opencode/settings.json` - OpenCode config
- `templates/gemini/settings.json` - Gemini CLI config
- `templates/agent/settings.json` - Generic agent config

### Task 4: Refactor to shared/ directory

- Move all commands to `shared/commands/professor/`
- Move all agents to `shared/agents/`
- Move hooks to `shared/hooks/`
- CLI copies from `shared/` during setup

### Task 5: Test CLI locally

```bash
# Test help
node bin/cli.js --help

# Test setup in temp directory
cd /tmp && rm -rf test-proj && mkdir test-proj && cd test-proj && node /path/to/bin/cli.js setup claude
```

## Files to Create

- `package.json`
- `bin/cli.js`
- `templates/claude/settings.json`
- `templates/claude/plugin.json`
- `templates/opencode/settings.json`
- `templates/gemini/settings.json`
- `templates/agent/settings.json`
- `shared/commands/professor/*.md` (14 files)
- `shared/agents/professor.md`
- `shared/hooks/pre-compact.js`
- `shared/SKILL.md`

## Files to Modify

- `README.md` - Add npx installation instructions

## Notes

- Must use ESM (`"type": "module"`) for modern Node.js
- CLI should be user-friendly with clear messages
- Templates should have minimal required config
- shared/ serves as single source of truth for all agents

---

## Implementation Summary

**COMPLETED** - Feature implemented during work session.

### Files Created

```
bin/cli.js                  # CLI entry point
package.json                # npm package enabling npx
templates/claude/settings.json
templates/claude/plugin.json
templates/opencode/settings.json
templates/gemini/settings.json
templates/agent/settings.json
shared/SKILL.md
shared/agents/professor.md
shared/commands/professor/*.md (14 files)
shared/hooks/pre-compact.js
```

### How It Works

1. **Manual Install (existing)**:
   - User symlinks repo to `~/.claude/plugins/professor`
   - Agent reads from root-level `agents/`, `commands/professor/`

2. **npx Auto-Setup (new)**:
   ```bash
   npx course-professor setup claude
   ```
   - CLI creates `.claude/` in user's project
   - Copies templates (settings.json, plugin.json)
   - Copies shared/ contents (commands, agents, hooks)

### Commands

```bash
npx course-professor init              # Auto-detect agent
npx course-professor setup claude      # Manual setup
npx course-professor setup opencode    # OpenCode
npx course-professor list              # Show supported agents
npx course-professor help              # Show help
```

### Notes

- Root-level `commands/professor/` and `agents/` are used by manual symlink install
- `shared/` serves as source of truth for CLI auto-setup
- Both paths produce equivalent plugin directories
