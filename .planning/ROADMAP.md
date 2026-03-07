# Roadmap: Course Learning Plugin

## Overview

Five phases transform the existing professor-skill-v3 into a full Claude Code plugin. The scaffold comes first to establish the target structure, then the professor agent is packaged with all its course commands, then personal notes and the PreCompact session-save hook are layered on, and finally the Notion/Obsidian export pipeline completes the knowledge-retention story.

v1.1 adds Git Worktree-based courses - each technology learned gets its own git worktree, with learning files alongside the user's project code.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Plugin Scaffold** - Establish plugin.json, directory layout, and README with setup instructions (completed 2026-03-05)
- [x] **Phase 1b: CLI Auto-Setup** - Add npx-based auto-setup for any AI agent (completed 2026-03-06)
- [x] **Phase 2: Professor Agent and Core Commands** - Package professor-skill-v3 as a Claude Code agent and wire all 12 course commands (completed 2026-03-06)
- [x] **Phase 3: Notes Feature** - Add NOTES.md per-course file and the professor:note command (completed 2026-03-06)
- [x] **Phase 4: PreCompact Hook** - Token warning and auto-save session state before context compression (completed 2026-03-06)
- [x] **Phase 5: Export Feature** - Notion and Obsidian export via MCP with user destination choice (completed 2026-03-06)
- [x] **Phase 6: Course Archive and Context Management** - Archive completed courses preserving learning context (completed 2026-03-07)
- [x] **Phase 7: Git Worktree Courses** - Each technology learned = separate git worktree (completed 2026-03-07)
- [x] **Phase 8: Auto-create Exercise Files** - Automatically create exercise files when professor:next is called (completed 2026-03-08)
- [ ] **Phase 9: Backend Foundation** - Express server with course API, chat API (SSE), WebSocket server
- [ ] **Phase 10: Client Components** - React split-pane UI with LecturePanel, ChatPanel, command pills
- [ ] **Phase 11: Integration** - CLI web command, production build, static file serving

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
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Implement PreCompact hook with token warning display and COURSE.md session-state auto-save

### Phase 5: Export Feature
**Goal**: Users can push their entire learning journey — notes, answers, and summaries — to Notion or Obsidian for long-term retention
**Depends on**: Phase 3
**Requirements**: CMD-14, EXP-01, EXP-02, EXP-03
**Success Criteria** (what must be TRUE):
  1. User runs `professor:export` and is prompted to choose Notion or Obsidian
  2. **Notion export**: Creates parent page with course properties, child pages for each lecture, separate "Notes" child page, code referenced (not embedded), capstone + summary as child pages
  3. **Obsidian export**: Creates folder per course with .md files, user provides/configures vault path
  4. If MCP not available, show helpful setup instructions (link to README)
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — Implement professor:export command with destination selector (Notion/Obsidian)
- [x] 05-02-PLAN.md — Implement Notion export path (MCP tool calls, content assembly, child pages for lectures/notes)
- [ ] 05-03-PLAN.md — Implement Obsidian export path (MCP tool calls, user vault path, folder/file structure)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 1b → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Scaffold | 2/2 | Complete   | 2026-03-05 |
| 1b. CLI Auto-Setup | 1/1 | Complete   | 2026-03-06 |
| 2. Professor Agent and Core Commands | 4/4 | Complete   | 2026-03-06 |
| 3. Notes Feature | 1/1 | Complete    | 2026-03-06 |
| 4. PreCompact Hook | 1/1 | Complete    | 2026-03-06 |
| 5. Export Feature | 3/3 | Complete    | 2026-03-06 |
| 6. Course Archive and Context | 1/1 | Complete    | 2026-03-07 |
| 7. Git Worktree Courses | 1/1 | Complete    | 2026-03-07 |
| 8. Auto-create Exercise Files | 1/1 | Complete    | 2026-03-08 |
| 9. Backend Foundation | 0/1 | Not started | - |
| 10. Client Components | 0/1 | Not started | - |
| 11. Integration | 0/1 | Not started | - |

### Phase 6: Course Archive and Context Management

**Goal:** Allow technical learners to archive completed courses with full context (notes, summary, syllabus) while leaving code exercises behind, plus improve context management for technical courses
**Depends on:** Phase 5
**Requirements**: ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):
  1. Course folder can include `exercises/` subfolder for code artifacts
  2. User can run `professor:archive` after course completion to archive learning context
  3. Archive creates `.course_archive/{slug}/` with COURSE.md, NOTES.md, CAPSTONE.md, and SUMMARY.md (comprehensive retrospective)
  4. Original course folder is deleted after successful archive
  5. Exercises folder is left behind (user has code locally)
**Plans**: 1 plan

Plans:
- [x] 06-01-PLAN.md — Implement professor:archive command with course archive and exercises handling

### Phase 7: Git Worktree Courses

**Goal:** Each technology learned = one git worktree. User's code lives in the worktree alongside learning files. When archived, learning context is preserved to `.course_archive/` before worktree is cleaned up.
**Depends on:** Phase 6
**Requirements**: WORK-01, WORK-02, WORK-03, WORK-04, ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, FILE-01, FILE-02, FILE-03, FILE-04, CMD-15, CMD-16, CMD-17
**Success Criteria** (what must be TRUE):
  1. User can create a new course as a git worktree at `learning/{tech-slug}/`
  2. Learning files (COURSE.md, NOTES.md, CAPSTONE.md) live in worktree root alongside project code
  3. User can list all existing learning worktrees
  4. User can switch between learning worktrees
  5. Archiving copies learning files to `.course_archive/{slug}/` before removing worktree
  6. User's code remains in worktree (not deleted with the worktree)
