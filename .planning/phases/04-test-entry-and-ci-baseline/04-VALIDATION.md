---
phase: "04"
slug: "test-entry-and-ci-baseline"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.5 (root) + 5.0.4 (Studio), run as one projects pass |
| **Config file** | `vitest.config.js` (projects), `studio/vite.config.js` (standalone Studio) |
| **Quick run command** | `npx vitest run test/cli-import.test.js test/cli-import-capstone.test.js test/cli-studio.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 s local; ~2–4 min including CI installs |

---

## Sampling Rate

- **After every task commit:** Run the quick command plus `npm pkg get scripts`.
- **After every plan wave:** Run `npm test` and the packlist assertion.
- **Before `/gsd-verify-work`:** Full suite green twice in a row; 30-run stress loop green; workflow YAML parses.
- **Max feedback latency:** ~30 seconds locally.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 — One `npm test` runs both projects with an offline guard | 01 | 1 | QA-02 | T-04-01 | No install/fetch/build in the test path; offline guard fails fast | integration | `npm test` + JSON-reporter combined-vs-root+Studio count comparison | ❌ W0 | ⬜ pending |
| 04-01-02 — Add the two Phase 2 security assets to the package allowlist | 01 | 1 | QA-02 | T-04-01 | Allowlist only; no stubbed files and no token path | config | Node allowlist assertion | ❌ W0 | ⬜ pending |
| 04-01-03 — Pin import-test clocks and record 30+ run stability evidence | 01 | 1 | QA-05 | T-04-02 | Explicit `readCourse`/`planCourseImport` clocks; `run` exercised unchanged | stress | 30-run loop over `test/cli-import*.test.js` + `test/cli-studio.test.js` | ❌ W0 | ⬜ pending |
| 04-02-01 — Prove the unit CI slice (Node 22 and 24) | 02 | 2 | QA-03 | T-04-03, T-04-05 | Static matrix values only in `run`; cache keyed by four lockfiles | static + GitHub-only | Ruby YAML parse + grep assertions; GitHub run after push | ❌ W0 | ⬜ pending |
| 04-02-02 — Add security and drift jobs with the pre-merge dependency note | 02 | 2 | QA-03 | T-04-03, T-04-04 | Static run strings; read-only token; cache on both install jobs | static | Ruby YAML parse + grep assertions | ❌ W0 | ⬜ pending |
| 04-02-03 — Extend release-smoke for develop and direct builds | 02 | 2 | QA-03 | T-04-04, T-04-05 | Read-only token; four-lockfile cache; `npm ci` only | static + GitHub-only | Ruby YAML parse + grep assertions; GitHub run after push | ❌ W0 | ⬜ pending |
| 04-03-01 — Export a pure normalized packlist assertion | 03 | 2 | QA-03 | T-04-06, T-04-08 | Exact token basename; normalized JSON root | packaging | exported packlist assertion + synthetic cases | ❌ W0 | ⬜ pending |
| 04-03-02 — Wire the assertion into the real pack flow and record the Phase 2 deferral | 03 | 2 | QA-03 | T-04-06, T-04-07 | Check precedes tarball install; Phase 2 paths required | packaging | synthetic cases + timed import + line-order check; `SMOKE_SKIP_BUILD=1 npm run smoke:pack` after Phase 2 merge | ❌ W0 (Phase 2) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Vitest already installed in both package roots; no framework install needed.
- [ ] `vitest.config.js` projects config.
- [ ] Root `package.json` scripts + two `files` entries (D-11 exception).
- [ ] Offline dependency guard (inside `vitest.config.js` or an inline script).
- [ ] `.github/workflows/ci.yml`; `release-smoke.yml` trigger/timeout/direct-build edits.
- [ ] `scripts/smoke-pack.mjs` exported packlist assertion.
- [ ] QA-05 stress evidence recorded in VERIFICATION.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Push/PR trigger semantics, cache hits, and matrix expansion | QA-03 | GitHub Actions semantics cannot be executed locally; only syntax can be checked | After pushing the branch, confirm a `develop` PR runs unit/security/drift and `release-smoke` runs tarball-smoke + cli-floor with the expected Node versions; confirm re-push cancels the previous run. |
| Real tarball contains the Phase 2 security files | QA-03 / D-10 | Phase 2 files do not exist in this worktree | After Phase 2 merges/rebase: `npm pack --json` must list `web/security.js` and `web/legacy-server.js` and no `.studio-token`; then run the full smoke. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
