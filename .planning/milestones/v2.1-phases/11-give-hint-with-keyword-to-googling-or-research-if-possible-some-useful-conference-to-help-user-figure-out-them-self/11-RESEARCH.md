# Phase 11: Research-Enhanced Hints - Research

**Researched:** 2026-03-11
**Domain:** Claude Code plugin - Socratic learning assistant hints enhancement
**Confidence:** HIGH

## Summary

Phase 11 enhances the existing `professor:hint` and `professor:stuck` commands to provide research keywords and learning resources. The key decisions are locked: research suggestions appear at Layer 3 (pseudo-code) for hints, and at any point for stuck. The implementation leverages the existing researcher agent from Phase 10 for live web research, with static fallback suggestions organized by category (tutorials, official docs, conferences, Stack Overflow).

**Primary recommendation:** Implement hybrid research flow in hint.md and stuck.md commands - attempt live research via researcher agent delegation first, fall back to pre-defined static suggestions if research fails or times out. Use clean bullet list format for keywords users can copy-paste directly.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Research suggestions appear at **hint Layer 3 only** (the pseudo-code layer) — user is closest to solving
- Stuck command can include research suggestions at any point when user is genuinely blocked
- Earlier layers (1-2) remain focused on conceptual guidance without research hints
- **Hybrid approach**: Try live web research first (using researcher agent), fall back to static suggestions if live research fails or times out
- Static suggestions use pre-defined categories: tutorials, official documentation, conferences, Stack Overflow
- Mix of all: programming conferences, tutorials, official docs, Stack Overflow — no preference for free/paid
- Keyword format: Clean bullet list that user can copy-paste directly into Google

### Claude's Discretion
- Research suggestions should feel like "Here's a path forward" not "Go figure it out yourself"
- Maintain Socratic tone — suggest resources that help users learn, not just solve
- Consider the learning topic context when selecting resources

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| N/A | TBD in roadmap | This phase adds research capability to existing hint/stuck commands |

---

## Standard Stack

### Core (Existing)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Claude Code plugin | N/A | Plugin architecture | Source format (Markdown) read directly by Claude Code |
| agents/professor.md | Existing | Main teaching agent | Handles hint layer logic |
| agents/researcher.md | Phase 10 | Research delegation | Live web research capability |
| commands/professor/hint.md | Existing | 3-layer hint system | Layer 1=conceptual, Layer 2=tool/pattern, Layer 3=pseudo-code |
| commands/professor/stuck.md | Existing | Stuck handling | Structured breakdown |

### No New Dependencies Required
This phase enhances existing commands using the researcher agent already created in Phase 10. No new libraries or packages needed.

---

## Architecture Patterns

### Recommended Project Structure
```
agents/
├── professor.md    # Modified: Add research suggestion logic at Layer 3
└── researcher.md   # Existing: Live research capability (Phase 10)

commands/professor/
├── hint.md         # Modified: Add research suggestion at Layer 3
└── stuck.md         # Modified: Add optional research suggestions

resources/          # NEW: Static fallback suggestions by topic category
├── static-research.md   # Pre-defined research suggestions format
└── conferences.md       # Programming conference resources
```

### Pattern 1: Hybrid Research Flow
**What:** Try live research first via researcher agent, fall back to static suggestions
**When to use:** When providing research keywords at Layer 3 hint or stuck command
**Example:**
```markdown
# Research suggestion flow in hint.md

## Layer 3 Hint Output (pseudo-code)

[Layer 3 pseudo-code hint content]

---

## 🔍 Research Keywords

*Try these searches to learn more:*
- "[specific concept] tutorial"
- "[tool name] official documentation"
- "[pattern name] best practices"

*Resources:*
- [Conference talk on topic] - [URL]
- [Stack Overflow question] - [URL]
```

### Pattern 2: Researcher Agent Delegation
**What:** Professor delegates research request to researcher agent for live keyword finding
**When to use:** When user is at Layer 3 and needs current, topic-specific research
**How it works:**
1. Professor formulates research query based on current section/exercise
2. Delegates to researcher agent: "Find current best search terms for [topic]"
3. Researcher returns keywords + relevant resources
4. Professor formats into clean bullet list for user

