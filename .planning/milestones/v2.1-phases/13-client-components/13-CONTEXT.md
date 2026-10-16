# Phase 13: Client Components - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

React client with split-pane layout, lecture panel with markdown rendering, chat panel with streaming and context-aware command pills. This is the frontend UI layer - backend (Express) is Phase 14.

</domain>

<decisions>
## Implementation Decisions

### Layout
- Fixed 40/60 split (lecture left ~40%, chat right ~60%)
- Lecture panel minimum width 300px, chat panel flexible
- Visual divider between panels (non-draggable, subtle gray line)
- Mobile (< 768px): Tab switcher to toggle between lecture and chat views

### Visual Design
- Dark mode theme (light mode not in scope for v2.0)
- Blue accent color for buttons and highlights
- System fonts (no web font downloads)
- Comfortable spacing (good for long learning sessions)

### Markdown Rendering
- react-markdown library for rendering lecture content
- Prism for syntax highlighting in code blocks
- Full GitHub Flavored Markdown support (tables, strikethrough, task lists)

### Command Pills
- Located above chat input field (like Slack)
- Horizontal row layout, wraps if needed
- Clicking a pill inserts the command text into chat input

### Course Selector
- Dropdown in top-left of header
- Shows course name + last active timestamp as progress indicator

### Claude's Discretion
- Exact color hex values for dark theme
- Loading skeleton designs
- Error state handling
- WebSocket reconnection logic

</decisions>

<specifics>
## Specific Ideas

- "Like Slack - commands above input"
- "Like ChatGPT - comfortable for long sessions"
- Mobile uses tab switcher between lecture/chat views

</specifics>

\code_context
## Existing Code Insights

### Reusable Assets
- No existing React components - all new for Phase 13
- Express backend exists (WEB-01 through WEB-08 implemented in Phase 9)

### Established Patterns
- Course files (COURSE.md, LECTURE.md, NOTES.md) structure already defined
- Professor agent behavior in agents/professor.md
- Command set is fixed: new-topic, next, hint, stuck, review, quiz, done, etc.

### Integration Points
- WebSocket connection to Express server for lecture updates
- SSE endpoint /api/chat for streaming Claude responses
- API endpoints already exist: /api/courses, /api/courses/:slug/:file

</code_context>

<deferred>
## Deferred Ideas

- Light mode support — future enhancement
- Mobile-responsive full layout — tab switcher is basic
- User preference persistence (dark/light, font size)

</deferred>

---

*Phase: 13-client-components*
*Context gathered: 2026-03-12*
