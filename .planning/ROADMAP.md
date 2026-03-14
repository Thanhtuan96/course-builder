# Roadmap: Course Learning Plugin

## Overview

Five phases transform the existing professor-skill-v3 into a full Claude Code plugin. The scaffold comes first to establish the target structure, then the professor agent is packaged with all its course commands, then personal notes and the PreCompact session-save hook are layered on, and finally the Notion/Obsidian export pipeline completes the knowledge-retention story.

v1.1 adds agent support (Cursor), agent specialization, research-enhanced hints, and MCP documentation.

v2.0 adds Local Web UI (React + Express), Retention Layer (spaced repetition, flashcards, streaks), and Sharing & Templates (course template export/import).

v2.1 adds cloud deployment (Vercel), email + GitHub OAuth authentication, and an open SKILL registry backed by the `professor-skills/` GitHub org.

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
- [x] **Phase 9: Agent Support** - Add Cursor agent support (completed 2026-03-08)
- [x] **Phase 10: Agent Specialization** - Improve and separate agents into specific fields (math, marketing, sales, coaching, bookkeeper, researcher) (completed 2026-03-11)
- [x] **Phase 11: Research-Enhanced Hints** - Give hints with keyword to googling or research + useful conferences (completed 2026-03-11)
- [x] **Phase 12: MCP Documentation** - Document mcp.json for tools needed (notion, obsidian) (verified in README.md)
- [x] **Phase 13: Client Components** - React split-pane UI with LecturePanel, ChatPanel, command pills (v2.0)
- [x] **Phase 14: Integration** - CLI web command, production build, static file serving (v2.0) (completed 2026-03-13)
- [ ] **Phase 15: Retention Layer** - SCHEDULE.md, professor:recall, professor:schedule, streak tracking, time tracking (v2.0)
- [ ] **Phase 16: Sharing and Templates** - professor:template-export, professor:template-import, course sharing workflow (v2.0)
- [ ] **Phase 17: Auto-generate Exercise Files** - Generate exercise files user can work on directly (exclude learning framework - only need instructions)
- [ ] **Phase 18: Cloud Deployment** - Deploy to Vercel with public URL, custom domain, and production env var management (v2.1)
- [ ] **Phase 19: Authentication** - Email + password signup, GitHub OAuth login, persistent sessions (v2.1)
- [ ] **Phase 20: OSS SKILL Registry** - GitHub-backed community registry, webhook sync, CLI install command (v2.1)

## Milestones

**v1.1 (Complete):** Phases 1-12 ✓
**v2.0 (In Progress):** Phases 13-17 — Local Web UI, Retention Layer, Sharing & Templates, Auto-generate Exercise Files
**v2.1 (Planned):** Phases 18-20 — Cloud Deployment, Authentication, OSS SKILL Registry

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

**Current Milestone:** v2.0 (in progress)
**v2.0:** 3 of 17 plans complete

**Execution Order:**
v1.1: 9 → 10 → 11 → 12
v2.0: 13 → 14 → 15 → 16
v2.1: 18 → 19 → 20

### v1.1 Phases

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
| 9. Agent Support (Cursor) | 1/1 | Complete    | 2026-03-08 |
| 10. Agent Specialization | 3/3 | Complete    | 2026-03-11 |
| 11. Research-Enhanced Hints | 1/1 | Complete    | 2026-03-11 |
| 12. MCP Documentation | 0/1 | Not started | - |

### v2.0 Phases

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Client Components | 2/2 | Complete   | 2026-03-11 |
| 14. Integration | 1/1 | Complete    | 2026-03-13 |
| 15. Retention Layer | 1/4 | In Progress|  |
| 16. Sharing and Templates | 0/1 | Not started | - |

### v2.1 Phases

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 18. Cloud Deployment | 0/TBD | Not started | - |
| 19. Authentication | 0/TBD | Not started | - |
| 20. OSS SKILL Registry | 0/TBD | Not started | - |

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

### Phase 9: Agent Support

**Goal:** Add Cursor agent support to CLI and templates.

**Depends on:** Phase 8

**Requirements:** AGENT-01

**Success Criteria** (what must be TRUE):
1. templates/cursor/settings.json exists following templates/claude/ pattern
2. CLI supports 'cursor' in SUPPORTED_AGENTS
3. README documents Cursor setup

**Plans:** 1/1 plans complete

Plans:
- [x] 09-01-PLAN.md — Add Cursor agent support

---

### Phase 10: Agent Specialization

