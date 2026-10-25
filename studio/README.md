# Professor Studio

A local-first, Socratic learning dashboard. Create a course from a prompt, study generated
lessons, take quizzes, review flashcards, and chat with a lesson-scoped tutor.

Studio is a static Vite + React SPA. It talks **directly** to AI providers from your browser
(BYOK — your key never leaves your machine) or, with no key at all, to your **own local agent**
through a small bridge server that ships with the plugin.

- **AI sources you can choose:** Anthropic (your key), any OpenAI-compatible endpoint
  (OpenAI / OpenRouter / Groq / LM Studio), Ollama (local), or **My local agent**
  (Claude Code / OpenCode / Cursor CLI).
- **Storage:** you choose where your data lives — the **browser (IndexedDB)** or a **SQLite file on
  disk** (`~/.professor/professor.db`) via the local server. Studio writes only to the store you
  picked and never mirrors data into the other one. Backups are plain JSON and never include API keys.

---

## Run it locally

```bash
cd studio
npm install
npm run dev            # http://localhost:5180
```

`npm run dev` also works with zero configuration: a bundled demo course is available immediately
under **Course** without any AI source.

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

### Use your own local agent (free, no API key)

Prefer the one-command path above. Run the steps in this section only when you want to start the
bridge and Studio **separately** — for example to keep an already-built Studio on a static host.

The bridge lets Studio use the subscription you already pay for. Six agents are supported, each
driven through its own CLI in a read-only, text-only way:

| Agent | Binary | Model selection | Read-only isolation |
|-------|--------|-----------------|---------------------|
| Claude Code | `claude` | uses your signed-in default | `--print` + temp cwd |
| OpenCode | `opencode` | `opencode models` (e.g. `opencode-go/deepseek-v4.1-flash`) | temp cwd + `OPENCODE_CONFIG_CONTENT` denies edit/bash/webfetch |
| Cursor CLI | `agent` / `cursor-agent` | `agent models` when available | temp cwd |
| Gemini CLI | `gemini` | curated list | `--approval-mode plan` + temp cwd |
| Antigravity | `agy` | `agy models` | `--mode plan` + temp cwd |
| Ollama | via the server | `/api/tags` | server-side passthrough (no `OLLAMA_ORIGINS` needed) |

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
- **Agent:** pick any of the six agents above
- **Model:** *Default* (lets the agent choose and omits `--model`), a model from **Load models**, or
  type a custom id. Each agent keeps its own model — choosing one never affects another provider.

