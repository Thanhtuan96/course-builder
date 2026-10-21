---
phase: "2"
slug: "security-release-gate-and-legacy-gating"
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-22"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` § Validation Architecture and audited against the implemented
> Plan 01–05 tests on 2026-10-22.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (root), supertest (Phase 1 dependency) |
| **Config file** | `vitest.config.js` (root; includes `test/**/*.test.js`) |
| **Quick run command** | `npx vitest run test/security` |
| **Full suite command** | `npm test` (root suite; once Phase 4 wires Studio, also `cd studio && npm test`) |
| **Estimated runtime** | ~4–8 seconds for `test/security`; ~60–90 seconds for the root suite |

The implemented security suites are:

- `test/security/{token,paths,helpers,token,guards,entrypoints,studio-static,legacy,legacy-agents,agents,runner,cli,client,no-side-effects,subprocess-smoke}.test.js`
- Regression suites touched by the phase: `test/studio-api.test.js`, `test/studio-api-agents.test.js`,
  `test/studio-runner.test.js`, `test/cli-studio.test.js`, `test/cli.test.js`

---

## Sampling Rate

- **After every task commit:** Run the narrowest `npx vitest run <changed test file>`.
- **After every plan wave:** Run `npx vitest run test/security test/studio-api.test.js test/studio-api-agents.test.js test/studio-runner.test.js test/cli-studio.test.js test/cli.test.js`.
- **Before `/gsd-verify-work`:** `npm test` must be green.
- **Max feedback latency:** 90 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-* | 01 | 1 | SEC-07, SEC-08 | T-02-01/02 | Token path/mode/migration/rotation; path containment rejects encoded/backslash/symlink escapes | unit | `npx vitest run test/security/token.test.js test/security/paths.test.js test/security/helpers.test.js` | ✅ | ✅ green |
| 02-02-* | 02 | 2 | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-11, SEC-13 | T-02-04..09, T-02-26 | Host→Origin→token→JSON guard order; Studio-only 404s; legacy stderr warning; exactly one UI at root; escape-hatch refusal; Studio static Host gate | integration | `npx vitest run test/security/guards.test.js test/security/entrypoints.test.js test/security/studio-static.test.js` | ✅ | ✅ green |
| 02-03-* | 03 | 3 | SEC-01, SEC-08, SEC-09, SEC-13 | T-02-10..13 | Legacy is opt-in; traversal/symlink and LLM write scoping; safe legacy spawns; capability TTL cache; no side effects | integration | `npx vitest run test/security/legacy.test.js test/security/legacy-agents.test.js` | ✅ | ✅ green |
| 02-04-* | 04 | 2 | SEC-09, SEC-10, SEC-13 | T-02-15..20 | No bypass flags/env; temp cwd; env allowlist; runner denylist + 429; injectable spawn; workspace containment | unit + integration | `npx vitest run test/security/agents.test.js test/security/runner.test.js` | ✅ | ✅ green |
| 02-05-* | 05 | 4 | SEC-02, SEC-07, SEC-11, SEC-13, SEC-14 | T-02-14, T-02-21..25 | CLI pairing/mask/rotate; legacy dev UI URL 5173; client fragment/no-query token/apiBase; deprecation banner; doctor posture; accepted risks; registry name fix | unit + source | `npx vitest run test/cli-studio.test.js test/cli.test.js test/security/cli.test.js test/security/client.test.js` | ✅ | ✅ green |
| 02-05-* | 05 | 4 | SEC-13 | — | Rejected requests write nothing and spawn nothing | integration | `npx vitest run test/security/no-side-effects.test.js test/security/subprocess-smoke.test.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Requirement Coverage Audit

| Requirement | Covering Tests | Status |
|-------------|----------------|--------|
| SEC-01 | `entrypoints.test.js`, `legacy.test.js`, `no-side-effects.test.js`, `subprocess-smoke.test.js` | ✅ COVERED |
| SEC-02 | `entrypoints.test.js` (stderr warning), `subprocess-smoke.test.js`, `client.test.js` (banner source) | ✅ COVERED |
| SEC-03 | `helpers.test.js`, `guards.test.js`, `studio-static.test.js`, `legacy.test.js` | ✅ COVERED |
| SEC-04 | `guards.test.js` (exact allowlist, `null`, no `*`, wildcard still token-gated) | ✅ COVERED |
| SEC-05 | `guards.test.js`, `legacy.test.js`, `legacy-agents.test.js`, `no-side-effects.test.js` | ✅ COVERED |
| SEC-06 | `guards.test.js` (text/plain, form-urlencoded, missing Content-Type, malformed, oversized), `legacy.test.js`, `no-side-effects.test.js` | ✅ COVERED |
| SEC-07 | `token.test.js`, `cli-studio.test.js`, `security/cli.test.js`, `client.test.js` | ✅ COVERED |
| SEC-08 | `paths.test.js`, `legacy.test.js`, `runner.test.js` | ✅ COVERED |
| SEC-09 | `agents.test.js`, `legacy-agents.test.js`, `helpers.test.js` | ✅ COVERED |
| SEC-10 | `runner.test.js`, `helpers.test.js` | ✅ COVERED |
| SEC-11 | `entrypoints.test.js`, `security/cli.test.js` (doctor posture) | ✅ COVERED |
| SEC-13 | `no-side-effects.test.js`, `subprocess-smoke.test.js`, plus the snapshot/spawn-spy assertions in each rejection suite | ✅ COVERED |
| SEC-14 | `cli.test.js` (`validateItemName`), `docs/security/ACCEPTED-RISKS.md` (review artifact) | ✅ COVERED |

No MISSING or PARTIAL requirement remains. The only uncovered variants are the manual checks
listed below; each has an automated substitute in the table above.

---

## Harness Prerequisites (created across the owning plans)

- [x] `test/security/helpers/app.js` — builds `createApp` with `createStudioDb({ dbPath })`, temp courses/dist and injected runners/capabilities/spawn spy (Plan 02)
- [x] `test/security/helpers/snapshot.js` — path → type/mode/sha256 snapshot for no-file-write assertions (Plan 01)
- [x] `test/security/helpers/env.js` — isolated `PROFESSOR_HOME`/`STUDIO_*`/API-key env with exact restore (Plan 01)
- [x] `test/security/helpers/free-port.js` — OS-assigned port for entry-point smoke tests (Plan 02)
- [x] `test/security/fixtures/` — fake agent binaries, symlink fixtures, malformed JSON (Plan 04)
- [x] `test/security/helpers/legacy.js` — temp courses/legacy dist + spawn spy (Plan 03)

*Existing Vitest + supertest infrastructure covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real agent CLI still answers through the hardened bridge | SEC-09 | CI has no signed-in agent CLIs; fake binaries cannot prove a real CLI accepts the safe argv | Run `course-professor studio`, pair, send one tutor message with each installed agent; confirm a reply and no permission prompt/bypass |
| Legacy UI deprecation banner on a real browser | SEC-02 | Visual/persistent placement; the source contract is automated | `course-professor web --legacy` (dev) prints/opens `http://localhost:5173/#token=<token>`; confirm the banner is visible on desktop and mobile widths and links to Studio. For `--production` use `http://localhost:3000/#token=<token>`. |
| `doctor` posture with a real token file | SEC-11 | Depends on real `~/.professor` state; the posture matrix is automated | Run `node bin/cli.js doctor` with and without a token file; confirm mode/bind/Bash/relaxed-env lines |
| Accepted-risk note and CONCERNS triage | SEC-14 | Acceptance is a review decision, not a runtime behavior | Read `docs/security/ACCEPTED-RISKS.md`; confirm exactly one accepted risk (registry integrity), every other high/medium CONCERNS row is fixed or mapped to an owning phase, and nothing is silently dropped |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an owning-plan harness prerequisite
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Harness prerequisites (helpers/fixtures) are created by their owning plans
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-22 (Nyquist audit)

