---
last_mapped_commit: 23bc7fcb6e5197d01731ffb36dc0f2d3628cef67
last_mapped_at: 2026-10-17
---
# Codebase Concerns

**Analysis Date:** 2026-10-17

Scope: whole repository, excluding `node_modules/`, `.worktrees/`, `learning/`, `courses/`, `.course_archive/`, `dist/`, `studio/dist/`, `web/dist/`. Secret files (`.env`, `web/.studio-token`) were noted for existence only and never read.

Verification labels used below:
- **Verified (run)**: reproduced against a running server in a scratch directory.
- **Verified (code)**: confirmed by reading the cited lines.
- **Reasoned**: follows from code reading, not executed.

## Priority Summary

| # | Severity | Area | Summary | Files |
|---|----------|------|---------|-------|
| 1 | Critical | Security | Legacy `web/server.js` is unauthenticated, uses `cors()` for every origin, and `/api/chat` spawns `claude` with `--dangerously-skip-permissions` in `web/` | `web/server.js` |
| 2 | High | Security | Legacy course routes allow path traversal on write (verified) and read (reasoned), reachable cross-origin | `web/server.js` |
| 3 | High | Correctness | Installed `SKILL.md` is a stale copy: `shared/SKILL.md` lacks the "Agent Architecture" section present in `professor-skill/SKILL.md` | `shared/SKILL.md`, `professor-skill/SKILL.md`, `bin/platforms/*.js` |
| 4 | High | Correctness | `generateJson` silently returns a wrong-language result (known) | `studio/src/lib/ai/provider-utils.js` |
| 5 | Medium | Test coverage | Studio's ~50 test files are not run by root `npm test` or by any CI workflow | `vitest.config.js`, `.github/workflows/release-smoke.yml`, `studio/test/` |
| 6 | Medium | Performance | Agent capability probing runs synchronous subprocesses on every `/api/chat` request (blocks the event loop up to ~15 s) | `web/server.js` |
| 7 | Medium | Security | Claude bridge CLI runs with its working directory set to `web/`, which holds `.studio-token` | `web/studio-api.js` |
| 8 | Medium | Schema | Schema version is hard-coded to 1 and snapshot data is packed into `checks_json` (both known) | `web/studio-db.js`, `studio/src/lib/runner/history.js` |
| 9 | Medium | Fragility | Module-level language state mutated during React render (known; latent) | `studio/src/lib/i18n/index.js` |
| 10 | Medium | Security | Community registry content is installed into `~/.claude/skills` with no integrity check | `bin/registry-helpers.js` |

## Verification Of Known-Issue Sources

**Already known from review (all re-checked):**

- **`useT()` mutates module-level language during render: confirmed, latent.** `studio/src/lib/i18n/index.js` sets `currentLanguage = language` inside `useT()` (the last lines of the file). Concurrent or StrictMode renders can leave that value from a discarded render. No production module-level consumer of `t()` / `getLanguage()` was found (every import from this module is `useT`), so impact is latent. Fix before adding any non-React caller. Fix: pass the language explicitly to `translate(language, key, params)` from non-hook code, and drop the render-time assignment.
- **`generateJson` keeps a wrong-language result silently: confirmed.** `studio/src/lib/ai/provider-utils.js:70-77`: when the repair attempt still fails validation it returns the first (wrong-language) `value`; when the repair parses, line 73 returns `coerce(second, validate)` without re-running `checkJsonLanguage`. Callers: `components/practice/QuizPanel.jsx:80`, `components/practice/FlashcardGenerator.jsx:54`, `lib/capstone.js:96`. Fix: run `checkJsonLanguage` on the second result too, and surface a `wrong_language` provider error instead of returning the value.
- **`/api/studio/db/health` reports `schemaVersion: 1`: confirmed.** `web/studio-db.js:26` is `export const SCHEMA_VERSION = 1;`, and it is returned at `web/studio-db.js:292`, `:344`, `:357`, and by `web/studio-api.js:1195`. `studio/migrations/` holds four files (`0001`-`0004`). Fix: derive the value from `migrationsRun`/applied rows (`d1_migrations`).
- **Snapshot data packed inside `checks_json`: confirmed.** `studio/src/lib/runner/history.js:4-17` writes `{ checks, snapshot: { files, entry, language, hash } }` into `checks_json`, and `:22-46` unpacks it. Matches `studio/docs/FOLLOW-UPS.md` item 1. Fix: add `code_json` / `code_hash` columns through a new migration in `studio/migrations/` and change only `history.js`.
- **Legacy `web/` coexists with `studio/`: confirmed.** Root `package.json` `start` runs `web/server.js`; `files` ships `web/client/src/`, `web/dist/`, and `web/server.js`. The legacy Vite client (`web/client/`) and `web/server.js` duplicate parts of the studio product (chat, lectures, exercises). `web/client/src/hooks/useWebSocket.js` is never imported and there is no WebSocket server, and `POST /api/notify` (`web/server.js:1163-1167`) is an explicit placeholder.

