# Architecture Research: Web UI Integration with CLI Plugin

**Domain:** Claude Code Plugin with Local Web UI
**Researched:** 2026-03-08
**Confidence:** HIGH

## Executive Summary

This architecture addresses integrating a local web UI (Express + React + Vite) with an existing Claude Code plugin. The key insight is that the web UI is not a backend-for-frontend replacement—it operates as a **parallel interface** to the same file-based data store that the CLI already uses. Both systems read/write Markdown course files in the `courses/` directory, and the web backend loads the same agent definition (`agents/professor.md`) that Claude Code uses for its system prompt.

The integration model is simple: shared file system for data, shared agent definition for behavior, and a CLI command to bootstrap the web server. This avoids complex IPC mechanisms while maintaining consistency between CLI and web experiences.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Claude Code Plugin Layer                        │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │
│  │   Agents    │  │  Commands   │  │   Hooks     │                │
│  │ professor   │  │ professor:* │  │ PreCompact  │                │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                │
│         │                │                │                         │
├─────────┴────────────────┴────────────────┴─────────────────────────┤
│                     Shared Data Layer                               │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              courses/{slug}/                                 │  │
│  │   COURSE.md  │  LECTURE.md  │  NOTES.md  │  CAPSTONE.md    │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │ (parallel interface)
┌─────────────────────────────────────────────────────────────────────┐
│                        Web UI Layer                                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────────────┐│
│  │   Express Server        │  │   React Client (Vite)          ││
│  │  ┌───────────────────┐  │  │  ┌───────────┐ ┌────────────┐ ││
│  │  │ /api/courses     │  │  │  │LecturePanel│ │ ChatPanel   │ ││
│  │  │ /api/chat (SSE)  │  │  │  └───────────┘ └────────────┘ ││
│  │  │ /api/notify      │  │  │  ┌───────────┐ ┌────────────┐ ││
│  │  │ WebSocket        │  │  │  │useWebSocket│ │CommandPills │ ││
│  │  └───────────────────┘  │  │  └───────────┘ └────────────┘ ││
│  └─────────────────────────┘  └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                ▲
                                │
┌─────────────────────────────────────────────────────────────────────┐
│                     External Services                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              Claude API (api.anthropic.com)                  │  │
│  │   - Streaming via Server-Sent Events (SSE)                 │  │
│  │   - Model: claude-sonnet-4-20250514                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `bin/cli.js` | CLI entry point, `web` command to launch server | Modify existing CLI with new case |
| `web/server.js` | Express server, WebSocket server, API routes | Express + ws library |
| `web/routes/courses.js` | Read course files from `courses/` | File system read, return JSON |
| `web/routes/chat.js` | Handle chat messages, stream Claude responses | @anthropic-ai/sdk with SSE |
| `web/professor.js` | Load agent prompt, build context | Read `agents/professor.md`, build system prompt |
| `web/client/` | React app with Vite | Vite dev server, static build for production |
| `web/client/src/components/LecturePanel` | Display LECTURE.md with markdown rendering | `marked` library |
| `web/client/src/components/ChatPanel` | Chat interface with streaming | SSE client, command pills |
| `web/client/src/hooks/useWebSocket.js` | Real-time lecture refresh | WebSocket client |

## Recommended Project Structure

```
course-learning-plugin/
├── bin/
│   └── cli.js                    ← Modified: add 'web' command
├── agents/
│   └── professor.md              ← Shared: agent definition
├── commands/professor/           ← Existing: CLI commands
├── hooks/                        ← Existing: PreCompact hook
├── shared/                       ← Existing: distributed files
│   ├── agents/professor.md       ← Copy of agent for distribution
│   └── commands/professor/      ← Command definitions
├── courses/                      ← Shared: course files (Markdown)
│   └── {slug}/
│       ├── COURSE.md
│       ├── LECTURE.md
│       ├── NOTES.md
│       └── CAPSTONE.md
├── web/                         ← NEW: web UI
│   ├── package.json
│   ├── server.js                ← Express + WebSocket server
│   ├── professor.js             ← Agent context builder
│   ├── routes/
│   │   ├── courses.js           ← Course file API
│   │   └── chat.js              ← Chat API with SSE
│   ├── tests/                   ← Backend unit tests
│   ├── client/                  ← React app
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.jsx
│   │       ├── App.jsx
│   │       ├── App.css
│   │       ├── components/
│   │       │   ├── LecturePanel.jsx
│   │       │   ├── LecturePanel.css
│   │       │   ├── ChatPanel.jsx
│   │       │   └── ChatPanel.css
│   │       └── hooks/
│   │           └── useWebSocket.js
│   └── .env.example
└── plugin.json                  ← Existing: plugin manifest
```

### Structure Rationale

- **`web/` as sibling to `bin/`:** The web UI is a parallel entry point, not integrated into the CLI. It operates independently but shares data.
- **`web/professor.js` separate from routes:** Clean separation between agent prompt logic and HTTP handling. Allows reuse if chat logic expands.
- **`client/src/components/`:** Standard React component organization. Lecture and Chat are the two main panels.
- **`web/routes/`:** Express route modules separated by concern (courses vs. chat). Follows Express convention.
- **`web/tests/`:** Backend unit tests colocated with implementation. Uses Node.js built-in test runner.

