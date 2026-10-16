# Phase 21: Research and Polish Current Agent Plan to Work in Real World - Research

**Researched:** 2026-03-16
**Domain:** Multi-platform AI agent compatibility (Claude Code, Cursor, Gemini CLI, OpenCode)
**Confidence:** HIGH (Claude Code), MEDIUM (Cursor, OpenCode), LOW (Gemini CLI subagents — experimental feature)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Platform compatibility depth:**
- All 4 platforms targeted equally: Claude Code, Cursor, Gemini CLI, OpenCode
- Minimum bar: agent loads and responds correctly on the target platform (functional minimum — full command parity not required)
- Platform-specific files as needed — no abstraction layer, maintain separately if formats diverge
- Research must fetch the official docs URLs provided: `code.claude.com/docs/en/plugins`, `cursor.com/docs/plugins`, `geminicli.com/docs/extensions/`, `opencode.ai/docs/agents/`

**Canonical source:**
- `agents/` is the canonical source (not `shared/`) — `shared/` is an auto-synced artifact via `bin/sync-shared.sh`
- Polish targets `agents/` first; then run sync to propagate to `shared/`
- Navigator is missing from `shared/` — add `shared/agents/navigator.md` as part of this phase
- `SKILL.md` is for human contributors; agent files are for AI runtime. Both kept. SKILL.md updated to reflect current multi-agent architecture.

**Polish scope:**
- Priority order: Professor first, then Coach → Spotter → Navigator (in order, since Professor routes to all)
- Professor.md goal: refactor for simplicity + compatibility (not just annotation — lean it down, remove legacy patterns from when it was the only agent)
- Critical gap to research: Do Cursor, Gemini CLI, and OpenCode support agent-to-agent delegation? This finding determines whether specialized agents work on non-Claude-Code platforms or need self-contained fallbacks
- If delegation doesn't work on a platform, agents get self-contained fallback behavior (no cross-agent wiring)

**Research deliverable:**
- Output: standard RESEARCH.md with per-platform sections: Claude Code, Cursor, Gemini CLI, OpenCode
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

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase requires understanding how each of the 4 target platforms (Claude Code, Cursor, Gemini CLI, OpenCode) actually loads and executes agent Markdown files, and then polishing the 5 existing agent files (Professor, Coach, Spotter, Navigator, Researcher) so they work correctly on each platform.

The single most important finding from this research is the **delegation question**: Only Claude Code has a fully documented and stable sub-agent delegation mechanism where one agent file can explicitly route to another. Cursor has a similar subagent system (as of their recent docs), but it uses different YAML fields. Gemini CLI subagents are an experimental/preview feature requiring a feature flag. OpenCode fully supports subagent delegation with `@agent-name` syntax.

The current agent files use Claude Code-specific YAML fields (`color`, `routing:`, `actions:`) that are ignored on other platforms. The body of each agent file (the Markdown system prompt) is portable across all 4 platforms. The polishing strategy should therefore focus on: making frontmatter fields cross-platform compatible where possible, and removing Claude-Code-only routing/action blocks from the body text since those are non-functional on Cursor, Gemini, and OpenCode.

**Primary recommendation:** Polish agents in two layers — (1) make the YAML frontmatter cross-platform by using the lowest common denominator (`name`, `description`, `tools`/permissions, `model`), and (2) rewrite the Markdown body so the system prompt is self-contained enough to work on any platform without relying on Claude Code's delegation machinery.

---

## Platform Research: Detailed Findings

### Platform 1: Claude Code

**Source:** https://code.claude.com/docs/en/sub-agents (HIGH confidence — official Anthropic docs)

#### How Agent Files Work

Agent files are Markdown with YAML frontmatter. They live in:
- `~/.claude/agents/` (user-level, all projects)
- `.claude/agents/` (project-level, checked into VCS)
- Plugin's `agents/` directory (loaded when plugin is active)

Plugin agents have lowest priority. Project agents override plugin agents of the same name.

