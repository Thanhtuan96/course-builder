---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# External Integrations

**Analysis Date:** 2026-10-17

## APIs & External Services

**Anthropic (Claude) - Studio BYOK provider:**
- Used for: lesson, course and tutor generation from the Studio SPA
- SDK/Client: `@anthropic-ai/sdk` `^0.134.0` (`studio/src/lib/ai/anthropic.js`), created with `dangerouslyAllowBrowser: true`; the SDK adds the `anthropic-dangerous-direct-browser-access` header
- Endpoint: SDK default `https://api.anthropic.com` via `client.beta.messages.stream` (streaming)
- Beta header constant: `server-side-fallback-2026-07-01` (`FALLBACK_BETA` in `studio/src/lib/ai/anthropic.js`); fallback is skipped when the model is `claude-haiku-5-5`
- Models (`studio/src/lib/ai/catalog.js`): `claude-opus-5-5` (default), `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1` (advanced)
- Auth: API key entered in Studio Settings and stored in browser localStorage (`anthropic.apiKey`); validated by `configIssue()` in `studio/src/lib/ai/config.js`. Key is never sent to any Professor-owned server.

**Anthropic (Claude) - legacy server route:**
- Used by: `POST /api/chat` in `web/server.js` (around line 1057)
- Endpoint: `https://api.anthropic.com/v1/messages` (`anthropic-version: 2023-06-01`, streamed)
- Model hardcoded in that route: `claude-sonnet-4-6`
- Auth: env var `ANTHROPIC_API_KEY` (or `CLAUDE_API_KEY`) sent as `x-api-key`
- Note: this is a separate code path from the Studio SDK integration and uses different model ids

**OpenAI and OpenAI-compatible endpoints - Studio:**
- Used for: Studio "OpenAI-compatible" provider (`studio/src/lib/ai/openai-compatible.js`)
- Protocol: `POST {baseUrl}/chat/completions` with `stream: true`; model probe `GET {baseUrl}/models`; `Authorization: Bearer <key>` only when a key is set
- Presets (`OPENAI_PRESETS` in `studio/src/lib/ai/catalog.js`):
  - OpenAI - `https://api.openai.com/v1` (default model `gpt-4o-mini`)
  - OpenRouter - `https://openrouter.ai/api/v1` (model `openrouter/auto`; adds attribution headers via `presetForBaseUrl()`)
  - Groq - `https://api.groq.com/openai/v1` (model `llama-3.3-70b-versatile`)
  - LM Studio - `http://localhost:1234/v1` (model `local-model`)
  - Custom - any OpenAI-compatible base URL
- Auth: API key in Studio Settings (localStorage)
- Caveat (from catalog notes): some endpoints block browser CORS

**OpenAI - legacy server route:**
- Used by: `POST /api/chat` and `GET /api/agents/models` in `web/server.js`
- Endpoint: `https://api.openai.com/v1/chat/completions`, model `gpt-4o`
- Used only when `OPENAI_API_KEY` is set and neither `ANTHROPIC_API_KEY` nor `CLAUDE_API_KEY` is set (`isOpenAI` check in `web/server.js`)
- Auth: env var `OPENAI_API_KEY`

**Ollama - Studio provider and bridge agent:**
- Studio provider: `studio/src/lib/ai/ollama.js` and `studio/src/lib/ai/index.js` use the OpenAI-compatible protocol at `http://localhost:11434/v1` (`OLLAMA_DEFAULT_BASE_URL`, default model `llama3.2`)
- Server side: `web/studio-api.js` probes `GET {OLLAMA_HOST}/api/tags` (default `http://127.0.0.1:11434`, 700 ms timeout) and streams `POST {OLLAMA_HOST}/api/chat`
- Env vars: `OLLAMA_HOST`, `OLLAMA_MODEL`
- Public site referenced in UI copy: `https://ollama.com/`

**Local coding-agent CLIs - Studio bridge:**
- The Studio server (`web/studio-api.js`) spawns the learner's installed agent CLI and streams its output back over SSE. No API key is held by Studio for these.
- Agents and binaries (`AGENT_BINARIES` in `web/studio-api.js`):
  - Claude Code - `claude` (`--print --output-format stream-json --include-partial-messages --verbose`, system prompt via `--system-prompt`)
  - OpenCode - `opencode` (permissions injected to deny `edit`, `bash`, `webfetch`)
  - Cursor CLI - `agent` or `cursor-agent` (`--print --output-format stream-json --stream-partial-output`, optional `--model`)
  - Gemini CLI - `gemini` (read-only plan mode)
  - Antigravity - `agy` (read-only plan mode)
  - Ollama - `ollama` (via server, see above)