## Architectural Patterns

### Pattern 1: Shared File System as Data Store

**What:** Both CLI and Web UI read/write to the same `courses/` directory using Markdown files.

**When to use:** When building a CLI with an optional web interface, avoiding database complexity.

**Trade-offs:**
- **Pros:** No migration needed, simple sync model, works offline
- **Cons:** No concurrent access handling, file locking not used, potential race conditions between CLI and web

**Example:**
```javascript
// web/routes/courses.js
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export async function listCourses(coursesDir) {
  if (!existsSync(coursesDir)) return [];
  return readdirSync(coursesDir)
    .filter(entry => statSync(join(coursesDir, entry)).isDirectory())
    .map(slug => ({
      slug,
      name: extractCourseName(join(coursesDir, slug, 'COURSE.md')),
      lastActive: extractLastActive(join(coursesDir, slug, 'COURSE.md'))
    }));
}
```

### Pattern 2: Agent Prompt Loading

**What:** The web backend loads the same Markdown agent definition that Claude Code uses, strips YAML frontmatter, and uses it as the system prompt for Claude API calls.

**When to use:** When you want web UI behavior to exactly match CLI behavior without duplicating prompt logic.

**Trade-offs:**
- **Pros:** Single source of truth for behavior, easy to update
- **Cons:** Agent prompt designed for Claude Code may have assumptions that don't fit web context

**Example:**
```javascript
// web/professor.js
import { readFileSync } from 'fs';

export async function buildSystemPrompt(agentPath) {
  const content = readFileSync(agentPath, 'utf-8');
  // Strip YAML frontmatter if present
  return content.replace(/^---[\s\S]+?---\n/, '').trim();
}
```

### Pattern 3: SSE Streaming with Claude API

**What:** Server-Sent Events (SSE) stream Claude API responses to the client in real-time, avoiding wait-for-complete response latency.

**When to use:** When building chat interfaces with AI APIs that support streaming.

**Trade-offs:**
- **Pros:** Real-time UX, feels responsive, shows thinking
- **Cons:** More complex error handling, requires proper connection management

**Example:**
```javascript
// web/routes/chat.js
router.post('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: fullSystem,
    messages,
  });

  stream.on('text', (text) => {
    res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
  });

  stream.on('message', () => {
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  });
});
```

### Pattern 4: WebSocket for Real-Time Updates

**What:** After Claude writes course files (simulating `professor:next`), the server broadcasts a WebSocket message to refresh the lecture panel.

**When to use:** When the server can detect file changes that clients need to know about.

**Trade-offs:**
- **Pros:** Instant updates, no polling
- **Cons:** Requires WebSocket connection, extra complexity

**Example:**
```javascript
// web/server.js
function broadcastLectureUpdate(courseSlug) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({ event: 'lecture-updated', courseSlug }));
    }
  });
}
```

## Data Flow

### Request Flow 1: Loading Courses

```
[User opens browser]
    ↓
[LecturePanel component] → GET /api/courses
    ↓
[Express server] → readdirSync(coursesDir)
    ↓
[File system] → Returns course list
    ↓
[LecturePanel] → Renders course dropdown
```

### Request Flow 2: Chat Message with Streaming

```
[User types message, presses Enter]
    ↓
[ChatPanel] → POST /api/chat { messages, courseSlug }
    ↓
[Express /api/chat] → Load agent prompt, build context
    ↓
[Claude API] → Stream response via SSE
    ↓
[Express] → Forward to client with `data:` prefix
    ↓
[ChatPanel] → Accumulate streaming text, render in real-time
```

### Request Flow 3: Lecture Refresh (After professor:next)

```
[User types "professor:next", sends]
    ↓
[ChatPanel] → POST /api/chat (same as Flow 2)
    ↓
[Claude API] → Processes command, writes LECTURE.md
    ↓
[Chat router detects "professor:next" in message]
    ↓
[broadcastLectureUpdate(courseSlug)]
    ↓
[WebSocket] → Send { event: 'lecture-updated', courseSlug }
    ↓
[LecturePanel via useWebSocket hook] → Reload LECTURE.md
```

### Key Data Flows

1. **Course loading flow:** Browser → Express API → File system → JSON → React state
2. **Chat flow:** User input → Express → Claude API (SSE) → Client streaming → UI update
3. **Lecture refresh flow:** Claude response → File write → WebSocket broadcast → Client reload
4. **CLI to Web sync:** User runs CLI command → File modified → Browser refreshes (manual or WebSocket polling future enhancement)

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|-------------------------|
| 0-1k users | Monolithic Express + React is sufficient. Single server instance. |
| 1k-100k users | Add Redis for WebSocket message pub/sub if running multiple instances. Consider rate limiting on /api/chat. |
| 100k+ users | Requires Claude API key management, possibly multi-tenant. Likely need separate frontend CDN. |

### Scaling Priorities

