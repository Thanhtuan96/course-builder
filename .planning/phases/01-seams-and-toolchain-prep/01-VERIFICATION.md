---
phase: 01-seams-and-toolchain-prep
verified: 2026-10-16T17:58:48Z
status: passed
score: "4/4 must-haves verified"
covered_files:
  - .planning/phases/01-seams-and-toolchain-prep/01-01-PLAN.md
  - .planning/phases/01-seams-and-toolchain-prep/01-01-SUMMARY.md
  - .planning/phases/01-seams-and-toolchain-prep/01-02-PLAN.md
  - .planning/phases/01-seams-and-toolchain-prep/01-02-SUMMARY.md
  - .planning/phases/01-seams-and-toolchain-prep/01-03-PLAN.md
  - .planning/phases/01-seams-and-toolchain-prep/01-03-SUMMARY.md
  - .planning/phases/01-seams-and-toolchain-prep/01-04-PLAN.md
  - .planning/phases/01-seams-and-toolchain-prep/01-04-SUMMARY.md
  - .planning/phases/01-seams-and-toolchain-prep/01-SUMMARY.md
  - bin/cli.js
  - bin/commands/web.js
  - package-lock.json
  - package.json
  - studio/package-lock.json
  - studio/package.json
  - test/fixtures/migrations.sha256.json
  - test/migrations.test.js
  - web/package-lock.json
  - web/package.json
  - web/studio-api.js
  - web/studio-api/agents.js
  - web/studio-api/bridge.js
  - web/studio-api/db.js
  - web/studio-api/guards.js
  - web/studio-api/health.js
covered_digest: "v3:sha256:30bd0f684bd346610dd5f9c8498ee6e6454c0f48edbb3e8b9bdd871bfda719ad"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: "4/4"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 1 Verification — Seams and Toolchain Prep (re-run)

**Goal:** Maintainer can run parallel workers safely because hotspot files are split into modules and
all milestone dependencies are already installed — with zero behavior change.

**Method:** goal-backward, read-only, independently falsified. All checks were re-run in the worktree
`gsd/phase-01-seams` at HEAD `743e57b` (branch fast-forwarded to `develop`; `HEAD == develop`).
One throwaway route-parity harness loaded the *original* monolith (`git show ddbc82c:web/studio-api.js`)
alongside the new split and compared live HTTP responses via `supertest`; migration negative cases were
executed against the real tree and reverted. Every transient artifact (`web/.verify-orig.mjs`,
`web/.studio-token`) was removed; the tree was left clean after each step (`git status --short` empty).

**Why re-run:** the prior report (commit `1a4040c`) went stale — covered source changed afterward:
`fac9245` bumped studio zod to `^4.6.7`, `743e57b` added the per-plan `01-0N-SUMMARY.md`, and `178b129`
merged develop. `covered_digest` was recomputed with
`gsd-tools query verification.fingerprint .planning/phases/01-seams-and-toolchain-prep --files <16 impl files>`
and matched the recorded value exactly.

---

## Criterion verdicts

### Criterion 1 — "createStudioRouter() and every CLI command behave exactly as before" — PASS

Existing suites pass unchanged except for the new migration test (no import-path edits were needed):

- Root `npx vitest run` → **Test Files 14 passed (14), Tests 294 passed (294)** (vitest v5.0.5).
- Studio `(cd studio && npx vitest run)` → **Test Files 43 passed (43), Tests 372 passed (372)** (vitest v5.0.4).
- `npx vitest run test/migrations.test.js` → **5 passed (5)**.

`createStudioRouter()` export/route parity, independently reproduced:

- **Export surface:** loaded `web/studio-api.js` outside VITEST. All 37 required named symbols resolve
  (`missing: NONE`), `default` export is a function, and `createStudioRouter(...)` returns a router with
  `router.__studio` present. (The eager-init block printed its banner and wrote `web/.studio-token`;
  the file was deleted afterward.) Total exports: 38.