### Pattern 3: Static Fallback Categories
**What:** Pre-defined categories of research resources as fallback
**When to use:** When live research fails, times out, or isn't available
**Categories:**
- Tutorials (level-appropriate)
- Official documentation
- Programming conferences (specific to topic)
- Stack Overflow (common questions)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live web research | Custom web search integration | Existing researcher agent (Phase 10) | Researcher agent already has WebFetch, follows Socratic principles |
| Research keyword format | Custom output format | Clean bullet list users can copy-paste | Simple, actionable, respects user autonomy |
| Resource categorization | Custom categories | Pre-defined: tutorials, docs, conferences, Stack Overflow | User-decided (CONTEXT.md), covers most learning needs |

**Key insight:** The researcher agent from Phase 10 is designed exactly for this use case - Socratic research that helps users find information without giving answers. Leveraging it maintains consistency with existing patterns.

---

## Common Pitfalls

### Pitfall 1: Research Suggests "Go Figure It Out"
**What goes wrong:** Research keywords feel like abandonment rather than help
**Why it happens:** Generic keywords without context, no Socratic framing
**How to avoid:** 
- Frame as "Here's a path forward" not "Go research it"
- Include specific resource names/URLs where relevant
- Maintain supportive tone: "These resources can help you understand..."
**Warning signs:** User says "I don't know where to start" after receiving research

### Pitfall 2: Live Research Times Out or Fails Silently
**What goes wrong:** User receives no research suggestions when expected
**Why it happens:** Network issues, researcher agent unavailable
**How to avoid:** 
- Always have static fallback ready
- Test fallback is included in response when live research unavailable
- Show clear fallback format: "If you'd like to research on your own, try..."
**Warning signs:** No research section appears at Layer 3

### Pitfall 3: Keywords Too Generic to Be Useful
**What goes wrong:** Keywords like "React hooks tutorial" are too broad
**Why it happens:** Not tailoring to specific exercise/context
**How to avoid:**
- Include specific concept names from the current section
- Add context: "React useState state management tutorial"
- Include specific resource recommendations where known
**Warning signs:** User says "I already tried searching but couldn't find anything specific"

### Pitfall 4: Research Appears at Wrong Hint Layer
**What goes wrong:** Research shows up at Layer 1 or 2 instead of only Layer 3
**Why it happens:** Logic error in hint layer detection
**How to avoid:**
- Explicit check: only add research section when layer === 3
- Test by calling professor:hint 3 times and verifying research appears on 3rd call only
**Warning signs:** Research appears early in hint sequence

---

## Code Examples

### Modified hint.md Command (Layer 3 Research)
```markdown
---
name: professor:hint
description: "Get the next hint layer without revealing the answer"
---

**Before giving hints, check for Active exercise:**

1. Read `COURSE.md` first (this is required at conversation start)
2. After reading COURSE.md, check for "Active exercise" field
3. If "Active exercise" field exists, load that specific file:
   - Found: **Active exercise**: exercises/01-intro.js
   - Read exercises/01-intro.js
4. If no "Active exercise" field, ask user which file to provide hints for (fallback)

Now give the next hint layer for the current exercise.

Infer the correct layer from the conversation history — count how many times `professor:hint` has been called this session for the current section. The layer logic and definitions are in the agent body (agents/professor.md).

Do not skip layers. Start from Layer 1 unless the user has already received it this session.

**For Layer 3 specifically:** After providing the pseudo-code hint, attempt live research:

1. **Try live research first:** Delegate to researcher agent:
   > "Use the researcher agent to find specific search keywords for [current section topic]. Return 3-5 keywords and 2-3 specific resource URLs."

2. **If live research succeeds:** Format keywords as clean bullet list with resources

3. **If live research fails:** Use static fallback with category template

**Research format at Layer 3:**
```
---

## 🔍 Research This

*Search keywords you can copy-paste:*
- [keyword 1]
- [keyword 2]
- [keyword 3]

*Helpful resources:*
- [Resource name](url) — [why useful]
- [Resource name](url) — [why useful]
```

If the user asks for a 4th hint, do not provide one. Suggest `professor:stuck` instead.

$ARGUMENTS
```

