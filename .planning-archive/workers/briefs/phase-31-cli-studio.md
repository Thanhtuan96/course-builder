# Task brief: Phase 31 — CLI ↔ Studio (one-command platform, terminal review, import)

Own git worktree branched from `feat/studio-local-first` (has Phases 22–30). Phase 26b is fixing `web/studio-api.js` in
parallel — you must NOT edit `web/studio-api.js` or `web/server.js`. Small conventional commits. Do NOT push.

Read first: `.planning/REQUIREMENTS.md` (CLI-05..07) at
/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.planning/REQUIREMENTS.md, `bin/cli.js`,
`bin/course-reader.js` (Phase 30 — reuse it), `bin/commands/*`, `web/studio-db.js` (node:sqlite generic table store,
migrations from `studio/migrations/`), `web/studio-api.js` (read only: token file `web/.studio-token`, `STUDIO_ORIGINS`,
`createStudioRouter` options), `studio/src/lib/repo/index.js` (business logic over a StorageAdapter),
`studio/src/lib/repo/schema.js`, `studio/src/lib/srs.js`, `studio/src/lib/settings.js`, `studio/src/lib/repo/select-adapter.js`,
`studio/README.md`.

## Requirements
- **CLI-05 `course-professor studio [--port 5180] [--api-port 3000] [--no-open]`**: one command that
  1) installs `web/` and `studio/` deps if missing, builds `studio/dist` if missing or older than `studio/src`
     (print what it is doing, use ora spinners);
  2) starts the local server (`web/server.js` as a child process, `NODE_ENV=production`, `PORT=<api-port>`,
     `STUDIO_ORIGINS` = the Studio origin(s) you will serve, plus any existing value) — strip inherited `CLAUDECODE`,
     `CLAUDE_CODE_*` env vars so nested agent CLIs behave like a normal terminal;
  3) serves `studio/dist` on `http://localhost:<port>` with a tiny static server (node:http, correct MIME types,
     `index.html` fallback, no directory listing, bind 127.0.0.1);
  4) waits for `/api/studio/health`, then opens the browser at
     `http://localhost:<port>/#/settings?bridge=<url-encoded api url>&token=<token>` (unless `--no-open`) and prints the
     same URL + "Press Ctrl+C to stop"; Ctrl+C stops both children cleanly.
  Studio side (you own these): `studio/src/lib/settings.js` gets `applyPairingFromUrl()` that reads `bridge`/`token`
  from the hash query once, saves them as the bridge config (and, if no provider is configured yet, selects the
  "My local agent" provider), then removes them from the URL with `history.replaceState`. Call it from
  `studio/src/main.jsx` before render. Unit-test it.
- **CLI-06 `course-professor review [--limit 20]`**: terminal flashcard review from the SQLite DB
  (`~/.professor/professor.db`, open it via `web/studio-db.js` — create a small Node StorageAdapter wrapper
  `bin/studio-store.js` that implements the Studio StorageAdapter contract over `createStudioDb()` and plugs into
  `studio/src/lib/repo/index.js` via `useAdapter()`, so business rules (gradeCard → SM-2 + reviews row + activity) are
  the SAME code as Studio). TTY UI: show front → Space/Enter to flip → 1–4 grade, q to quit, summary at the end; non-TTY
  → print due count and exit. Empty state: "All caught up — next card due <time>".
- **CLI-07 `course-professor import [slug|--all] [--dry-run]`**: import CLI courses (`learning/*`, legacy `courses/*`
  via `course-reader.js`) into SQLite through the same repo API: course (title, level, kind, goal) + lessons (sections,
  status, completed_at); each archived `lectures/NN-*.md` and the current `LECTURE.md` → `lesson_versions` of the
  matching lesson (ordered, never overwriting); `SCHEDULE.md` cards → `cards` (due dates preserved); `LEARNING-LOG.md`
  entries → `reflections` / `quiz_attempts` where they map, else `notes`. Idempotent: re-running must not duplicate
  (store `source:'cli'` + a stable `external_id` such as `cli:<slug>` / `cli:<slug>:<n>` in existing TEXT columns —
  if no suitable column exists, add migration `studio/migrations/0002_external_ids.sql` adding nullable
  `external_id TEXT` + index to courses, lessons, lesson_versions, cards — D1-compatible, and mirror it in schema.js).
  `--dry-run` prints what would be imported.
- Help text + EXAMPLES in `bin/cli.js`; README CLI section.

## Files you own
`bin/cli.js` (3 new `case` lines + help), NEW `bin/commands/{studio,review,import}.js`, NEW `bin/studio-store.js`,
NEW `bin/static-server.js`, `studio/src/lib/settings.js`, `studio/src/main.jsx` (one call), `studio/migrations/0002_*.sql`
+ `studio/src/lib/repo/schema.js` (only if the migration is needed), tests under `test/cli-studio*.test.js`,
`test/cli-review*.test.js`, `test/cli-import*.test.js`, `studio/test/settings-pairing.test.js`, README.md, studio/README.md.

## Verify before reporting
1. Root `npm test` + `cd studio && npm test` + `npm run build` pass. Run `runAdapterContract` against `bin/studio-store.js`.
2. Real run from the MAIN repo using a temp DB (never touch the user's real DB in tests):
   `cd /Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin && PROFESSOR_HOME=$(mktemp -d) node <worktree>/bin/cli.js import --all --dry-run`
   then without `--dry-run`, then `… review` (non-TTY) — paste outputs.
3. `node <worktree>/bin/cli.js studio --no-open` with a temp PROFESSOR_HOME: curl the printed Studio URL (200, HTML) and
   `/api/studio/health` with the token (200); then stop it. Paste outputs.
4. `git diff --stat <base>..HEAD` only lists owned files.
