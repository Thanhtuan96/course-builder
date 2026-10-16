# Project Research Summary

**Project:** Course Learning Plugin v2.0 — Local Web UI
**Domain:** Claude Code Plugin with Local Web Interface (Express + React + SSE + WebSocket)
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

This research addresses integrating a local web UI (Express + React + Vite) with the existing Professor Claude Code plugin. The core insight is that the web UI operates as a **parallel interface** to the same file-based data store the CLI already uses—both systems read/write Markdown course files in `courses/`, and the web backend loads the same agent definition (`agents/professor.md`) that Claude Code uses. This shared file system model avoids complex IPC mechanisms while maintaining consistency between CLI and web experiences.

The recommended stack is straightforward: Express 4.x backend serving a React 18 + Vite 5 frontend, with Server-Sent Events (SSE) for streaming Claude responses and WebSockets for real-time lecture panel updates. The architecture follows a clear build order—backend foundation first (validate data flow with curl), then client scaffold, then components, finally integration with CLI. Key pitfalls to avoid are XSS via unsanitized Markdown (use DOMPurify), SSE connection limits (implement retry logic), silent WebSocket failures (add heartbeat), and file system race conditions between CLI and web (use proper locking).

## Key Findings

### Recommended Stack

**Summary from STACK.md:** The implementation plan has the right foundation—Express + React + Vite is the correct approach. Recommended version updates improve stability and security: Express ^4.22.1 (stable, all middleware works), React 18.3.1 (current stable), Vite 5.4.x (better HMR), and marked 15.x (security fixes). The Anthropic SDK should be updated to ^0.78.0 for better streaming support.

**Core technologies:**
- **express ^4.22.1**: HTTP server — stable, well-documented, extensive middleware ecosystem
- **react ^18.3.1**: UI framework — current stable LTS, all libraries support it
- **vite ^5.4.0**: Build tool + dev server — better HMR stability than 5.2.x
- **@anthropic-ai/sdk ^0.78.0**: Claude API client — major version bump for streaming fixes
- **ws ^8.19.0**: WebSocket library — lightweight, no native dependencies
- **marked ^15.0.0**: Markdown parsing — security fixes, better GFM support
- **dompurify**: HTML sanitization — CRITICAL for preventing XSS in rendered markdown

**What NOT to add:**
- Database (SQLite) — all state in Markdown files
- Authentication — single-user local app
- TypeScript — keep simple JS for now
- State management (Redux/Zustand) — useState is sufficient
- CSS framework (Tailwind) — custom CSS in plan is fine

### Expected Features

**Summary from FEATURES.md:** This is a split-pane educational chat application with lecture content on the left and Socratic chat on the right. Users expect streaming AI responses, proper markdown rendering, syntax highlighting, course navigation, and context-aware command buttons. The key differentiator is enforcing the Socratic methodology through UI design—no "show answer" buttons, command pills change based on learning phase.

**Must have (table stakes):**
- Split-pane layout (lecture + chat) — fundamental dual-content learning pattern
- Streaming AI responses — character-by-character via SSE, eliminates perceived latency
- Markdown rendering — lecture and AI responses are markdown-based
- Syntax highlighting — code blocks need readable colors for tech topics
- Course/lesson selector — navigate between courses
- Context-aware command pills — buttons change based on learning phase (idle/lecture/exercise/review)
- Progress indicator — show course name, last active, progress percentage
- WebSocket lecture refresh — auto-update lecture panel when professor:next runs
- CLI/Web interoperability — both interfaces use same `courses/` directory

**Should have (competitive differentiators):**
- Socratic method enforcement — UI prevents users from skipping to answers
- Phase-aware commands — reduces cognitive load, guides correct behavior
- Integrated note-taking — per-course notes accessible in UI
- System prompt integration — web uses exact same agent behavior as CLI

**Defer (v2+):**
- Session timer, exercise checklist, section navigation, quick notes (P2)
- Spaced repetition, streak calendar, quiz card UI, multi-course dashboard (P3)

### Architecture Approach

**Summary from ARCHITECTURE.md (1 paragraph):** The architecture treats the web UI as a presentation layer over the same file-based data store that the CLI uses. The Express server exposes API endpoints for course listing and chat with streaming (SSE), while a WebSocket server broadcasts lecture updates when Claude writes new content. The React client has two main panels—LecturePanel (renders markdown from LECTURE.md) and ChatPanel (streaming chat with command pills). The integration point with CLI is simple: the web server loads `agents/professor.md` as its system prompt, ensuring behavioral consistency.

**Major components:**
1. **Express Server (`web/server.js`)**: HTTP server, WebSocket server, API routes—handles CORS, serves static files in production
2. **Course Routes (`web/routes/courses.js`)**: Read course files from `courses/` directory—returns JSON list of courses, individual file contents
3. **Chat Routes (`web/routes/chat.js`)**: Handle chat messages, stream Claude responses via SSE—loads agent prompt, builds context
4. **Professor Context Builder (`web/professor.js`)**: Load agent prompt from `agents/professor.md`, strip YAML frontmatter—ensures web behavior matches CLI
5. **React Client (`web/client/`)**: LecturePanel + ChatPanel components with WebSocket hook for real-time updates
6. **CLI Integration (`bin/cli.js`)**: Modified to spawn Express server with `course-professor web` command

### Critical Pitfalls

**Top 5 from PITFALLS.md:**

1. **XSS via `dangerouslySetInnerHTML`** — ChatPanel and LecturePanel render Markdown from course files and AI responses. Without DOMPurify, malicious `<script>` tags or event handlers execute in browser. **Prevention:** Always sanitize with `DOMPurify.sanitize(marked(content))` before rendering.