### Modified stuck.md Command (Research at Any Point)
```markdown
---
name: professor:stuck
description: "Get structured guidance when genuinely blocked"
---

**Before helping, check for Active exercise:**

1. Read `COURSE.md` first (this is required at conversation start)
2. After reading COURSE.md, check for "Active exercise" field
3. If "Active exercise" field exists, load that specific file:
   - Found: **Active exercise**: exercises/01-intro.js
   - Read exercises/01-intro.js
4. If no "Active exercise" field, ask user which file they're stuck on (fallback)

Now before diving into the breakdown, use AskUserQuestion to ask:
> "Walk me through what you've tried so far."

Offer structured options: "I described it below" / "Nothing yet — I'm not sure where to start" / "I tried X but got stuck on Y"

Based on their response:
- Identify the exact sticking point (concept gap, syntax issue, or logic error)
- Break the problem into smaller steps — "Let's forget the full solution. Can you just do X first?"
- Give a worked analogy using a different, simpler example from outside the domain
- Guide them to the next smallest step they can take independently

**After initial stuck guidance, optionally add research if helpful:**

1. **Assess if research would help:** If the sticking point is something that requires understanding a concept better (not just syntax), offer research keywords
2. **Try live research:** Delegate to researcher agent for topic-specific keywords
3. **Or use static fallback:** Provide category-based suggestions

**Research suggestion format (optional):**
```
---

## 🔍 Dig Deeper (Optional)

If you'd like to understand [concept] better:
- Search: "[concept] explained"
- Docs: [official docs link if known]
- Example: [tutorial link if known]
```

Do NOT write the solution.

$ARGUMENTS
```

### Researcher Agent Prompt for Hint Integration
```markdown
# Researcher Agent - Hint Layer Research

When professor delegates research for Layer 3 hint:

**Input:** Current section topic, exercise context, user's specific sticking point

**Task:** Find:
1. 3-5 specific search keywords user can copy-paste
2. 2-3 high-quality resource URLs (tutorial, docs, conference talk)
3. Brief annotation for each resource: why it's useful

**Output format:**
```
### Search Keywords
- [keyword 1]
- [keyword 2]
- [keyword 3]

### Helpful Resources
- [Title](url) — [1-line why useful]
- [Title](url) — [1-line why useful]
```

**Rules:**
- Keep keywords specific to the exercise, not generic
- Prefer current resources (recent tutorials, updated docs)
- Include conference talks if relevant to topic
- Do NOT give the answer — just keywords and resources
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hints give no external resources | Layer 3 hints include research keywords | Phase 11 | Users can self-direct learning |
| Stuck gives no research path | Stuck optionally includes research | Phase 11 | Genuinely stuck users get help |
| No live research in hint flow | Hybrid: live research + static fallback | Phase 11 | Best of both worlds |

**No deprecation:** This adds new capability, no existing behavior is removed.

---

## Open Questions

1. **Should research appear on every Layer 3 hint?**
   - What's unclear: Could become repetitive if user calls hint multiple times on same section
   - Recommendation: Always include for first Layer 3 call per section; skip if already provided

2. **Static fallback content storage?**
   - What's unclear: Should static suggestions be embedded in hint.md or separate file?
   - Recommendation: Separate file `resources/static-research.md` for maintainability

3. **Conference resource coverage?**
   - What's unclear: How to ensure conferences are relevant to diverse topics?
   - Recommendation: Use researcher agent for live conference search; static fallback only for common topics (JS, Python, React, etc.)

---

## Validation Architecture

> This section included since workflow.nyquist_validation is not explicitly set to false in .planning/config.json

### Test Framework
| Property | Value |
|----------|-------|
| Framework | N/A (Markdown-based plugin - no test runner) |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N/A | Research appears at Layer 3 only | Manual | Call professor:hint 3x, verify research on 3rd | ✅ Existing |

### Manual Testing Required
- [ ] Call `professor:hint` 3 times on same section — verify research appears only on 3rd call
- [ ] Call `professor:stuck` and verify research option appears after breakdown
- [ ] Test fallback: disable researcher agent, verify static suggestions still appear
- [ ] Test keyword format: verify clean bullet list, copy-paste works

### Wave 0 Gaps
- None — existing command infrastructure sufficient
- Static fallback resource file: `resources/static-research.md` — may need creation

---

## Sources

### Primary (HIGH confidence)
- Existing implementation: commands/professor/hint.md - current 3-layer system
- Existing implementation: commands/professor/stuck.md - current stuck handling
- Existing implementation: agents/researcher.md (Phase 10) - Socratic research agent
- CONTEXT.md - locked decisions for this phase

### Secondary (MEDIUM confidence)
- CLAUDE.md - project conventions and structure
- agents/professor.md - hint layer logic in agent body

### Tertiary (LOW confidence)
- None required - sufficient existing context

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing infrastructure (researcher agent Phase 10)
- Architecture: HIGH - clear patterns from CONTEXT.md decisions
- Pitfalls: MEDIUM - based on existing hint system patterns, no new research needed

**Research date:** 2026-03-11
**Valid until:** 30 days (stable plugin architecture)
