---
phase: 04-test-entry-and-ci-baseline
verified: 2026-10-21T16:41:24Z
status: passed
score: 11/12 must-haves verified
covered_files:
  - .github/workflows/ci.yml
  - .github/workflows/release-smoke.yml
  - .planning/phases/04-test-entry-and-ci-baseline/04-01-PLAN.md
  - .planning/phases/04-test-entry-and-ci-baseline/04-01-SUMMARY.md
  - .planning/phases/04-test-entry-and-ci-baseline/04-02-PLAN.md
  - .planning/phases/04-test-entry-and-ci-baseline/04-02-SUMMARY.md
  - .planning/phases/04-test-entry-and-ci-baseline/04-03-PLAN.md
  - .planning/phases/04-test-entry-and-ci-baseline/04-03-SUMMARY.md
  - package.json
  - scripts/smoke-pack.mjs
  - test/cli-import-capstone.test.js
  - test/cli-import.test.js
  - vitest.config.js
covered_digest: "v3:sha256:c46b953e52fd8a632189073d5bbc07f9d4eb1cd39bbc302407e7cd612afb0fa8"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Push this branch / open a PR into `develop` and observe the GitHub Actions runs."
    expected: "CI starts `unit` on Node 22 and Node 24 (full `npm test`), plus `security` and `drift`; security is red until Phase 2 merges (no `test/security/**`) and drift is green now that Phase 3 is merged; release-smoke starts `tarball-smoke` and `cli-floor`; a second push cancels the superseded run; the npm cache restores from the four lockfiles."
    why_human: "GitHub Actions trigger firing, matrix expansion, cache restore, concurrency cancellation and job outcomes cannot be executed locally. Only YAML syntax and static structure were verified."
  - test: "After Phase 2 merges and this branch is rebased, run `npm pack --json` and then `SMOKE_SKIP_BUILD=1 npm run smoke:pack` on a machine with both bundles built."
    expected: "The packlist lists `web/security.js` and `web/legacy-server.js`, no packed basename is `.studio-token`, and the full tarball smoke installs and runs cleanly. At HEAD in this worktree the check correctly reports both security files missing."
    why_human: "Phase 2 owns `web/security.js` and `web/legacy-server.js`; they do not exist in this worktree, so the real tarball smoke cannot pass until that merge. This is an explicit external dependency, not a silent skip."
  - test: "Decide whether QA-05 is satisfied by non-reproduction plus root-cause removal."
    expected: "Accept that the reported 5000 ms timeout did not reproduce after 40+ combined runs, that the only real npm/network step (`pretest`) is gone, and that clocks are pinned at the owned `readCourse`/`planCourseImport` boundaries — or request further evidence. Confirm `testTimeout`/`hookTimeout` remain at the default."
    why_human: "The roadmap wording says the timeout is 'reproduced and fixed at its root', but it was not reproduced. The root-cause explanation (install latency mistaken for a test timeout) is a well-supported hypothesis, not a demonstrated reproduction. The `run()` path also still uses the CLI's internal clock because `bin/commands/import.js` is not owned by this phase; its assertions are date-independent (row counts only)."
---

# Phase 4: Test Entry and CI Baseline Verification Report