#### Supported YAML Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique lowercase identifier using letters and hyphens |
| `description` | Yes | When Claude should delegate to this subagent — written for Claude to decide routing |
| `tools` | No | Allowlist of tools (inherits all if omitted) |
| `disallowedTools` | No | Denylist of tools removed from inherited list |
| `model` | No | `sonnet`, `opus`, `haiku`, full model ID, or `inherit` (default: inherit) |
| `permissionMode` | No | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, or `plan` |
| `maxTurns` | No | Maximum agentic turns before stopping |
| `skills` | No | Skills to preload into subagent context at startup |
| `mcpServers` | No | MCP servers scoped to this subagent |
| `hooks` | No | Lifecycle hooks for the subagent |
| `memory` | No | `user`, `project`, or `local` for cross-session persistent memory |
| `background` | No | `true` to always run as background task |
| `isolation` | No | `worktree` to run in temporary git worktree |
| `color` | Recognized | UI color for identifying the subagent (Claude Code specific) |

**Fields used by current agents that are Claude Code-specific:** `color`, `routing:`, `actions:` — these fields in the current `agents/professor.md` frontmatter are not standard Claude Code frontmatter fields. The `routing:` and `actions:` custom sections appear to be project-defined conventions, not a Claude Code platform feature.

#### Delegation Support

YES — fully supported. Delegation mechanism: Claude reads each agent's `description` and routes to the matching subagent automatically. Can also be explicitly requested ("Use the coach agent to..."). The parent conversation calls the subagent as a tool; subagent runs in its own context and returns results.

**Critical constraint:** Subagents cannot spawn other subagents. If a subagent needs to delegate, it must return to the parent. This means the Professor → Coach → back to Professor chain only works if Professor is the main thread, not a subagent.

#### Tool Names (Claude Code)

`Read`, `Write`, `Bash`, `WebSearch`, `WebFetch`, `Grep`, `Glob`, `Edit`, `Agent`

#### What Works in Current Agents

- `name`, `description`, `tools`, `color` — all recognized
- Markdown body (system prompt) — fully loaded
- The `routing:` and `actions:` custom YAML blocks — present but not interpreted as platform features; they work as documentation embedded in the frontmatter that Claude reads as context

#### What Breaks / Gaps

- The current `plugin.json` uses an old format (`agents[]`, `commands[]`) — the new Claude Code plugin format requires `.claude-plugin/plugin.json` manifest + skills in `skills/` directory. However, the existing agent files in `agents/` still load when installed as a plugin. LOW risk for existing installs.
- `routing:` block in professor.md frontmatter is valid YAML parsed into the agent's data, but Claude Code does not use it as an official routing table. Claude Code routing is purely description-based. The block only serves as documentation.

---

### Platform 2: Cursor

**Source:** https://cursor.com/docs/context/subagents (MEDIUM confidence — official Cursor docs)

#### How Agent Files Work

Agent files are Markdown with YAML frontmatter. They live in:
- `.cursor/agents/` (project-level)
- `~/.cursor/agents/` (user-level)

Project files take precedence. Filename becomes the agent identifier.

#### Supported YAML Frontmatter Fields

| Field | Purpose |
|-------|---------|
| `name` | Unique lowercase identifier (defaults to filename) |
| `description` | Determines when agent auto-delegates; "Use proactively" or "always use for" encourage triggering |
| `model` | `fast`, `inherit`, or a specific model ID (defaults to `inherit`) |
| `readonly` | `true` to restrict write permissions |
| `background` | `true` to run independently without blocking |

Cursor does NOT support: `tools` allowlist, `disallowedTools`, `color`, `permissionMode`, `skills`, `memory`, `hooks` (frontmatter hooks), `mcpServers` in frontmatter.

Rules format (`.cursor/rules/*.mdc`) has different fields: `description`, `globs`, `alwaysApply`.

#### Delegation Support

YES — supported as of recent docs. Two delegation modes:
1. **Automatic**: Cursor delegates based on task matching the subagent's `description`
2. **Explicit**: User invokes with `/subagent-name` syntax (e.g., `/coach review my code`)

Agents can run in parallel. The body becomes the system prompt.

**Critical constraint:** No documented mechanism for agent-to-agent invocation within a single session from the agent's system prompt. Delegation is driven by Cursor's orchestrator based on user requests, not by the agent's own instructions to "call agent X."

#### What Works in Current Agents

- `name`, `description` — recognized
- Markdown body (system prompt) — fully loaded and used
- The `tools:` field in frontmatter is ignored (Cursor uses `readonly: true` for permissions)
- `color` — ignored

