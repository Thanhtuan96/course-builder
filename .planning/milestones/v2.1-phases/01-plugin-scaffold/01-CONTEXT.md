# Phase 1: Plugin Scaffold - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish a valid Claude Code plugin directory at the project root with `plugin.json`, `agents/`, `commands/professor/`, `hooks/` directories, and `README.md` with setup instructions. No behavioral logic yet — this is pure structure and metadata.

</domain>

<decisions>
## Implementation Decisions

### Plugin location
- Plugin root is the project root (`.`) — `plugin.json` sits at the repo top level
- The entire repo IS the plugin; dev tooling (`.planning/`, `.claude/gsd`) coexists in the same root
- Install method: user clones/symlinks repo into `~/.claude/plugins/professor/`
- `README.md` at project root (visible directly on GitHub)

### Directory structure
- `agents/` — agent definition files
- `commands/professor/` — all professor commands namespaced under `professor/` subdirectory to avoid conflicts with other plugins
- `hooks/` — hook scripts

### Command and agent naming
- Command prefix: `professor:*` (English spelling, consistent with REQUIREMENTS.md and PROJECT.md)
- This means SKILL.md will need to be updated in Phase 2 to change `profesor:*` → `professor:*`
- Agent trigger name: `professor` (user calls `@professor` or mentions "professor")
- Hook file: `hooks/pre-compact.js` (kebab-case, event-descriptive)

### plugin.json
- Pre-register ALL agents, commands, and hooks in Phase 1 — acts as the full plugin declaration
- Files not yet created (Phase 2+) will be registered but not functional until those phases complete
- Metadata: minimal — name, version, description only (no author/license/keywords)
- Version: `"1.0.0"` (plugin is based on stable skill v3)

### README depth
- Full step-by-step install instructions (no Googling required)
- Notion MCP: full setup snippet (`.mcp.json` or `settings.json` config, install command)
- Obsidian MCP: full setup snippet for Obsidian MCP server
- Short explanation of Socratic method — 1-2 paragraphs explaining why this is different from typical AI coding assistants, setting correct user expectations
- Scope: Claude Code plugin only for now (multi-agent / multi-platform support is deferred)

### Claude's Discretion
- Exact README formatting and section order
- Specific wording for Socratic method explanation
- `.gitkeep` vs placeholder files in empty directories

</decisions>

<specifics>
## Specific Ideas

- User noted: multi-AI-agent support (beyond Claude Code) is worth exploring later — log as deferred idea
- README should make clear that the professor will NOT write code for the user; this is by design

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `professor-skill-v3/professor-skill/SKILL.md`: Full behavioral spec for the professor — Phase 2 will package this as the agent definition; Phase 1 does not touch it
- `.claude/hooks/gsd-context-monitor.js`: Existing hook example in CommonJS (Node.js v22) — pattern to follow for `hooks/pre-compact.js` in Phase 4
- `.claude/settings.json`: Shows how hooks are registered in Claude Code — plugin hooks registration follows same pattern

### Established Patterns
- Naming: kebab-case for files, `professor/` namespace subdirectory for commands
- Hook scripts: CommonJS `.js` files, `#!/usr/bin/env node`, Node.js stdlib only (no npm install)
- YAML frontmatter: `name` and `description` fields in all agent/command `.md` files
- Generated course files: `courses/{topic-slug}/` at runtime — not in plugin directory

### Integration Points
- `plugin.json` is the entry point; Claude Code reads it to discover agents, commands, hooks
- `commands/professor/` connects to Claude Code's slash command resolver — registered commands appear as `professor:*`
- `hooks/` connects to Claude Code's hook event system — `PreCompact` event triggers `pre-compact.js`

</code_context>

<deferred>
## Deferred Ideas

- Multi-AI-agent support: README and distribution support for agents beyond Claude Code (other AI platforms, agent frameworks) — noted by user as potentially valuable, out of scope for v1.0
- Claude.ai `.skill` zip distribution documentation — user wants to log this for later; the `.skill` format is already functional but not documented in this README

</deferred>

---

*Phase: 01-plugin-scaffold*
*Context gathered: 2026-03-06*