### Commands run

```text
npx vitest run test/security/token.test.js test/security/paths.test.js test/security/helpers.test.js
  # 3 files, 88 tests passed

npx vitest run test/security/guards.test.js test/security/entrypoints.test.js test/security/studio-static.test.js
  # 3 files, 34 tests passed (before the guard-matrix additions)

npx vitest run test/security/guards.test.js
  # 1 file, 23 tests passed (after adding form/missing-Content-Type and wildcard-token cases)

npx vitest run test/security/legacy.test.js test/security/legacy-agents.test.js
  # 2 files, 27 tests passed

npx vitest run test/security/agents.test.js test/security/runner.test.js
  # 2 files, 22 tests passed

npx vitest run test/cli-studio.test.js test/cli.test.js test/security/cli.test.js test/security/client.test.js
  # 4 files, 133 tests passed

npx vitest run test/security/no-side-effects.test.js test/security/subprocess-smoke.test.js
  # 2 files, 9 tests passed
```

**Audit note:** the guard suite gained two concrete cases found during this audit — the
`STUDIO_ORIGINS=*` escape hatch must still require the pairing token, and the JSON gate must reject
`application/x-www-form-urlencoded` and a POST with no `Content-Type` at the route boundary. Both
now pass and close the only matrix-level gaps in SEC-04/SEC-06.

## Validation Audit 2026-10-21

| Metric | Count |
|---|---|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |
