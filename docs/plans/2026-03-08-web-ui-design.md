# Web UI Design: Professor Local Web App

**Date:** 2026-03-08
**Status:** Approved

## Overview

Add a local web UI for the Professor plugin that runs on `localhost:3000`. The web experience focuses on learning quality — split-pane layout with lecture content alongside the Professor chat. CLI remains fully functional; web UI reads and writes the same course files.

## Architecture

```
localhost:3000
     |
React Frontend (Vite)
  - Split-pane layout
  - WebSocket for realtime lecture panel refresh
     |
Node.js Server (Express + ws)
  - /api/chat  → Claude API (streaming)
  - /api/courses → reads courses/ folder
  - /api/files → reads/writes .md files
     |
  Claude API          Local Filesystem
  (user API key)      courses/{slug}/
                      COURSE.md
                      LECTURE.md
                      NOTES.md
```

**Stack:**
- Backend: Node.js + Express
- Frontend: React + Vite
- AI: Claude API with system prompt from `agents/professor.md`
- Realtime: WebSocket — lecture panel refreshes automatically when professor:next runs

**CLI compatibility:** Web UI reads/writes the same course files as CLI. Both can be used interchangeably without data loss.

## UI Layout

```
+----------------------------------------------------------+
| Professor  [React Hooks v]  ########--  80%   [+ Notes] |
+-------------------------+--------------------------------+
|                         |                                |
|  LECTURE                |  Professor Chat                |
|  -----------------      |                                |
|  Section 3: useEffect   |  Professor: Before we start,  |
|                         |  can you explain what         |
|  [rendered markdown]    |  useCallback does?            |
|                         |                                |
|  ```js                  |  You: useCallback memoizes    |
|  // syntax highlighted  |  a function...                |
|  ```                    |                                |
|                         |  Professor: Correct! So when  |
|  Exercise               |  would you NOT need it?       |
|  > Build a custom hook  |                                |
|                         |  ----------------------------  |
|  [ ] criterion 1        |  [Type your answer...  ] [>]  |
|  [ ] criterion 2        |                                |
+-------------------------+--------------------------------+
```

**Top bar:** Course switcher dropdown, visual progress bar, quick-add note button.

**Lecture panel:** Renders LECTURE.md with full markdown, syntax highlighting (Shiki), collapsible sections. Auto-refreshes via WebSocket when professor:next is triggered in chat.

**Chat panel:** Streams Claude API responses (typing effect), renders markdown in messages, code blocks have copy button.

**Command pills:** Context-aware shortcuts replace memorizing commands:
- Reading lecture: `Start Exercise`, `professor:discuss`
- Doing exercise: `professor:hint`, `professor:review`, `professor:stuck`
- After review: `professor:done`, `Try again`

## Data Flow

```
User types message
  -> POST /api/chat
  -> Server prepends system prompt (from agents/professor.md)
  -> Appends COURSE.md + LECTURE.md as context
  -> Streams response back (Server-Sent Events)
  -> If response triggers file mutation (professor:next, professor:done)
       -> Server writes .md files
       -> WebSocket broadcast
       -> Lecture panel refreshes
```

## Features

### Must have
- Streaming responses (character by character, no waiting)
- Context-aware command pills (hints shown when stuck, not always)
- Markdown + syntax highlighting in both panels
- Course switcher (multiple courses supported)

### Should have
- Exercise checklist (check criteria directly on lecture panel)
- Session timer (tracks time per section)

### Could have (future)
- Spaced repetition reminders (review prompts after 1/3/7 days)
- Learning streak calendar (GitHub contribution graph style)
- Quiz card-flip UI (instead of text wall)

## UX Improvements (CLI + Web)

- `professor:new-topic` guided wizard: web shows multi-step form; CLI keeps Q&A but adds progress indicator
- `professor:quiz` as interactive cards on web
- Multiple course management via dashboard

## Out of Scope

- User authentication / accounts
- Cloud sync or remote deployment
- Mobile-specific layout (responsive is fine, mobile-first is not required)
- Replacing the CLI — both coexist

## Entry Point

The web server starts via:
```
npx course-professor web
```

Or added as a new command in the existing CLI setup:
```
course-professor web --port 3000
```