- **Route parity:** built `createStudioApp({ token, db, probeReachable:false, runners:{}, capabilities })`
  from both the original monolith and the split and diffed status + body over 7 requests (health with/
  without token, disallowed/allowed origin, CORS preflight, `/db/health`, `/agents/claude/models`).
  **route mismatches: 0** (401/403/204/200 all matched, bodies byte-equal).
- **Guards middleware order** preserved verbatim vs the original: `express.json({limit:'25mb'})` →
  loopback guard → CORS/preflight → `X-Studio-Token` (`web/studio-api/guards.js:49-91` vs original
  `ddbc82c` lines 1003-1039); `/run` still mounts `createRunnerRouter(options.runner)` inside the guard.

CLI commands, re-proved against the live tree:

- `bin/cli.js` `web` case now delegates in one line — `bin/cli.js:117-121`:
  `const { run } = await import('./commands/web.js'); await run({ args: args.slice(1), cwd, chalk, style }); break;`.
  The entire `bin/cli.js` diff vs `ddbc82c` is exactly: remove `createRequire` import + `canResolveFrom`
  helper + the old `web` body, and **add 2 lines** (the delegation). `status`/`next`/`check`/`doctor`/
  `studio` cases are untouched.
- Positional port regression (`d83c966`) re-proved end-to-end:
  - `node bin/cli.js web 4123` → `Mode: development | Port: 4123` and serves `http://localhost:4123`.
  - `node bin/cli.js web` (no arg) → `Mode: development | Port: 3000`.
  - `node bin/cli.js web 4124 --production` exits early on "Production build not found" exactly as the
    original would (no `web/client/dist`), so the production port path is unchanged by inspection of the
    identical `args[0]`/`args[1]` logic.

### Criterion 2 — "web/studio-api.js is a thin composition; the `web` command body lives in bin/commands/web.js" — PASS

- `web/studio-api.js` is now 216 lines (was 1294): it declares `VERSION`/`STUDIO_URL_HINT`/`TOKEN_FILE`,
  `resolveToken`/`printBanner`, builds the router (`installGuards` → `/run` mount → `registerBridgeRoutes`
  → `registerDbRoutes` → `router.__studio = { db, token, origins }`), keeps `createStudioApp`, the default
  export handler + eager-init block, `createStudioDb`, and re-exports every prior symbol.
- Route bodies live in disjoint modules: `web/studio-api/agents.js` (494), `bridge.js` (195), `db.js` (66),
  `guards.js` (91), `health.js` (388); a `web/studio-api/` entry is present in the root `package.json`
  `files` allowlist (line 26), next to `web/studio-api.js`.
- The full `web` command body (204 lines) lives in `bin/commands/web.js` and reads the positional port as
  `args[0]` (`bin/commands/web.js:184-187`).

### Criterion 3 — "supertest, @playwright/test, root vitest@^5, express@^4.22.3 and Studio zod installed in a single lockfile change; packageManager pins npm; npm ci succeeds in all four roots" — PASS

Manifests:

- Root `package.json`: `packageManager: "npm@11.19.0"`; devDeps `@playwright/test ^1.50.0`,
  `supertest ^7.1.0`, `vitest ^5.0.5`.
- `web/package.json`: `express ^4.22.3`. `studio/package.json`: `zod` in **dependencies** `^4.6.7`.
- Lockfiles resolve the installed pins: root `vitest 5.0.5`, `supertest 7.3.1`, `@playwright/test 1.64.1`,
  `express 4.22.3`; `web` lock `express 4.22.3`; `studio` lock `zod 4.6.7` (4.x).