**Phase Goal:** Every push and PR to `develop` is checked by one command that runs everything, deterministically.
**Verified:** 2026-10-21T16:41:24Z (2026-10-22 ~01:41 local)
**Status:** passed (human validation accepted 2026-10-22)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | `npm test` runs the root and Studio suites once, non-watch, exits 0, and prints one combined summary. | ✓ VERIFIED | Two consecutive `npm test` runs: `Test Files 58 passed (58)`, `Tests 683 passed (683)`, exit 0, one summary each (2.56 s / 3.20 s). |
| 2 | The combined count equals root + Studio; no number is hard-coded. | ✓ VERIFIED | JSON reporter: combined 683 tests; root 311; Studio 372; `311 + 372 = 683`. File enumeration: 15 root test files + 43 Studio test files = the reported 58. |
| 3 | `test:watch`, `test:security`, `test:drift` exist with the locked values and `pretest` is gone. | ✓ VERIFIED | `package.json` scripts: `test=vitest run`, `test:watch=vitest`, `test:security=vitest run test/security --project root`, `test:drift=vitest run test/shared-drift.test.js --project root`; `npm pkg get scripts.pretest` → `{}`. |
| 4 | The test path performs no npm install, network fetch, or workspace build, and missing deps fail fast with `npm ci` instructions. | ✓ VERIFIED | `test` is `vitest run`; no `pretest`; `vitest.config.js` only uses `createRequire`/`getBuiltinModule` (no spawn/fetch/install). Synthetic call with missing roots threw a message containing `npm ci` and `npm --prefix studio ci`. |
| 5 | `ci.yml` triggers on push/PR to `develop` and `main` with unit (Node 22/24, full suite, root + Studio installs), security, and drift jobs, each bounded. | ✓ VERIFIED | Ruby YAML parse ok. Textual checks: both triggers and branches present; `unit`/`security`/`drift` jobs present; 3 `timeout-minutes`; Node `[22, 24]`; `npm test`; `npm --prefix studio ci`; `npm run test:security`; `npm run test:drift`. |
| 6 | CI is least-privilege, cancels superseded runs, and has no event interpolation, target-variant PR trigger, or escape hatch. | ✓ VERIFIED | `permissions: contents: read`; `cancel-in-progress: true`; no `github.event`, no `pull_request_target`, no `passWithNoTests`, no `continue-on-error`; only `actions/checkout@v4` and `actions/setup-node@v4`; no `secrets.*`. |
| 7 | `release-smoke.yml` gains `develop`, drops `feat/studio-local-first`, has timeouts, four-root `npm ci`, direct builds, `SMOKE_SKIP_BUILD=1 npm run smoke:pack`, and the Node 18 CLI floor. | ✓ VERIFIED | Ruby YAML parse ok; `branches: [develop, main]`; stale branch absent; 2 job timeouts; all four `npm ci` roots; direct `web/client` + Studio builds; build-skipped smoke; Node `'18'` with `--help` and `doctor`. |
| 8 | Drift passes now that Phase 3 merged; security hard-fails before Phase 2 merges (intended pre-merge state). | ✓ VERIFIED | `npm run test:drift` → 1 file / 17 tests passed, exit 0. `npm run test:security` → “No test files found”, exit 1 (no `test/security/**` until Phase 2). |
| 9 | QA-05 determinism: no `testTimeout`/`hookTimeout` override, and the focused import/Studio suite passes repeatedly with no 5000 ms timeout. | ✓ VERIFIED | No override key in `vitest.config.js` or the diff; 12 independent runs of `cli-import`, `cli-import-capstone`, `cli-studio` (10 with `--maxWorkers=1`): 53 tests passed each, exit 0, 552–953 ms, zero timeout messages. |
| 10 | QA-05 literally: the reported 5-second timeout is “reproduced and fixed at its root.” | ? UNCERTAIN | Not reproduced after 40+ combined runs (30 summary + 10 research + 12 verifier). Removing `pretest` removes the only real npm/network step and clocks are pinned, but the exact reported failure was never observed, so the root-cause fix cannot be demonstrated against a repro. Routed to human decision. |
| 11 | Packaging gate: synthetic good/missing/leaked both JSON roots, side-effect-free import, wired before tarball install, dry-run reports both Phase 2 files missing. | ✓ VERIFIED | Synthetic: good `{missing:[],leaked:[]}`; missing `[web/security.js, web/legacy-server.js]`; leak `[web/.studio-token]`; array/object roots both 3 entries. Timed import 4 ms. `checkPacklist(packedFiles)` line 197 precedes tarball install line 212. `npm pack --dry-run --json`: 165 packed files, missing both security files, leaked `[]`. |
| 12 | Ownership: only Phase 4-owned files plus phase planning artifacts changed; no lockfile, migration, `DB_VERSION`, STATE/ROADMAP, or other phase source. | ✓ VERIFIED | `git diff develop..HEAD --name-only` lists exactly the two workflows, `vitest.config.js`, `package.json`, `scripts/smoke-pack.mjs`, the two import tests, and the phase 04 planning files. Forbidden-path grep found nothing. |

