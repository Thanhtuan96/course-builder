# Phase 9: Support for Another AI Agent - Context

**Gathered:** 2026-03-08 (updated)
**Status:** Ready for planning
**Source:** Existing templates/ pattern + CLI

<domain>
## Phase Boundary

This phase adds Cursor support using the existing templates/ pattern.

**Discovery:** 
- templates/ already has agent-specific templates (claude, opencode, gemini, agent)
- bin/cli.js already handles setup for each agent
- Just need to add 'cursor' to both!

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Use existing templates/ pattern
- templates/cursor/settings.json (like templates/claude/settings.json)
- Add 'cursor' to CLI SUPPORTED_AGENTS

### CLI already handles:
- Copy template files to .cursor/
- Copy plugin.json to .cursor/
- Copy shared/ to .cursor/

</decisions>

<specifics>
## Implementation

1. Create templates/cursor/settings.json
2. Add 'cursor' to bin/cli.js SUPPORTED_AGENTS
3. Update README

</specifics>

<deferred>
## Deferred

- Windsurf, Antigravity (tạm thời)

</deferred>

---

*Phase: 09-support-for-another-ai-agent*
*Context updated: 2026-03-08*
