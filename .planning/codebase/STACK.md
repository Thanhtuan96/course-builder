---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# Technology Stack

**Analysis Date:** 2026-10-17

## Languages

**Primary:**
- JavaScript (ES modules, `"type": "module"`) - CLI (`bin/cli.js`, `bin/commands/*.js`, `bin/platforms/*.js`), Express server (`web/server.js`, `web/studio-api.js`, `web/studio-db.js`, `web/studio-runner.js`, `web/lecture-archive.js`), Studio app (`studio/src/**`), legacy client (`web/client/src/**`), tests (`test/**`, `studio/test/**`)
- JSX - React components in `studio/src/**/*.jsx` and `web/client/src/**/*.jsx`

**Secondary:**
- CommonJS - `hooks/pre-compact.js` (uses `require`, runs under Claude Code hook runtime)
- SQL - SQLite migrations in `studio/migrations/0001_init.sql` through `0004_capstone.sql`
- CSS - Tailwind v4 entry `studio/src/index.css`, `web/client` Tailwind config `web/client/tailwind.config.js`
- Shell - `bin/sync-shared.sh` (sync of `shared/` canonical files)
- Markdown - agent, command and skill definitions (`agents/*.md`, `commands/professor/*.md`, `professor-skill/SKILL.md`, `shared/`); read directly by AI coding agents, no build step

## Runtime

**Environment:**
- Node.js. Floors differ by surface:
  - Root package and CLI: `>=18.0.0` (`package.json` `engines`); CI verifies `node bin/cli.js --help` and `doctor` on Node 18 (`.github/workflows/release-smoke.yml`)
  - Studio local server storage (`web/studio-db.js`) requires Node `>=22.5.0` because it imports the built-in `node:sqlite` module; the floor is defined in `bin/node-version.js` (`STUDIO_MIN_NODE`) and checked by the `studio`, `review`, and `import` commands and by `doctor`
  - Studio app package: `>=20` (`studio/package.json` `engines`)
  - CI tarball smoke test runs on Node 22 (`.github/workflows/release-smoke.yml`)
- Browser runtime for Studio SPA and legacy client (Web Workers used for code execution: `studio/src/workers/js.worker.js`, `python.worker.js`, `sql.worker.js`)

**Package Manager:**
- npm (lockfiles present in every package)
- Lockfiles: `package-lock.json` (root), `web/package-lock.json`, `web/client/package-lock.json`, `studio/package-lock.json` - all present
- `.opencode/` has its own `bun.lock` and `package.json` (OpenCode plugin dependency, `@opencode-ai/plugin` 1.4.3, CommonJS)

## Packages and Workspaces

The repository has no npm workspaces. Four independent npm packages exist:

| Package | Path | `name` | Private | Purpose |
|---------|------|--------|---------|---------|
| Root CLI | `package.json` | `course-professor` (v1.6.0-beta.1) | No (published) | npx CLI, plugin distribution |
| Express server | `web/package.json` | `professor-web` (v2.0.0) | Yes | Backend for Studio and legacy client |
| Legacy web client | `web/client/package.json` | `professor-client` (v2.0.0) | Yes | Older React UI served by Express |
| Studio SPA | `studio/package.json` | `professor-studio` (v0.1.0) | Yes | Local-first learning dashboard |

## Frameworks

**Core:**
- Express 4 (`^4.21.0`) - HTTP server for the CLI `web`/`studio` commands and API routes. Used in root `package.json` (for `bin/`) and `web/package.json`. Installed: 4.22.x.
- React 19 - Studio SPA (`studio/package.json` `react` `^19.3.1`, `react-dom` `^19.3.1`); legacy client (`web/client/package.json` `react` `^19.0.0`)
- Vite - bundler/dev server:
  - Studio: `vite` `^8.3.4`, config `studio/vite.config.js` (dev port 5180, `base: './'`, hash routing, no server rewrites needed)
  - Legacy client: `vite` `^7.0.0`, config `web/client/vite.config.js` (dev port 5173, proxies `/api` to `http://localhost:3000`, build output `web/dist`)
