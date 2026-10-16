# Phase 14: Integration - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning
**Source:** Roadmap and Requirements

<domain>
## Phase Boundary

Phase 14 Integration connects the CLI, Express server, and React client into a complete web application. It completes the v2.0 Local Web UI story.

**What this phase delivers:**
- CLI `web` command launches Express server
- Express serves React frontend in production
- Production build creates optimized bundle

</domain>

<decisions>
## Implementation Decisions

### CLI Integration (WEB-17, WEB-18)
- Use existing `bin/cli.js` web command (already implemented)
- Server port configurable via CLI argument

### Production Build (WEB-20)
- Add `npm run build` to root package.json
- Build outputs to `web/client/dist/`
- Use Vite build

### Express Static Serving (WEB-21)
- Detect NODE_ENV=production
- In production: serve static files from `web/client/dist/`
- In development: proxy to Vite dev server

### Shared Data Store (WEB-19)
- Web UI reads/writes to same `./courses/` directory as CLI
- No separate data store

</decisions>

<specifics>
## Specific Ideas

- Express server: web/server.js
- Production port: 3000 (default), configurable
- Build output: web/client/dist/
- Course directory: ./courses/

</specifics>

<deferred>
## Deferred Ideas

None — Phase 14 scope is well-defined by requirements.

</deferred>

---

*Phase: 14-integration*
*Context gathered: 2026-03-12*
