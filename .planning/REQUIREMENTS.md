# Requirements: Course Learning Plugin

**Defined:** 2026-03-05
**Updated:** 2026-03-08
**Core Value:** The learner builds real understanding by doing — not by reading Claude's code.

## v1.0 Requirements

Requirements for milestone v1.0. Each maps to roadmap phases.

### Plugin Structure

- [x] **PLG-01**: Plugin has `plugin.json` with metadata, version, and registration for agents/commands/hooks
- [x] **PLG-02**: Plugin directory layout follows Claude Code conventions (`agents/`, `commands/`, `hooks/`)
- [x] **PLG-03**: README contains install instructions, Notion MCP config, and Obsidian MCP config

### Agents

- [x] **AGT-01**: Professor agent packages professor-skill-v3 as a Claude Code agent with correct frontmatter

### Commands

- [x] **CMD-01**: User can run `professor:new-topic` to start a new course on a topic
- [x] **CMD-02**: User can run `professor:next` to advance to the next section
- [x] **CMD-03**: User can run `professor:review` to review a completed section
- [x] **CMD-04**: User can run `professor:done` to mark a section complete
- [x] **CMD-05**: User can run `professor:hint` to receive a hint without the answer being revealed
- [x] **CMD-06**: User can run `professor:stuck` to receive additional guidance when genuinely stuck
- [x] **CMD-07**: User can run `professor:syllabus` to view the course outline
- [x] **CMD-08**: User can run `professor:progress` to view learning progress
- [x] **CMD-09**: User can run `professor:discuss` to open discussion on a concept
- [x] **CMD-10**: User can run `professor:quiz` to run a quiz on the current topic
- [x] **CMD-11**: User can run `professor:capstone` to start the capstone project
- [x] **CMD-12**: User can run `professor:capstone-review` to review capstone progress
- [x] **CMD-13**: User can run `professor:note` to append a note to the current course's NOTES.md
- [x] **CMD-14**: User can run `professor:export` to choose exporting the course to Notion or Obsidian

### Hooks

- [x] **HOK-01**: PreCompact hook displays a token warning to the user before context is compressed
- [x] **HOK-02**: PreCompact hook auto-saves current session state (active section, progress) to COURSE.md before context reset

### Notes

- [x] **NOT-01**: NOTES.md file is automatically created in `courses/{slug}/` when a new course starts

### Export

- [x] **EXP-01**: `professor:export` sends lecture notes + user answers + NOTES.md to Notion via MCP
- [x] **EXP-02**: `professor:export` sends course content to Obsidian via Obsidian MCP server
- [x] **EXP-03**: User can choose export destination (Notion or Obsidian) when running `professor:export`

### Agent Support (Phase 9)

- [x] **AGENT-01**: MCP server implementation with @modelcontextprotocol/sdk
- [ ] **AGENT-02**: Core command tools (new-topic, next, done, progress, syllabus) as MCP tools
- [ ] **AGENT-03**: Cross-agent configuration documented for Cursor and VS Code
- [ ] **AGENT-04**: Agent detection via environment variables for different AI agents

## v1.1 Requirements

Requirements for milestone v1.1 - Git Worktree Courses.

### Worktree Management

- [ ] **WORK-01**: User can create a new course as a git worktree at `learning/{tech-slug}/`
- [ ] **WORK-02**: User can list all existing learning worktrees
- [ ] **WORK-03**: User can switch between learning worktrees
- [ ] **WORK-04**: User can archive a completed course (copies learning files to `.course_archive/`, removes worktree)

### Archive Preservation