1. **First bottleneck:** Claude API rate limits. Implement request queuing or caching for repeated contexts.
2. **Second bottleneck:** WebSocket memory. Each connected client holds a connection. Implement heartbeat and cleanup.

## Anti-Patterns

### Anti-Pattern 1: Building a Separate Backend API

**What people do:** Create a full REST API with database, authentication, and complex business logic separate from the CLI.

**Why it's wrong:** Overcomplicates a tool that works fine with file-based state. Duplicates logic between CLI and web.

**Do this instead:** Web UI is a presentation layer over the same files. Claude Code does the heavy lifting of command processing.

### Anti-Pattern 2: Bidirectional Sync Between CLI and Web

**What people do:** Try to keep CLI and web UI state perfectly in sync with complex messaging.

**Why it's wrong:** Both interfaces modify the same files. File system is the source of truth. No sync needed if both read from files.

**Do this instead:** Accept that CLI and web are independent clients. Changes appear when files are read, not pushed.

### Anti-Pattern 3: Reimplementing Professor Logic in Web Backend

**What people do:** Parse commands like `professor:next` in Express routes and implement the logic directly.

**Why it's wrong:** The agent prompt defines complex behavior. Reimplementing it leads to drift and bugs.

**Do this instead:** Pass commands to Claude API and let the agent process them. The web backend is just a message relay.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|--------------------|-------|
| Claude API | `@anthropic-ai/sdk` with streaming | Requires `ANTHROPIC_API_KEY` env var. Model: `claude-sonnet-4-20250514` |
| Browser | Vite dev server + production static build | Dev: port 5173 (proxy to 3000). Prod: Express serves `client/dist/` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI → Web | Process spawn | `bin/cli.js` launches Express as child process |
| Web → Agent | File read | `web/professor.js` reads `agents/professor.md` |
| Web → Data | File read/write | Express routes access `courses/` directory |
| Client → Server | HTTP + WebSocket | REST for chat, WS for real-time updates |

## Integration Points Summary

### Point 1: Agent Definition (`agents/professor.md`)

- **Used by:** Claude Code (native), Web backend (via `web/professor.js`)
- **Purpose:** System prompt that defines Socratic behavior
- **Integration:** Web loads this file and strips frontmatter to create the `system` parameter for Claude API calls

### Point 2: Course Files (`courses/{slug}/*.md`)

- **Used by:** Claude Code (reads at session start), Web (via `/api/courses/:slug/:file`)
- **Purpose:** All course state (progress, lecture content, notes, capstone)
- **Integration:** Both systems read/write the same Markdown files. No conversion layer needed.

### Point 3: CLI Entry Point (`bin/cli.js`)

- **Used by:** User terminal
- **Purpose:** Launch the web server with `npx course-professor web`
- **Integration:** Add new `case 'web':` that spawns Express server

### Point 4: Environment Variables

- **Shared:** `ANTHROPIC_API_KEY` (required for both CLI and web)
- **Web-specific:** `PORT` (default 3000), `COURSES_DIR` (default `./courses`)

## Build Order

### Phase 1: Backend Foundation (Tasks 1-5)

Build the Express server with course API and chat streaming first. This is independent of the React client and validates the core data flow.

1. **Task 1:** Web directory scaffold (`package.json`, `.env.example`, `.gitignore`)
2. **Task 2:** Course files API (`web/routes/courses.js`)
3. **Task 3:** Professor context builder (`web/professor.js`)
4. **Task 4:** Chat API with Claude streaming (`web/routes/chat.js`)
5. **Task 5:** Express server with WebSocket (`web/server.js`)

**Rationale:** Backend can be tested with curl/Postman before React exists.

### Phase 2: Client Scaffold (Task 6)

Create the React + Vite project structure. At this point, the client can connect to the backend API.

6. **Task 6:** React + Vite client scaffold

**Rationale:** Provides the shell for components to be added into.

### Phase 3: Client Components (Tasks 7-9)

Add the main UI components. LecturePanel needs the backend running; ChatPanel needs both backend and API key.

7. **Task 7:** LecturePanel component (markdown rendering)
8. **Task 8:** ChatPanel with streaming (command pills, SSE handling)
9. **Task 9:** WebSocket hook for lecture auto-refresh

**Rationale:** Components depend on backend being functional. Build in order of dependency.

### Phase 4: Integration & Distribution (Tasks 10-12)

Connect web launch to CLI and finalize for production use.

10. **Task 10:** CLI `web` command (modify `bin/cli.js`)
11. **Task 11:** Production build setup (Vite build, Express static serving)
12. **Task 12:** README update

**Rationale:** These tasks integrate the completed web app into the plugin distribution.

## Sources

- Implementation plan: `docs/plans/2026-03-08-web-ui-implementation.md`
- Existing CLI: `bin/cli.js`
- Agent definition: `shared/agents/professor.md` (866 lines of Socratic behavior)
- Project context: `.planning/PROJECT.md`
- Architecture template: `.opencode/get-shit-done/templates/research-project/ARCHITECTURE.md`

---

*Architecture research for: Local Web UI Integration*
*Researched: 2026-03-08*
