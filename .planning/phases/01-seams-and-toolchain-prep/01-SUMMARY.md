---
phase: 1
phase_name: Seams and Toolchain Prep
status: complete
plans_complete: 4
plans_total: 4
commits:
  - ad717b5 chore(01): land milestone dependencies in one lockfile change
  - f393902 refactor(01): split web/studio-api.js into route modules
  - c58ae91 refactor(01): extract web case into bin/commands/web.js
  - 5ba5b44 test(01): guard migration uniqueness, contiguity and released content
---

# Phase 1: Seams and Toolchain Prep — Summary

**Goal:** Maintainer can run parallel workers safely because hotspot files are split into modules
and all milestone dependencies are already installed — with zero behavior change.

## What landed

**01-01 Dependencies (one lockfile change).**
- Root devDeps: `supertest`, `@playwright/test`, `vitest` bumped `^4.1.1` → `^5.0.5`.
- `express` `^4.21.0` → `^4.22.3` in the two manifests that already declared it (root, `web/`).
- `zod` added to `studio` dependencies.
- `packageManager: "npm@11.19.0"` pinned in the root manifest.
- `npm ci` verified in all four package roots.

**01-02 studio-api split.**
- `web/studio-api.js` (1294 lines) → thin composition + `web/studio-api/{guards,bridge,db,health,agents}.js`.
- Composition re-exports **every** previous public symbol, so `web/server.js` and all test files
  needed **zero** import changes.
- Middleware order, status codes and JSON shapes preserved; `/run` mount unchanged.
- `agents.js` is the Phase 2 extension point for `buildAgentArgs` + the flag denylist.
- `web/studio-api/` added to the root `files` allowlist.

**01-03 CLI `web` case.**
- `bin/cli.js` `web` case body (~175 lines) moved to `bin/commands/web.js` behind the shared
  `run({ args, cwd, chalk, style })` shape; `cli.js` delegates in one line like the other commands.
- Removed the now-unused `canResolveFrom` helper + `createRequire` import.

**01-04 Migration integrity test.**
- `test/migrations.test.js` + `test/fixtures/migrations.sha256.json` (0001–0004 baseline).
- Asserts unique prefixes, contiguous numbering from 0001, released-prefix manifest guard, and
  SHA-256 immutability of released migrations.

## Verification evidence (local)

| Check | Result |
|-------|--------|
| `npm ci` in root, web/, web/client/, studio/ | pass |
| Root suite (`npx vitest run`) | 289 passed (13 files) |
| Studio suite (`npx vitest run` in studio/) | 372 passed (43 files) |
| `test/migrations.test.js` | 5 passed |
| Tamper / duplicate-prefix / gap negative cases | each fails as intended |
| `node bin/cli.js list`, `--help` | unchanged |

## Scope discipline

- No behavior change: all edits are mechanical extraction or manifest/test additions.
- No migration added; no `DB_VERSION`/`SCHEMA_VERSION` bumped.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were **not** edited (orchestrator-owned per
  Execution Rules).
- Files touched: only those in Phase 1 **Owns** (`web/studio-api.js` + new modules, `bin/cli.js`,
  `bin/commands/web.js`, the four `package.json`/lockfile pairs, `test/migrations.test.js`,
  `test/fixtures/migrations.sha256.json`).

## Notes / follow-ups

- `supertest` and `@playwright/test` are installed but not yet consumed — Phase 4 (test entry) and
  Phase 12 (E2E) use them.
- `web/client/package-lock.json` was unchanged (no dependency change there) and still satisfies
  `npm ci`.