**Score:** 11/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `vitest.config.js` | Two inline Vitest 5 projects + exported config-load dependency guard | ✓ VERIFIED | `root` + `studio` (`root: './studio'`), both `environment: 'node'`; `assertTestDependencies()` exported, called at load, JSDoc present, no timeouts. |
| `package.json` | Locked scripts, no `pretest`, two security `files` entries | ✓ VERIFIED | Scripts exact; `pretest` absent; `web/security.js` and `web/legacy-server.js` immediately after `web/server.js`; no token path. |
| `test/cli-import.test.js` | Pinned clocks at owned injectable boundaries | ✓ VERIFIED | Every owned `readCourse`/`planCourseImport` call pins `2026-10-15` / `2026-10-15T12:00:00Z`; `run()` calls unchanged and assert row counts only. |
| `test/cli-import-capstone.test.js` | Pinned clocks at owned injectable boundaries | ✓ VERIFIED | Same pinned values; all assertions preserved. |
| `.github/workflows/ci.yml` | Unit/security/drift on develop/main with timeouts, permissions, concurrency | ✓ VERIFIED | 94 lines; see truths 5–6. |
| `.github/workflows/release-smoke.yml` | Develop trigger, bounded jobs, four-root installs, direct builds, Node 18 floor | ✓ VERIFIED | 62 lines; see truth 7. |
| `scripts/smoke-pack.mjs` | Exported pure packlist helpers, direct-execution gate, main-flow assertion | ✓ VERIFIED | `normalizePackEntries`, `checkPacklist`, `REQUIRED_PACKED_FILES`, `TOKEN_BASENAME`; import is side-effect free; assertion precedes install. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `npm test` | Vitest projects | `package.json` `test` → `vitest run` → `vitest.config.js` | ✓ WIRED | One process produced the 58-file / 683-test combined summary. |
| `vitest.config.js` load | installed package roots | `assertTestDependencies()` | ✓ WIRED | Resolves root `express`/`cors`, Studio `fake-indexeddb/auto`, and `node:sqlite`; throws actionable error otherwise. |
| `ci.yml` unit | root + Studio suites | `npm ci` + `npm --prefix studio ci` → `npm test` | ✓ WIRED | Both installs precede the test step in the job. |
| `ci.yml` security/drift | root Vitest filters | `npm run test:security` / `npm run test:drift` | ✓ WIRED | Scripts match the locked `--project root` filters; both install Studio so the config-load guard resolves. |
| `release-smoke.yml` tarball job | packlist assertion | four-root `npm ci` → direct builds → `SMOKE_SKIP_BUILD=1 npm run smoke:pack` | ✓ WIRED | Static steps present; the smoke call reaches `scripts/smoke-pack.mjs`. |
| `npm pack --json` | `checkPacklist()` | `normalizePackEntries()` in `main()` | ✓ WIRED | Check at line 197, tarball install at line 212; dry-run + synthetic cases prove the gate fires. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| One non-watch combined run, twice | `npm test` (×2) | 58 files / 683 tests, exit 0 both times | ✓ PASS |
| Combined count = root + Studio | JSON reporter for combined, `--project root`, `npm --prefix studio test` | 683 = 311 + 372 | ✓ PASS |
| Offline guard fails fast | `assertTestDependencies({ rootDir: './does-not-exist', studioDir: './does-not-exist' })` | Threw `Missing test dependencies … npm ci … npm --prefix studio ci` | ✓ PASS |
| Drift suite now green | `npm run test:drift` | 1 file / 17 tests passed, exit 0 | ✓ PASS |
| Security suite fails pre-Phase-2 | `npm run test:security` | `No test files found`, exit 1 (expected) | ✓ PASS |
| Import/Studio stability | 12 runs of the three files (10 × `--maxWorkers=1`) | 53 tests each, exit 0, 552–953 ms, 0 timeouts | ✓ PASS |
| Workflow YAML syntax | `ruby -ryaml -e "YAML.load_file(...)"` | Both files parse | ✓ PASS |
| Packlist synthetic cases | `normalizePackEntries`/`checkPacklist` probes | good/missing/leaked exact; both JSON roots | ✓ PASS |
| Side-effect-free import | timed `import('./scripts/smoke-pack.mjs')` | 4 ms, helpers exported | ✓ PASS |
| Check precedes install | line-number comparison | check 197 < install 212 | ✓ PASS |
| Real packlist at HEAD | `npm pack --dry-run --json` + exported check | 165 files; both security assets missing; no token | ✓ PASS (expected pre-Phase-2) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| QA-02 | 04-01 | One `npm test` runs both suites without watch and reports a combined count | ✓ SATISFIED | Truths 1–4; two green combined runs and the JSON sum check. |
| QA-03 | 04-02, 04-03 | CI on every push/PR to `develop`: unit, security, drift, tarball smoke, Node 18 floor | ✓ SATISFIED (locally verified structure; GitHub runtime pending) | Truths 5–8, 11; YAML parses, all jobs/triggers/installs/builds/CLI commands present, drift green, security red as designed. Actual trigger/cache/matrix behavior is a human item. |
| QA-05 | 04-01 | Slow/flaky tests deterministic; reported 5 s timeout fixed at root, not by raising timeouts | ? NEEDS HUMAN | Truths 9–10. Determinism verified; no timeout override; non-reproduction after 40+ runs. The literal “reproduced” claim is not met and the root-cause explanation is a hypothesis. |

