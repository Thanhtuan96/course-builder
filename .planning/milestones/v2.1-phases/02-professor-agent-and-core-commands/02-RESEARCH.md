# Phase 2: Professor Agent and Core Commands - Research

**Researched:** 2026-03-06
**Domain:** Claude Code plugin authoring — agent files, command/skill files, Socratic pedagogy patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Command Architecture**

- Both invocation paths supported: slash commands (`/professor:review`) AND direct agent chat ("review my code")
- Slash commands are thin entry points — they set context/intent and delegate to the professor agent for behavior
- `agents/professor.md` is the brain: holds all Socratic rules, course state logic, and command behaviors
- Command files (`commands/professor/*.md`) route the agent's attention to a specific action; they do not duplicate behavior
- Socratic absolute rules live in the agent file only — single source of truth, no duplication across command files

**new-topic Interaction Flow**

- Professor collects context via a single `AskUserQuestion` call with 3-4 questions:
  - What do you want to learn? (free text)
  - What is your current experience with this topic? (free text or levels)
  - What level are you aiming for? (Beginner / Intermediate / Advanced / Expert)
  - What do you want to be able to build or do after this course? (free text — the goal/outcome)
- Professor proposes the syllabus **inline in chat first** — not written to COURSE.md yet
- Syllabus is framed around the user's stated goal: each section explanation ends with how it moves the user toward their outcome
- User confirms conversationally ("looks good" / requests changes) → COURSE.md is written only after confirmation
- CAPSTONE.md is created at the same time as COURSE.md, after confirmation

**AskUserQuestion Usage**

Commands that use `AskUserQuestion` for structured input:
- `professor:new-topic` — one call with 3-4 questions (topic, experience, target level, goal)
- `professor:stuck` — asks what the user has tried so far (structured options: "I described it below", "nothing yet", "tried X but got stuck on Y")
- `professor:quiz` — asks quiz scope (current section / entire course so far / specific concept)
- `professor:export` — asks destination (Notion / Obsidian) — noted here for command file structure consistency; implementation is Phase 5

**Context Auto-Restoration**

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

### Deferred Ideas (OUT OF SCOPE)

- `professor:export` destination selection (Notion / Obsidian) — Phase 5 implementation; noted in AskUserQuestion decisions for structural consistency
- File-based Obsidian export as fallback — already in future requirements (EXP-04)
- `professor:note` command — Phase 3
- NOTES.md auto-creation on new-topic — Phase 3
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGT-01 | Professor agent packages professor-skill-v3 as a Claude Code agent with correct frontmatter | Agent file format, frontmatter fields, description-driven delegation |
| CMD-01 | User can run `professor:new-topic` to start a new course on a topic | AskUserQuestion pattern, syllabus proposal flow, file writing pattern |
| CMD-02 | User can run `professor:next` to advance to the next section | LECTURE.md write pattern, COURSE.md update pattern |
| CMD-03 | User can run `professor:review` to review a completed section | Socratic review structure from SKILL.md |
| CMD-04 | User can run `professor:done` to mark a section complete | COURSE.md status update, capstone unlock trigger |
| CMD-05 | User can run `professor:hint` to receive a hint without the answer being revealed | Layer tracking pattern, session context |
| CMD-06 | User can run `professor:stuck` to receive additional guidance when genuinely stuck | AskUserQuestion for "what have you tried", structured breakdown |
| CMD-07 | User can run `professor:syllabus` to view the course outline | Read and display COURSE.md |
| CMD-08 | User can run `professor:progress` to view learning progress | Read COURSE.md, structured summary output |
| CMD-09 | User can run `professor:discuss` to open discussion on a concept | Conceptual-only constraint, no code dumps |
| CMD-10 | User can run `professor:quiz` to run a quiz on the current topic | AskUserQuestion for scope, level-appropriate question types |
| CMD-11 | User can run `professor:capstone` to start the capstone project | Display CAPSTONE.md, unlock status check |
| CMD-12 | User can run `professor:capstone-review` to review capstone progress | Full project review flow, section-availability gate |
</phase_requirements>

