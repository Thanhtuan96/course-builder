# Phase 1: Seams and Toolchain Prep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 1-seams-and-toolchain-prep
**Areas discussed:** studio-api module seams, cli.js split scope, dependency pins & placement,
migration test mechanism

---

## studio-api module seams

| Option | Description | Selected |
|--------|-------------|----------|
| Re-export every public symbol | `web/studio-api.js` stays thin and re-exports the full current surface so tests + `web/server.js` need zero changes | ✓ |
| Re-export only router/app | Re-export just `createStudioRouter`/`createStudioApp`; update consumers' imports | |
| Monolithic bridge module | Put agents + bridge in one module | |

**User's choice:** Re-export EVERY current public symbol; agents get a dedicated
`web/studio-api/agents.js` (Phase 2 adds `buildAgentArgs` + flag denylist there); other modules
`guards` / `bridge` / `db` / `runner` / `health`.
**Notes:** Zero test churn is a hard goal for this phase.

---

## cli.js split scope

| Option | Description | Selected |
|--------|-------------|----------|
| Move only `web` | Extract the large `web` case to `bin/commands/web.js`; leave registry cases in `cli.js` | ✓ |
| Broader split | Also extract `install`/`update`/`remove`/`installed`/`publish`/`courses`/`search` | |

**User's choice:** Move only the `web` case.
**Notes:** Lowest risk; registry flows stay untouched in this phase.

---

## dependency pins & placement

| Option | Description | Selected |
|--------|-------------|----------|
| As specified | supertest + @playwright/test + vitest ^5.0.5 as root devDeps; express ^4.22.3 only where already declared; zod in studio deps; `packageManager` = npm@11.19.0 | ✓ |
| Caret/floor npm pin | Pin a lower npm floor instead of exact | |

**User's choice:** Exact placements as listed; `packageManager` pinned exactly to `npm@11.19.0`.
**Notes:** Phase 1 owns all four lockfiles; `npm ci` must succeed in each root.

---

## migration test mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Committed SHA-256 manifest | `test/fixtures/migrations.sha256.json` for released 0001–0004 + uniqueness + contiguity checks | ✓ |
| Git-history check | Detect released-migration edits via git | |
| Inline hashes | Hard-code hashes in the test file | |

**User's choice:** Committed SHA-256 manifest fixture; uniqueness + contiguity; each newly released
migration must be added to the manifest.
**Notes:** Phase 5 adds its own `0005_beta_loop.sql` entry when it lands.

---

## the agent's Discretion

- Internal function placement / exact named exports within each new module (public surface fixed).
- `export { x } from` vs. explicit import/export list in `web/studio-api.js`.

## Deferred Ideas

None — discussion stayed within phase scope.