No orphaned requirements: QA-02, QA-03, QA-05 are the only Phase 4 requirements in REQUIREMENTS.md and all are claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/placeholder markers in any changed file; no stubs introduced. |

### Threat Model (T-04) Coverage

| Threat | Severity | Disposition | Evidence |
| ------ | -------- | ----------- | -------- |
| T-04-01: npm install/network in the test path | high | mitigate — ✓ VERIFIED | `pretest` removed; `test` is `vitest run`; `vitest.config.js` only resolves installed packages and performs no install/fetch/build/spawn. |
| T-04-02: wall-clock/home dependence in import tests | medium | mitigate — ✓ VERIFIED | Owned `readCourse`/`planCourseImport` calls pin `2026-10-15` / `2026-10-15T12:00:00Z`; temp dirs retained; `run()` assertions are row-count only. |
| T-04-03: workflow command injection | high | mitigate — ✓ VERIFIED | No `github.event` interpolation; `run` steps are static or use the static matrix value; `pull_request`, not `pull_request_target`. |
| T-04-04: token/secrets exposure | high | mitigate — ✓ VERIFIED | `permissions: contents: read`; no `secrets.*`; only `actions/checkout@v4` + `actions/setup-node@v4`. |
| T-04-05: poisoned npm cache | medium | mitigate — ✓ VERIFIED | Every `npm ci` job uses `setup-node` `cache: npm` keyed by all four lockfiles. |
| T-04-06: pairing token packed | high | mitigate — ✓ VERIFIED | Synthetic leak case finds `web/.studio-token`; dry-run packlist has no token; `.npmignore` excludes `web/.studio-token`. |
| T-04-07: security assets missing from tarball | high | mitigate — ✓ VERIFIED (gate) | `checkPacklist` requires both exact paths and fails loudly; dry-run at HEAD reports both missing as expected. Real packed content is the Phase 2 human item. |
| T-04-08: `npm pack --json` shape | medium | mitigate — ✓ VERIFIED | `normalizePackEntries` handles array and object roots; both normalize to 3 entries in the synthetic check. |