---

## Summary

Phase 2 is entirely a **content authoring phase** — no code is compiled, no packages are installed. Every deliverable is a Markdown file interpreted at runtime by Claude Code. The two file types needed are: (1) an agent file (`agents/professor.md`) and (2) twelve command files (`commands/professor/*.md`). The content of these files directly determines Claude's behavior when the plugin is loaded.

The canonical behavior spec already exists in `professor-skill/SKILL.md`. Phase 2 is a structured translation and refactoring of that spec into the agent+commands architecture. The agent file holds all shared rules, state logic, and absolute constraints. The command files are intentionally thin — each one redirects attention to a specific action without duplicating the rules.

The most important architectural insight from official docs is that a plugin agent file's `description` field determines **when Claude auto-delegates** to the professor agent. Writing a precise, trigger-rich description is critical for both explicit slash command invocation and natural-language invocation paths. Command files in `commands/` are the legacy/simple format (a flat .md file, not a SKILL.md in a subdirectory) and are already pre-registered in `plugin.json`.

**Primary recommendation:** Translate SKILL.md into `agents/professor.md` as the authoritative behavior document, then write 12 thin command files that each invoke the professor agent's attention on a specific action using one or two sentence routing instructions plus `$ARGUMENTS` reference where needed.

---

## Standard Stack

### Core

| Component | Format | Purpose | Why Standard |
|-----------|--------|---------|--------------|
| `agents/professor.md` | Markdown with YAML frontmatter | Agent system prompt + behavior rules | Claude Code's native agent definition format; registered in plugin.json |
| `commands/professor/*.md` | Markdown with YAML frontmatter | Slash command entry points | Plugin `commands/` directory — pre-registered in plugin.json for all 14 commands |
| `courses/{slug}/COURSE.md` | Plain Markdown | Course state, syllabus, progress log | Runtime-created; the single source of truth per SKILL.md spec |
| `courses/{slug}/LECTURE.md` | Plain Markdown | Current section content | Runtime-created, overwritten by professor:next each time |
| `courses/{slug}/CAPSTONE.md` | Plain Markdown | Capstone project brief | Runtime-created once, immutable after creation |

### Supporting

| Concept | Tool | Purpose | When Used |
|---------|------|---------|-----------|
| Web search | Claude's built-in web search | Research topic content when creating courses and sections | professor:new-topic, professor:next |
| AskUserQuestion | Claude's built-in tool | Collect structured multi-part input from users | professor:new-topic, professor:stuck, professor:quiz |
| File Read/Write | Claude's built-in tools | Manage COURSE.md, LECTURE.md, CAPSTONE.md | All state-changing commands |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat command files in `commands/` | Skills in `skills/` with SKILL.md | Skills are the newer approach; commands are simpler and already pre-registered in plugin.json — do not migrate |
| Agent holds all behavior | Duplicate rules in each command file | Duplication causes drift; agent-as-brain is the locked decision |
| Inline behavior in commands | `@reference` to agent file | Commands are thin entry points by design |

**Installation:** None. No packages to install. All files are Markdown.

---

## Architecture Patterns

### Recommended Project Structure

```
agents/
└── professor.md              # Agent brain — all Socratic rules, state logic, command behaviors

commands/professor/
├── new-topic.md              # Thin: "Start a new course. Use AskUserQuestion for 4 inputs."
├── next.md                   # Thin: "Load the next section into LECTURE.md."
├── done.md                   # Thin: "Mark current section complete. Confirm understanding first."
├── review.md                 # Thin: "Review user's work with Socratic feedback."
├── hint.md                   # Thin: "Give the next hint layer. Don't skip layers."
├── stuck.md                  # Thin: "Structured breakdown. Use AskUserQuestion first."
├── syllabus.md               # Thin: "Display COURSE.md contents."
├── progress.md               # Thin: "Summarize progress from COURSE.md."
├── discuss.md                # Thin: "Conceptual Q&A only. No code dumps."
├── quiz.md                   # Thin: "Generate quiz. Use AskUserQuestion for scope."
├── capstone.md               # Thin: "Display CAPSTONE.md. Note unlock status."
└── capstone-review.md        # Thin: "Full project review. Only if all sections done."

# Runtime-created by the professor agent (not in this repo):
courses/{topic-slug}/
├── COURSE.md
├── LECTURE.md
└── CAPSTONE.md
```

