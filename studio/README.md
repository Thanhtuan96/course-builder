# Professor Studio

A local-first, Socratic learning dashboard. Create a course from a prompt, study generated
lessons, take quizzes, review flashcards, and chat with a lesson-scoped tutor.

Studio is a static Vite + React SPA. It talks **directly** to AI providers from your browser
(BYOK — your key never leaves your machine) or, with no key at all, to your **own local agent**
through a small bridge server that ships with the plugin.

- **AI sources you can choose:** Anthropic (your key), any OpenAI-compatible endpoint
  (OpenAI / OpenRouter / Groq / LM Studio), Ollama (local), or **My local agent**
  (Claude Code / OpenCode / Cursor CLI).
- **Storage:** IndexedDB by default; a **SQLite file on disk** (`~/.professor/professor.db`) when the
  local server is running. Backups are plain JSON and never include API keys.

---

## Run it locally

```bash
cd studio
npm install
npm run dev            # http://localhost:5180
```

`npm run dev` also works with zero configuration: a bundled demo course is available immediately
under **Course** without any AI source.

### Use your own local agent (free, no API key)

The bridge lets Studio use the subscription you already pay for (Claude Code / OpenCode / Cursor):

```bash
# from the repository root
npx course-professor web        # or: cd web && node server.js
```

The server prints a banner:

```
┌─ Studio bridge ──────────────────────────────────────────────
│ Studio URL:     http://localhost:5180
│ Pairing token:  <48 hex chars>
│ Token file:     /…/web/.studio-token
└──────────────────────────────────────────────────────────────
```

In Studio go to **Settings → AI source → My local agent**, enter:

- **Bridge URL:** `http://localhost:3000`
- **Pairing token:** the value the server printed (also in `web/.studio-token`)
- **Agent:** Claude Code, OpenCode or Cursor CLI