- Priority order: `AGENT_PRIORITY` = claude, opencode, cursor, gemini, antigravity, ollama
- Spawn uses `child_process.spawn` with argument arrays; the tutor is run without `--dangerously-skip-permissions` and without auto-approved tools
- Model lists: probed at runtime (`GET /api/studio/agents/:agent/models`, 8 s timeout) with curated fallbacks in `studio/src/lib/ai/catalog.js` (`BRIDGE_AGENTS`)

**Pyodide (Python runtime in browser):**
- Used for: running Python lessons/exercises in the Studio Web Worker `studio/src/workers/python.worker.js`
- Loaded at runtime: `https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/pyodide.mjs` (version pinned in the worker)
- Not an npm dependency; requires network access on first use

**GitHub - course/skill registry:**
- Used for: browsing, installing and publishing community course templates and earned skills
- Read endpoints (no auth, public raw content), defined in `bin/registry-helpers.js`:
  - `https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/index.json`
  - `https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/courses`
  - `https://raw.githubusercontent.com/professor-skills-hub/courses-skills-registry/main/skills`
- Write path (publish): GitHub CLI `gh` (`cli.github.com`) when installed; otherwise a browser compare URL `https://github.com/professor-skills-hub/courses-skills-registry/compare/main...contribute/{type}/{slug}` (`bin/registry-helpers.js`)
- Repository for the plugin itself (package metadata): `https://github.com/Thanhtuan96/course-builder`

**Optional MCP servers (export):**
- Used by: `professor:export` command (`commands/professor/export.md`), configured through a project-level `.mcp.json`. No `.mcp.json` is present in the repository.
- Notion - `@modelcontextprotocol/server-notion`, token env `NOTION_API_TOKEN`
- Obsidian - `mcp-obsidian`, env `OBSIDIAN_API_KEY`, `OBSIDIAN_HOST`, `OBSIDIAN_PORT`

**Void / Cloudflare deploy (Studio SPA hosting):**
- Documented in `studio/docs/DEPLOY.md`; config in `void.config.ts` and `studio/void.config.ts`
- Target: void.cloud, deploying to the user's own Cloudflare account (Workers + static assets) with `npx void deploy --platform cloudflare --dir studio/dist --spa`
- No deployment credentials are stored in the repository

**Other documented links (not runtime integrations):** `https://console.anthropic.com/settings/keys` (API key creation, shown in UI copy), `https://nodejs.org`, `https://git-scm.com`, `https://cli.github.com`, `https://opencode.ai/config.json` (OpenCode config schema reference in `templates/opencode`)

## Data Storage

**Browser (default for Studio):**
- IndexedDB database `professor-studio`, schema version 4 (`studio/src/lib/repo/idb-adapter.js`)
- Client-side Studio settings and provider config in localStorage (`studio/src/lib/settings.js`, `SETTINGS_KEY`)
- Storage choice is `'browser' | 'sqlite'` (`studio/src/lib/settings.js`, `studio/src/lib/repo/select-adapter.js`)
- Adapters: `idb-adapter.js` (IndexedDB), `memory-adapter.js`, `remote-adapter.js` (HTTP to the local server), `blocked-adapter.js` (fail-closed when SQLite is chosen but unreachable)

**SQLite (Studio local server):**
- Engine: Node built-in `node:sqlite` (`DatabaseSync`), implemented in `web/studio-db.js`
- File: `${PROFESSOR_HOME:-~/.professor}/professor.db` (override with `STUDIO_DB`)
- Migrations: `studio/migrations/*.sql` (`0001_init.sql`, `0002_external_ids.sql`, `0003_course_language.sql`, `0004_capstone.sql`), applied in filename order; tracking table `d1_migrations`
- Access: HTTP contract under `/api/studio/db` and `/api/studio/db/health` (`web/studio-api.js`); the browser calls it via `studio/src/lib/repo/remote-adapter.js`
- The same contract is intended for a future Cloudflare Worker + D1 backend (per `web/studio-db.js` and `studio/docs/DEPLOY.md`); not implemented in this repo

**In-browser SQL practice:**
- `sql.js` (SQLite WASM) in `studio/src/workers/sql.worker.js`; no server persistence

**File storage:**
- Local filesystem only
- Courses: `learning/{slug}/` (git worktrees for programming courses), `courses/{slug}/` (legacy); root resolved from `COURSES_DIR` or the CLI default (`bin/cli.js`)
- Archives: `.course_archive/{slug}/`
- Lecture archives: `web/lecture-archive.js` writes `lectures/NN-<slug>.md`
- Studio runner work directories under `PROFESSOR_HOME` (`web/studio-runner.js`); Bash steps in the runner only run when `PROFESSOR_ALLOW_BASH=1`

