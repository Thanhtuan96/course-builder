# Phase 4: Test Entry and CI Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 4-test-entry-and-ci-baseline
**Areas discussed:** unified test entry, CI topology, not-yet-merged suites, 5-second import flake,
Node 20 matrix, tarball `files` ownership

---

## unified test entry

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest 5 `test.projects` | One root config, two node projects (`root`, `studio`), one combined summary/watch | ✓ |
| Chained scripts | `vitest run && npm --prefix studio test`; two summaries, watch is awkward | fallback only |
| Keep separate entries | Leave `npm test` as root only | |

**User's choice:** Use Vitest 5 `test.projects`; chained `vitest run && npm --prefix studio test` is
only the documented fallback if projects cannot work. Add `test:watch`, `test:security`
(`test/security/**`) and `test:drift` (`test/shared-drift.test.js`).
**Notes:** Root `vitest` must move to `test:watch` so CI cannot enter watch mode. Projects were
validated in this worktree: 57 files / 666 tests in one summary.

---

## CI topology

| Option | Description | Selected |
|--------|-------------|----------|
| New ci.yml + reuse release-smoke | `ci.yml` for unit/security/drift; add `develop` triggers to the existing tarball smoke + CLI floor workflow | ✓ |
| One ci.yml with all five jobs | Duplicate tarball smoke/CLI floor into `ci.yml` | |

**User's choice:** `.github/workflows/ci.yml` on push/PR to `develop` and `main` with unit, security
and drift jobs; `release-smoke.yml` gains the `develop` trigger instead of a duplicate job. npm cache,
`npm ci`, concurrency cancel-in-progress, per-job `timeout-minutes`.
**Notes:** Security/drift are expected red until Phases 2 and 3 merge; Phase 4 merges after them.

---

## not-yet-merged suites

| Option | Description | Selected |
|--------|-------------|----------|
| Hard fail | `test:security`/`test:drift` fail while files are absent; jobs go green only after Phases 2/3 merge | ✓ |
| `--passWithNoTests` | Green now, meaningful later | |
| Conditional guards | Pass when neither tests nor sources exist | |

**User's choice:** No `passWithNoTests`. Smoke-pack hard-asserts `web/security.js` and
`web/legacy-server.js` are packed and `.studio-token` is not. Record the Phase 2/3 dependency in
VERIFICATION.

---

## 5-second import flake

| Option | Description | Selected |
|--------|-------------|----------|
| Stress + remove npm/network, fix root cause | 30+ stress runs, remove real npm from `pretest`, fix any reproduced slow import; document evidence only if unreproducible | ✓ |
| Raise `testTimeout` | Quick green | |
| Assume stale report | Document no-repro without changes | |

**User's choice:** Stress-reproduce (e.g. 30 runs), remove real npm/network from `pretest` and the
test paths, fix the root cause. Only if not reproducible after that, document evidence. Never raise
timeouts.
**Notes:** Local 30-run stress on `cli-import*.test.js` already showed 0/30 failures; the verifier must
re-run. Root `pretest` currently performs `npm --prefix web install` — the only npm/network step.

---

## Node 20 matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Node 22 both suites; Node 20 Studio only | Keeps the real `node:sqlite` >=22.5 floor while proving Studio's >=20 engine | ✓ |
| Node 22 only | Drops Node 20 coverage | |
| Node 20 root with skips | Weakens root coverage | |

**User's choice:** Node 22 runs root + Studio; Node 20 runs `npm --prefix studio test` only.
**Notes:** Root tests statically import `node:sqlite` via `web/studio-db.js`, which does not exist on
Node 20.

---

## tarball `files` ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 4 adds the two `files` entries | Two lines next to `web/server.js`; small, approved ownership exception | ✓ |
| Orchestrator merge patch | Leave `package.json` untouched and record the dependency | |
| Assert `package.json` only | Weaker than the roadmap's "packed" wording | |

**User's choice:** Phase 4 adds `web/security.js` and `web/legacy-server.js` to root `package.json`
`files`. Phase 2 still owns the contents.
**Notes:** Without the entries, the hard smoke assertion can never pass even after Phase 2 merges.

---

## Node 20 matrix (post-research revision)

| Option | Description | Selected |
|--------|-------------|----------|
| Replace Node 20 with Node 24 | Node 22 and 24 both run the full `npm test`; no knowingly-red job | ✓ |
| Node 20 subset | Run only the 42 Studio files that avoid `web/studio-api.js`; Vitest 5 itself still exceeds Node 20's engine floor | |
| Node 22 only | Drop the second runtime | |

**User's choice:** Replace Node 20 with Node 24. Research found the Studio suite is not Node 20-safe:
Vitest 5 declares `^22.12 || ^24 || >=26`, and `studio/test/agent-parsers.test.js` imports
`web/studio-api.js` → `web/studio-db.js` → `node:sqlite`.

---

## Smoke verification timing (post-research revision)

| Option | Description | Selected |
|--------|-------------|----------|
| Logic-test now, real smoke after Phase 2 | Export the packlist check and prove good/missing/leaked cases with synthetic data; run the real tarball smoke after Phase 2 merges | ✓ |
| Hard-fail now | Run the real smoke and record the expected missing-file failure | |
| Borrow Phase 2 files temporarily | Copy unowned files into this worktree for one run | |

**User's choice:** Logic-test the exported assertion now; record the real tarball smoke as a Phase 2
merge dependency in VERIFICATION. Do not stub the missing files.

---

## Research

| Option | Description | Selected |
|--------|-------------|----------|
| Research first | Ground Vitest projects, GitHub Actions, packlist shape, and QA-05 before planning | ✓ |
| Skip research | Plan directly from CONTEXT | |

**User's choice:** Research first. The researcher verified the projects config, Node engine conflicts,
`npm pack --json` shape, and that QA-05 did not reproduce.

---

## the agent's Discretion

- Exact project/job names, reporter flags, cache keys, and whether the unit matrix is one job.
- Wording of the offline dependency guard and CI/VERIFICATION dependency notes.
- Keeping or removing the stale `feat/studio-local-first` push trigger in `release-smoke.yml`.

## Deferred Ideas

- E2E/Chromium jobs and `test:e2e` (Phase 12).
- `sync:shared` script (Phase 3 request).
- Coverage tooling (would add a dependency).
- README/CHANGELOG documentation of the new scripts (Phase 11).
