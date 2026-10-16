# Phase 2: Professor Agent and Core Commands - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Package `professor-skill/SKILL.md` into a Claude Code plugin agent and 12 core course commands. Users can start, navigate, and complete a full Socratic learning course via slash commands or direct agent chat. Notes (Phase 3), the PreCompact hook (Phase 4), and export (Phase 5) are out of scope here.

Commands in scope: `professor:new-topic`, `professor:next`, `professor:done`, `professor:review`, `professor:syllabus`, `professor:progress`, `professor:hint`, `professor:stuck`, `professor:discuss`, `professor:quiz`, `professor:capstone`, `professor:capstone-review`

</domain>

<decisions>
## Implementation Decisions

### Command Architecture

- Both invocation paths supported: slash commands (`/professor:review`) AND direct agent chat ("review my code")
- Slash commands are thin entry points — they set context/intent and delegate to the professor agent for behavior
- `agents/professor.md` is the brain: holds all Socratic rules, course state logic, and command behaviors
- Command files (`commands/professor/*.md`) route the agent's attention to a specific action; they do not duplicate behavior
- Socratic absolute rules live in the agent file only — single source of truth, no duplication across command files

### new-topic Interaction Flow

- Professor collects context via a single `AskUserQuestion` call with 3-4 questions:
  - What do you want to learn? (free text)
  - What is your current experience with this topic? (free text or levels)
  - What level are you aiming for? (Beginner / Intermediate / Advanced / Expert)
  - What do you want to be able to build or do after this course? (free text — the goal/outcome)
- Professor proposes the syllabus **inline in chat first** — not written to COURSE.md yet
- Syllabus is framed around the user's stated goal: each section explanation ends with how it moves the user toward their outcome. The user evaluates the learning journey ("does this lead to my goal?"), not the domain content
- User confirms conversationally ("looks good" / requests changes) → COURSE.md is written only after confirmation
- CAPSTONE.md is created at the same time as COURSE.md, after confirmation

### AskUserQuestion Usage

Commands that use `AskUserQuestion` for structured input:
- `professor:new-topic` — one call with 3-4 questions (topic, experience, target level, goal)
- `professor:stuck` — asks what the user has tried so far (structured options: "I described it below", "nothing yet", "tried X but got stuck on Y")
- `professor:quiz` — asks quiz scope (current section / entire course so far / specific concept)
- `professor:export` — asks destination (Notion / Obsidian) — noted here for command file structure consistency; implementation is Phase 5

### Context Auto-Restoration

- The professor agent's description triggers auto-restoration at every conversation start
- Agent reads `courses/` on session start before responding
- **If no `courses/` folder**: Friendly onboarding prompt — "No active course found. I'm Professor Claude — a Socratic learning assistant. Run `/professor:new-topic` to start your first course."
- **If one course found**: Brief status message — "Welcome back! You're on [Topic] — Section [N]: [Name]. Status: [In progress / Not started]. Ready to continue?"
- **If multiple courses found**: Use `AskUserQuestion` to ask which course to resume; list course names and their last-active dates

### Claude's Discretion

- Exact wording of Socratic questions within each command
- Hint layer phrasing (conceptual / tool/pattern / pseudo-code structure)
- How many sections to propose in the syllabus (professor calibrates to topic complexity)
- Edge case handling: what to say if `professor:next` is called before `professor:new-topic`

</decisions>

<specifics>
## Specific Ideas

- "professor:stuck should ask what they tried before diving into the breakdown" — the AskUserQuestion for this primes the Socratic response without feeling interrogative
- Syllabus review must work for a total beginner who has no domain knowledge — outcome-anchoring is the key insight here ("does this lead to what I want to do?")
- The user noticed that slash commands and natural agent chat should coexist — both paths trigger the same professor behavior
- Commands that collect structured input should use `AskUserQuestion`; this was explicitly noted as a design priority (todo: use AskUserQuestion for context setup)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `professor-skill/SKILL.md`: Full authoritative behavior spec — command behaviors, COURSE.md/LECTURE.md/CAPSTONE.md formats, absolute rules, level calibration table. This is the primary source for writing `agents/professor.md`.

### Established Patterns

- All state lives in Markdown files in `courses/{topic-slug}/` — no database, no structured data files
- `plugin.json` already pre-registers all 14 commands — Phase 2 must create the 12 core command files to match those registrations
- Node.js v22, no compiled code — all files are Markdown

### Integration Points

- `agents/professor.md` must match the registration in `plugin.json` (`"file": "agents/professor.md"`)
- Each command file must be at the exact path registered in `plugin.json` (e.g., `commands/professor/new-topic.md`)
- `courses/` directory is created at runtime in the user's working directory — not inside the plugin itself

</code_context>

<deferred>
## Deferred Ideas

- `professor:export` destination selection (Notion / Obsidian) — Phase 5 implementation; noted in AskUserQuestion decisions for structural consistency
- File-based Obsidian export as fallback — already in future requirements (EXP-04)
- `professor:note` command — Phase 3
- NOTES.md auto-creation on new-topic — Phase 3

</deferred>

---

*Phase: 02-professor-agent-and-core-commands*
*Context gathered: 2026-03-06*