#### What Breaks / Gaps

- `tools: Read, Write` lines in current agent frontmatter are ignored by Cursor — no tool restriction
- `color: green` etc. are ignored
- `routing:` and `actions:` custom YAML blocks are ignored
- The Professor body text that says "Professor delegates to Coach via routing table" is meaningless on Cursor because Cursor controls delegation, not the agent's instructions
- A user on Cursor invoking `professor:review` would get Professor responding directly (since Cursor slash commands route to the file name, not delegation logic)

#### Fallback Strategy Needed

Since Cursor doesn't use Claude Code's slash commands (`professor:review` syntax is Claude Code specific), Cursor users interact with agents directly. Professor.md's body needs to self-contain the behaviors for commands that would normally delegate, OR those behaviors need to be accessible via Cursor's `/agent-name` invocation (routing each specialized function to its specialized agent file).

---

### Platform 3: Gemini CLI

**Source:** https://geminicli.com/docs/core/subagents/ + https://geminicli.com/docs/extensions/writing-extensions/ (LOW-MEDIUM confidence — subagents explicitly marked as experimental/preview feature in docs)

#### How Agent Files Work

Agent files are Markdown with YAML frontmatter. They live in:
- `.gemini/agents/*.md` (project-level)
- `~/.gemini/agents/*.md` (user-level)

Extension-level agents go in the extension's `agents/` directory.

**Requires feature flag:** Custom subagents require setting `experimental.enableAgents: true` in `settings.json`. This is a preview feature as of 2026-03.

#### Supported YAML Frontmatter Fields

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Unique identifier (lowercase, alphanumeric, hyphens, underscores) |
| `description` | string | Used for routing decisions |
| `kind` | string | `local` or `remote` agent type |
| `tools` | array | Permitted tools (supports wildcards like `*`, `mcp_*`) |
| `model` | string | Override model selection |
| `temperature` | number | Response creativity (0.0–2.0) |
| `max_turns` | number | Limit conversation iterations |
| `timeout_mins` | number | Maximum execution time |

Gemini does NOT support: `color`, `permissionMode`, `skills`, `memory`, `hooks` in frontmatter.

#### Delegation Support

YES — partially. Two invocation modes:
1. **Automatic**: Main agent delegates to specialized subagent when task matches description
2. **Explicit**: User invokes with `@agent-name` syntax

**Status: experimental/preview.** Feature flag required. The body of the markdown becomes the agent's system prompt.

