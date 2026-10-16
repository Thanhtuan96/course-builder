---
phase: 1
status: passed
score: "4/4 must-haves verified"
verified_at: 2026-10-17
---

# Phase 1 Verification — Seams and Toolchain Prep

**Goal:** Maintainer can run parallel workers safely because hotspot files are split into modules and
all milestone dependencies are already installed — with zero behavior change.

**Method:** goal-backward, read-only. All checks were re-run independently in the worktree
`gsd/phase-01-seams`. Two throwaway harnesses (outside the repo) loaded the *original* monolith
(`git show ddbc82c:web/studio-api.js`) alongside the new split and compared pure-function outputs and
live HTTP responses via `supertest`. Migration negative cases were executed against the real tree and
reverted. Worktree left clean (verified by `git status --short`).

---

## Criterion verdicts

### Criterion 1 — "createStudioRouter() and every CLI command behave exactly as before"

**Verdict: PASS** (re-verified after `d83c966`; the earlier `web` positional-port regression is fixed).

Verified identical:
- `web/studio-api.js` export surface — all 37 named symbols + a default function are still exported.
  Ran the loader check outside Vitest; result `missing: NONE`, `default export is function: true`,
  `router.__studio present: true` (then removed the generated `web/.studio-token`).
- Pure-function behavior — loaded original vs. new and compared outputs over a battery of inputs
  (`parseOrigins`, `parse{Opencode,Antigravity,Cursor}Models`, `flattenConversation`, `clampMessages`,
  `firstMeaningfulStderr`, `diagnoseAgentFailure`, `describeNoOutput`, `detectAgentLogin`,
  `curatedAgentModels`, `antigravityArgs`, all `extract*`/`*ErrorText`/`antigravityStep`, plus all
  `AGENT_*`/`VERSION`/`DEFAULT_ORIGINS`/`STUDIO_URL_HINT` constants). Result:
  `ALL PURE-FUNCTION CHECKS MATCH` (only expected diff: `TOKEN_FILE`, which embeds `__dirname`).
- Route behavior — built `createStudioApp()` from both implementations and compared status + body +
  `Content-Type`/`Vary`/CORS headers across 12 requests (401 no-token, 200 with token, CORS preflight
  allowed/disallowed, private-network header, unknown/known agent models + cache, `/db/health`,
  `/db` missing/unknown op/info). Result: `ALL ROUTE CHECKS MATCH`.
- Suites: root `npx vitest run` → **294 passed (14 files)**; studio `npx vitest run` (in `studio/`) →
  **372 passed (43 files)**; `npx vitest run test/migrations.test.js` → **5 passed**. No test file
  other than the new `test/migrations.test.js` was edited.

Regression previously found — now resolved:
- `course-professor web <port>` positional port was off by one in the first pass; fixed in `d83c966`
  (`bin/commands/web.js` now reads `args[0]`). See "Re-verification after d83c966".

### Criterion 2 — "web/studio-api.js is a thin composition; the web command body lives in bin/commands/web.js"

**Verdict: PASS.**

- `web/studio-api.js` (216 lines) composes `installGuards` → `/run` mount → `registerBridgeRoutes` →
  `registerDbRoutes`, then sets `router.__studio = { db, token, origins }`.
- Middleware order preserved exactly: `installGuards` (`web/studio-api/guards.js:49-91`) installs
  json → loopback → CORS/preflight → token, matching the original byte-for-byte
  (`git show ddbc82c:web/studio-api.js`, `createStudioRouter` body).
- Routes live in disjoint files: `guards.js`, `bridge.js`, `db.js`, `health.js`, `agents.js` — and the
  original `bridge.js`/`db.js` bodies are verbatim copies (confirmed by the route + function diff
  above). `/run` still mounts `createRunnerRouter(options.runner)` inside the token guard.
- `bin/cli.js:117-121` now delegates the `web` case to `bin/commands/web.js` in one line, matching the
  pre-existing sibling pattern (`bin/cli.js:658`). `canResolveFrom`/`createRequire` were moved, not
  dropped (grep for leftovers in `bin/cli.js` → none).

### Criterion 3 — "supertest, @playwright/test, root vitest@^5, express@^4.22.3, Studio zod installed in one lockfile change; packageManager pins npm; npm ci succeeds in all four roots"

**Verdict: PASS.**

- All dependency edits landed in one commit, `ad717b5`, touching exactly
  `package.json`/`package-lock.json`, `web/*`, `studio/*` (6 files). `web/client/*` was intentionally
  unchanged.
- Manifests: root devDeps `{@playwright/test ^1.50.0, supertest ^7.1.0, vitest ^5.0.5}`;
  `web` `express ^4.22.3`; `studio` `dependencies.zod ^3.24.1` (not devDeps). `packageManager` =
  `npm@11.19.0`.
- Lockfiles resolve the pins: root vitest `5.0.5`, supertest + `@playwright/test` present; web
  `express 4.22.3`; studio `zod 3.25.76`.
- `npm ci --dry-run` exit 0 in all four roots: `. `, `web`, `web/client`, `studio` (only non-fatal
  npm-11 install-scripts warnings).

### Criterion 4 — "A test fails if migrations are duplicated, non-contiguous, or a released migration changes content"

**Verdict: PASS.**