2. **SSE Connection Limit Exhaustion** — HTTP/1.1 limits SSE to 6 connections per domain. Multiple tabs or retries hit this limit. **Prevention:** Implement retry with exponential backoff, consider HTTP/2.

3. **WebSocket Broken Connections Not Detected** — Network drops or server restarts leave stale connections. Lecture shows outdated content. **Prevention:** Implement ping/pong heartbeat (every 30 seconds).

4. **File System Race Conditions** — CLI (`professor:next`) and Web API (chat calling Claude) write to same files simultaneously. **Prevention:** Use `proper-lockfile` for file locking.

5. **CLI ↔ Web UI State Desync** — Running `professor:next` in CLI updates files but Web UI doesn't know. **Prevention:** File locking + comprehensive WebSocket broadcasts + "last updated by" metadata.

## Implications for Roadmap

Based on research, the suggested phase structure follows the build order from ARCHITECTURE.md:

### Phase 1: Backend Foundation
**Rationale:** Backend must be functional before client can be tested. This phase validates the core data flow independently of React.
**Delivers:** Express server with course API (`/api/courses`), professor context builder, chat API with SSE streaming (`/api/chat`), WebSocket server
**Addresses:** Split-pane layout data source, streaming responses, course selector data
**Avoids:** Pitfall 2 (SSE connection limits via proper retry), Pitfall 7 (SSE response closure), Pitfall 8 (rate limiting), Pitfall 10 (memory leaks)
**Stack:** Express, @anthropic-ai/sdk, ws, cors, dotenv, marked

### Phase 2: Client Scaffold
**Rationale:** Provides the shell for components. At this point client can connect to backend APIs.
**Delivers:** React + Vite project structure, basic routing, error boundary
**Avoids:** Pitfall 12 (React error boundary)
**Stack:** React 18, Vite, @vitejs/plugin-react

### Phase 3: Client Components
**Rationale:** Components depend on backend being functional. Build in order of dependency—LecturePanel needs backend, ChatPanel needs both backend and API key.
**Delivers:** LecturePanel (markdown rendering + syntax highlighting), ChatPanel (streaming + command pills), WebSocket hook for lecture auto-refresh
**Addresses:** Split-pane layout, markdown rendering, syntax highlighting, context-aware commands, real-time lecture refresh, CLI/Web interop
**Avoids:** Pitfall 1 (XSS—must use DOMPurify), Pitfall 3 (WebSocket heartbeat), Pitfall 6 (CORS), Pitfall 13 (scroll to top), Pitfall 14 (command parsing)
**Stack:** marked, dompurify (client)

### Phase 4: Integration & Distribution
**Rationale:** Connects web launch to CLI and finalizes for production use.
**Delivers:** CLI `web` command (`bin/cli.js`), production build setup (Vite build + Express static serving), README update
**Avoids:** Pitfall 4 (file locking for CLI↔Web), Pitfall 5 (state desync), Pitfall 11 (graceful shutdown)
**Stack:** Integration with existing plugin structure

### Phase Ordering Rationale

- **Backend-first approach** validates data flow with curl/Postman before UI complexity
- **Scaffold before components** ensures React structure exists before adding feature code
- **LecturePanel before ChatPanel** because chat depends on more pieces (API + SSE + command detection)
- **Integration last** because it depends on everything else working

### Research Flags

Phases with well-documented patterns (skip deeper research):
- **Phase 1 (Backend):** Express routing, SSE streaming, WebSocket server—standard Node.js patterns
- **Phase 2 (Scaffold):** React + Vite setup—boilerplate, no research needed

Phases likely needing validation during implementation:
- **Phase 3 (Components):** DOMPurify integration with marked—verify sanitization works correctly for all edge cases
- **Phase 4 (Integration):** CLI↔Web file locking—may need tuning based on actual usage patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Recommended versions verified against npm registry (March 2026), Express 4.x stability confirmed by community consensus |
| Features | HIGH | Based on implementation plan (`docs/plans/2026-03-08-web-ui-implementation.md`) and UX analysis (`.planning/PRODUCT_UX_ANALYSIS.md`) |
| Architecture | HIGH | File-based shared state model is straightforward, standard Express+React patterns, SSE/WebSocket well-documented |
| Pitfalls | HIGH | Based on Express Security Best Practices, MDN SSE docs, ws library documentation—common issues with well-known solutions |

**Overall confidence:** HIGH

### Gaps to Address

- **File locking library selection:** `proper-lockfile` is recommended but wasn't tested—verify it works with Node.js 20+ during Phase 1 implementation
- **Command phase detection:** Current approach (string includes) is fragile; may need refinement during Phase 3 based on actual COURSE.md format
- **SSE retry logic:** The recommended approach is standard but may need tuning for browser behavior—test with multiple tabs

## Sources

### Primary (HIGH confidence)
- npm registry (express, react, vite, @anthropic-ai/sdk, marked, ws) — verified versions as of March 2026
- Express Security Best Practices (expressjs.com) — official documentation
- MDN: Using Server-Sent Events — Mozilla developer docs
- ws npm package documentation — official library docs

### Secondary (MEDIUM confidence)
- Implementation plan: `docs/plans/2026-03-08-web-ui-implementation.md` — detailed technical approach
- UX analysis: `.planning/PRODUCT_UX_ANALYSIS.md` — competitive positioning and user needs
- Design specification: `docs/plans/2026-03-08-web-ui-design.md` — UI layout and data flow

### Tertiary (LOW confidence)
- Common Express middleware issues — community patterns, may need validation

---

*Research completed: 2026-03-08*
*Ready for roadmap: yes*