Extension format uses `gemini-extension.json` manifest (not the same as Claude Code's `plugin.json`).

#### Tool Names (Gemini CLI)

Gemini uses different tool identifiers than Claude Code. Uses wildcard patterns: `mcp_*` for MCP tools, `run_shell_command` for bash. Tool names do not map 1:1 to Claude Code tool names.

#### What Works in Current Agents

- `name`, `description` — recognized
- `model` — recognized
- Markdown body (system prompt) — loaded and used
- `tools: array syntax` — recognized but requires Gemini tool names, not Claude Code tool names (`Read`, `Write`, etc. are Claude Code-specific)

#### What Breaks / Gaps

- `tools: Read, Write, Bash, WebSearch` — these are Claude Code tool names. Gemini CLI tool names are different. The `tools` field in current frontmatter would need platform-specific values.
- `color` — ignored
- `routing:` and `actions:` custom YAML blocks — ignored
- The system prompt references `AskUserQuestion` (a Claude Code tool) — this is not available in Gemini CLI
- Extension manifest format is `gemini-extension.json`, not `plugin.json` — a separate manifest would be needed for Gemini CLI extension packaging

---

### Platform 4: OpenCode

**Source:** https://opencode.ai/docs/agents/ + https://opencode.ai/docs/config/ + https://opencode.ai/docs/skills/ (MEDIUM confidence — official OpenCode docs)

#### How Agent Files Work

Two formats:
1. **Markdown files**: `~/.config/opencode/agents/*.md` (global) or `.opencode/agents/*.md` (project)
2. **JSON in opencode.json**: Inline agent definitions in config

Filename becomes the agent identifier. Markdown body becomes the system prompt.

#### Supported YAML Frontmatter Fields

| Field | Purpose |
|-------|---------|
| `description` | Required — agent's purpose and when to activate |
| `mode` | `primary`, `subagent`, or `all` |
| `model` | Override default LLM model (format: `provider/model-id`) |
| `temperature` | Response randomness (0.0–1.0) |
| `tools` | Enable/disable specific tools |
| `permission` | Access controls for edit, bash, webfetch, and task operations |
| `color` | Visual appearance |
| `top_p` | Alternative diversity control |
| `steps` | Maximum agentic iterations before forcing text-only responses |

#### Delegation Support

YES — fully supported. Subagent delegation works via:
1. **Automatic**: Primary agents auto-invoke subagents when task matches description
2. **Explicit**: `@agent-name` syntax in user messages (e.g., `@coach review my code`)

`mode: subagent` marks an agent as only invokable by other agents (not directly by users). `mode: primary` marks it as a user-facing agent. `mode: all` for both.

**Important difference from Claude Code:** OpenCode `tools` field controls tool access with `true`/`false` per tool, not a list of allowed tool names:

```json
"tools": { "write": false, "edit": false }
```

#### What Works in Current Agents

- `name` — if parsed from frontmatter (docs show `description` as the required field, `name` may default to filename)
- `description` — recognized
- `model` — recognized (needs format `provider/model-id`, not `sonnet`)
- `color` — recognized
- Markdown body (system prompt) — fully loaded
- Subagent delegation pattern is conceptually similar to Claude Code

#### What Breaks / Gaps

- `tools: Read, Write, Bash, WebSearch` — OpenCode uses boolean tool controls, not a list of allowed tool names. This frontmatter line would be parsed but semantically different from intent.
- `model: sonnet` — OpenCode format is `anthropic/claude-sonnet-4-5`. Plain `sonnet` may not resolve.
- `routing:` and `actions:` custom YAML — ignored
- `AskUserQuestion` references in system prompt — this is a Claude Code-specific tool. Not available on OpenCode. The prompt should use generic "ask the user" instructions instead.

---

## Standard Stack (Agent File Compatibility)

### Cross-Platform Minimum Viable Frontmatter

The intersection of all 4 platforms' supported fields:

| Field | Claude Code | Cursor | Gemini CLI | OpenCode | Use |
|-------|-------------|--------|------------|----------|-----|
| `name` | Yes | Yes | Yes | implied | Unique identifier |
| `description` | Yes | Yes | Yes | Yes | Routing trigger |
| `tools` | Yes (list) | No (ignored) | Yes (array) | Yes (boolean map) | Capability restriction |
| `model` | Yes (alias) | Yes | Yes | Yes (provider/id) | Model selection |
| `color` | Yes | No | No | Yes | Visual only |

**Lowest common denominator fields (safe on all platforms):** `name`, `description`, `model`

### The AskUserQuestion Problem

Current agents reference `AskUserQuestion` as a tool call. This is Claude Code-specific. On Cursor, Gemini CLI, and OpenCode, this tool does not exist by that name. The system prompts should use platform-agnostic instructions for asking the user questions (plain text instruction, no tool call reference).

**Resolution:** Remove `AskUserQuestion` tool call references from agent bodies. Replace with generic instructions like "Ask the user:" or use a conditional annotation approach.

---

## Architecture Patterns

### Recommended: Two-Layer Agent File Structure

**Layer 1: Cross-platform frontmatter (minimum fields)**
```yaml
---
name: professor
description: >
  [description text that works as routing trigger on all platforms]
tools: Read, Write, Bash, WebSearch
model: inherit
color: blue
---
```

**Layer 2: Self-contained system prompt body**

The Markdown body should work standalone on any platform. This means:
- No references to platform-specific tools by name (e.g., avoid `AskUserQuestion`)
- No delegation instructions that only work on Claude Code (e.g., "Route to Coach via routing table")
- Include fallback behavior for delegated commands: if the platform doesn't support delegation, the agent handles it directly

### Pattern: Conditional Delegation Block

For Claude Code, delegation instructions can reference other agents. For other platforms, a fallback behavior block:

```markdown
## Handling professor:review

**If running on Claude Code:** Delegate to the `coach` agent.

**If running on any other platform:** Act as Coach directly:
[inline coach behavior here]
```

This makes the system prompt self-contained while still enabling delegation where supported.

### Pattern: Platform Tool Annotation

For commands that require user interaction, use a table rather than tool-specific references:

```markdown
When you need to ask the user a question:
- Claude Code: use `AskUserQuestion`
- Cursor / Gemini CLI / OpenCode: ask inline in your response
```

This approach was documented in project memory as the planned cross-platform annotation pattern.

### Professor.md Refactor: What to Trim

Current professor.md is 24KB in `agents/`, 43KB in `shared/agents/` (stale). The 43KB shared version still has pre-refactor content. After recent refactoring to add routing table, it's down to 24KB in `agents/`.

Content that can be removed from Professor.md now that specialized agents own their commands:
- Full `professor:review` flow (now owned by Coach) — remove detailed flow, keep 2-line delegation note
- Full `professor:stuck` flow (now owned by Coach) — same
- Full `professor:spotter` flow (now owned by Spotter) — same
- Detailed LEARNING-LOG.md format spec (duplicated in Coach.md and Spotter.md) — remove from Professor
- Detailed delegation-back-to-professor instructions (redundant since routing is in frontmatter)

Content to KEEP in Professor.md:
- Identity and core philosophy
- Session start / context restoration logic
- File structure and paths (COURSE.md, LECTURE.md, CAPSTONE.md, SCHEDULE.md)
- COURSE.md, LECTURE.md, CAPSTONE.md format specs (Professor is the only one who creates/writes these)
- Level calibration table
- Absolute rules
- Routing table reference (brief, pointing to the `routing:` frontmatter)
- Spaced repetition / SCHEDULE.md format (Professor manages this)

---

## Compatibility Gaps: Existing Agents vs Each Platform

### professor.md

| Issue | Platform | Impact | Fix |
|-------|----------|--------|-----|
| `routing:` and `actions:` custom YAML blocks | All non-Claude-Code | Ignored but harmless | Remove from frontmatter, document in body |
| `AskUserQuestion` tool reference in body | Non-Claude-Code | Tool not found | Replace with generic instructions + platform table |
| `tools: Read, Write, Bash, WebSearch` | Gemini CLI | Wrong tool name format | Gemini uses different tool names |
| `model: inherit` implied | OpenCode | May need `provider/model-id` format | Add OpenCode note |
| Professor body references "routing table" | Cursor/Gemini/OpenCode | Confusing — no routing table on those platforms | Add platform-conditional fallback blocks |
| 24KB body size | All platforms | Larger context consumption | Trim per plan above |

### coach.md

| Issue | Platform | Impact | Fix |
|-------|----------|--------|-----|
| `tools: Read, Write` | All (fine) | Works | No change needed |
| `color: green` | Cursor/Gemini | Ignored | Harmless |
| No `mode:` field | OpenCode | Defaults to primary (should be subagent on OpenCode) | Add `mode: subagent` |
| "Delegate back to Professor" in body | Non-Claude-Code | Won't actually route back | Replace with "Return your response to the user" |

### spotter.md

| Issue | Platform | Impact | Fix |
|-------|----------|--------|-----|
| `tools: Read, Write` | All | Fine | No change |
| `color: yellow` | Cursor/Gemini | Ignored | Harmless |
| No `mode:` field | OpenCode | Should be `subagent` | Add `mode: subagent` |
| "Invoke the Coach agent" in body | Non-Claude-Code | Can't invoke another agent from inside system prompt | Add fallback: "respond as Coach directly" |

### navigator.md

| Issue | Platform | Impact | Fix |
|-------|----------|--------|-----|
| `tools: Read, Write` | All | Fine | No change |
| `color: cyan` | Cursor/Gemini | Ignored | Harmless |
| No `mode:` field | OpenCode | Should be `subagent` | Add `mode: subagent` |
| Not in `shared/agents/` | All | Missing from auto-sync | Add navigator.md to shared/ |
| References "professor:done flow" and "professor:next flow" | Non-Claude-Code | Those command triggers don't exist | Reframe as: activated when a section is completed or user advances |

### researcher.md

| Issue | Platform | Impact | Fix |
|-------|----------|--------|-----|
| `tools: WebFetch, Read, Grep, Bash` | Gemini CLI | Wrong tool name format | Note Gemini tool names differ |
| `color: green` (conflicts with coach.md color) | All | Minor conflict | Acceptable |
| No `mode:` field | OpenCode | Should be `subagent` | Add `mode: subagent` |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform tool name mapping | A translation layer | Per-platform documentation in agent body | No universal tool name standard exists |
| Platform detection in agent files | Runtime detection logic | Platform-conditional text blocks | Agent files are static Markdown, not code |
| Gemini CLI extension manifest | Custom build script | Standard `gemini-extension.json` schema | Gemini CLI has its own extension format |
| Cursor rules for slash commands | Custom `.cursor/rules/*.mdc` | Direct `.cursor/agents/*.md` files | Cursor agents ARE the right abstraction |

---

## Common Pitfalls

### Pitfall 1: Assuming Claude Code Tool Names Work Everywhere

**What goes wrong:** Agent body says "use AskUserQuestion to ask the user" — this tool doesn't exist on Cursor, Gemini CLI, or OpenCode. The agent fails silently or tries to call a non-existent tool.

**Why it happens:** Tool names are Claude Code-specific (`Read`, `Write`, `Bash`, `WebSearch`, `AskUserQuestion`). Other platforms have different tool registries.

**How to avoid:** Never hard-reference platform-specific tool names in the system prompt body. Use generic instructions ("ask the user:") or a platform conditional block.

**Warning signs:** System prompt contains backtick-wrapped tool names like `` `AskUserQuestion` `` or `` `WebSearch` `` as executable instructions rather than documentation.

---

### Pitfall 2: Delegation Instructions That Don't Work on Non-Claude Platforms

**What goes wrong:** Professor.md says "delegate to Coach" — on Cursor, Gemini CLI, OpenCode, Professor cannot call Coach from within its system prompt. The user gets confused when Professor says "handing off to Coach" but Coach never responds.

**Why it happens:** Claude Code's sub-agent delegation is orchestrator-driven. On other platforms, the agent cannot initiate delegation from its system prompt — only the platform orchestrator can route.

**How to avoid:** Add self-contained fallback behavior for every delegated command. When delegation is possible (Claude Code, OpenCode, Cursor), the platform handles routing. When it's not, the agent falls back to direct handling.

**Warning signs:** Agent body contains phrases like "I'll hand you off to [agent]" or "use the [agent] agent" without a fallback for when that other agent isn't reachable.

---

### Pitfall 3: shared/ Directory Drift

**What goes wrong:** `agents/` is polished, but `shared/agents/` is never re-synced. Non-Claude-Code users (Gemini CLI, OpenCode) who install from `shared/` get stale agent files.

**Why it happens:** `bin/sync-shared.sh` must be run manually after editing `agents/`. It's easy to forget.

**How to avoid:** Run `bin/sync-shared.sh` as the last step of any agent file edit. Add a verification step to the phase.

**Warning signs:** File sizes or modification times in `shared/agents/` don't match `agents/`.

---

### Pitfall 4: Gemini CLI Subagent Feature Flag

**What goes wrong:** Agent files are placed in `.gemini/agents/` but never load because the feature flag is not set.

**Why it happens:** Gemini CLI subagents are an experimental preview feature requiring `experimental.enableAgents: true` in `settings.json`.

**How to avoid:** Document the feature flag requirement clearly in README/install instructions. Don't assume the feature is on by default.

**Warning signs:** Agents in `.gemini/agents/` are silently ignored.

---

### Pitfall 5: OpenCode `mode:` Field Missing

**What goes wrong:** Coach, Spotter, Navigator, and Researcher are meant to be subagents (invoked by Professor or by `@name`), but without `mode: subagent` they appear as primary agents on OpenCode — cluttering the primary agent list and confusing users who try to start a conversation with Coach directly.

**Why it happens:** OpenCode uses `mode:` to distinguish primary vs subagent; Claude Code infers this from where the file is placed and the description.

**How to avoid:** Add `mode: subagent` to Coach, Spotter, Navigator, Researcher. Add `mode: primary` (or `mode: all`) to Professor.

---

## Delegation Support Matrix (Critical Finding)

| Platform | Agent-to-Agent Delegation | Mechanism | Status |
|----------|--------------------------|-----------|--------|
| Claude Code | YES | Description-based auto-routing + explicit "use X agent" | Stable, production |
| Cursor | YES | Description-based auto-routing + explicit `/agent-name` | Stable (recent docs confirm) |
| Gemini CLI | YES (experimental) | `@agent-name` explicit invocation + auto-routing | Experimental, requires feature flag |
| OpenCode | YES | `@agent-name` explicit + auto-routing by description | Stable, production |

**Conclusion:** All 4 platforms support some form of agent delegation. However, the mechanisms differ enough that professor.md's internal delegation instructions (using Claude Code's specific routing logic) won't transfer directly. Each platform's orchestrator handles routing independently based on the `description` field and user's invocation method.