Then press **Test connection**. The server is bound to loopback only and rejects requests from
other origins or without the token — see [Security & privacy](#security--privacy).

**Never a silent failure.** If an agent is missing, unknown, or exits without producing text, the
bridge streams `data: {"error":…,"code":…,"hint":…}` instead of an empty reply, and Studio shows the
hint (e.g. Cursor → “Run `agent login` (or set CURSOR_API_KEY)”, Gemini → “Run `gemini` once to sign
in”, Ollama → “Start the Ollama app or run `ollama serve`”, a bad model → “Pick a model in
Settings”). `GET /api/studio/health` lists all six agents with `installed` and, where detectable,
`loggedIn` / `reachable`. `GET /api/studio/agents/:agent/models` powers the model picker.

**Ollama from the browser.** A deployed Studio page may hit CORS talking to your local Ollama. When
that happens Studio shows the `OLLAMA_ORIGINS` hint *and* a one-click **“Use Ollama through the
local server”** button that switches to the bridge (agent `ollama`), which needs no CORS setup.

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

You pick **one** place for your learning data, and Studio writes only there:

| Option | Where it lives | Notes |
|--------|----------------|-------|
| **This browser** | IndexedDB in this browser | No setup; cleared if you clear site data; not shared with the CLI |
| **SQLite file** | `${PROFESSOR_HOME:-~/.professor}/professor.db` via the local server | One file on disk, shared with the CLI — easy to back up; needs the server running |

Choose it in **Settings → Where your learning data is saved** (also asked once during onboarding).
The default is **SQLite when the CLI paired a local server**, otherwise the browser. Existing installs
are migrated: Studio preselects the store that already holds your data, and asks once if both do.

Studio **never auto-falls back**. If you chose SQLite and the local server isn't running, Studio shows
a blocking **“Local server isn't running”** screen with **Retry** and **Switch to browser storage…** —
nothing is read from or written to IndexedDB in that state.

**Switching is safe.** Changing the setting opens a “Move N courses, M cards…?” confirmation. Studio
copies via `exportAll()`/`importAll()`, verifies per-table counts, *then* switches. The old copy is
kept until you press **Remove the old copy**. Cancelling changes nothing. API keys and settings are
never moved (they live in `localStorage`, outside the repository).

The **“Your data is only in this browser”** banner is shown only when the browser store is active, and
can be dismissed for the session. DataPanel keeps offering:

- **Export backup (JSON)** / **Restore backup** — move all your data to another browser. Keys are excluded.
- **Import browser data into SQLite** — an alternative to switching that copies IndexedDB into the
  SQLite file (counts verified), then optionally clears the browser copy.
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

## Capstone: ship your artifact

Every course names **one real deliverable** — its artifact — with an explicit **Definition of Done**,
shown as **“Your artifact”** on the New-course screen (editable before you start) and on the Course
page. A capstone brief, a 4–6 criterion **rubric** and the kind-shaped extras are generated once at
course creation and stored **immutably** (`capstones`), so you always build against the original spec.

- **Unlock (CAP-02):** the Course page shows a 🔒 Capstone card with lesson progress. It unlocks only
  when **every lesson is done**, then **Start capstone** opens `#/course/:id/capstone`.
- **Capstone mode:** on the capstone page the tutor switches to *concept discussion only*. It refuses
  hints, step lists, code and answers — the artifact is your solo build.
- **Submissions (CAP-03):** submit text/markdown, an optional repo link, and (for programming) a
  snapshot of your **Workspace files**. Attempts are unlimited and **never overwritten** — every
  attempt and its review is kept (`capstone_submissions`).
- **Review (CAP-04):** programming submissions first run the capstone's own self-check tests through
  the code runner (pass/fail per check); a failing test caps the verdict at **Needs work**. The review
  gives a verdict (**Course Complete** / **Needs work**), per-criterion feedback and one next action —
  never a rewritten solution.
- **Completion (CAP-05):** a **Course Complete** verdict shows the completion page and an
  **Export COMPLETION.md** button (plugin-compatible, with the artifact so it is portfolio-ready). The
  course list shows a 🎓 badge. `course-professor import` brings CLI `CAPSTONE.md` and `COMPLETION.md`
  into Studio (idempotent via `external_id`).

Built-in demo: the bundled “How to learn anything” course ships a conceptual capstone and its artifact
with **no provider needed** — finish the four lessons to unlock it.

## Language

Studio has **one learning language**, stored as a BCP-47 code (`settings.language`). It is chosen
once at the start of onboarding (preselected from `navigator.language`) and can be changed any time in
**Settings → Learner → Learning language**. The same choice drives, with no separate “tutor language”:

- **The whole UI.** A tiny dependency-free i18n layer lives in `src/lib/i18n/` (`t(key, params)`,
  `useT()`, `en.json`, `vi.json`, English fallback, plural-safe params). Every user-facing string —
  navigation, onboarding, courses, lessons, practice, tutor, capstone, settings, data tools, empty
  states, workspace and provider-error hints — is translated. A test enforces that every key used in
  `src/**` exists in **both** catalogs and that the two catalogs define the same keys.
- **Generated content.** Every prompt builder states the language at the top of the system prompt
  *and* appends a final one-line instruction to the last user message (“Answer only in Vietnamese.”).
  After generation a dependency-free detector (`src/lib/i18n/detect.js`) checks the output — for `vi`
  it measures the ratio of Vietnamese diacritic letters, for `en` the ASCII-letter ratio, with a
  stopword fallback for other languages. Code fences are ignored so code-heavy programming lessons
  are not misjudged. Lesson and tutor text that drifts is **regenerated once** with a stronger
  instruction (both versions are kept and a short notice is shown); JSON (syllabus, quiz, flashcards,
  capstone) is re-asked through the `generateJson` repair retry with the language instruction.
- **Lesson & capstone structure.** Lesson section headings (“Objectives”, “Exercise”, “Answers to
  check yourself”, “Verify it yourself”, “Misconception/Reality”, …) and capstone brief headings are
  localised by the course language, keyed by stable internal section ids.

**Per-course override.** New-course defaults to the learning language, with a **“Use a different
language for this course”** disclosure if you want another one. To switch later, use **Change
language** on the Course page: existing lesson versions keep their language, the next generations use
the new one, and **Regenerate in <language>** on the Lesson page adds a new version in it.

The bundled demo course ships a **Vietnamese variant** and is seeded in your language on first run.

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
├── src/components/capstone/ # capstone card, rubric, submission form, review + completion panels
├── docs/DEPLOY.md           # deploy steps
└── docs/SAAS-ROADMAP.md     # Cloudflare/D1 SaaS plan
web/
├── server.js                # Studio bridge server + mounts the Studio API
├── studio-api.js            # /api/studio/* (bridge + DB), token + CORS
└── studio-db.js             # node:sqlite layer + migration runner
```
