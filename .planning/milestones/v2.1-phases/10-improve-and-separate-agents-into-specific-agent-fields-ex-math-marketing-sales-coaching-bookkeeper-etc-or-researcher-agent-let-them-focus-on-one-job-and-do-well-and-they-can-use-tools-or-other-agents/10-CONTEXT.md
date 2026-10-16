# Phase 10: Agent Specialization - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve and separate agents into specific agent fields (math, marketing, sales, coaching, bookkeeper, researcher). Each agent focuses on one job and can use tools or call other agents.

</domain>

<decisions>
## Implementation Decisions

### Agent Structure
- **Hybrid approach** — Single professor agent with capabilities that delegates to sub-agents
- Professor remains the main agent, sub-agents handle domain-specific tasks

### Domain Priorities
- **Researcher first** — Build researcher agent first as it's most useful for learning flow
- Other domains (math, marketing, sales, coaching, bookkeeper) can be added later

### Tool Access
- **Domain-specific** — Each agent gets exactly the tools it needs
- Researcher agent: WebFetch, Read, Grep (for researching topics)
- Other domains get tailored tools as they're added

### Delegation Pattern
- **Mixed** — MCP for external agent calls, prompt routing for internal delegation
- Professor delegates to sub-agents via prompt routing
- External systems can call specific agents via MCP

### Claude's Discretion
- Exact sub-agent prompt templates
- Order of adding other domains after researcher
- Tool configurations per domain

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- templates/claude/settings.json — Agent permissions template
- templates/cursor/settings.json — Just added in Phase 9
- bin/cli.js — Has SUPPORTED_AGENTS array, can extend for new agents

### Established Patterns
- Template-based agent setup — Each agent gets templates/{agent}/settings.json
- CLI handles setup for each agent

### Integration Points
- Agents will integrate with existing professor agent (agents/professor.md)
- New agents need entries in plugin.json
- Can extend CLI setup command for new agent types

</code_context>

<specifics>
## Specific Ideas

- "Researcher agent should be able to search the web and find relevant learning resources"
- Each specialized agent focuses on one domain
- Professor agent coordinates and delegates to sub-agents

</specifics>

<deferred>
## Deferred Ideas

- Math agent — to be added after researcher
- Marketing agent — to be added after researcher
- Sales agent — to be added after researcher
- Coaching agent — to be added after researcher
- Bookkeeper agent — to be added after researcher

</deferred>

---

*Phase: 10-agent-specialization*
*Context gathered: 2026-03-08*