- `test/migrations.test.js` (5 tests) + `test/fixtures/migrations.sha256.json` (0001–0004 baseline).
- Negative cases re-run independently in the real tree:
  - append a byte to `studio/migrations/0004_capstone.sql` → `Tests 1 failed | 4 passed`; restored with
    `git checkout --`.
  - duplicate prefix (`0002_dup.sql`) → `Tests 3 failed | 2 passed`; removed.
  - gap (`0006_gap.sql`, 0005 missing) → `Tests 1 failed | 4 passed`; removed.
- `git status --short` clean after every case.

---

## Gaps

### GAP-1 (Medium) — RESOLVED in `d83c966` — `web` command ignored its positional port argument

- **File:** `bin/commands/web.js:185-186` (with `bin/cli.js:119`).
- **What:** `bin/cli.js` passes `args.slice(1)` (command name already stripped), but the moved body
  still reads `args[1]` as the port — the index used when `args` was the full `process.argv.slice(2)`.
  This is an off-by-one, so the first positional token is skipped and the second is misread.
- **Evidence:**
  - Original source (`git show ddbc82c:bin/cli.js`): `const args = process.argv.slice(2);` …
    `if (!isProduction) port = args[1] || process.env.PORT || '3000';` → for `web 4123`, `args[1]='4123'`.
  - New: `bin/cli.js:119` `run({ args: args.slice(1), … })` → for `web 4123`, `args=['4123']`, so
    `args[1]` is `undefined`.
  - Runtime harness (a verbatim copy of the new `bin/commands/web.js` with a stub `web/server.js`):
    `web 4123` printed `Mode: development | Port: 3000 … SERVER_STARTED_WITH_PORT=3000`
    (expected 4123). `web --production 4123` diverges the other way: original → 3000, new → 4123.
- **Impact:** Contradicts criterion 1 ("zero behavior change") and `01-CONTEXT.md` D-04/specifics
  ("preserve … positional port"). Default `web` (no positional port), `--production`, `--cloud`,
  `PORT` env, `COURSES_DIR`, and the `server.js` handoff are unaffected. No test covers this path
  (grep of `test/` finds no `web`-command port assertion), so the "unchanged suites" pass cannot
  catch it.
- **Resolution:** fixed in commit `d83c966`; the port lines now read `args[0]`
  (`bin/commands/web.js:185-187`). Re-verified in "Re-verification after d83c966" below.

No open gaps. Response shapes, status codes, headers, and the `router.__studio` contract are all
unchanged (verified by header/body diff on 12 route cases).

---

## Re-verification after d83c966

Commit `d83c966` (`fix(01): preserve positional web port after cli split`) changed exactly
`bin/commands/web.js` — the two port lines `args[1]` → `args[0]`, plus a clarifying comment. Re-run:

- **Stub/harness proof** (verbatim copy of `bin/commands/web.js` + stub `web/server.js`):
  - `web 4123` → `Mode: development | Port: 4123` (process listen port 4123). ✔
  - `web` (no positional) → `Mode: development | Port: 3000`. ✔
  - `web 4123 --production` → `Mode: production | Port: 4123`. ✔
- **Root suite** `npx vitest run` → **294 passed (14 files)**.
- **Studio suite** `(cd studio && npx vitest run)` → **372 passed (43 files)**.
- **Sibling delegation unchanged:** `bin/cli.js` `status`/`next`/`check`/`doctor`/`studio`
  (`bin/cli.js:650-658`) is untouched by the phase diff; `node bin/cli.js status` and `doctor` run
  unchanged.
- **Scope:** `git diff --name-only ddbc82c..HEAD` still only Phase 1 Owns files + planning docs;
  `.planning/STATE.md` and `.planning/ROADMAP.md` untouched; only the new `test/migrations.test.js` +
  fixture appear under `test/`.

---

## Risk assessment (requested items)

- **Response shape / status / header / `router.__studio`:** No change. All 12 supertest cases matched
  in status, body and headers; `router.__studio` present on both.
- **`files` allowlist:** root `package.json` retains `web/studio-api.js` and adds `web/studio-api/`
  (both `true`). `scripts/smoke-pack.mjs` contains no `studio-api` path assertions, so no drift there.
- **Test edits:** Only `test/migrations.test.js` (new) + `test/fixtures/migrations.sha256.json` (new).
  `git diff --name-only ddbc82c..HEAD` shows no existing test modified.

## Scope discipline

`git diff --name-only ddbc82c..HEAD` contains only Phase 1 **Owns** files plus this phase's planning
docs (`01-0*-PLAN.md`, `01-SUMMARY.md`, `01-CONTEXT.md`): `web/studio-api.js` + its 5 new modules,
`bin/cli.js`, `bin/commands/web.js`, the root/`web`/`studio` `package.json`+lockfile pairs, and the
migration test + fixture. `.planning/STATE.md` and `.planning/ROADMAP.md` are **not** modified
(confirmed empty diff). No migration added; no `DB_VERSION`/`SCHEMA_VERSION` bump. No scope violation.

---

## Final verdict

**passed — 4/4 must-haves verified.** The seams (criterion 2), the toolchain install (criterion 3)
and the migration-integrity guard (criterion 4) are delivered and independently reproduced; the split
preserves every export and identical route/pure-function behavior. The one behavior change found in
the first pass — the `web` command's positional port — was fixed in `d83c966` and re-verified (4123 →
4123, default → 3000, production form → 4123). With the root (294) and studio (372) suites green and
scope intact, all four criteria now hold; no open gaps.