**Goal:** Improve and separate agents into specific agent fields (math, marketing, sales, coaching, bookkeeper, researcher, etc.). Let each agent focus on one job and do it well. Agents can use tools or call other agents.

**Depends on:** Phase 9

**Requirements:** AGT-01

**Success Criteria** (what must be TRUE):
1. Each specialized agent has a clear focus area (e.g., math-agent, marketing-agent, researcher-agent)
2. Agents can delegate to other agents when needed
3. Agents have appropriate tools for their domain

**Plans:** 3/3 plans complete

Plans:
- [x] 10-01-PLAN.md — Create researcher agent and register in plugin.json
- [x] 10-02-PLAN.md — Add delegation from professor to researcher agent + CLI support
- [x] 10-03-PLAN.md — Create researcher agent templates

---

### Phase 11: Research-Enhanced Hints

**Goal:** Enhance professor:hint and professor:stuck commands to provide keywords for googling or research, plus useful conferences/resources to help users figure out solutions themselves.

**Depends on:** Phase 10

**Requirements:** TBD

**Success Criteria** (what must be TRUE):
1. Hints include relevant search keywords
2. Hints suggest useful conferences, tutorials, or documentation
3. Research suggestions are contextual to the current learning topic
4. Static fallback available when live research unavailable

**Plans:** 1/1 plans complete

Plans:
- [x] 11-01-PLAN.md — Enhance hint and stuck commands with research keywords

---

### Phase 12: MCP Documentation

**Goal:** Document mcp.json configuration for tools needed in this project (notion, obsidian, etc.)

**Depends on:** Phase 11

**Requirements:** TBD

**Success Criteria** (what must be TRUE):
1. mcp.json is documented with all required tools
2. Notion MCP configuration is documented
3. Obsidian MCP configuration is documented

**Plans:** To be planned

---

### Phase 13: Client Components

**Goal:** React client with split-pane layout, lecture panel with markdown rendering, chat panel with streaming and context-aware command pills.

**Depends on:** Phase 12

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

**Plans:** 2/2 plans complete

Plans:
- [x] 13-01-PLAN.md — Set up React client project infrastructure with Vite, dependencies, CSS theme, API client, and markdown utilities
- [x] 13-02-PLAN.md — Implement all React components (Header, SplitPane, LecturePanel, ChatPanel, CommandPills, MobileTabSwitcher), hooks (useWebSocket, useSSE), and integrate with backend

---

### Phase 14: Integration

**Goal:** CLI web command launches server, production build creates optimized bundle, Express serves static files in production mode.

**Depends on:** Phase 13

**Requirements:** WEB-17, WEB-18, WEB-19, WEB-20, WEB-21

**Success Criteria** (what must be TRUE):
1. Running `npx course-professor web` in CLI starts the Express server and opens web UI
2. `npx course-professor web 8080` starts server on port 8080 instead of default 3000
3. Web UI reads and writes to the same `courses/` directory that the CLI uses (no separate data store)
4. Running `npm run build` in project root creates optimized React bundle in `client/dist/`
5. When NODE_ENV=production, Express serves static React build from `client/dist/` instead of proxying to Vite dev server

**Plans:** 1/1 plans complete

Plans:
- [x] 14-01-PLAN.md — Implement CLI web command, production build, and static file serving

### Phase 15: Retention Layer

**Goal:** Prevent learners from forgetting completed content through spaced repetition scheduling, interactive recall sessions, streak tracking, and time-per-section logging — all stored in plain Markdown with no external plugin dependencies.

**Depends on:** Phase 14

**Requirements:** RET-01, RET-02, RET-03, RET-04, RET-05

**Success Criteria** (what must be TRUE):
1. `courses/{slug}/SCHEDULE.md` is auto-created when `professor:done` completes a section, containing a spaced repetition queue and flashcard set for that section
2. `professor:recall` runs an interactive recall session: shows due sections, asks 3 Socratic questions per section, user self-rates (clear/fuzzy/forgot), updates SCHEDULE.md with next scheduled date
3. `professor:schedule` displays a read-only dashboard of overdue, due-today, and upcoming reviews
4. Session start auto-checks SCHEDULE.md and displays recall count + streak if items are due
5. Streak (days active) and time-per-section are tracked in COURSE.md and visible in `professor:progress`
6. `professor:export` includes SCHEDULE.md data — flashcards exported as plain Q/A table to Notion; Markdown as-is to Obsidian

**Plans:** 2/4 plans executed