Then press **Test connection**. The server is bound to loopback only and rejects requests from
other origins or without the token — see [Security & privacy](#security--privacy).

> Starting the bridge each time generates a **new** token. Paste it once when it changes.
> Set `STUDIO_BRIDGE_TOKEN=…` to keep a fixed token.

The bridge streams SSE: it emits `data: {"status":"thinking"}` when the request is accepted and a
`: ping` comment every 15 s while the agent boots (Claude Code ≈11 s, OpenCode ≈28 s), so proxies
and the browser tab do not time out before the first token.

**Token cost & isolation.** OpenCode and Cursor CLI are full coding agents, not chat completions:
launched in a repository they read the project and send a large fixed system prompt every turn
(OpenCode alone is roughly **37K input tokens even for a one-word reply**). The bridge therefore
runs them in a throwaway empty temp directory (deleted when the run ends) and, for OpenCode, sets
`OPENCODE_CONFIG_CONTENT` to deny `edit`/`bash`/`webfetch` — so the tutor can only produce text and
never touches your files. For the cheapest, fastest tutor calls prefer **Claude Code**.

### One command: `course-professor studio` (recommended)

From the repository root, one command installs and builds what is missing, starts the bridge server
and the built Studio app, and pairs them for you:

```bash
npx course-professor studio              # starts server + Studio and opens the browser
npx course-professor studio --no-open    # print the pairing URL only
npx course-professor studio --port 5180 --api-port 3000
```

It prints a **pairing URL** like
`http://localhost:5180/#/settings?bridge=http%3A%2F%2Flocalhost%3A3000&token=<48 hex chars>` and opens
it. On load, Studio reads `bridge`/`token` from the URL, saves them as the bridge settings, selects
**My local agent** on a fresh install, and then removes the secrets from the address bar
(`history.replaceState`) so they are never bookmarked or shared. Inherited `CLAUDECODE` /
`CLAUDE_CODE_*` variables are stripped from the server process so a nested agent CLI behaves like a
normal terminal.

### Terminal review & import (`course-professor review` / `import`)

The CLI and Studio share the same SQLite file and the same repository logic:

```bash
npx course-professor review                  # due flashcards: Space flips, 1 again · 2 hard · 3 good · 4 easy, q quits
npx course-professor review --limit 10
npx course-professor import --all            # COURSE.md + lectures/ + SCHEDULE.md + LEARNING-LOG.md → SQLite
npx course-professor import nextjs --dry-run # preview the import, write nothing
```

`import` is idempotent — it stores `source: 'cli'` and a stable `external_id`, so re-running updates
instead of duplicating, and never overwrites graded cards or existing lecture versions.

### Use Ollama (free, local)

1. `ollama serve` (and `ollama pull llama3.2` or any model you like).
2. Settings → **Ollama**: base URL `http://localhost:11434/v1`, pick the model.

Ollama allows loopback origins by default, so this works with `npm run dev` out of the box.
If you open **the deployed site** and point at your local Ollama, allow the site origin and restart
Ollama:

- **macOS:** `launchctl setenv OLLAMA_ORIGINS "https://your-studio-origin"` then quit and reopen the
  Ollama app (or run `OLLAMA_ORIGINS="https://your-studio-origin" ollama serve`).
- **Linux (systemd):** `systemctl edit ollama` → `[Service]` `Environment="OLLAMA_ORIGINS=https://your-studio-origin"`
  → `systemctl restart ollama`.
- **Windows:** `setx OLLAMA_ORIGINS "https://your-studio-origin"` then restart Ollama.
- **Docker:** add `-e OLLAMA_ORIGINS=https://your-studio-origin`.

Prefer your exact origin over `*` — `*` lets any site on your machine talk to Ollama.

### Local Network Access (deployed site → local machine)

Local AI sources (Ollama, LM Studio, and the agent bridge) are **first-class when Studio runs from
localhost** (`npm run dev`). When Studio is served from an **https** origin, Chrome 142+ gates
requests to `localhost` behind the **Local Network Access** permission prompt, and Safari/Firefox may
block them outright. If a local source fails only on the deployed site, that is why — run Studio
locally, or grant the browser permission and use a browser that supports it.

---

## Storage & data

| Situation | Where your data lives |
|-----------|-----------------------|
| `npm run dev` / static deploy, no server | **IndexedDB** in this browser |
| Local bridge server running + token set | **SQLite** at `${PROFESSOR_HOME:-~/.professor}/professor.db` |

Studio auto-detects the bridge: if the URL + token are set in Settings and `/db/health` answers, it
uses SQLite; otherwise IndexedDB. On a static deploy with no server it always uses IndexedDB. The CLI
(`course-professor review` / `import`) always uses this SQLite file, so terminal and browser state
stay in sync.

Settings → **Storage** shows which backend is active and whether storage is persistent, and offers:

- **Export backup (JSON)** / **Restore backup** — move all your data to another browser. Keys are excluded.
- **Import browser data into SQLite** — move your IndexedDB data into the SQLite file (counts are
  verified), then optionally clear the browser copy.
- **Export a course as COURSE.md** — a plugin-compatible file you can continue in Claude Code,
  OpenCode or Cursor with `professor:*` commands.

### Environment variables for the bridge

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | Bridge HTTP port |
| `STUDIO_BRIDGE_TOKEN` | generated at startup | Fixed pairing token (otherwise a new one each start, saved to `web/.studio-token`) |
| `STUDIO_ORIGINS` | `http://localhost:5180,http://127.0.0.1:5180` | Comma-separated CORS allowlist. `*` allows any origin — **unsafe**. |
| `PROFESSOR_HOME` | `~/.professor` | Directory holding `professor.db` |
| `STUDIO_DB` | `${PROFESSOR_HOME}/professor.db` | Override the SQLite file path |
| `STUDIO_MIGRATIONS_DIR` | `studio/migrations` | Override the migrations directory |
| `STUDIO_ALLOW_NON_LOOPBACK` | unset | Set to `1` to accept non-loopback clients (not recommended) |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama base URL used by the bridge's `/complete` passthrough |

---

## Security & privacy

- **Keys stay in your browser.** API keys live in `localStorage` and are never sent anywhere except
  the provider you chose. **Backups never contain keys** (enforced by a test). Use **Clear keys** in
  Settings to wipe them.
- **CORS is not authentication.** The bridge enforces **both** an origin allowlist (`STUDIO_ORIGINS`)
  and a **pairing token** (`X-Studio-Token`) on every route, and only accepts loopback clients.
- **No auto-approved tools.** The Studio bridge invokes agent CLIs in print/stream mode with a
  Professor system prompt and does **not** pass `--dangerously-skip-permissions`. It never writes
  files from model output (unlike the CLI chat path).
- Lesson/tutor Markdown renders through a safe pipeline (no raw HTML, no `dangerouslySetInnerHTML`).

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for deployment and [`docs/SAAS-ROADMAP.md`](docs/SAAS-ROADMAP.md)
for the cloud/SaaS plan.

---

## Scripts

```bash
npm run dev       # Vite dev server on :5180
npm run build     # static build → studio/dist (deployable to any static host)
npm run preview   # serve the built studio/dist locally
npm test          # Vitest
```

## Deploy the static build

```bash
cd studio && npm run build
npx vite preview      # sanity-check studio/dist
```

Then follow [`docs/DEPLOY.md`](docs/DEPLOY.md) (void.cloud, with Cloudflare Pages / Netlify fallbacks).

## Project layout

```
studio/
├── migrations/              # D1-compatible SQL (the same files run on node:sqlite and Cloudflare D1)
├── src/lib/repo/            # storage layer: idb / memory / remote adapters + schema mirror
├── src/lib/ai/              # provider adapters (anthropic, openai, ollama, bridge) + SSE
├── src/components/data/     # backup / restore / COURSE.md export (Settings)
├── docs/DEPLOY.md           # deploy steps
└── docs/SAAS-ROADMAP.md     # Cloudflare/D1 SaaS plan
web/
├── server.js                # existing CLI web UI + mounts the Studio API
├── studio-api.js            # /api/studio/* (bridge + DB), token + CORS
└── studio-db.js             # node:sqlite layer + migration runner
```