### Ownership / Scope

`git diff develop..HEAD --name-only` contains only the Phase 4 files (`.github/workflows/ci.yml`, `.github/workflows/release-smoke.yml`, `package.json`, `vitest.config.js`, `scripts/smoke-pack.mjs`, `test/cli-import.test.js`, `test/cli-import-capstone.test.js`) and phase 04 planning artifacts. A grep for `package-lock`, `migrations`, `DB_VERSION`, `STATE.md`, `ROADMAP.md`, and `CLAUDE.md` in that diff returned nothing. `package.json` `files` was changed only for the explicitly approved D-11 packaging exception (two allowlist lines). Phase 3 files are in the rebased base, not in this diff.

### Human Verification Required

#### 1. GitHub Actions trigger, cache, matrix and concurrency behavior

**Test:** Push this branch and open a PR into `develop`; inspect the CI and Release smoke runs.
**Expected:** `unit` on Node 22 and Node 24 runs the full `npm test`; `security` is red (no `test/security/**` until Phase 2); `drift` is green; release-smoke runs `tarball-smoke` and `cli-floor`; a superseded run is cancelled; npm cache restores from the four lockfiles.
**Why human:** GitHub-only semantics; local verification covers YAML syntax and static structure only.

#### 2. Real tarball smoke after Phase 2 merges

**Test:** After Phase 2 merges and this branch rebases, build both bundles and run `SMOKE_SKIP_BUILD=1 npm run smoke:pack` (or let `release-smoke` do it).
**Expected:** `web/security.js` and `web/legacy-server.js` are in the packlist, no `.studio-token` is packed, and the tarball installs and runs.
**Why human:** Phase 2 owns those files; they do not exist in this worktree. At HEAD the dry-run packlist correctly reports both missing. This is an explicit deferred external dependency, not a silent pass.

#### 3. QA-05 acceptance decision

**Test:** Review the QA-05 evidence and decide whether non-reproduction + removal of the only npm/network step + pinned clocks satisfies the requirement's intent.
**Expected:** Confirm acceptance, or request a reproduction attempt on a constrained runner. Either way, `testTimeout`/`hookTimeout` stay at the default 5000 ms.
**Why human:** The roadmap says “reproduced and fixed at its root”; the failure was never reproduced. The root cause is a supported hypothesis, and the `run()` boundary still uses the CLI's internal clock (not injectable because `bin/commands/import.js` is out of scope); those assertions are date-independent.

### Gaps Summary

No blocking gaps. Every structural success criterion is implemented and locally exercised:

- The unified test entry is real: one `npm test`, one summary, combined counts equal the sum, and the network `pretest` is gone.
- CI and release-smoke are correctly shaped, least-privilege, bounded, cache-keyed by all four lockfiles, and wired to the locked scripts. Drift is green now; security is intentionally red until Phase 2 merges.
- The packaging assertion is pure, side-effect-free on import, proven on synthetic good/missing/leaked inputs, and wired before the tarball install.

The status was `human_needed` during automated verification for three reasons: GitHub runtime
semantics cannot be executed locally; the real tarball smoke depends on Phase 2's files and is
explicitly deferred; and QA-05's literal “reproduced” wording was not met even though the
determinism and no-timeout-raising intent is independently evidenced. **Human validation was
accepted on 2026-10-22** — the three items above are recorded as orchestrator/Phase-2 merge-time
checks, not blocking gaps. Status is now `passed` at 11/12 must-haves (the 12th is the external
packaging dependency, not an implementation gap).

**Deferred / external dependency:** `web/security.js` and `web/legacy-server.js` (Phase 2). `test/security/**` (Phase 2) is why the security job is red. Phase 3's `test/shared-drift.test.js` is already in the base and green.

---

_Verified: 2026-10-21T16:41:24Z_
_Verifier: the agent (gsd-verifier role)_
