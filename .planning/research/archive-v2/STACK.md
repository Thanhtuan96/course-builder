# Technology Stack — Web UI

**Project:** Course Learning Plugin — Local Web UI
**Researched:** 2026-03-08
**Confidence:** HIGH

## Summary

Adding a local web UI to the existing Claude Code plugin requires a focused stack: Express backend serving a React+Vite frontend. The implementation plan already has the right approach — verify versions and minor adjustments below.

## Recommended Stack

### Backend (Node.js)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **express** | ^4.22.1 | HTTP server | Express 5.x is too new (March 2026); 4.x is stable, well-documented, and all middleware works |
| **@anthropic-ai/sdk** | ^0.78.0 | Claude API client | Plan specifies 0.39.0 (outdated). Latest adds better streaming support and bug fixes |
| **ws** | ^8.19.0 | WebSocket | Lightweight, no native dependencies. Plan version (8.16.0) is fine; minor patch update |
| **cors** | ^2.8.5 | CORS middleware | Required for dev mode (Vite proxy) |
| **dotenv** | ^16.4.5 | Env variable loading | Already in plan, correct |
| **marked** | ^15.0.0 | Markdown parsing | Plan specifies 12.0.0; 15.x has security fixes and better GFM support |

**NOT needed:**
- **shiki**: Syntax highlighting mentioned in plan but not used in implementation. Add later only if code blocks need rich highlighting (not required for MVP)

### Frontend (React + Vite)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **react** | ^18.3.1 | UI framework | React 19 (latest) is too new; 18.3.1 is stable and all libraries support it |
| **react-dom** | ^18.3.1 | React DOM renderer | Paired with React 18 |
| **vite** | ^5.4.0 | Build tool + dev server | Plan specifies 5.2.0; 5.4.x has better HMR stability |
| **@vitejs/plugin-react** | ^4.3.0 | React Fast Refresh | Works with Vite 5.x |
| **marked** | ^15.0.0 | Markdown rendering (client) | Same as backend for consistent parsing |

### Dev Dependencies

| Technology | Version | Purpose |
|------------|---------|---------|
| **eslint** | ^9.x | Linting (optional but recommended) |
| **prettier** | ^3.x | Code formatting |

## Installation

```bash
# Backend
cd web
npm install express@^4.22.1 @anthropic-ai/sdk@^0.78.0 ws@^8.19.0 cors@^2.8.5 dotenv@^16.4.5 marked@^15.0.0

# Frontend  
cd web/client
npm install react@^18.3.1 react-dom@^18.3.1 marked@^15.0.0
npm install -D vite@^5.4.0 @vitejs/plugin-react@^4.3.0
```

## Integration Points with Existing Plugin

| Integration Point | How It Connects |
|-------------------|-----------------|
| **Course files** | Reads from `./courses/{slug}/` same as CLI |
| **Professor agent** | Loads `agents/professor.md` as system prompt |
| **CLI command** | `bin/cli.js` spawns `web/server.js` |
| **Environment** | Uses `ANTHROPIC_API_KEY` from parent process |

## Alternative Considerations

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend framework | Express 4 | Fastify | Express ecosystem is larger; less migration risk |
| Real-time | WebSocket | SSE | Plan already uses WebSocket; SSE would require more client code |
| Markdown → HTML | marked | remark + rehype | marked is simpler for MVP; swap later if needed |
| Syntax highlighting | None (MVP) | shiki | Adds ~3MB bundle; not required for learning content |

## What NOT to Add

1. **Database** — All state in Markdown files; no SQLite needed
2. **Authentication** — Single-user local app; not multi-tenant
3. **TypeScript** — Keep simple JS for now; adds build complexity
4. **State management (Redux/Zustand)** — React useState is sufficient for this scope
5. **CSS framework (Tailwind)** — Custom CSS in plan is fine; avoid dependency bloat

## Version Rationale Summary

| Package | Plan Version | Recommended | Reason |
|---------|--------------|-------------|--------|
| express | ^4.18.2 | ^4.22.1 | Patch update, same major |
| @anthropic-ai/sdk | ^0.39.0 | ^0.78.0 | Major version bump for streaming fixes |
| react | ^18.3.1 | ^18.3.1 | Same — correct |
| vite | ^5.2.0 | ^5.4.0 | Minor update for HMR stability |
| marked | ^12.0.0 | ^15.0.0 | Security fixes, better GFM |
| ws | ^8.16.0 | ^8.19.0 | Patch update |

## Sources

- npm registry (express, react, vite, @anthropic-ai/sdk, marked, ws) — verified versions as of March 2026
- Express 4.x stability: Community consensus, extensive middleware ecosystem
- React 18.x: Current LTS-line for production React apps