**Open items from `studio/docs/FOLLOW-UPS.md` (still open in code):**

1. Snapshot columns: see above.
2. `PRACTICE-01..04` checkboxes: lives in `.planning/`, not verifiable from source. Treat as open.
3. Course-wide ordering of `listWorkspaceFiles`: not verified in this pass; low impact per the file.
4. End-to-end browser UAT: not verifiable from source.
5. `/api/studio/db/health` `schemaVersion`: see above.

**Stale or partially stale items from `.planning-archive/workers/INTEGRATION-TODO.md`:**

| Item | Status | Evidence |
|------|--------|----------|
| `tutor.js` re-declares `COURSE_KINDS` / `DEFAULT_COURSE_KIND` | **Partly done, still a hazard.** No longer a literal duplicate, but `lib/prompts/tutor.js:87` exports `COURSE_KINDS = COURSE_KIND_IDS` (an array of ids), while `lib/course.js:14` exports `COURSE_KINDS` as an array of objects. Same name, different shape. | `studio/src/lib/prompts/tutor.js:87-90`, `studio/src/lib/course.js:14-21` |
| Wire `getCurrentCode(lessonId)` into TutorPanel "Check my answer" | Done | `studio/src/components/tutor/TutorPanel.jsx:18,141-146` |
| Mount Phase 29 runner router | Done | `web/studio-api.js:1047` |
| `repo.listCards({courseId, lessonId})` + stop using `exportAll()` | Done | `studio/src/components/practice/card-store.js:7,18` |
| Unify streak (`course.js#streak` vs `activity.js#computeStreak`) | Done; no `streak` in `lib/course.js` | `studio/src/lib/activity.js` |
| `quiz_seed` uses `answer` -> `answerIndex` | Done | `studio/src/data/demo-course.js:214,220` |
| "Export COURSE.md" on Course page | Done | `studio/src/pages/Course.jsx:13,135` |
| `initAdapter()` at startup before demo seeding | Done | `studio/src/App.jsx:168,196` |
| Lazy-load `CodeWorkspace` | Done (dynamic import in `Lesson.jsx`). The "164 KB gzip, target <150 KB" figure cannot be verified because build output is out of scope. | `studio/src/pages/Lesson.jsx:30` |
| HANDOFF-29 §2: "Check my answer" uses delimited untrusted code block | Done | `TutorPanel.jsx:146`, `studio/src/lib/prompts/tutor.js:270` |
| Full E2E browser UAT | Open | Not verifiable from source |

**Pending todos in `.planning-archive/todos/pending/`:**

- `2026-03-25-update-all-stale-files.md`: still open. `installSkill` (`bin/registry-helpers.js:163-200`) writes new files over an existing directory and never removes files from a previous version.
- `2026-03-25-skill-install-platform-destinations.md` (P3, L): open; not reviewed in depth.
- `2026-03-06-use-askuserquestion-...md`: the agent already uses `AskUserQuestion` in `agents/professor.md`; the remaining commands and the cross-platform annotation plan (see project memory) are still open.
- `2026-03-11-enhance-npx-init-behavior.md`, `...migrate-notebooklm...md`, `...update-readme-md.md`: placeholders with no requirements ("TBD"). Triage or delete.

