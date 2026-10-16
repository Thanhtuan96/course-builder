# Phase 11: Research-Enhanced Hints - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance professor:hint and professor:stuck commands to provide keywords for googling or research, plus useful conferences/resources to help users figure out solutions themselves. This adds research capability to the existing hint system without changing core Socratic behavior.

</domain>

<decisions>
## Implementation Decisions

### When to show research suggestions
- Research suggestions appear at **hint Layer 3 only** (the pseudo-code layer) — user is closest to solving
- Stuck command can include research suggestions at any point when user is genuinely blocked
- Earlier layers (1-2) remain focused on conceptual guidance without research hints

### Research approach
- **Hybrid approach**: Try live web research first (using researcher agent or WebFetch)
- Fall back to static suggestions if live research fails or times out
- Static suggestions use pre-defined categories: tutorials, official documentation, conferences, Stack Overflow

### Resource types
- Mix of all: programming conferences, tutorials, official docs, Stack Overflow
- No preference for free/paid — include quality resources regardless

### Keyword format
- Clean bullet list that user can copy-paste directly into Google
- Include what to search for AND specific URLs or resource names where relevant

</decisions>

<specifics>
## Specific Ideas

- Research suggestions should feel like "Here's a path forward" not "Go figure it out yourself"
- Maintain Socratic tone — suggest resources that help users learn, not just solve
- Consider the learning topic context when selecting resources

</specifics>

\code_context
## Existing Code Insights

### Reusable Assets
- agents/researcher.md: Created in Phase 10, can be used for live research
- commands/professor/hint.md: Existing 3-layer hint system (Layer 1=conceptual, Layer 2=tool/pattern, Layer 3=pseudo-code)
- commands/professor/stuck.md: Existing stuck command with structured breakdown

### Established Patterns
- Hint system uses 3 layers: conceptual → tool/pattern → pseudo-code
- Professor delegates research to researcher agent (Phase 10)
- Socratic principles: never give answers, guide users to find information themselves

### Integration Points
- hint.md and stuck.md command files in commands/professor/
- agents/professor.md for hint layer logic
- agents/researcher.md for live web research capability

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-research-enhanced-hints*
*Context gathered: 2026-03-11*