- [ ] **ARCH-01**: Archiving copies COURSE.md to `.course_archive/{slug}/`
- [ ] **ARCH-02**: Archiving copies NOTES.md to `.course_archive/{slug}/` (if exists)
- [ ] **ARCH-03**: Archiving copies CAPSTONE.md to `.course_archive/{slug}/`
- [ ] **ARCH-04**: Archiving generates SUMMARY.md retrospective in `.course_archive/{slug}/`
- [ ] **ARCH-05**: Original worktree is removed after successful archive (user's code stays in their local)

### Course File Location

- [ ] **FILE-01**: COURSE.md lives in worktree root alongside project code
- [ ] **FILE-02**: NOTES.md lives in worktree root alongside project code
- [ ] **FILE-03**: CAPSTONE.md lives in worktree root alongside project code
- [ ] **FILE-04**: LECTURE.md is overwritten in worktree (current section, disposable)

### Commands Update

- [ ] **CMD-15**: `professor:new-topic` creates git worktree by default
- [ ] **CMD-16**: `professor:archive` works with worktree structure (copies files, removes worktree)
- [ ] **CMD-17**: Session restoration detects worktree-based courses

## v2.0 Requirements

Requirements for milestone v2.0 - Local Web UI.

### Web Backend

- [x] **WEB-01**: Express server runs on configurable port (default 3000)
- [x] **WEB-02**: `/api/courses` returns list of all courses with slug, name, lastActive
- [x] **WEB-03**: `/api/courses/:slug/:file` returns COURSE.md, LECTURE.md, NOTES.md, CAPSTONE.md content
- [x] **WEB-04**: `/api/chat` accepts messages and streams Claude responses via Server-Sent Events (SSE)
- [x] **WEB-05**: Chat API loads system prompt from `agents/professor.md` for behavioral consistency
- [x] **WEB-06**: Chat API builds course context from COURSE.md and LECTURE.md
- [x] **WEB-07**: WebSocket server broadcasts lecture updates when professor:next runs
- [x] **WEB-08**: `/api/notify` endpoint triggers WebSocket broadcast to all connected clients

### Web Frontend

- [x] **WEB-09**: React client displays split-pane layout (lecture panel left, chat panel right)
- [x] **WEB-10**: LecturePanel renders LECTURE.md with markdown (marked) and syntax highlighting
- [x] **WEB-11**: LecturePanel auto-refreshes when WebSocket receives lecture-updated event
- [x] **WEB-12**: ChatPanel streams Claude responses character-by-character via SSE
- [x] **WEB-13**: ChatPanel displays context-aware command pills that change based on learning phase
- [x] **WEB-14**: Command pills: idle phase shows `professor:new-topic`, lecture shows `professor:hint/review/quiz`, exercise shows `professor:hint/stuck/review`, review shows `professor:done/hint`
- [x] **WEB-15**: Course selector dropdown in top bar to switch between courses
- [x] **WEB-16**: Progress indicator shows current course name and last active timestamp

### Integration

- [x] **WEB-17**: `bin/cli.js` has `web` command to launch Express server
- [x] **WEB-18**: `npx course-professor web [port]` starts web UI on specified port
- [ ] **WEB-19**: Web UI reads/writes same `courses/` directory as CLI
- [ ] **WEB-20**: Production build: `npm run build` creates optimized React bundle
- [ ] **WEB-21**: Production mode: Express serves static React build from `client/dist/`

### Security

- [x] **WEB-22**: All markdown rendered in browser is sanitized with DOMPurify to prevent XSS

## v2.1 Requirements

Requirements for milestone v2.1 — Public Launch.

### Deployment

- [ ] **DEPL-01**: Platform is accessible at a public URL after deploying to cloud host
- [ ] **DEPL-02**: User can configure a custom domain to point to the deployed platform
- [ ] **DEPL-03**: Production environment variables (API keys, DB connection) can be managed without code changes

### Authentication

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can sign up / login with GitHub OAuth
- [ ] **AUTH-03**: User session persists across browser refresh and revisits

### OSS Registry

- [ ] **REG-01**: Creator can publish a SKILL by opening a PR to the `professor-skills/` GitHub org
- [ ] **REG-02**: Platform indexes the `professor-skills/` registry and keeps it synced via webhook on push
- [ ] **REG-03**: User can install a community SKILL via `npx course-professor install <skill-name>`

---

## Future Requirements

### Syllabus Creation

- **SYL-01**: Hybrid course creation — Claude proposes syllabus → user reviews/edits → confirms before start

### Export

- **EXP-04**: File-based Obsidian export (YAML frontmatter .md files) as fallback when Obsidian MCP unavailable

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated grading/scoring | Learning is qualitative, not point-based |
| Multi-user/collaborative learning | Single user per plugin instance (v1) |
| Video or audio content | Text-based Socratic learning only |
| AI-generated quizzes with auto-grading | Socratic review is the evaluation mechanism |
| File-based Obsidian export (primary) | Using Obsidian MCP instead — cleaner integration |
| Worktree push to remote | User controls their git workflow |
| Multiple courses per worktree | One tech per worktree keeps it simple |
| Worktree branch management | Main branch only for learning |
| Mobile-responsive UI | Local web UI is desktop-focused for v2.0 |
| Cloud course state in v2.1 | Needs DB design — deferred to v3.0 |
| User profile page in v2.1 | Needs creator loop first (v3.1) |
| SKILL discovery/search page in v2.1 | Not enough SKILLs to discover yet — v4.0 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLG-01 | Phase 1 | Complete |
| PLG-02 | Phase 1 | Complete |
| PLG-03 | Phase 1 | Complete |
| AGT-01 | Phase 2 | Complete |
| CMD-01 | Phase 2 | Complete |
| CMD-02 | Phase 2 | Complete |
| CMD-03 | Phase 2 | Complete |
| CMD-04 | Phase 2 | Complete |
| CMD-05 | Phase 2 | Complete |
| CMD-06 | Phase 2 | Complete |
| CMD-07 | Phase 2 | Complete |
| CMD-08 | Phase 2 | Complete |
| CMD-09 | Phase 2 | Complete |
| CMD-10 | Phase 2 | Complete |
| CMD-11 | Phase 2 | Complete |
| CMD-12 | Phase 2 | Complete |
| CMD-13 | Phase 3 | Pending |
| NOT-01 | Phase 3 | Pending |
| HOK-01 | Phase 4 | Complete |
| HOK-02 | Phase 4 | Complete |
| CMD-14 | Phase 5 | Complete |
| EXP-01 | Phase 5 | Complete |
| EXP-02 | Phase 5 | Complete |
| EXP-03 | Phase 5 | Complete |
| WORK-01 | Phase 7 | Pending |
| WORK-02 | Phase 7 | Pending |
| WORK-03 | Phase 7 | Pending |
| WORK-04 | Phase 7 | Pending |
| ARCH-01 | Phase 7 | Pending |
| ARCH-02 | Phase 7 | Pending |
| ARCH-03 | Phase 7 | Pending |
| ARCH-04 | Phase 7 | Pending |
| ARCH-05 | Phase 7 | Pending |
| FILE-01 | Phase 7 | Pending |
| FILE-02 | Phase 7 | Pending |
| FILE-03 | Phase 7 | Pending |
| FILE-04 | Phase 7 | Pending |
| CMD-15 | Phase 7 | Pending |
| CMD-16 | Phase 7 | Pending |
| CMD-17 | Phase 7 | Pending |
| WEB-01 | Phase 9 | Complete |
| WEB-02 | Phase 9 | Complete |
| WEB-03 | Phase 9 | Complete |
| WEB-04 | Phase 9 | Complete |
| WEB-05 | Phase 9 | Complete |
| WEB-06 | Phase 9 | Complete |
| WEB-07 | Phase 9 | Complete |
| WEB-08 | Phase 9 | Complete |
| WEB-09 | Phase 10 | Complete |
| WEB-10 | Phase 10 | Complete |
| WEB-11 | Phase 10 | Complete |
| WEB-12 | Phase 10 | Complete |
| WEB-13 | Phase 10 | Complete |
| WEB-14 | Phase 10 | Complete |
| WEB-15 | Phase 10 | Complete |
| WEB-16 | Phase 10 | Complete |
| WEB-17 | Phase 11 | Complete |
| WEB-18 | Phase 11 | Complete |
| WEB-19 | Phase 11 | Pending |
| WEB-20 | Phase 11 | Pending |
| WEB-21 | Phase 11 | Pending |
| WEB-22 | Phase 10 | Complete |

| DEPL-01 | Phase 18 | Pending |
| DEPL-02 | Phase 18 | Pending |
| DEPL-03 | Phase 18 | Pending |
| AUTH-01 | Phase 19 | Pending |
| AUTH-02 | Phase 19 | Pending |
| AUTH-03 | Phase 19 | Pending |
| REG-01 | Phase 20 | Pending |
| REG-02 | Phase 20 | Pending |
| REG-03 | Phase 20 | Pending |

**Coverage:**
- v1.0 requirements: 24 total
- v1.1 requirements: 16 total
- v2.0 requirements: 22 total
- v2.1 requirements: 9 total
- Mapped to phases: 87
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-13 after v2.1 milestone started*