### Pattern 1: Agent File Structure

**What:** The agent file is the system prompt that governs all professor behavior. It uses YAML frontmatter for Claude Code metadata, followed by full Markdown body as the system prompt.

**When to use:** One agent file, all behavior. Commands delegate to this.

**Example (from official docs, verified HIGH confidence):**
```markdown
---
name: professor
description: >
  A Socratic teaching assistant. Triggers when user runs any professor:* command,
  asks to learn something, says "teach me X", "create a course for X",
  or asks for help understanding a topic. Reads courses/ at session start to restore
  course context before responding. NEVER writes code for the user — always guides.
tools: Read, Write, Bash, WebSearch
---

You are Professor Claude...
[full system prompt from SKILL.md translated here]
```

**Key facts about agent frontmatter (HIGH confidence — official docs):**
- `name`: Required. Unique identifier, lowercase + hyphens.
- `description`: Required. Claude uses this to decide when to auto-delegate. Write it to match natural user phrasing AND slash command invocations.
- `tools`: Optional. If omitted, inherits all tools. Specify to restrict.
- `model`: Optional. `sonnet`, `opus`, `haiku`, or `inherit` (default).
- `skills`: Optional. Load skill content into agent context at startup.
- `color`: Optional. UI color for identification.

### Pattern 2: Thin Command File Structure

**What:** Command files in `commands/professor/` are simple Markdown files (not SKILL.md directories). They route user intent to the professor agent.

**When to use:** Each of the 12 commands gets one thin file.

**Example:**
```markdown
---
name: professor:new-topic
description: Start a new Socratic learning course on a topic
argument-hint: [topic]
---

Start a new course. Collect context from the user with a single AskUserQuestion
call containing these 4 questions:
1. What do you want to learn?
2. What is your current experience with this topic?
3. What level are you aiming for? (Beginner / Intermediate / Advanced / Expert)
4. What do you want to be able to build or do after this course?

Then propose the syllabus inline in chat (do not write COURSE.md yet).
Frame each section around the user's stated goal.
After the user confirms, write COURSE.md and CAPSTONE.md together.

$ARGUMENTS
```

**Key facts about command frontmatter (HIGH confidence — official docs):**
- `name`: Required. Must match registration in plugin.json (e.g., `professor:new-topic`).
- `description`: Shown in UI autocomplete. Describes what command does.
- `argument-hint`: Optional. Shows expected arguments in autocomplete.
- `allowed-tools`: Optional. Tools available without per-use permission when command is active.
- `disable-model-invocation`: Optional. `true` = only user can invoke (not Claude automatically). Default `false`.

### Pattern 3: Context Auto-Restoration via Description

**What:** The professor agent's description field is engineered to trigger auto-restoration of course context at session start.

**Why it works:** Claude Code loads agent descriptions into context and auto-delegates when tasks match. A description that says "reads courses/ at session start" causes Claude to invoke the agent at the beginning of sessions.

**Implementation note:** The description should include trigger phrases for:
- Any `professor:*` command invocation
- Natural language learning requests ("teach me X", "I want to learn X")
- Session start context restoration cue

### Pattern 4: AskUserQuestion for Structured Input

**What:** Use Claude's `AskUserQuestion` tool to collect multi-part input in a single interactive call rather than sequential chat turns.

**When:** `professor:new-topic` (4 questions), `professor:stuck` (1 structured question), `professor:quiz` (scope selection).

**Behavior:** AskUserQuestion blocks until user responds, then continues. For background subagents, AskUserQuestion fails silently — acceptable since professor always runs in foreground.

### Pattern 5: COURSE.md as Single Source of Truth