**Strategy implication (per CONTEXT.md decision):** Platform-specific fallback files are NOT needed because all 4 platforms support delegation. However, agent bodies need to be written so they work on any platform — self-contained fallback behavior for delegated flows, and removing Claude-Code-specific delegation machinery from the system prompt text.

---

## Code Examples

### Cross-Platform Agent Frontmatter (Minimum Viable)

```yaml
---
name: coach
description: >
  Feedback dialogue and self-assessment agent. Use for professor:review, professor:done,
  professor:stuck — or invoke directly with @coach for Socratic feedback on your work.
  Always begins with a self-assessment question before giving any feedback.
tools: Read, Write
model: inherit
color: green
mode: subagent
---
```

Notes:
- `tools: Read, Write` — works on Claude Code (allowlist), ignored on Cursor, partially applicable on Gemini/OpenCode
- `color: green` — works on Claude Code and OpenCode, ignored on Cursor/Gemini
- `mode: subagent` — works on OpenCode, unknown effect on others (safe to include, will be ignored if unrecognized)
- `model: inherit` — works on Claude Code; Cursor defaults to inherit if omitted; OpenCode may need `provider/model-id`

### Platform Conditional Delegation Block (in system prompt body)

```markdown
## When to Delegate Back

After completing your task, return results to the user.

**On Claude Code:** Professor orchestrates the flow — you don't need to re-route.
**On Cursor:** User can continue by invoking `/professor` or another agent by name.
**On Gemini CLI / OpenCode:** User can continue by typing `@professor` or any other agent.

Do not say "I'm handing you back to Professor" — the platform handles agent transitions.
```

