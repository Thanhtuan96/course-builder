# Phase 21: research and polish current agent plan to work in real world - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Research how agents work on 4 real-world platforms (Claude Code, Cursor, Gemini CLI, OpenCode) by fetching their official docs, then polish the existing agent files (Professor, Coach, Spotter, Navigator, Researcher) to actually load and respond correctly on each platform. Scope is agent compatibility — not new features, not new commands.

</domain>

<decisions>
## Implementation Decisions

### Platform compatibility depth
- All 4 platforms targeted equally: Claude Code, Cursor, Gemini CLI, OpenCode
- Minimum bar: agent loads and responds correctly on the target platform (functional minimum — full command parity not required)
- Platform-specific files as needed — no abstraction layer, maintain separately if formats diverge
- Research must fetch the official docs URLs provided: `code.claude.com/docs/en/plugins`, `cursor.com/docs/plugins`, `geminicli.com/docs/extensions/`, `opencode.ai/docs/agents/`

### Canonical source
- `agents/` is the canonical source (not `shared/`) — `shared/` is an auto-synced artifact via `bin/sync-shared.sh`
- Polish targets `agents/` first; then run sync to propagate to `shared/`
- Navigator is missing from `shared/` — add `shared/agents/navigator.md` as part of this phase
- `SKILL.md` is for human contributors; agent files are for AI runtime. Both kept. SKILL.md updated to reflect current multi-agent architecture.

### Polish scope
- Priority order: Professor first, then Coach → Spotter → Navigator (in order, since Professor routes to all)
- Professor.md goal: refactor for simplicity + compatibility (not just annotation — lean it down, remove legacy patterns from when it was the only agent)
- **Critical gap to research**: Do Cursor, Gemini CLI, and OpenCode support agent-to-agent delegation? This finding determines whether specialized agents work on non-Claude-Code platforms or need self-contained fallbacks
- If delegation doesn't work on a platform, agents get self-contained fallback behavior (no cross-agent wiring)

### Research deliverable
- Output: standard `RESEARCH.md` with per-platform sections: Claude Code, Cursor, Gemini CLI, OpenCode
  - Each section covers: what works, what breaks, what's unknown
  - Must address delegation support as a first-class question
- Verification: compatibility checklist per platform after polishing
  - Format: `Claude Code: ✓, Cursor: ✓/partial, Gemini CLI: ✓/partial, OpenCode: ✓`
- Git: work on a separate feature branch (`feature/phase-21-agent-polish`), reviewed before merging to develop
- New files: edits only unless research reveals delegation doesn't work → then create platform-specific fallback variants

### Claude's Discretion
- Exact structure of per-platform fallback (if delegation doesn't work) — figure out during research
- How much of Professor.md to trim — use judgment based on what's genuinely redundant now that Coach/Spotter/Navigator own their commands
- Whether to create a compatibility matrix doc in addition to RESEARCH.md

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/sync-shared.sh`: existing sync script — run after polishing agents/ to propagate to shared/
- `shared/agents/`: has professor, coach, researcher, spotter — missing navigator; already structured for multi-platform
- `agents/navigator.md`: exists in agents/ but not yet in shared/ — gap to close

### Established Patterns
- Agent files use YAML frontmatter (`name`, `description`, `tools`, `color`) — Claude Code specific
- Agent-to-agent delegation pattern exists (Professor → Coach, Spotter → Coach) — works in Claude Code; unknown elsewhere
- Commands reference agents by file path in plugin.json — Claude Code specific registration
- `LEARNING-LOG.md` is the shared data file across all agents — consistent pattern

### Integration Points
- `agents/*.md` → registered in `plugin.json` (Claude Code only)
- `shared/` → consumed by CLI auto-setup for non-Claude platforms
- `bin/sync-shared.sh` → propagates from agents/ to shared/

</code_context>

<specifics>
## Specific Ideas

- Research first: fetch all 4 platform doc URLs before touching any agent file
- The delegation question (do other platforms support multi-agent?) is the single most important finding — it determines the entire polishing strategy
- Professor.md is currently 51KB — it grew when it was the only agent. Now Coach owns review/done/stuck, Spotter owns check-ins, Navigator owns bridges. Professor should shrink significantly.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-research-and-polish-current-agent-plan-to-work-in-real-world*
*Context gathered: 2026-03-16*