**What:** All course state (sections, status, progress log) lives in `courses/{slug}/COURSE.md`. The agent reads this at every session start. The agent updates it immediately after every state change.

**When to update:**
- `professor:next` → change section status from ⬜ to 🔄
- `professor:done` → change section status from 🔄 to ✅, add progress log entry
- `professor:capstone-review` (verdict: complete) → update capstone status to ✅

**LECTURE.md is disposable:** Overwritten by each `professor:next`. Never treated as state.

**CAPSTONE.md is immutable:** Written once during `professor:new-topic`. Never edited.

### Anti-Patterns to Avoid

- **Duplicating Socratic rules in command files:** All absolute rules (never write code, never skip hint layers, capstone lockdown) live in `agents/professor.md` only. Command files only route attention.
- **Migrating commands to skills/SKILL.md format:** The plugin already pre-registers paths like `commands/professor/new-topic.md` in plugin.json. Do not change the file format or location.
- **Writing COURSE.md before user confirmation in new-topic:** The locked decision is: propose syllabus inline first, write file only after user confirms.
- **Putting courses/ inside the plugin directory:** Courses are created at runtime in the user's working directory. The plugin repo contains no course files.
- **Using the `.claude-plugin/` manifest location:** This plugin uses root-level `plugin.json` (an older or alternative convention that is already working from Phase 1). Do not restructure.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session state across context windows | Custom state serialization | COURSE.md as the state file | Already the spec; Markdown survives context resets |
| User input collection | Sequential chat turns | `AskUserQuestion` tool | Built-in structured input; locked decision |
| Web content for course creation | Static built-in syllabi | Claude's web search at runtime | Keeps content current; already specified in SKILL.md |
| Progress calculation | Separate tracking database | Parse status icons in COURSE.md table | No infrastructure needed; ⬜/🔄/✅/🔒 are the source |
| Command routing logic | Complex dispatch | Thin command files + agent description | Claude handles routing via description matching |

**Key insight:** This plugin has zero infrastructure. All "logic" is Claude interpreting Markdown instructions. The planner should never create tasks that involve databases, config files, or programmatic state.

---

## Common Pitfalls

### Pitfall 1: Agent Description Too Generic

**What goes wrong:** Claude doesn't auto-delegate to the professor agent when users run `professor:*` commands or make learning requests. Users must explicitly invoke the agent.

**Why it happens:** The `description` field is how Claude decides when to delegate. A vague description like "teaching assistant" won't trigger reliably.

**How to avoid:** Write the description to match every trigger scenario:
1. Explicit slash command patterns (`professor:*`)
2. Natural language learning requests ("teach me", "I want to learn", "create a course")
3. Session start cue ("reads courses/ at startup to restore context")

**Warning signs:** Users report needing to explicitly say "use the professor agent" instead of natural invocation.

### Pitfall 2: Command Files That Duplicate Rules

**What goes wrong:** Socratic rules drift between the agent file and individual command files. After edits, the hint command allows code nudges while the agent file doesn't.

**Why it happens:** Developers add behavior to command files for "completeness" rather than relying on agent delegation.

**How to avoid:** Command files contain ONLY: (1) action-specific routing instructions, (2) `$ARGUMENTS` reference if needed, (3) any locked interaction flow steps (like AskUserQuestion calls). Zero Socratic rules.

**Warning signs:** A command file is more than ~20 lines.

### Pitfall 3: Forgetting the Courses/ Path Assumption

**What goes wrong:** Agent looks for `courses/` relative to the plugin install location (`~/.claude/plugins/professor/courses/`) instead of the user's working directory.

**Why it happens:** Path confusion between plugin directory and user's project directory.