- Tailwind CSS v4 - Studio via `@tailwindcss/vite` `^4.3.3` (`studio/vite.config.js`); legacy client via `@tailwindcss/postcss` `^4.2.2` (`web/client/postcss.config.js`)
- Tiptap 3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/markdown` `^3.20.5`) - rich-text/markdown editing in the legacy client
- Radix UI Select (`@radix-ui/react-select` `^2.2.6`) and shadcn-style config (`web/client/components.json`) - legacy client UI primitives

**Testing:**
- Vitest - root `vitest` `^4.1.1` (config `vitest.config.js`, includes `test/**/*.test.js`, Node environment); `studio` `vitest` `^5.0.4` (`studio/vite.config.js` test block, `studio/test/*.test.js`); `web/client` `vitest` `^3.0.0`
- `fake-indexeddb` `^6.2.5` - IndexedDB stub for Studio tests (Studio devDependency)

**Build/Dev:**
- `@vitejs/plugin-react` - Studio `^6.1.2`, legacy client `^4.0.0`
- PostCSS and Autoprefixer - legacy client (`web/client/postcss.config.js`, `autoprefixer` `^10.4.27`)
- Void (`void/config`) - deploy config for the Studio SPA: `void.config.ts` at repo root and `studio/void.config.ts` (`appType: 'spa'`, `outputDir: 'studio/dist'`, Cloudflare worker name `professor-studio`). Documented in `studio/docs/DEPLOY.md`. `void` is not listed in any `package.json`; it is run through `npx void`.
- `npm pack` based release check: `scripts/smoke-pack.mjs` (`npm run smoke:pack`)

## Key Dependencies

**Critical (root CLI, shipped to users):**
- `inquirer` `^9.2.23` - interactive prompts in CLI setup (`bin/cli.js`)
- `chalk` `^5.3.0` - terminal colors (ESM-only)
- `ora` `^8.1.1` - terminal spinners
- `express` `^4.21.0` and `cors` `^2.8.5` - the `web` and `studio` commands start the Express server

**Critical (Studio SPA, `studio/package.json`):**
- `@anthropic-ai/sdk` `^0.134.0` - Anthropic BYOK provider, used in the browser with `dangerouslyAllowBrowser: true` (`studio/src/lib/ai/anthropic.js`); loaded via dynamic import to keep it out of the main bundle
- `sql.js` `^1.15.0` - SQLite compiled to WebAssembly; WASM imported as `sql.js/dist/sql-wasm.wasm?url` (SQL practice runner, `studio/src/workers/sql.worker.js`)
- `pyodide` loaded at runtime from `https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/` (`studio/src/workers/python.worker.js`); not an npm dependency
- `mermaid` `^12.2.0` - diagram rendering in lessons
- `katex` `^0.19.0`, `rehype-katex` `^7.0.1`, `remark-math` `^6.0.0` - math rendering
- `react-markdown` `^10.1.0`, `remark-gfm` `^4.0.1` - Markdown rendering
- `@uiw/react-codemirror` `^4.25.12` plus `@codemirror/lang-{css,go,html,java,javascript,python,rust,sql}` - code editor with per-language modes
- `react` / `react-dom` `^19.3.1`

**Critical (legacy client, `web/client/package.json`):**
- `@bytemd/vue` and `@bytemd/plugin-gfm` `^1.22.0` - Markdown editor (note: Vue-based package in a React project; verify usage before relying on it)
- `react-syntax-highlighter` `^16.0.0` - code highlighting
- `dompurify` `^3.0.0` - HTML sanitization for rendered Markdown
- `lucide-react` `^1.7.0`, `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^3.5.0` - UI utilities
- `react-markdown` `^10.0.0`, `remark-gfm` `^4.0.0`

**Infrastructure:**
- Node built-in `node:sqlite` (`DatabaseSync`) - Studio server database (`web/studio-db.js`), DB file at `${PROFESSOR_HOME:-~/.professor}/professor.db` (override `STUDIO_DB`)
- Node built-ins used widely: `child_process` (CLI spawning in `web/studio-api.js`, `web/studio-runner.js`), `crypto` (token generation in `web/studio-api.js`), `http`, `fs`, `path`, `os`, `url`
- Browser IndexedDB - primary Studio storage (`studio/src/lib/repo/idb-adapter.js`, database `professor-studio`, DB version 4)

**Dev-only tooling:**
- `vitest` (root, studio, legacy client)
- `fake-indexeddb` (Studio tests)
- `@opencode-ai/plugin` `1.4.3` - only inside `.opencode/package.json`

## Configuration

**Environment variables (names only; values are never recorded here):**
- Server and CLI:
  - `PORT` - Express port (default 3000, `bin/commands/studio.js` `DEFAULT_API_PORT`)
  - `HOST` - bind address override (loopback by default, `web/server.js`)
  - `NODE_ENV` - production switch for serving `web/dist` (`web/server.js`, `web/studio-api.js`)
  - `COURSES_DIR` - course root override (`bin/cli.js`, `web/server.js`)
  - `PROFESSOR_HOME` - Studio data directory (default `~/.professor`; `web/studio-db.js`, `web/studio-runner.js`)
  - `STUDIO_DB`, `STUDIO_MIGRATIONS_DIR` - SQLite file and migrations overrides (`web/studio-db.js`)
  - `STUDIO_ORIGINS` - comma-separated CORS/origin allowlist for the Studio API (default `http://localhost:5180,http://127.0.0.1:5180`, `web/studio-api.js`)
  - `PROFESSOR_ALLOW_BASH` - set to `1` to enable the Studio runner's Bash step (`web/studio-runner.js`)
  - `OLLAMA_HOST` (default `http://127.0.0.1:11434`) and `OLLAMA_MODEL` (`web/studio-api.js`, `web/server.js`)
  - `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`, `OPENAI_API_KEY` - legacy `/api/chat` and model listing in `web/server.js`; also checked by `bin/cli.js` and `bin/platforms/claude.js`
  - `GEMINI_API_KEY`, `GOOGLE_API_KEY` - checked by `bin/platforms/gemini.js`
  - `SMOKE_STUDIO_PORT`, `SMOKE_API_PORT`, `SMOKE_SKIP_BUILD` - `scripts/smoke-pack.mjs`
  - `VITEST` - test-mode branch in `web/studio-api.js`
- Studio SPA (browser): no `import.meta.env` usage found in `studio/src`. All provider settings (API key, base URL, model, bridge URL, bridge token, storage choice) are stored by the browser in localStorage through `studio/src/lib/settings.js`. Settings key constant: `SETTINGS_KEY` in that module.
- Environment file: a `.env` file exists at the repository root. Its contents were not read. Git-ignored (`.gitignore` lists `.env`).

**Pairing token:**
- The Studio server writes a pairing token to `web/.studio-token` (mode 0600, `TOKEN_FILE` in `web/studio-api.js`). Git-ignored and excluded from the npm package (`.npmignore`).

**Build:**
- Root: `package.json` scripts `build` (builds `web/client`), `build:studio` (builds `studio`), `prepublishOnly` (both builds), `smoke:pack`, `start` (`cd web && node server.js`), `test` (`vitest`, pretest installs `web/`)
- Studio: `studio/vite.config.js`
- Legacy client: `web/client/vite.config.js` (`outDir: '../dist'`, i.e. `web/dist`)
- Void deploy: `void.config.ts` (root), `studio/void.config.ts`
- Package file allowlist: `files` array in `package.json` (ships `web/server.js`, `web/studio-*.js`, `web/dist/`, `studio/dist/`, `studio/migrations/`, `studio/src/lib/`, `templates/`, `shared/`, `bin/`, `plugin.json`)
- Ignore rules: `.npmignore` excludes `test/`, `scripts/`, `.github/`, `.planning/`, source maps, and nested `node_modules`
- Git: `.gitignore` excludes `dist`, `web/client/dist`, `/web/.studio-token`, `learning/**`, `courses/**`, `.course_archive`, `.worktrees/`, agent directories (`.claude/**`, `.cursor/**`, `.gemini/**`, `.agents/**`, `.opencode/**`)

**Database migrations:**
- Location: `studio/migrations/*.sql`, applied in filename order by `web/studio-db.js`
- Tracking table: `d1_migrations` (same shape as Cloudflare D1/wrangler so the same files run on D1 later)
- Schema version constant: `SCHEMA_VERSION = 1` in `web/studio-db.js`

## CI

- `.github/workflows/release-smoke.yml`
  - Triggers: push to `main` and `feat/studio-local-first`, pull requests, manual dispatch
  - Job `tarball-smoke`: Node 22, `npm ci`, `npm run smoke:pack`
  - Job `cli-floor`: Node 18, `npm ci`, `node bin/cli.js --help`, `node bin/cli.js doctor`
- No other workflows are present in `.github/workflows/`.

## Platform Requirements

**Development:**
- Node.js 18+ for the CLI and plugin; Node 22.5+ for Studio server storage (`node:sqlite`); Node 20+ for the Studio package
- npm; install per package (`npm install` at root, `npm --prefix studio install`, `npm --prefix web install`, `npm --prefix web/client install`)
- Optional local agents for the bridge: `claude`, `opencode`, `agent`/`cursor-agent`, `gemini`, `agy`, `ollama` (`web/studio-api.js` `AGENT_BINARIES`)
- Optional: Ollama on `127.0.0.1:11434`

**Production / Distribution:**
- npm package `course-professor` (bin: `course-professor`, `professor`) installed by end users via `npx`
- Claude Code plugin via `plugin.json` and `.claude-plugin/marketplace.json`; per-platform templates in `templates/` (agent, claude, cursor, gemini, opencode, researcher) plus `.gemini/`, `.opencode/`, `.cursor/`, `.codex/` directories
- Studio SPA: static hosting (Void / Cloudflare Workers static assets per `studio/docs/DEPLOY.md`; Cloudflare Pages or Netlify also documented). Served locally by the CLI from `studio/dist`.
- Local Express server for Studio bridge and SQLite storage, bound to loopback by default

---

*Stack analysis: 2026-10-17*