Plans:
- [x] 15-01-PLAN.md — SCHEDULE.md schema and auto-creation on section completion (completed 2026-03-14)
- [x] 15-02-PLAN.md — Time-per-section and streak tracking in COURSE.md (completed 2026-03-14)
- [ ] 15-03-PLAN.md — professor:recall and professor:schedule commands
- [ ] 15-04-PLAN.md — Session start integration and export support for SCHEDULE.md

---

### Phase 16: Sharing and Templates

**Goal:** Enable course syllabus sharing via exportable template files and one-command template import, so instructors and community members can share learning paths without sharing personal progress or notes.

**Depends on:** Phase 15

**Requirements:** SHR-01, SHR-02, SHR-03

**Success Criteria** (what must be TRUE):
1. `professor:template-export` creates `courses/{slug}/TEMPLATE.md` containing only course structure (sections, objectives, capstone brief) — no personal data (notes, progress, answers, dates)
2. `professor:template-import <path>` reads a TEMPLATE.md file and creates a new course with pre-built syllabus; user still runs `professor:next` to generate lectures
3. Exported template is valid Markdown readable without any tool and importable by any Professor installation

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 16 to break down)

### Phase 17: auto generate excercise files that user can work on directly (exclude learning framework- only need instructions)

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 16
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 17 to break down)

---

### Phase 18: Cloud Deployment

**Goal:** The platform runs at a stable public URL with production-safe configuration — no local machine required to access the app.

**Depends on:** Phase 14 (production build must exist before deploying)
**Requirements:** DEPL-01, DEPL-02, DEPL-03

**Success Criteria** (what must be TRUE):
1. Visiting the public Vercel URL loads the web UI without error from any network
2. A custom domain (e.g. `professor.yourdomain.com`) resolves to the deployed platform
3. Rotating or adding an environment variable (API key, secret) in the Vercel dashboard takes effect on the next request without any code change or redeployment
4. A new deployment triggered by a `git push` to main completes successfully and serves the updated app

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 18 to break down)

---

### Phase 19: Authentication

**Goal:** Users can create accounts and stay signed in — via email/password or GitHub — with sessions that survive browser restarts.

**Depends on:** Phase 18 (OAuth callbacks require a public URL; session cookies require a stable domain)
**Requirements:** AUTH-01, AUTH-02, AUTH-03

**Success Criteria** (what must be TRUE):
1. A new visitor can sign up with email and password and land on the app as an authenticated user
2. An existing user can click "Continue with GitHub" and complete OAuth login without entering a password
3. A logged-in user who closes the browser tab and returns later is still authenticated without being asked to log in again
4. An unauthenticated user who navigates to a protected route is redirected to the login page, then returned to their original destination after login

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 19 to break down)

---

### Phase 20: OSS SKILL Registry

**Goal:** Community contributors can publish SKILLs to a shared GitHub registry, the platform index stays current automatically, and any user can install a community SKILL with one CLI command.

**Depends on:** Phase 18 (webhook endpoint requires a public URL; CLI install fetches from the registry index)
**Requirements:** REG-01, REG-02, REG-03

**Success Criteria** (what must be TRUE):
1. A contributor can open a PR to the `professor-skills/` GitHub org repository, and after merge the SKILL appears in the platform's registry index
2. When a push is made to `professor-skills/`, the platform index updates automatically via GitHub webhook — no manual sync step required
3. A user can run `npx course-professor install <skill-name>` and have the SKILL files downloaded and placed correctly without any manual file copying
4. The CLI `install` command prints a clear error if the skill name does not exist in the registry

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 20 to break down)

---

## v2.0 Coverage

v2.0 phases:
- Phase 13: Client Components — React split-pane UI, markdown rendering, command pills
- Phase 14: Integration — CLI web command, production build, static file serving
- Phase 15: Retention Layer — SCHEDULE.md, professor:recall, streak, time tracking
- Phase 16: Sharing and Templates — professor:template-export, professor:template-import

**Coverage:** 4 phases delivering Local Web UI + Retention + Sharing

## v2.1 Coverage

v2.1 phases:
- Phase 18: Cloud Deployment — Vercel deploy, custom domain, env var management
- Phase 19: Authentication — Email/password signup, GitHub OAuth, persistent sessions
- Phase 20: OSS SKILL Registry — GitHub-backed registry, webhook sync, CLI install command

**Requirements mapped:** DEPL-01, DEPL-02, DEPL-03, AUTH-01, AUTH-02, AUTH-03, REG-01, REG-02, REG-03
**Coverage:** 9/9 v2.1 requirements mapped ✓