**How to avoid:** The agent file must instruct the professor to read/write `courses/` relative to the current working directory (where the user's project lives). This is a runtime directory, not a plugin directory.

**Warning signs:** `courses/` ends up inside the plugin installation, not in the user's project.

### Pitfall 4: COURSE.md Written Before User Confirms Syllabus

**What goes wrong:** User can't iterate on the syllabus without editing a file. The conversational review flow is broken.

**Why it happens:** Following the old SKILL.md spec which creates files immediately after generating the syllabus.

**How to avoid:** `professor:new-topic` flow:
1. AskUserQuestion (4 inputs)
2. Propose syllabus in chat (no file written yet)
3. User confirms or requests changes
4. On confirmation: write COURSE.md + CAPSTONE.md simultaneously

**Warning signs:** COURSE.md appears in the file system before user says "looks good."

### Pitfall 5: Hint Layer State Not Tracked

**What goes wrong:** The professor gives Layer 3 (pseudo-code) on the first `professor:hint` call, skipping layers 1 and 2.

**Why it happens:** No state mechanism to track how many hints have been given this session for the current exercise.

**How to avoid:** The agent file must instruct the professor to infer hint layer from context (count how many `professor:hint` calls appear in conversation history for the current section). No database needed — conversation history is the state.

**Warning signs:** User reports receiving pseudo-code on first hint request.

### Pitfall 6: Capstone-Review Available Before All Sections Done

**What goes wrong:** User runs `professor:capstone-review` mid-course and receives a review.

**Why it happens:** Command file lacks gate check; agent doesn't verify COURSE.md status before proceeding.

**How to avoid:** The `professor:capstone-review` command and agent behavior must: (1) read COURSE.md, (2) check all non-capstone rows are ✅, (3) refuse if any are not ✅.

**Warning signs:** Capstone review proceeds when COURSE.md shows ⬜ or 🔄 sections.

---

## Code Examples

Verified patterns from SKILL.md (HIGH confidence — primary source) and official docs (HIGH confidence):

### Agent File Frontmatter Pattern

```markdown
---
name: professor
description: >
  A Socratic teaching assistant that helps users learn technology concepts by
  asking questions rather than giving answers. Invoke for any professor:* command,
  when user says "teach me X", "I want to learn X", "create a course for X",
  "help me understand X", or asks for code review on a learning topic.
  At every session start, reads courses/ in the working directory to restore
  course context before responding.
  NEVER writes working code for the user — guides, questions, and instructs only.
tools: Read, Write, Bash, WebSearch
color: blue
---

You are Professor Claude — a Socratic technology mentor...
```

### Command File Pattern (Thin Routing)

```markdown
---
name: professor:review
description: Review your code or answer with Socratic feedback
---

Review the user's work using the Socratic review structure:
1. What's working — acknowledge what they got right (1-2 sentences)
2. Socratic question — point to the most important gap with a question, not a correction
3. One concept to study — name it, don't explain it fully
4. Next action — one clear thing to try

Do NOT rewrite their code. Focus on one issue at a time.

$ARGUMENTS
```

### Command File Pattern (With AskUserQuestion)

```markdown
---
name: professor:stuck
description: Get structured guidance when genuinely blocked on a problem
---

The user is stuck. Before diving into the breakdown:

Use AskUserQuestion to ask: "Walk me through what you've tried so far."
Offer structured options: "I described it below" / "Nothing yet" / "Tried X but got stuck on Y"

Then based on their response:
1. Identify the exact sticking point (concept gap / syntax issue / logic error)
2. Break the problem into smaller steps — forget the full solution
3. Give a worked analogy using a simpler, different example
4. Guide them to the next smallest step — do NOT write the solution

$ARGUMENTS
```

### COURSE.md Template (from SKILL.md — HIGH confidence)

```markdown
# Course: [Topic Name]
**Level**: [Beginner / Intermediate / Advanced / Expert]
**Learner background**: [brief summary]
**Started**: [date]
**Last active**: [date]
**Estimated total time**: [X hours]
**Capstone status**: Locked (complete all sections to unlock)

## Learning Objectives
By the end of this course, you will be able to:
- [objective 1]
- [objective 2]

## Syllabus & Progress

| # | Section Title | Status | Completed |
|---|---------------|--------|-----------|
| 1 | [name] | Not started | — |
| 2 | [name] | Not started | — |
| Capstone | Capstone Project | Locked | — |

Status legend: Not started / In progress / Done / Locked

## Progress Log

| Date | Section | Activity | Notes |
|------|---------|----------|-------|
| [date] | — | Course created | Level: [X], Background: [summary] |
```

### Status Transition Rules (from SKILL.md — HIGH confidence)

```
professor:next   → section: Not started → In progress (update COURSE.md, update Last active)
professor:done   → section: In progress → Done (update COURSE.md, add Progress Log entry)
                 → if all sections Done: trigger Capstone Unlock message, update Capstone status
professor:capstone-review (verdict: Complete) → Capstone: In progress → Done (with date)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Skills in `.claude/commands/` flat files | Skills in `.claude/skills/name/SKILL.md` with directory | Recent Claude Code update | Commands dir still works; don't migrate — plugin.json already registered flat command paths |
| `commands/` for everything | `commands/` (legacy) vs `skills/` (new) | 2025 | For this plugin: use `commands/` since plugin.json is pre-configured that way |
| Single-file agents | Agent files with `skills:` preloading | Current | Agent can have skills injected at startup — not needed for professor since agent body IS the behavior |

**Deprecated/outdated:**
- Old `profesor:` prefix (with single 's'): The plugin uses `professor:` (double 's'). SKILL.md uses the old prefix — must translate to new prefix in all command files and agent description.
- Creating COURSE.md immediately in `new-topic`: Old SKILL.md does this. Locked decision requires inline-first proposal.

---

## Open Questions

1. **Plugin.json manifest format vs official `.claude-plugin/plugin.json` format**
   - What we know: The project uses a root-level `plugin.json` with an `agents[]` and `commands[]` array with `{name, file}` objects. Official docs show the plugin manifest lives in `.claude-plugin/plugin.json`.
   - What's unclear: Whether the root-level `plugin.json` with the Phase 1 format is a valid older convention or a project-specific convention for local dev/symlink installs.
   - Recommendation: Phase 1 created this structure and it works. Do not restructure. The agent and command files just need to exist at the paths already registered.

2. **`professor:note` and `professor:export` command files — stub or skip?**
   - What we know: Both commands are pre-registered in plugin.json. Phase 2 scope covers CMD-01 through CMD-12 (not CMD-13/professor:note or CMD-14/professor:export). Those are Phase 3 and Phase 5.
   - What's unclear: Whether stubs (placeholder files) should be created for `note.md` and `export.md` to prevent "command not found" errors.
   - Recommendation: Create minimal stub files for `note.md` and `export.md` that say "This command is coming in a future update." This prevents user confusion if someone tries them. Include as a small task in Phase 2 since the files are pre-registered.

3. **Hint layer session tracking**
   - What we know: `professor:hint` should give Layer 1 first, Layer 2 second, Layer 3 third. No external state store.
   - What's unclear: How reliably Claude can count hint invocations from conversation history for the current section. This could fail if the session is long.
   - Recommendation: Instruct the agent to use conversation history to count hints. Accept that this is best-effort. Document as a known limitation.

---

## Validation Architecture

> nyquist_validation is `true` in .planning/config.json — section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test files, no test config, no package.json test script |
| Config file | None |
| Quick run command | N/A — see Wave 0 |
| Full suite command | N/A — see Wave 0 |

**Critical note:** This is a Markdown-only plugin. There is no executable code to unit test (the hooks/pre-compact.js is Phase 4). Automated testing of Claude behavior from static Markdown files is not feasible with standard test runners.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGT-01 | Agent file exists with valid frontmatter (name, description fields) | manual-only | `test -f agents/professor.md && echo PASS` (existence check only) | ❌ Wave 0 |
| CMD-01 | `professor:new-topic` command file exists at registered path | manual-only | `test -f commands/professor/new-topic.md && echo PASS` | ❌ Wave 0 |
| CMD-02 | `professor:next` command file exists at registered path | manual-only | `test -f commands/professor/next.md && echo PASS` | ❌ Wave 0 |
| CMD-03 | `professor:review` command file exists at registered path | manual-only | `test -f commands/professor/review.md && echo PASS` | ❌ Wave 0 |
| CMD-04 | `professor:done` command file exists at registered path | manual-only | `test -f commands/professor/done.md && echo PASS` | ❌ Wave 0 |
| CMD-05 | `professor:hint` command file exists at registered path | manual-only | `test -f commands/professor/hint.md && echo PASS` | ❌ Wave 0 |
| CMD-06 | `professor:stuck` command file exists at registered path | manual-only | `test -f commands/professor/stuck.md && echo PASS` | ❌ Wave 0 |
| CMD-07 | `professor:syllabus` command file exists at registered path | manual-only | `test -f commands/professor/syllabus.md && echo PASS` | ❌ Wave 0 |
| CMD-08 | `professor:progress` command file exists at registered path | manual-only | `test -f commands/professor/progress.md && echo PASS` | ❌ Wave 0 |
| CMD-09 | `professor:discuss` command file exists at registered path | manual-only | `test -f commands/professor/discuss.md && echo PASS` | ❌ Wave 0 |
| CMD-10 | `professor:quiz` command file exists at registered path | manual-only | `test -f commands/professor/quiz.md && echo PASS` | ❌ Wave 0 |
| CMD-11 | `professor:capstone` command file exists at registered path | manual-only | `test -f commands/professor/capstone.md && echo PASS` | ❌ Wave 0 |
| CMD-12 | `professor:capstone-review` command file exists at registered path | manual-only | `test -f commands/professor/capstone-review.md && echo PASS` | ❌ Wave 0 |

**Why all manual-only:** Claude Code agent/command files are Markdown prompts. Their correctness is behavioral (does Claude follow the instructions?), not structural (does the code compile?). The only automatable check is file existence and basic YAML frontmatter validity.

### Sampling Rate

- **Per task commit:** `test -f [created-file] && echo PASS || echo FAIL` (file existence)
- **Per wave merge:** Manually verify plugin loads in Claude Code using `/agents` command
- **Phase gate:** Install plugin locally and smoke-test `professor:new-topic` end-to-end before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] All 12 command files in `commands/professor/` — none exist yet
- [ ] `agents/professor.md` — does not exist yet (only `.gitkeep` in agents/)
- [ ] `commands/professor/note.md` — stub for Phase 3 command (pre-registered)
- [ ] `commands/professor/export.md` — stub for Phase 5 command (pre-registered)

---

## Sources

### Primary (HIGH confidence)

- `professor-skill/SKILL.md` — Canonical behavior spec: all command behaviors, file formats, absolute rules, level calibration table
- `plugin.json` — Plugin manifest: exact file paths and names for all 14 pre-registered commands
- `https://code.claude.com/docs/en/sub-agents` — Official Claude Code agent file format, frontmatter fields, description-driven delegation, plugin agent priority
- `https://code.claude.com/docs/en/slash-commands` (redirected to skills page) — Command file format, frontmatter fields, $ARGUMENTS substitution
- `https://code.claude.com/docs/en/plugins-reference` — Plugin component reference: commands/ as legacy format, agents/ location, file structure

### Secondary (MEDIUM confidence)

- Existing GSD agent files in `.claude/agents/` — Confirmed frontmatter pattern (`name`, `description`, `tools`, `color`, `skills`) as used in production GSD workflow
- `02-CONTEXT.md` — Locked decisions on architecture, interaction flows, AskUserQuestion usage

### Tertiary (LOW confidence)

- None used

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — official docs confirm agent and command file formats, frontmatter fields, and discovery mechanism
- Architecture: HIGH — locked decisions from CONTEXT.md + SKILL.md spec provide exact behavior; official docs confirm the file format
- Pitfalls: HIGH — derived from locked decisions (prefix change, file-write timing) + official docs (description field purpose) + direct reading of SKILL.md

**Research date:** 2026-03-06
**Valid until:** 2026-06-06 (60 days — stable platform, plugin format unlikely to change)