## Security Considerations

**Legacy web server unauthenticated and open to every origin (Critical):**
- Risk: `web/server.js:27` mounts `app.use(cors())` for all routes (only `/api/studio` is mounted before it, and it has its own origin allowlist). `POST /api/chat` (`web/server.js:982`) has no token. Any web page the user visits can send a JSON `POST` to `http://localhost:3000/api/chat` (the preflight is answered by `cors()`).
- Chain: `/api/chat` -> `streamViaCLI` (`web/server.js:384-420`) spawns `claude` with `--dangerously-skip-permissions` and sets `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1`, with `cwd: __dirname` (`web/`). The prompt is the attacker's text. Result: a cross-site page can drive a fully permissive Claude agent running as the user, able to read and write files and run commands in the user's session. The Cursor path also uses `--trust` (`web/server.js:754`).
- Verified (run): `OPTIONS` preflight from `Origin: https://evil.example` returns `Access-Control-Allow-Origin: *`. The `/api/chat` path was not executed, to avoid launching an agent.
- Files: `web/server.js:27`, `web/server.js:392-412`, `web/server.js:414`, `web/server.js:754`, `web/server.js:982`.
- Current mitigation: the server binds to `127.0.0.1` by default (`web/server.js:15`); that does not stop a browser on the same machine.
- Recommendations: retire the legacy server, or at minimum (a) restrict CORS to the Studio origin allowlist, (b) require `X-Studio-Token` on every `/api/*` route, (c) remove `--dangerously-skip-permissions` and `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, and (d) route `/api/chat` through the bridge's `runJsonCli` (`web/studio-api.js:561`), which already omits the flag.

**Path traversal in legacy course routes (High, verified write):**
- Risk: slug and exercise filename are not sanitized. `saveCourseFile` joins the raw `slug` (`web/server.js:110`), and `POST /api/courses/:slug/exercises/:filename` joins the raw `filename` (`web/server.js:216-217`). Express decodes `%2F` in route params, so `..%2F` becomes `../`.
- Verified (run): `POST /api/courses/..%2F..%2F..%2Fprobe/COURSE.md` wrote `probe/COURSE.md` outside `COURSES_DIR`. `POST /api/courses/x/exercises/..%2F..%2F..%2Fprobe2.txt` wrote a file outside the exercises directory. Both succeeded with `{"success":true}`.
- Reasoned (read): `GET /api/courses/:slug/exercises/:filename` (`web/server.js:190-205`) calls `readFileSync` on any joined path with no extension check, so the same traversal reads arbitrary files, and CORS allows the response to be read cross-origin.
- Files: `web/server.js:78-132` (`getCourseFile`/`saveCourseFile`; the file-name sanitizer covers only `file`, not `slug`), `web/server.js:190-230`.
- Fix: validate `slug` with `/^[a-z0-9][a-z0-9-]*$/` and the filename with the same whitelist as the 4 course files, then assert `resolve(...)` stays under `COURSES_DIR` (the pattern already used in `web/studio-runner.js:226-230`).

**LLM output writes files (Medium):**
- Risk: `saveFilesFromResponse` (`web/server.js:350-381`) writes any `<file path="...">` block the model emits. Filenames are restricted to four names and the slug to `[a-z0-9-]`, so the blast radius is limited to course files, but prompt-injected course or web content can overwrite `COURSE.md`/`LECTURE.md` in any existing course.
- Fix: write only to the course being chatted about, and ignore `courses/{slug}/` paths that name a different course.

**Studio bridge: Claude CLI runs inside `web/` (Medium):**
- Risk: `web/studio-api.js:757-758` sets `tempCwd: false` for `claude` and `cwd: __dirname` (the `web/` directory). `runJsonCli` resolves `cwd || spec.cwd || __dirname` (`web/studio-api.js:568`), so the agent starts in `web/`, which contains `web/.studio-token`. The other agents use a throwaway directory (`makeTempCwd`, `web/studio-api.js:483`). The Claude invocation does not pass `--dangerously-skip-permissions`, so writes and shell use are denied by default, but reads inside the working directory are the risk.
- Fix: use `makeTempCwd` for Claude too, or set an explicit empty `cwd`.

**Bridge pairing token (Verified, code; mostly sound):**
- Good: token compare uses `timingSafeEqual` (`web/studio-api.js:444-450`); loopback-only by default (`web/studio-api.js:1005-1009`); origin allowlist before token check (`:1011-1034`); token generated with 24 random bytes (`:941`); file written with mode `0o600` (`:943`).
- Weak spots: (a) the token is printed to stdout in the banner (`web/studio-api.js:950-964`), so it lands in any captured log; (b) `writeFileSync` only applies `mode` when the file is created, so a pre-existing `web/.studio-token` keeps its old permissions; (c) the token is regenerated on every start and overwrites the previous file, which breaks any saved pairing (`studio/README.md:192` documents this).
- `STUDIO_ORIGINS=*` (`web/studio-api.js:1014-1024`) disables the origin check; `STUDIO_ALLOW_NON_LOOPBACK` (`:996`) exposes the bridge to the LAN. Both are opt-in, but neither warns at startup.

**Studio client sends the bridge token to any configured `bridgeUrl` (Low):**
- Risk: `studio/src/lib/runner/local.js:24-27` and `studio/src/lib/ai/bridge.js:26-30` attach `X-Studio-Token` to whatever `bridgeUrl` is in settings, with no loopback check on the client. A tampered or imported setting sends the pairing token to a remote host.
- Fix: reject non-loopback `bridgeUrl` in `runnerBase` and `createBridgeProvider`, or require an explicit opt-in.

**BYOK keys and bridge token live in localStorage (Medium, by design):**
- Files: `studio/src/lib/settings.js:4,116-139` (settings, including `anthropic.apiKey` and `bridge.bridgeToken`), `studio/src/lib/ai/anthropic.js:22-23` (`dangerouslyAllowBrowser: true`), `studio/src/lib/ai/status.js:2`.
- Impact: any XSS in the Studio origin exposes every API key. Existing mitigations: Markdown renders without `rehype-raw` (`studio/src/components/ui/Markdown.jsx:85`) and Mermaid runs with `securityLevel: 'strict'` (`:18`). The only `dangerouslySetInnerHTML` is the Mermaid SVG (`:66`).
- Recommendation: keep the Markdown and Mermaid constraints, add a Content-Security-Policy to `studio/index.html` (none is present), and document the trade-off.

**Learner and imported code runs in a same-origin Worker (Medium):**
- Risk: `studio/src/workers/js.worker.js:113-146` executes workspace code with `new Function`. This is not a security sandbox: the worker shares the Studio origin's IndexedDB (the whole local database) and can call `fetch`. Imported community courses (`professor:template-import`, registry installs) can contain such code.
- Fix: run untrusted code in an opaque-origin `sandbox` iframe or without storage access; do not rely on the Worker boundary.

**Pyodide loaded at runtime from a CDN without SRI (Low-Medium):**
- `studio/src/workers/python.worker.js:15-24` dynamically imports `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`. The version is pinned, but there is no integrity check and no offline mode.

**Registry install trusts remote content (Medium):**
- Risk: `installSkill` writes `SKILL.md` into `~/.claude/skills/<name>` (`bin/registry-helpers.js:186-198`). That file is agent instructions. The index and files come over HTTPS from `main` of the registry with no signature or checksum (`bin/registry-helpers.js:28-66`).
- `fetchRegistryText` has no timeout and does not follow redirects; a `301` is reported as a failure.
- Fix: pin registry content by commit SHA or checksum in `index.json`, and show the diff before overwriting an installed skill.

**`validateItemName` accepts `..` (Low, verified code):**
- `basename('..') === '..'` and the check only rejects `.`, so `validateItemName('..')` passes (`bin/registry-helpers.js:91-97`). `installCourse` then resolves `join(process.cwd(), 'learning', '..')` (`:386`) and writes `COURSE.md`/`meta.json` into the project root (after the overwrite prompt). Requires the user to type `..` and the index to contain that name.
- Fix: reject `.`, `..`, and names not matching `/^[a-z0-9][a-z0-9-]*$/`.

**Shell interpolation in publish flow (Low):**
- `bin/cli.js:754` (`git clone "${forkUrl}"`), `:777-780` (branch and commit message), and `:791-793` (`gh pr create --title "${commitMsg}"`) build shell strings with `execSync`. `safeSlug` is sanitized (`bin/cli.js:645`), so injection is unlikely, but `forkUrl` comes from a GitHub username. Prefer `execFileSync` with argument arrays.

**Hygiene (verified):** a grep of tracked files for common credential patterns (Anthropic, GitHub, AWS keys, PEM blocks) found nothing. `.env` (repo root) and `web/.studio-token` exist locally and are gitignored (`.gitignore`); neither was read.

## Tech Debt

**Two web applications for one product:**
- Issue: `web/` (Express + legacy React client, `web/client/`) and `studio/` (Vite + React + SQLite bridge) overlap. Root `package.json` ships both (`files`), and `bin/cli.js` installs and starts `web/`.
- Impact: the security issues above live only in `web/`; the duplicated features drift; test effort is split.
- Fix: deprecate `web/` behind a flag, or delete it after moving the remaining `courses/` routes into the Studio bridge.

**Three-plus parsers for the same `COURSE.md` format:**
- Files: `bin/course-reader.js:307` (`parseLecture`), `:383` (`parseSchedule`), `:540` (`readCourse`); `studio/src/lib/course.js:91` (`parseCourseMarkdown`); `web/server.js:56-60` and `:168-170` (regex title and "Active exercise" match); `hooks/pre-compact.js:123` (regex "Current Section").
- Impact: a format change must be made in several places; `studio/` and `bin/` already disagree on some fields.
- Fix: one parser module under `studio/src/lib/` imported by `bin/` (which already imports from there) and by the hook.

**Duplicated canonical content with manual sync:**
- `shared/agents/*.md`, `shared/commands/professor/*.md`, `shared/hooks/pre-compact.js` are byte-identical copies of `agents/`, `commands/professor/`, and `hooks/pre-compact.js` (verified with `diff`). `bin/sync-shared.sh` copies them, but **does not sync `SKILL.md`**, so `shared/SKILL.md` (547 lines) has drifted from `professor-skill/SKILL.md` (567 lines), which `CLAUDE.md` names as source of truth. The installers read `shared/SKILL.md` (`bin/platforms/claude.js:88`, `gemini.js:30`, `cursor.js:31`), so installed users miss the "Agent Architecture" section.
- Other copies (mostly local, gitignored): `.gemini/agents/professor.md` (926 lines vs 372 canonical), `.opencode/professor.md` (437), `GEMINI.md` (468) vs `templates/gemini/GEMINI.md` (28), `.cursor/rules/professor.mdc` (430) vs `templates/cursor/professor.mdc` (4), `.gemini/hooks/pre-compact.js` and `.codex/hooks/pre-compact.js` differ from `hooks/pre-compact.js`.
- Fix: make `shared/` generated (or the only copy), add `SKILL.md` to `sync-shared.sh`, and add a test that fails when copies differ.

**Version and metadata drift:**
- `plugin.json:3` is `1.2.0` with name `course-learning-plugin`; `package.json` is `1.6.0-beta.1`; `templates/claude/plugin.json` is `1.0.0` with name `professor`; `.claude-plugin/marketplace.json` is `1.2.0`. `package.json` `repository.url` points to `Thanhtuan96/course-builder` while `author` is `ronnie-tk`.
- Command count: `CLAUDE.md` says 25 commands; `plugin.json` registers 26 (`professor:onboard` is registered but not listed in `CLAUDE.md`'s command table).

**Dead or placeholder code:**
- `web/client/src/hooks/useWebSocket.js` (unused, no WebSocket server); `POST /api/notify` placeholder (`web/server.js:1163-1167`).
- `web/server.js:1170-1183` spawns `npm run dev` (Vite) whenever `NODE_ENV` is not `production` (the default), with `shell: true` and no cleanup on exit, so the Vite child can outlive the server.

**Cross-package imports from the CLI:**
- `bin/commands/import.js:21,35-36` imports `studio/src/lib/srs.js`, `studio/src/lib/repo/index.js`, and `studio/src/lib/prompts/capstone.js`. `package.json` `files` ships only `studio/src/lib/` and `studio/migrations/`. Any new relative import from `lib/` into `data/`, `workers/`, or `i18n/*.json` breaks the published package. `scripts/smoke-pack.mjs` is the only guard.
- `bin/node-version.js:10` requires Node 22.5 for Studio, while root `engines` says `>=18.0.0` and `studio/package.json` says `>=20`.

**Duplicated tooling versions:**
- Root `vitest` `^4.1.1` (`package.json`) vs studio `vitest` `^5.0.4`; `express`/`cors` are declared in both root and `web/package.json`.

**Experimental runtime API:**
- `web/studio-db.js:17` uses `node:sqlite` (`DatabaseSync`), which is experimental on Node 22 and prints a warning. Pin the Node floor and watch the API across Node majors.

**Large modules:**
- `web/studio-api.js` (1294 lines), `web/server.js` (1222), `studio/src/lib/repo/index.js` (740), `studio/src/components/workspace/CodeWorkspace.jsx` (501), `bin/cli.js` (966). Split by concern before adding features.

## Known Bugs

**Silent wrong-language output:** see `studio/src/lib/ai/provider-utils.js:70-77` above. Symptom: quiz questions, flashcards, or capstone rubric JSON come back in the wrong language with no error. Trigger: a model that ignores the language instruction twice. Workaround: none in code.

**`schemaVersion` is wrong:** `GET /api/studio/db/health` returns `1` with four migrations applied (`web/studio-db.js:26`). Cosmetic; the smoke test checks `migrationsApplied`.

**IndexedDB import is not atomic:** `studio/src/lib/repo/idb-adapter.js:179-194` commits one transaction per table, so a failure in a later table leaves earlier tables imported. The SQLite path is wrapped in `BEGIN`/`COMMIT`/`ROLLBACK` (`web/studio-db.js:304-316`). Symptom: a partially restored backup. Trigger: a dump with a malformed row in a late table (`os.put` throws). Workaround: re-run the import after fixing the file.

**Hook writes unescaped YAML (fragile):** `hooks/pre-compact.js:163-175` and `:175` insert `lastActiveSection` and `lectureSummary` inside double quotes with no escaping. A title containing `"` or a newline breaks COURSE.md frontmatter. The `.replace(/last_active_section:.*$/m, ...)` calls (`:163-172`) also match the first occurrence anywhere in the file, not only inside frontmatter.

**Stale pending-update behaviour:** `installSkill` (`bin/registry-helpers.js:163-200`) and `installCourse` (`:365-400`) overwrite files but never delete files from an earlier version (see todo `update-all-stale-files`).

**Path-name validation gap:** see `validateItemName('..')` above.

**Checks and snapshot coupling:** `studio/src/lib/runner/history.js` returns `snapshot: null` for any `checks_json` that is a bare array (legacy rows). Consumers must handle both shapes; the mixed shape is the cause of FOLLOW-UPS item 1.

## Performance Bottlenecks

**Synchronous capability probes on every chat request (legacy server):**
- Problem: `POST /api/chat` calls `getAgentCapabilities()` (`web/server.js:992`), which runs `commandExists` (sync `which`) for each agent, and `listOllamaModels`, `listCursorModels`, `listOpencodeModels` when installed (`web/server.js:569-575`). `execSync` is used with timeouts of 3 s, 6 s, and 6 s (`web/server.js:512`, `:540`, `:558`). The event loop is blocked for the full duration on every chat request.
- Files: `web/server.js:491-560`, `:569-580`, `:922-927`, `:992`.
- Improvement path: cache capabilities with a short TTL (the Studio bridge already caches models per session in `modelCache`, `web/studio-api.js:995`), and move probes to async `execFile`.

**Capability detection on each `/health` call (Studio bridge):** `web/studio-api.js:1051-1059` calls `detectAgents()` (`:169-182`), which runs `execSync('which …')` per binary on every request, and `probeOllama` each time. Cache with a TTL.

**Whole-database export and import in one request:** `db.exportAll()` returns every table (`web/studio-api.js:1223`), and `POST /api/studio/db` accepts bodies up to 25 MB (`web/studio-api.js:1003`); the legacy server accepts 50 MB (`web/server.js:28`). Large workspaces (many `workspace_files` rows and `run_results` with embedded snapshots, see the `checks_json` issue) make these responses large and blocking. Improvement: paginate `exportAll`, and store code snapshots in their own columns.

**Browser bundle weight (not measured):** the Studio ships `@anthropic-ai/sdk` for the browser (`studio/src/lib/ai/anthropic.js`), CodeMirror with eight language packages, `react-markdown` with KaTeX, and `sql.js`. Mermaid is loaded on demand (`loadMermaid()` in `studio/src/components/ui/Markdown.jsx:14`), SQL runs in a worker (`studio/src/workers/sql.worker.js`), and the code workspace is a dynamic import (`studio/src/pages/Lesson.jsx:30`). Build output is out of scope here, so the 164 KB gzip figure in FOLLOW-UPS cannot be confirmed.

## Fragile Areas

**`useT()` and module-level language state:** `studio/src/lib/i18n/index.js` (see Verification above). Safe modification: keep all callers on `useT()` and do not add module-level `t()` calls until the render-time assignment is removed.

**`generateJson` retry ladder:** `studio/src/lib/ai/provider-utils.js:37-83`. Three call paths share the repair logic (`streamText` twice for JSON, and again for language). Any change to `coerce` or the language check changes behaviour for quiz, flashcards, and capstone. Test coverage for the wrong-language branch is the gap to close first.

**Repository adapter contract:** `studio/src/lib/repo/*.js` has four implementations (`memory-adapter.js`, `idb-adapter.js`, `remote-adapter.js`, `blocked-adapter.js`) plus `select-adapter.js` (301 lines) and `web/studio-db.js`. Method additions must land in all of them. `remote-adapter.js` targets an unbuilt Cloudflare D1 backend; `FOLLOW-UPS.md` item 1 touches `repo/schema.js` and migrations.

**Legacy course routes:** `web/server.js:176-260` mixes raw `slug`/`filename` joins with a sanitizer that covers only one of them. Changing one route without the other reproduces the traversal.

**Hook regex edits:** `hooks/pre-compact.js:123-172` edits COURSE.md with global regexes. Keep edits anchored to frontmatter.

**Four copies of the pre-compact hook** (`hooks/`, `shared/hooks/`, `.gemini/hooks/`, `.codex/hooks/`) and several copies of agent and skill files: editing the canonical file without re-syncing (see Tech Debt) ships stale behaviour.

**Numeric and textual magic values:** `MAX_TOKENS` 200000 and `TOKEN_WARNING_THRESHOLD` 0.8 in `hooks/pre-compact.js:13-14`; the hook reads `context.tokenCount`, so the warning never fires unless the host passes it.

## Scaling Limits

**Single user, single machine:** the Studio bridge is designed for loopback, single-pairing use (`web/studio-api.js:5-19`). The remote adapter (Cloudflare D1) is a contract, not an implementation (`studio/src/lib/repo/remote-adapter.js`). Multi-user or hosted use needs auth, tenancy, and the remote backend.

**SQLite file at `~/.professor/professor.db`:** one writer; `runMigrations` runs on every start (`web/studio-db.js:172`). Fine for one user, but there is no backup rotation and no migration lock across concurrent server processes.

**Local runner concurrency:** `web/studio-runner.js` spawns up to one process tree per request with a 20 s timeout and 200 KB output cap. No queue or concurrency limit exists; repeated "Run" clicks can start many processes.

**Agent CLIs:** each chat turn spawns a new CLI process (`runJsonCli`, `web/studio-api.js:561`). Latency and token cost scale with turns; `--resume` is used only by the legacy server (`web/server.js:400-402`).

## Dependencies at Risk

**`node:sqlite` (experimental):** `web/studio-db.js:17`. Requires Node 22.5+ (`bin/node-version.js:10`) and prints an experimental warning. Its API may change in minor releases.

**`@anthropic-ai/sdk` in the browser:** `studio/src/lib/ai/anthropic.js:22-23` uses `dangerouslyAllowBrowser: true`. Works by design for BYOK; the risk is that every key is reachable from the page (see Security).

**CDN-hosted runtimes:** Pyodide from jsDelivr (`studio/src/workers/python.worker.js:15`). Offline use and reproducibility depend on a third-party CDN.

**`express@^4` on the legacy server:** no further risk identified beyond the security findings above.

**Local agent CLIs:** `claude`, `cursor-agent`, `opencode`, `gemini`, `antigravity`, `ollama` are invoked with flags that change between releases (`--approval-mode plan` for Gemini at `web/studio-api.js:833`, `--trust` for Cursor at `web/server.js:754`). Breaking flag changes surface only at runtime; `web/studio-api.js:690` and `:849` already special-case some of them.

## Missing Critical Features

**CI coverage for the product:** only `.github/workflows/release-smoke.yml` exists. It packs the tarball, runs the CLI `--help` and `doctor`, and nothing else. No workflow runs the root unit tests, the Studio tests, or the legacy server.

**Authentication for the legacy server:** none (see Security).

**Schema-version reporting and code-snapshot columns:** FOLLOW-UPS items 1 and 5.

**Registry integrity:** no signature or checksum for downloaded skills and courses.

**Observability:** no structured logging or error reporting; bridge errors print to the console only.

**Backup safety:** the Studio's `clearAll` (`web/studio-api.js` `POST /db` op `clearAll`) and `importAll` are token-gated but have no server-side confirmation or pre-import snapshot. The UI confirms (`studio/src/components/data/DataPanel.jsx:137`), the API does not.

## Test Coverage Gaps

**Legacy server (`web/server.js`):** no route tests. `test/cli-studio.test.js` is the only test that references it. Path traversal, CORS, and `/api/chat` behaviour are untested. Priority: High.

**Pre-compact hook (`hooks/pre-compact.js`):** no test references it. Frontmatter edits, YAML quoting, and the "no course found" path are untested. Priority: Medium.

**Studio test suite not in CI or root test run:** root `vitest.config.js` includes only `test/**/*.test.js`, and `studio/test/` (about 50 files: `generateJson`, i18n, runner, capstone, SRS, adapters) is run only by `cd studio && npm test`. No workflow runs it. Priority: High.

**Wrong-language JSON path:** the branch in `studio/src/lib/ai/provider-utils.js:70-77` that returns the first value after a failed repair is the one that needs a test. Priority: High.

**IndexedDB `importAll` partial failure:** `studio/src/lib/repo/idb-adapter.js:179-194` has no atomicity test covering failure in a later table. Priority: Medium.

**Registry install:** `bin/registry-helpers.js` `installSkill`/`installCourse` are tested only through `test/cli.test.js`. The `..` name case and the overwrite-without-cleanup case are untested. Priority: Medium.

**Shared-copy drift:** no test compares `agents/`, `commands/`, `hooks/` with `shared/`, or `professor-skill/SKILL.md` with `shared/SKILL.md`. Priority: Medium.

**Language switching:** no test exercises concurrent renders of `useT` with different languages (the module-state issue). Priority: Low until a non-React caller exists.

---

*Concerns audit: 2026-10-17*