`npm ci --dry-run --no-audit --no-fund` exits **0** in all four roots: `.`, `web`, `web/client`, `studio`
(only non-fatal npm-11 install-script warnings). All dependency edits landed in one lockfile commit
`ad717b5` (plus the orchestrator's zod follow-up `fac9245`, which only touched `studio/package*.json`).

### Criterion 4 — "A test fails if migration filenames are duplicated or non-contiguous, or if a released migration (0001–0004) changes content" — PASS

- `test/migrations.test.js` (5 tests) + `test/fixtures/migrations.sha256.json` (0001–0004 baseline) exist;
  the test reads `studio/migrations/*.sql` and asserts unique prefixes, contiguous `0001..NNNN`, a
  released-prefix-only manifest guard, and SHA-256 immutability of released files.
- Negative cases re-run independently in the real tree, then reverted (tree clean after each):
  - tamper `0004_capstone.sql` (`printf '\n-- tamper' >>`) → **Tests 1 failed | 4 passed**; `git checkout --`.
  - duplicate prefix (`0002_dup.sql`) → **Tests 3 failed | 2 passed**; removed.
  - gap (`0006_gap.sql`, 0005 missing) → **Tests 1 failed | 4 passed**; removed.
  - clean baseline re-run → **5 passed**.

---

## Requirement traceability

- **QA-01** — "`web/studio-api.js` and the `bin/cli.js` command switch are split into modules with no
  behavior change, all milestone dev dependencies land in one lockfile change, and the npm version is
  pinned." Satisfied by criteria 1–3 (module split + 2-line delegation, single lockfile commit `ad717b5`,
  `packageManager: npm@11.19.0`, all four `npm ci` green).
- **QA-04** — "Migration files are verified unique and contiguous, and released migrations are never
  edited." Satisfied by criterion 4 (test + fixture + the three failing negative cases above). No migration
  file was added and no `DB_VERSION`/`SCHEMA_VERSION` was bumped (both unchanged vs `ddbc82c`).

---

## Notes / nuances (no gaps)

- **Studio zod 3 → 4 (`fac9245`).** The research stack decided `zod ^4.6.7`; `studio/package.json`
  now declares `^4.6.7` and `studio/package-lock.json` resolves `zod 4.6.7`. This still satisfies
  criterion 3 ("Studio `zod` installed in a single lockfile change") — it is a version bump only, kept
  inside the phase-1 lockfile commit set. The stale report referenced `zod 3.25.76`; that is the delta
  the re-run closes.
- **Root `express` range.** Root `package.json` still declares `express ^4.21.0` (plan 01-01 Task 1
  explicitly said "do not touch root `dependencies`"); only `web/package.json` was bumped to `^4.22.3`.
  Both lockfiles resolve/install `express 4.22.3`, so the ROADMAP wording ("express@^4.22.3 … installed")
  holds. Note a wording inconsistency between `01-CONTEXT.md` D-06 ("bump root and web") and plan Task 1
  ("do not touch root dependencies"); the implementation followed the plan task and the criterion is met.

## Scope discipline

`git diff --name-only ddbc82c..HEAD` contains only Phase 1 **Owns** files plus this phase's planning docs:
`web/studio-api.js` + its 5 new modules, `bin/cli.js`, `bin/commands/web.js`, the root/`web`/`studio`
`package.json`+lockfile pairs, and `test/migrations.test.js` + `test/fixtures/migrations.sha256.json`.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `CLAUDE.md` are **untouched** (grep of the diff → none).
- `web/client/**` untouched (its lockfile still satisfies `npm ci`).
- No migration added; no `DB_VERSION`/`SCHEMA_VERSION` bump.
- Orchestrator/extra commits stay within Owns: `fac9245` = `studio/package{,-lock}.json`; `743e57b` =
  the four `01-0N-SUMMARY.md` planning docs; `178b129` is the develop merge. No scope violation.

---

## Final verdict

**passed — 4/4 must-haves verified.** The seams (criterion 2), the toolchain install (criterion 3) and
the migration-integrity guard (criterion 4) are delivered; criterion 1 is independently reproduced with a
0-mismatch route/export parity check, a one-line `web` delegation, and the positional-port path re-proved
(`4123 → 4123`, default `→ 3000`). Root (294/14) and Studio (372/43) suites are green, the migration test
is 5/5 and falsifiable on tamper/duplicate/gap, the covered-input fingerprint is current, and scope is
intact. No gaps, no regressions.
