# Roadmap: Course Learning Plugin

## Overview

Five phases transform the existing professor-skill-v3 into a full Claude Code plugin. The scaffold comes first to establish the target structure, then the professor agent is packaged with all its course commands, then personal notes and the PreCompact session-save hook are layered on, and finally the Notion/Obsidian export pipeline completes the knowledge-retention story.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Plugin Scaffold** - Establish plugin.json, directory layout, and README with setup instructions (completed 2026-03-05)
- [x] **Phase 1b: CLI Auto-Setup** - Add npx-based auto-setup for any AI agent (completed 2026-03-06)
- [x] **Phase 2: Professor Agent and Core Commands** - Package professor-skill-v3 as a Claude Code agent and wire all 12 course commands (completed 2026-03-06)
- [x] **Phase 3: Notes Feature** - Add NOTES.md per-course file and the professor:note command (completed 2026-03-06)
- [ ] **Phase 4: PreCompact Hook** - Token warning and auto-save session state before context compression
- [ ] **Phase 5: Export Feature** - Notion and Obsidian export via MCP with user destination choice

## Phase Details

### Phase 1: Plugin Scaffold
**Goal**: A valid Claude Code plugin directory exists that can be installed and recognized by the runtime
**Depends on**: Nothing (first phase)
**Requirements**: PLG-01, PLG-02, PLG-03
**Success Criteria** (what must be TRUE):
  1. `plugin.json` exists at the plugin root with valid metadata, version, and registrations for agents, commands, and hooks
  2. Directory layout matches Claude Code conventions with `agents/`, `commands/`, and `hooks/` directories present
  3. README contains step-by-step install instructions including Notion MCP config and Obsidian MCP config
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Create plugin.json manifest and scaffold agents/, commands/professor/, hooks/ directories
- [ ] 01-02-PLAN.md — Write README with install guide, Notion MCP setup, Obsidian MCP setup, and Socratic method explanation

### Phase 1b: CLI Auto-Setup
**Goal**: Enable `npx course-professor` to auto-detect and configure for any supported AI agent
**Depends on**: Phase 1
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05
**Success Criteria** (what must be TRUE):
  1. User can run `npx course-professor init` for auto-detection
  2. User can run `npx course-professor setup <agent>` for manual selection
  3. Supports agents: claude, opencode, gemini, agent
  4. Setup creates proper directory structure with all commands
  5. No manual file copying required
**Plans**: 1 plan

Plans:
- [x] 01b-PLAN.md — CLI auto-setup feature (already implemented)

### Phase 2: Professor Agent and Core Commands
**Goal**: Users can start and run a full Socratic learning course through slash commands powered by the professor agent
**Depends on**: Phase 1
**Requirements**: AGT-01, CMD-01, CMD-02, CMD-03, CMD-04, CMD-05, CMD-06, CMD-07, CMD-08, CMD-09, CMD-10, CMD-11, CMD-12
**Success Criteria** (what must be TRUE):
  1. User can run `professor:new-topic` and receive a course syllabus with hybrid review-before-start flow
  2. User can navigate a course with `professor:next`, `professor:done`, `professor:review`, `professor:syllabus`, and `professor:progress` commands
  3. User can get help during a section with `professor:hint`, `professor:stuck`, and `professor:discuss` without receiving direct answers
  4. User can run `professor:quiz` on the current topic and receive a Socratic quiz session
  5. User can run `professor:capstone` and `professor:capstone-review` to work through the course capstone project
**Plans**: 4 plans

Plans:
- [ ] 02-01-PLAN.md — Write agents/professor.md — the professor agent brain with all Socratic rules and command behaviors
- [ ] 02-02-PLAN.md — Write navigation commands: new-topic, next, done, review, syllabus, progress
- [ ] 02-03-PLAN.md — Write assistance commands: hint, stuck, discuss, quiz
- [ ] 02-04-PLAN.md — Write capstone commands (capstone, capstone-review) and future-phase stubs (note, export)

### Phase 3: Notes Feature
**Goal**: Users can capture personal notes tied to a course and have them automatically available throughout learning
**Depends on**: Phase 2
**Requirements**: CMD-13, NOT-01
**Success Criteria** (what must be TRUE):
  1. When a new course starts via `professor:new-topic`, a NOTES.md file is automatically created in `courses/{slug}/`
  2. User can run `professor:note` with text and the note is appended to the active course's NOTES.md with a timestamp
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — Implement NOTES.md auto-creation on new-topic and professor:note command

### Phase 4: PreCompact Hook
**Goal**: Users never lose session progress silently when Claude's context is about to be compressed
**Depends on**: Phase 2
**Requirements**: HOK-01, HOK-02
**Success Criteria** (what must be TRUE):
  1. When context approaches the compression threshold, the user sees a visible token-limit warning message before the reset occurs
  2. The active section, progress, and key session state are written to COURSE.md before context is compressed, so resuming the course picks up where the user left off
**Plans**: TBD

Plans:
- [ ] 04-01: Implement PreCompact hook with token warning display and COURSE.md session-state auto-save

### Phase 5: Export Feature
**Goal**: Users can push their entire learning journey — notes, answers, and summaries — to Notion or Obsidian for long-term retention
**Depends on**: Phase 3
**Requirements**: CMD-14, EXP-01, EXP-02, EXP-03
**Success Criteria** (what must be TRUE):
  1. User can run `professor:export` and is prompted to choose between Notion and Obsidian as the export destination
  2. Choosing Notion sends lecture notes, user review answers, concept summaries, COURSE.md, and NOTES.md to a Notion page via MCP
  3. Choosing Obsidian sends the same course content to the Obsidian vault via Obsidian MCP server
**Plans**: TBD

Plans:
- [ ] 05-01: Implement professor:export command with destination selector
- [ ] 05-02: Implement Notion export path (MCP tool calls, content assembly)
- [ ] 05-03: Implement Obsidian export path (MCP tool calls, content assembly)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 1b → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Scaffold | 2/2 | Complete   | 2026-03-05 |
| 1b. CLI Auto-Setup | 1/1 | Complete   | 2026-03-06 |
| 2. Professor Agent and Core Commands | 4/4 | Complete   | 2026-03-06 |
| 3. Notes Feature | 1/1 | Complete    | 2026-03-06 |
| 4. PreCompact Hook | 0/1 | Not started | - |
| 5. Export Feature | 0/3 | Not started | - |
| 6. agent able to get and manage context through all course | 0/0 | Not started | - |

### Phase 6: agent able to get and manage context through all course

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 1/1 plans complete

Plans:
- [ ] TBD (run /gsd:plan-phase 6 to break down)