**Caching:**
- None detected (no Redis, memcached, or HTTP cache layer)

## Authentication & Identity

**Studio local server (bridge and DB routes):**
- Pairing token: random value generated in `web/studio-api.js` (Node `crypto`), printed at startup, written to `web/.studio-token` with mode 0600
- Every `/api/studio` route requires header `X-Studio-Token`, compared with `timingSafeEqual`
- Origin allowlist: `STUDIO_ORIGINS` (default `http://localhost:5180,http://127.0.0.1:5180`)
- Loopback clients only by default (`isLoopback()` in `web/studio-api.js`)
- Browser sends the token from Settings as `X-Studio-Token` (`studio/src/lib/ai/bridge.js`, `studio/src/lib/repo/remote-adapter.js`)

**Anthropic / OpenAI / OpenRouter / Groq keys:**
- Entered by the learner in Studio Settings; stored in browser localStorage; sent only to the chosen provider endpoint
- Server-side keys read from env vars for legacy `/api/chat` routes (see above)

**Application auth / user accounts:**
- None. Studio tags all rows with `owner_id = 'local'` (`studio/src/lib/repo/index.js`) and has no login flow.

**Claude Code plugin:**
- Authentication is handled by the host agent (Claude Code, Gemini CLI, OpenCode, Cursor). The plugin itself holds no credentials.

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, or similar SDK in any `package.json`)

**Logs:**
- Server: `console.log` / `console.error` in `web/server.js` and `web/studio-api.js`; Studio server logs via the `log` callback in `createStudioDb()` (`web/studio-db.js`)
- Studio SPA: browser console only

**Health endpoints:**
- `GET /api/studio/health` - returns agent availability (`agents` map) behind the pairing token
- `GET /api/studio/db/health` - SQLite and migration status

## CI/CD & Deployment

**Hosting:**
- npm registry for `course-professor` (`prepublishOnly` builds both bundles)
- Studio SPA: static hosting (Void / Cloudflare per `studio/docs/DEPLOY.md`; Cloudflare Pages or Netlify also documented)
- Local-only server for end users: `npx course-professor studio` (default ports 5180 for the SPA, 3000 for the API)

**CI Pipeline:**
- GitHub Actions - `.github/workflows/release-smoke.yml`
  - `tarball-smoke` on Node 22: `npm ci`, then `npm run smoke:pack` (`scripts/smoke-pack.mjs`: build, `npm pack`, install into a temp project, run CLI and Studio health checks with a throwaway `PROFESSOR_HOME`)
  - `cli-floor` on Node 18: `node bin/cli.js --help` and `node bin/cli.js doctor`
- No deploy job in CI; publishing is manual per `RELEASING.md`

## Environment Configuration

**Required env vars:**
- None for the core learning flow (Claude Code plugin, CLI setup, Studio with browser storage and BYOK key entered in the UI)
- Optional for legacy server routes: `ANTHROPIC_API_KEY` or `CLAUDE_API_KEY`, or `OPENAI_API_KEY`
- Optional for Ollama bridge: `OLLAMA_HOST`, `OLLAMA_MODEL`
- Optional for Studio storage/runner: `PROFESSOR_HOME`, `STUDIO_DB`, `STUDIO_MIGRATIONS_DIR`, `STUDIO_ORIGINS`, `PROFESSOR_ALLOW_BASH`
- Optional for Gemini setup detection: `GEMINI_API_KEY`, `GOOGLE_API_KEY` (`bin/platforms/gemini.js`)

**Secrets location:**
- Repository: a `.env` file exists at the repository root (git-ignored). Contents were not read for this document.
- Studio BYOK keys: browser localStorage of the learner's browser profile
- Studio pairing token: `web/.studio-token` (git-ignored, excluded from npm package)
- Agent CLI credentials: managed by each external CLI (Claude Code, Cursor, OpenCode, Gemini, Antigravity, Ollama) in their own config locations

## Webhooks & Callbacks

**Incoming:**
- `POST /api/notify` in `web/server.js` - placeholder; accepts `{ courseSlug, lectureSlug }` and returns success without broadcasting (WebSocket broadcast is not implemented)
- No third-party webhook receivers

**Outgoing:**
- None. The server makes outbound calls only to the provider endpoints listed above, the GitHub raw registry, and (when chosen) the Pyodide CDN.

---

*Integration audit: 2026-10-17*