**Plans**: 1 plan

Plans:
- [x] 07-01-PLAN.md — Implement git worktree-based course structure and worktree management

### Phase 8: Auto-create Exercise Files

**Goal:** Automatically create exercise files when professor:next is called, instead of making users create files manually. Exercise files are templates with comments, not working code.
**Requirements**: EXER-01, EXER-02, EXER-03, EXER-04
**Depends on:** Phase 7
**Plans:** 1/1 plans complete
**Status:** Complete (2026-03-08)

Plans:
- [x] 08-01-PLAN.md — Auto-create exercise files on professor:next

### Phase 9: Backend Foundation

**Goal:** Express server running with working course API, chat API (SSE), and WebSocket server for real-time lecture updates.

**Depends on:** Phase 8

**Requirements:** WEB-01, WEB-02, WEB-03, WEB-04, WEB-05, WEB-06, WEB-07, WEB-08

**Success Criteria** (what must be TRUE):
1. Express server starts on configurable port (default 3000) when `npm run web` is executed
2. GET `/api/courses` returns JSON array of courses with slug, name, and lastActive fields
3. GET `/api/courses/:slug/:file` returns raw content of COURSE.md, LECTURE.md, NOTES.md, or CAPSTONE.md
4. POST `/api/chat` with message accepts request and initiates SSE stream to client
5. Chat API loads behavioral rules from `agents/professor.md` for Socratic consistency
6. Chat API includes relevant course context (current lecture, progress) in Claude requests
7. WebSocket server runs alongside HTTP server and accepts client connections
8. POST `/api/notify` broadcasts "lecture-updated" event to all connected WebSocket clients

**Plans:** 1 plan

Plans:
- [ ] 09-01-PLAN.md — Implement Express backend with course API, chat API (SSE), and WebSocket server

---

### Phase 10: Client Components

**Goal:** React client with split-pane layout, lecture panel with markdown rendering, chat panel with streaming and context-aware command pills.

**Depends on:** Phase 9

**Requirements:** WEB-09, WEB-10, WEB-11, WEB-12, WEB-13, WEB-14, WEB-15, WEB-16, WEB-22

**Success Criteria** (what must be TRUE):
1. Browser displays two-panel layout: lecture panel (left ~40%) and chat panel (right ~60%)
2. LecturePanel renders LECTURE.md content as formatted markdown with syntax-highlighted code blocks
3. LecturePanel automatically fetches new content when WebSocket receives "lecture-updated" event
4. ChatPanel displays streaming Claude responses character-by-character as they arrive via SSE
5. ChatPanel shows command pills (buttons) above or below chat input
6. Command pills update based on current learning phase: idle shows new-topic, lecture shows hint/review/quiz, exercise shows hint/stuck/review, review shows done/hint
7. Top bar displays course selector dropdown listing all available courses
8. Top bar shows current course name and last active timestamp as progress indicator
9. All markdown rendered anywhere in the UI is sanitized with DOMPurify to prevent XSS attacks

**Plans:** 1 plan

Plans:
- [ ] 10-01-PLAN.md — Implement React client with LecturePanel, ChatPanel, WebSocket hook, and DOMPurify sanitization

---

### Phase 11: Integration

**Goal:** CLI web command launches server, production build creates optimized bundle, Express serves static files in production mode.

**Depends on:** Phase 10

**Requirements:** WEB-17, WEB-18, WEB-19, WEB-20, WEB-21

**Success Criteria** (what must be TRUE):
1. Running `npx course-professor web` in CLI starts the Express server and opens web UI
2. `npx course-professor web 8080` starts server on port 8080 instead of default 3000
3. Web UI reads and writes to the same `courses/` directory that the CLI uses (no separate data store)
4. Running `npm run build` in project root creates optimized React bundle in `client/dist/`
5. When NODE_ENV=production, Express serves static React build from `client/dist/` instead of proxying to Vite dev server

**Plans:** 1 plan

Plans:
- [ ] 11-01-PLAN.md — Implement CLI web command, production build, and static file serving

---

## v2.0 Coverage

All 22 v2.0 requirements mapped to phases:

| Requirement | Phase |
|-------------|-------|
| WEB-01 | Phase 9 |
| WEB-02 | Phase 9 |
| WEB-03 | Phase 9 |
| WEB-04 | Phase 9 |
| WEB-05 | Phase 9 |
| WEB-06 | Phase 9 |
| WEB-07 | Phase 9 |
| WEB-08 | Phase 9 |
| WEB-09 | Phase 10 |
| WEB-10 | Phase 10 |
| WEB-11 | Phase 10 |
| WEB-12 | Phase 10 |
| WEB-13 | Phase 10 |
| WEB-14 | Phase 10 |
| WEB-15 | Phase 10 |
| WEB-16 | Phase 10 |
| WEB-22 | Phase 10 |
| WEB-17 | Phase 11 |
| WEB-18 | Phase 11 |
| WEB-19 | Phase 11 |
| WEB-20 | Phase 11 |
| WEB-21 | Phase 11 |

**Coverage:** 22/22 requirements mapped ✓