### OpenCode Agent JSON Format (alternative to .md)

```json
{
  "agent": {
    "coach": {
      "description": "Feedback dialogue agent. Use for review, done, stuck commands.",
      "model": "anthropic/claude-sonnet-4-5",
      "mode": "subagent",
      "prompt": "[paste system prompt here]",
      "tools": { "write": true, "edit": false }
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Single monolithic professor.md | Professor + Coach + Spotter + Navigator + Researcher | Professor can shrink significantly |
| Claude Code only | 4-platform compatibility | Agent files need cross-platform frontmatter |
| platform-specific tool names in body | Generic instructions + platform annotation | Agents work on all platforms |
| `commands/` slash command paradigm | Agents as primary abstraction | Other platforms don't use `professor:*` slash commands |
| Gemini CLI: GEMINI.md only | Gemini CLI: agents/ directory (experimental) | Subagents available but require opt-in |

**Deprecated/outdated in current agents:**
- `routing:` YAML block in professor.md frontmatter — was a project-defined convention, not a Claude Code feature; replace with description-based routing
- `actions:` YAML block in professor.md frontmatter — same; remove
- 43KB `shared/agents/professor.md` — stale pre-refactor version from March 15 before routing table refactor; must be resynced

---

## Open Questions

1. **Gemini CLI tool names**
   - What we know: Gemini CLI has its own tool registry; `run_shell_command` is documented; MCP tools use `mcp_*` pattern
   - What's unclear: Are there Gemini equivalents for `Read`, `Write`, `WebSearch`, `WebFetch`?
   - Recommendation: Use the Gemini docs Tools Reference page (`/docs/reference/tools/`) before writing Gemini-specific tool fields. For now, omit `tools:` field from Gemini-targeted agents (inherit all) and document manually.

2. **Cursor `professor:*` slash command compatibility**
   - What we know: Cursor uses `.cursor/agents/*.md` for agent delegation, not Claude Code's slash command syntax
   - What's unclear: Whether Cursor has a concept of custom slash commands that maps to `commands/professor/*.md` files
   - Recommendation: Treat Cursor as agent-only (no slash commands). Users on Cursor invoke agents via `/agent-name` or natural language. Document this in README.

3. **OpenCode model format for `model: inherit`**
   - What we know: OpenCode uses `provider/model-id` format (e.g., `anthropic/claude-sonnet-4-5`); `inherit` may not be a recognized keyword
   - What's unclear: Whether OpenCode supports an `inherit` alias like Claude Code does
   - Recommendation: Use `model: inherit` and test. If it breaks on OpenCode, override to `anthropic/claude-sonnet-4-5` for OpenCode-targeted agents.

---

## Validation Architecture

nyquist_validation is enabled in .planning/config.json.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — this project has no automated test runner. It is a pure Markdown plugin. |
| Config file | none |
| Quick run command | Manual: load plugin in target platform, invoke agent, observe response |
| Full suite command | Manual: compatibility checklist per platform |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMPAT-01 | Professor loads on Claude Code and responds to session start | manual | Launch `claude --plugin-dir .` and send a message | N/A |
| COMPAT-02 | Coach loads on Claude Code and handles `professor:review` | manual | Invoke `professor:review` in active course | N/A |
| COMPAT-03 | Navigator.md exists in shared/ | file-check | `ls shared/agents/navigator.md` | ❌ Wave 0 |
| COMPAT-04 | Professor loads on Cursor via `.cursor/agents/professor.md` | manual | Open Cursor, load agent, verify response | N/A |
| COMPAT-05 | All agents have cross-platform frontmatter | file-check | Verify `name`, `description`, `model` present in all 5 agent files | N/A |

### Sampling Rate

- **Per task commit:** Visual inspection of modified agent files — check frontmatter fields, verify no platform-specific tool references in body
- **Per wave merge:** Manual platform smoke test (at minimum Claude Code; other platforms where available)
- **Phase gate:** Compatibility checklist format: `Claude Code: ✓, Cursor: ✓/partial, Gemini CLI: ✓/partial, OpenCode: ✓`

### Wave 0 Gaps

- [ ] `shared/agents/navigator.md` — does not exist yet; needs to be created as part of this phase (can be done by running `bin/sync-shared.sh` after polishing `agents/navigator.md`)

*(All other gaps are manual verification — no automated test infrastructure needed for this phase.)*

---

## Sources

### Primary (HIGH confidence)

- `https://code.claude.com/docs/en/sub-agents` — Claude Code subagent frontmatter fields, delegation mechanism, tool names, built-in agents
- `https://code.claude.com/docs/en/plugins` — Claude Code plugin structure, agents/ directory location, plugin.json format evolution
- `https://cursor.com/docs/context/subagents` — Cursor subagent YAML fields, delegation modes, file locations

### Secondary (MEDIUM confidence)

- `https://opencode.ai/docs/agents/` — OpenCode agent format, mode field, subagent delegation
- `https://opencode.ai/docs/config/` — opencode.json agent configuration format, tools boolean map
- `https://opencode.ai/docs/skills/` — OpenCode skills format and agent integration
- `https://geminicli.com/docs/extensions/writing-extensions/` — Gemini CLI extension structure, YAML fields
- `https://geminicli.com/docs/core/subagents/` — Gemini CLI subagent delegation, YAML fields, feature flag requirement

### Tertiary (LOW confidence — experimental)

- Gemini CLI subagents feature is explicitly marked as experimental/preview in official docs; behavior may change
- `https://geminicli.com/docs/extensions/reference/` — extension JSON schema (limited agent-specific details in fetched content)

---

## Metadata

**Confidence breakdown:**

- Claude Code platform details: HIGH — fetched from official Anthropic docs, comprehensive field reference
- Cursor platform details: MEDIUM-HIGH — fetched from official Cursor docs; subagent system confirmed stable
- OpenCode platform details: MEDIUM — fetched from official OpenCode docs; agent format well documented
- Gemini CLI subagents: LOW-MEDIUM — feature is experimental with feature flag requirement; docs are sparse on agent YAML details
- Delegation matrix: HIGH for Claude Code, MEDIUM for Cursor/OpenCode, LOW for Gemini CLI (experimental caveat)
- Polish strategy: HIGH — derived from gap analysis of current agent files vs. platform requirements

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 for stable platforms; 2026-03-30 for Gemini CLI (fast-moving experimental feature)
