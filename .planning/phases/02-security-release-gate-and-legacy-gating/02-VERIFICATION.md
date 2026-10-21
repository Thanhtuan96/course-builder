---
phase: 2
status: passed
score: "35/35"
verified: 2026-10-21T18:20:58Z
covered_files:
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-01-PLAN.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-01-SUMMARY.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-02-PLAN.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-02-SUMMARY.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-03-PLAN.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-03-SUMMARY.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-04-PLAN.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-04-SUMMARY.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-05-PLAN.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-05-SUMMARY.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-SECURITY.md
  - .planning/phases/02-security-release-gate-and-legacy-gating/02-VALIDATION.md
  - bin/cli.js
  - bin/commands/doctor.js
  - bin/commands/studio.js
  - bin/commands/web.js
  - bin/registry-helpers.js
  - docs/security/ACCEPTED-RISKS.md
  - test/security/agents.test.js
  - test/security/cli.test.js
  - test/security/client.test.js
  - test/security/entrypoints.test.js
  - test/security/fixtures/fake-agents/_capture.cjs
  - test/security/fixtures/fake-agents/agent
  - test/security/fixtures/fake-agents/agy
  - test/security/fixtures/fake-agents/claude
  - test/security/fixtures/fake-agents/gemini
  - test/security/fixtures/fake-agents/opencode
  - test/security/guards.test.js
  - test/security/helpers.test.js
  - test/security/helpers/app.js
  - test/security/helpers/env.js
  - test/security/helpers/free-port.js
  - test/security/helpers/legacy.js
  - test/security/helpers/snapshot.js
  - test/security/legacy-agents.test.js
  - test/security/legacy.test.js
  - test/security/no-side-effects.test.js
  - test/security/paths.test.js
  - test/security/runner.test.js
  - test/security/studio-static.test.js
  - test/security/subprocess-smoke.test.js
  - test/security/token.test.js
  - web/client/src/App.jsx
  - web/client/src/api/client.js
  - web/client/src/components/ChatPanel.jsx
  - web/client/src/components/DeprecationBanner.jsx
  - web/client/src/hooks/useSSE.js
  - web/legacy-server.js
  - web/security.js
  - web/server.js
  - web/studio-api.js
  - web/studio-api/agents.js
  - web/studio-api/bridge.js
  - web/studio-api/db.js
  - web/studio-api/guards.js
  - web/studio-api/health.js
  - web/studio-runner.js
covered_digest: "v3:sha256:af5e61adb3bd806482e6c21e6d658efaa7ac3682a0a3cc4db71b1834ba6f6e1e"
---

# Phase 2 Verification — Security Release Gate and Legacy Gating

**Goal:** No agent-execution or file-writing route is reachable from an arbitrary browser origin,
through any entry point, and the legacy web is opt-in only.

**Method:** goal-backward, read-only, re-run after commit `c449739` (`fix(02): scrub model-probe env
and run in a temp cwd`). I read the implemented source rather than the summaries, traced every
request path from each entry point, exercised the previous gap independently through both the Studio
and legacy HTTP routes, and re-ran every required suite. The report does not trust the previous
verification: each row is anchored to current source, a test that asserts the behaviour, or an
executed command.

**Verdict:** **passed.** The prior SEC-09 gap is closed: model-listing probes now run through the
same spawn contract as chat turns — scrubbed allowlisted env, `assertSafeAgentInvocation`, a fresh
`professor-*` temp cwd, shell-less `execFileSync`, and synchronous cleanup. Both the Studio route
(`GET /api/studio/agents/:agent/models`) and the legacy route (`GET /api/agents/models?provider=…`)
use that contract. All 35 plan must-have bullets and all 13 in-scope requirements are verified.

Score is the plan frontmatter must-have bullets: **35/35 verified**. Requirements: **13/13**
(SEC-01..11, SEC-13, SEC-14; SEC-12 is Phase 6).

---

## Previous gap — closed and re-proved

### SEC-09 / Plan 02-04 #1 and #2 — model-listing spawn hardening

**Before:** `web/studio-api/health.js` ran `opencode/agent/agy models` with the inherited
`process.env`, the server's cwd, and no argv/env assertion. The route was reachable from the bridge
and the legacy `/api/agents/models` path.

**Now (source):**

- `web/studio-api/health.js:192-214` — `runCommand`:

  ```js
  cwd = mkdtempSync(join(tmpdir(), 'professor-'));
  const childEnv = security.buildAgentEnv(agent, env || process.env);
  security.assertSafeAgentInvocation(agent, args, childEnv);
  execFileSync(command, args, { cwd, encoding: 'utf-8', timeout, stdio: [...], env: childEnv });
  // finally: rmSync(cwd, { recursive: true, force: true })
  ```

- Every model probe passes the agent identity: `opencode` at `:327`, `cursor` at `:335`,
  `antigravity` at `:343`. Claude and Gemini model lists are curated and spawn nothing.
- `buildAgentEnv` (`web/security.js:776-792`) copies only the allowlist plus provider credentials
  and drops `SERVER_BUILT_KEYS` (`OPENCODE_CONFIG_CONTENT`) and every denied key (including
  `NODE_OPTIONS`, `LD_PRELOAD`, `DYLD_*`, `BASH_ENV`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`).
- `assertSafeAgentInvocation` (`web/security.js:865-919`) runs before `execFileSync`; an assertion
  failure is caught and the route falls back to the curated list without spawning.
- The temp cwd is removed in `finally`, including when `buildAgentEnv`/the assertion throws.

**Bridge and legacy share the implementation:**

- Bridge: `web/studio-api/bridge.js:66-84` calls `listAgentModelsFn`; `web/studio-api.js:89,115`
  defaults it to the imported `listAgentModels` from `health.js`.
- Legacy: `web/legacy-server.js:33` imports the same `listAgentModels`; `:843` makes it the default
  `listModels`; `:863-879` passes it to the TTL cache; `:1011-1050` is the `GET /api/agents/models`
  route. No production caller overrides it.

**Tests:**

- `test/security/agents.test.js:268-298` — “runs model probes in a temp cwd with a scrubbed env”
  invokes `listAgentModels('opencode')` with fake `opencode` on PATH and ambient
  `NODE_OPTIONS`/`LD_PRELOAD`/`OPENCODE_PERMISSION`, then asserts a `professor-*` cwd, all three
  variables absent, and the fake PATH preserved.
- Targeted run passed: `1 passed | 10 skipped` for that test.
- Independent HTTP reproduction (not part of the suite; no repo files changed): a fake `opencode`
  captured cwd/env through both routes with `NODE_OPTIONS`, `LD_PRELOAD`, `OPENCODE_PERMISSION`,
  `OPENCODE_CONFIG_CONTENT`, `BASH_ENV` and `DYLD_INSERT_LIBRARIES` set.

  ```text
  studio 200 {"ok":true,...,"models":[{"id":"","label":"Default"},{"id":"fake/model",...}]}
  studio cwd base professor-tAFvft exists false
  studio env {} PATH has fake true
  legacy 200 {"provider":"opencode","supportsModelSelection":true,"allowCustomModel":true,
              "models":["fake/model"]}
  legacy cwd base professor-YeXWMm exists false
  legacy env {}
  ```

**Result:** the previous Root Cause is gone. `02-SECURITY.md`'s T-02-03/T-02-15 “closed” claims are
now accurate for this spawn path. The only remaining Windows nuance is listed under residual risks
(model probes fall back to curated models on a `.cmd` shim instead of surfacing the structured
error; they still never spawn through a shell).

---

## Must-haves

### Plan 02-01 — security helper contract

| # | Must-have | Status | Evidence |
|---|---|---|---|
| 1 | Token at `${PROFESSOR_HOME:-~/.professor}/studio-token`, read before generated, 0600 after every write | VERIFIED | `web/security.js:37-166`; temp+rename+chmod `:83-109`; `test/security/token.test.js:54-76`; fresh probe generated 48 hex, mode 600 |
| 2 | Legacy `web/.studio-token` migrated once; deleted only with no env override and no new file | VERIFIED | `web/security.js:119-132`; `test/security/token.test.js:87-139` |
| 3 | Mask, file-first rotation, mtime/size getter | VERIFIED | `web/security.js:173-238`; `test/security/token.test.js:141-218`; fresh probe: `maskToken` never contains the input, rotation writes 0600, env token is immutable |
| 4 | `resolveInside`/`safeWriteFile` reject `..`, encoded, backslash, absolute, drive, UNC and symlink escapes for read/write | VERIFIED | `web/security.js:364-430`; `test/security/paths.test.js:49-175`; fresh probe rejected 9/9 traversal vectors and a directory symlink |
| 5 | Host/Origin/JSON/env/argv helpers exported with no route wiring | VERIFIED | `web/security.js:466-919`; `test/security/helpers.test.js` |
| 6 | Snapshot/env harness for later plans | VERIFIED | `test/security/helpers/snapshot.js`, `test/security/helpers/env.js`; imported by every later suite and by `no-side-effects.test.js` |

### Plan 02-02 — composed guards, app factory, Studio-only entry

| # | Must-have | Status | Evidence |
|---|---|---|---|
| 1 | Every Studio API route runs Host -> Origin -> token -> JSON, answering 403/403/401/415 in order | VERIFIED | `web/studio-api/guards.js:102-200`; `test/security/guards.test.js:53-157` (bad Host 403, evil Origin 403, no token 401, text/plain 415); every route mounted after `installGuards` in `web/studio-api.js:100-105` |
| 2 | Host allowlist localhost/127.0.0.1/[::1] any port; spoofed/missing rejected on static and API | VERIFIED | `web/security.js:466-499`; `web/server.js:121-135`; `bin/commands/studio.js:209-225`; `test/security/helpers.test.js:40-110`, `studio-static.test.js`, `entrypoints.test.js:147-193` |
| 3 | Exact Origins, `null` always rejected, wildcard echoes exact non-null origin, never `*` | VERIFIED | `web/studio-api/guards.js:115-146`; `test/security/guards.test.js:68-230`; `rg` found the only ACAO writer in `guards.js:129`, and it echoes the request origin |
| 4 | `web/server.js` side-effect-free, exports `createApp`/`startServer`; import writes no token, binds no port | VERIFIED | `web/server.js:95-218,236-378`; fresh `PROFESSOR_HOME=<temp> node -e "import('./web/server.js')"` -> `ok`, temp home not created |
| 5 | Studio-only default for `node web/server.js` and `course-professor web`; legacy APIs 404 | VERIFIED | `web/server.js:152-218`; `test/security/entrypoints.test.js:146-236`; `test/security/subprocess-smoke.test.js:129-227`; `test/security/no-side-effects.test.js:222-234` |
| 6 | `STUDIO_ORIGINS=*` + `STUDIO_ALLOW_NON_LOOPBACK` refuses before bind | VERIFIED | `web/server.js:277-283`; `test/security/entrypoints.test.js:315-339` (non-zero exit, port closed) |
| 7 | Exactly one UI at `/` (Studio; legacy prod dist; no UI on 3000 in legacy dev) | VERIFIED | `web/server.js:200-215`; `test/security/legacy.test.js:107-133`; `test/security/entrypoints.test.js:238-313`; `test/security/no-side-effects.test.js:222-280` |
| 8 | Missing `studio/dist` returns build instruction, never legacy fallback | VERIFIED | `web/server.js:46-60,200-201`; `test/security/entrypoints.test.js:195-215` (503 + `/build/i`) |

### Plan 02-03 — legacy extraction and gating

| # | Must-have | Status | Evidence |
|---|---|---|---|
| 1 | `createLegacyRouter` mounts every legacy route behind the shared guards | VERIFIED | `web/legacy-server.js:833-892,1169-1171`; `test/security/legacy.test.js:135-172` |
| 2 | Legacy slugs/course files/exercise filenames exact allowlists + `resolveInside`; encoded/backslash/symlink read+write rejected | VERIFIED | `web/legacy-server.js:240-474`; `test/security/legacy.test.js:174-317`; `test/security/paths.test.js` |
| 3 | LLM `<file>` writes scoped to current course; one new slug adoption | VERIFIED | `web/legacy-server.js:490-555`; `test/security/legacy.test.js:318-388` |
| 4 | Legacy agent spawns no bypass, shell-less, temp cwd, allowlisted env, OpenCode deny | VERIFIED | `createLegacyAgentRunners` delegates to `defaultAgentRunners` (`legacy-server.js:699-712`); `test/security/legacy-agents.test.js:111-237` |
| 5 | Vite only legacy dev, shell false; prod legacy dist; dev no UI on 3000 | VERIFIED | `web/legacy-server.js:764-806`; `web/server.js:202-215,338-346`; `test/security/legacy-agents.test.js:238-360` |
| 6 | Capability/model probes behind 30 s TTL, no per-request `which` | VERIFIED (note) | `createCapabilityCache` `web/legacy-server.js:568-608`; model route `:1011-1050`; tests `legacy.test.js:389-467` prove TTL and no `execSync`. Model probes now use the shared shell-less `runCommand` in `health.js:192-214`; they resolve through `execFileSync`/PATH rather than `resolveExecutable`, which is a Windows-shim nuance only (see residual risks) |
| 7 | Every legacy rejection test proves no write and no spawn | VERIFIED | `test/security/legacy.test.js` snapshots + spawn spy; `test/security/no-side-effects.test.js` mocks both `child_process` ids and snapshots the tree |

### Plan 02-04 — bridge agents and learner runner

| # | Must-have | Status | Evidence |
|---|---|---|---|
| 1 | No bridge agent spawned with a bypass flag/env; `assertSafeAgentInvocation` on the final argv/env immediately before spawn | VERIFIED | Chat turns: `web/studio-api/agents.js:143-154`; model probes: `web/studio-api/health.js:196-197`; tests `test/security/agents.test.js:110-226,268-298`, `legacy-agents.test.js:111-177` |
| 2 | Claude, Cursor, OpenCode, Gemini, Antigravity run shell-less in a `professor-*` temp cwd with an allowlisted env; only `defaultAgentRunners({extraEnv})` widens it | VERIFIED | Chat: `agents.js:34-51,156-175,404-499`; env: `security.js:776-792`; model listing: `health.js:192-214,327-345`; tests `agents.test.js:228-298`, `legacy-agents.test.js:111-177`; fresh HTTP probe confirmed scrubbed env + removed temp cwd on both routes |
| 3 | Injectible `spawnImpl`/`mintLimiter`/`maxRuns`; `runStep` uses `spawnImpl` | VERIFIED | `web/studio-runner.js:250-272,495-523`; `test/security/runner.test.js:107-210` |
| 4 | Windows `.cmd`/`.bat` structured error + doctor report | VERIFIED | `web/security.js:1000-1015`; `web/studio-api/agents.js:81-91,129-137`; `bin/commands/doctor.js:215-245`; `agents.test.js:204-226`, `legacy-agents.test.js:258-271` |
| 5 | Runner denylist; Bash off unless `PROFESSOR_ALLOW_BASH=1` | VERIFIED | `web/studio-runner.js:50-88,195-204,252-253`; `test/security/runner.test.js:107-139` |
| 6 | At most `PROFESSOR_MAX_RUNS` (1-8, default 2); 429 + Retry-After before write/spawn | VERIFIED | `web/studio-runner.js:96-122,332-360`; `test/security/runner.test.js:141-210` (second request 429, no second dir, slot released) |
| 7 | Learner env scrubbed; workspace realpath-contained | VERIFIED | `web/security.js:799-807`; `web/studio-runner.js:332-403,505-510`; `runner.test.js:212-350` |

### Plan 02-05 — release-gate edges

| # | Must-have | Status | Evidence |
|---|---|---|---|
| 1 | `studio`/`web` emit `#token=` (+`&bridge=` only non-default), print mask, support rotation | VERIFIED | `bin/commands/studio.js:150-180,338-360`; `bin/commands/web.js:90-108,277-316`; `test/security/cli.test.js:34-52`; `test/cli-studio.test.js` |
| 2 | `web` Studio-only default, flags parsed, no API-key prompt unless legacy | VERIFIED | `bin/commands/web.js:39-66,71-160,222-260`; `test/security/cli.test.js:54-86`; `subprocess-smoke.test.js:173-197` |
| 3 | Legacy client sends token on every request, fragment/sessionStorage, scrub, persistent banner | VERIFIED | `web/client/src/api/client.js:79-185,240-300`; `useSSE.js:7,44`; `ChatPanel.jsx:91-110`; `App.jsx:12-14`; `DeprecationBanner.jsx`; `test/security/client.test.js` |
| 4 | Doctor posture: legacy, bind, token mode, Bash, relaxed env, Windows shims; 401 = unpaired | VERIFIED | `bin/commands/doctor.js:126-270`; `test/security/cli.test.js:88-178` |
| 5 | Only registry install integrity accepted; every other high/medium CONCERNS mapped | VERIFIED | `docs/security/ACCEPTED-RISKS.md` — one accepted risk; disposition table #1-#10 + extras; explicit mapped-not-accepted section |
| 6 | `validateItemName` rejects `.`/`..`/`...`/`a..b`/uppercase/`%`/separators | VERIFIED | `bin/registry-helpers.js:87-99`; `test/cli.test.js:66-100` |
| 7 | Every rejected request side-effect free (child_process spy + snapshot) | VERIFIED | `test/security/no-side-effects.test.js` mocks both `child_process` ids, snapshots temp roots, asserts zero spawns; `test/security/subprocess-smoke.test.js` exercises real entry points |

---

## Requirement traceability

| Requirement | Status | Evidence |
|---|---|---|
| SEC-01 Studio-only default | VERIFIED | `web/server.js:95-218`; `entrypoints.test.js:146-236`; `subprocess-smoke.test.js:129-227`; `no-side-effects.test.js:222-234` |
| SEC-02 Legacy warning + banner | VERIFIED (banner visual = human) | `web/server.js:299-305` (stderr); `entrypoints.test.js:238-313`; `subprocess-smoke.test.js:199-227`; `client.test.js:147-160` + `DeprecationBanner.jsx` |
| SEC-03 Host allowlist on every route/static | VERIFIED | `web/security.js:466-499`; `web/server.js:121-135`; `bin/commands/studio.js:209-225`; guard/static/legacy tests |
| SEC-04 Exact Origin, no wildcard CORS | VERIFIED (API routes; scope note) | `web/studio-api/guards.js:115-146`; `guards.test.js:68-230`; ACAO only in guards, never `*`; the public static shell is Host-gated and sets no ACAO, so a cross-origin page cannot read it — no agent/file route is static |
| SEC-05 Token on every API route, even without Origin | VERIFIED (scope note) | `web/studio-api/guards.js:148-161`; `studio-api.js:100-105` (runner inside); `legacy-server.js:886-892`; guards/legacy/no-side-effects tests; the pre-pairing Studio shell is intentionally public so it can read the fragment token |
| SEC-06 Non-JSON mutations rejected pre-handler | VERIFIED | `web/security.js:627-654`; `guards.js:163-200`; `guards.test.js:112-157`; `legacy.test.js`; `no-side-effects.test.js:96-130` |
| SEC-07 Token 0600/masked/fragment/rotate | VERIFIED | `security.js:83-238`; `web.js`/`studio.js` fragment builders; `token.test.js`, `cli.test.js`, `client.test.js` |
| SEC-08 Containment (encoded/backslash/symlink) | VERIFIED | `security.js:364-430`; `studio-runner.js:332-346`; `paths.test.js`, `legacy.test.js:174-317`, `runner.test.js:212-297` |
| SEC-09 No agent bypass/shell/temp cwd/scrubbed env | VERIFIED | Agent turns: `agents.js:143-183,399-499`; model probes: `health.js:192-214,327-345`; both reachable routes use the same `listAgentModels` (`bridge.js:66-84`, `legacy-server.js:843,1011-1050`); `agents.test.js:228-298`, `legacy-agents.test.js:111-177`; fresh HTTP probe |
| SEC-10 Runner allowlist/Bash off/concurrency | VERIFIED | `studio-runner.js:50-122,195-204,250-360,495-523`; `runner.test.js` |
| SEC-11 Loud escape hatches + doctor posture | VERIFIED | `server.js:253-295`; `doctor.js:126-270`; `entrypoints.test.js:315-355`; `cli.test.js:107-178` |
| SEC-13 Rejection suite/no side effects | VERIFIED | `no-side-effects.test.js` + `subprocess-smoke.test.js` + snapshots in each rejection suite |
| SEC-14 CONCERNS fixed/accepted + `validateItemName` | VERIFIED | `docs/security/ACCEPTED-RISKS.md`; `registry-helpers.js:87-99`; `test/cli.test.js:66-100` |

SEC-12 is Phase 6 (CSP/BYOK), correctly excluded by the phase plan.

---

## Cross-check of `02-SECURITY.md`

The threat register is accurate against current source, including the previous overclaim:

- T-02-03 and T-02-15 are now closed for the model-listing path: `runCommand` calls
  `buildAgentEnv` + `assertSafeAgentInvocation` before `execFileSync`, both routes share
  `listAgentModels`, and the new test plus the fresh HTTP probe prove the env/cwd contract.
- T-02-17's Windows-shim guarantee remains complete for chat/runners (`resolveAgentCommand`,
  `spawnFailure`, doctor). Model probes do not resolve through `resolveExecutable`; a `.cmd` shim
  there would produce `{ok:false}` and the curated model list rather than the structured error, but
  it still never uses a shell or bypasses env/argv checks. Not a spawn-safety regression.
- T-02-05's “no wildcard CORS” holds: the only ACAO writer is `guards.js:129`, echoing the exact
  origin; `*` is never emitted.
- T-02-08's “import creates no `PROFESSOR_HOME`” was re-executed and holds.
- The accepted-risk note is not used to hide anything: only registry install integrity is accepted;
  every other CONCERNS row is mapped to an owning phase.

**Conclusion:** `02-SECURITY.md` can stand at `threats_open: 0` for the in-scope high/medium
register, with the Windows model-probe nuance documented below.

---

## Deleting the previous gap statement

The previous report's Gap 1 (“model-listing agent CLIs bypass the D-15/SEC-09 spawn hardening”) is
**closed**, not carried forward. Evidence:

1. Source: `health.js:192-214` now builds the allowlisted env, asserts the invocation, runs in a
   fresh temp cwd, and removes it in `finally`.
2. Test: `agents.test.js:268-298` asserts the scrubbed env and `professor-*` cwd.
3. Route sharing: `bridge.js:66-84` and `legacy-server.js:843,1011-1050` both default to the same
   `listAgentModels`; no production override.
4. Independent HTTP probe: both routes returned 200 with `cwd` matching `professor-*`, the directory
   already removed, and all tested loader/bypass variables absent.

---

## Deviations and residual risks

1. **Static app shell is Host-gated, not Origin- or token-gated.** `/` and `/index.html` are public
   so the browser can load the app and read the `#token=` fragment; they set no ACAO, so a hostile
   origin cannot read them. Every `/api/*` route enforces Origin and token. This is the intended
   D-24/D-11 design; no agent/file route is exposed.
2. **`package.json.files` still omits `web/security.js` and `web/legacy-server.js`.** A published
   tarball would fail `web/server.js`'s import of `./security.js`; legacy would be unavailable. This
   is the documented D-27 handoff to Phase 4 (tarball smoke must assert both). Release blocker, not
   a Phase 2 code change.
3. **Legacy dev Vite inherits the full env** (`startLegacyDevServer` passes `env` to `npm run dev`;
   `legacy-server.js:788-793`). Dev-only, legacy-only, deprecated.
4. **The local runner is not a sandbox.** Learner code runs as the user with containment, allowlist,
   scrubbed env, timeout and output caps. Documented in `ACCEPTED-RISKS.md`.
5. **Same-user access is not isolated.** `~/.professor/studio-token` and `professor.db` are readable
   by any process running as the same user. Documented residual.
6. **Windows file modes are ACLs.** `0600` is best-effort; documented.
7. **Windows model-probe shims.** Model listing does not use `resolveExecutable`; on a real Windows
   `.cmd`/`.bat` agent it falls back to the curated list instead of returning
   `unsupported_windows_shim`. No shell, no bypass, no execution; chat/runners still return the
   structured error. Verify on a Windows host (human item 4).

---

## Human verification items

These are genuinely manual; they do not change the automated score, but should be completed before
beta:

1. **Real agent round-trip (SEC-09):** run `course-professor studio`, pair, and send one tutor
   message with each installed agent (Claude, Cursor, OpenCode, Gemini, Antigravity); confirm a reply
   and no permission prompt/bypass. Open the model picker for OpenCode/Cursor/Antigravity and confirm
   it lists models without errors.
2. **Legacy banner (SEC-02):** `course-professor web --legacy` (dev) must open/print
   `http://localhost:5173/#token=…`; confirm the persistent banner is visible at desktop and mobile
   widths, links to `http://localhost:5180`, and does not cover the chat input.
3. **Doctor against a real home (SEC-11):** run `node bin/cli.js doctor` with and without
   `~/.professor/studio-token`; confirm token mode, bind, legacy, Bash and relaxed-env lines.
4. **Windows shims (SEC-09/T-02-17):** on a real Windows host, confirm a `.cmd`/`.bat` agent is
   reported by doctor and rejected by the bridge/runner, and note the model-listing fallback
   behaviour described in residual risk 7.

---

## Commands run (exact results)

```text
$ npx vitest run test/security
Test Files  14 passed (14)
Tests       203 passed (203)
Duration    4.84s

$ npx vitest run test/studio-api.test.js test/studio-api-agents.test.js \
    test/studio-runner.test.js test/cli-studio.test.js test/cli.test.js
Test Files  5 passed (5)
Tests       179 passed (179)
Duration    2.58s

$ npm test
> course-professor@1.6.0-beta.1 pretest
> npm --prefix web install --no-audit --no-fund --silent
Test Files  28 passed (28)
Tests       500 passed (500)
Duration    4.44s

$ npm --prefix studio test
Test Files  43 passed (43)
Tests       372 passed (372)
Duration    1.13s

$ npx vitest run test/security/agents.test.js \
    -t "runs model probes in a temp cwd with a scrubbed env"
Test Files  1 passed (1)
Tests       1 passed | 10 skipped (11)

$ PROFESSOR_HOME=$(mktemp -d) node -e "import('./web/server.js').then(() => console.log('ok'))"
ok
HOME_NOT_CREATED

$ rg -n "cors\(|Access-Control-Allow-Origin" web bin --glob '*.js'
web/studio-api/guards.js:129  (only writer; exact origin, never `*`)

# independent HTTP probe (fake `opencode` on PATH; no repo mutation)
studio GET /api/studio/agents/opencode/models  -> 200
  cwd = professor-tAFvft, exists=false
  env = {} (NODE_OPTIONS/LD_PRELOAD/OPENCODE_PERMISSION/OPENCODE_CONFIG_CONTENT/
            BASH_ENV/DYLD_INSERT_LIBRARIES all absent), PATH contains fake dir
legacy GET /api/agents/models?provider=opencode -> 200
  cwd = professor-YeXWMm, exists=false
  env = {} (same keys absent)

# helper probe (no repo mutation)
token: 48 hex, mode 600; maskToken does not contain input; env token immutable
Host: localhost:3000/127.0.0.1:9/[::1]:3000 true; evil.example/evil@localhost/empty false
Origin: exact true; evil false; null false
paths: 9/9 traversal vectors rejected; directory symlink rejected
buildAgentEnv('claude', {...}) -> {"PATH":"/bin","ANTHROPIC_API_KEY":"k"}
assertSafeAgentInvocation: --dangerously-skip-permissions rejected
```

**Working tree:** no source, plan, STATE or ROADMAP file was changed by this verification. Only this
report was regenerated and committed.

**Fingerprint:** the `covered_files` and `covered_digest` above were produced verbatim by
`node /Users/tuankhuat/.config/opencode/gsd-core/bin/gsd-tools.cjs query verification.fingerprint
"<phase_dir>" <the covered files listed>` on 2026-10-21.

---

## Final verdict

**passed — 35/35 must-have bullets verified, 13/13 in-scope SEC requirements verified.** The
arbitrary-origin goal holds: every agent/file/write route is gated by Host, exact Origin, the pairing
token and JSON; legacy is opt-in only; rejected requests are proved side-effect free; and the
model-listing path now uses the same scrubbed-env, temp-cwd, shell-less, pre-spawn-asserted contract
as chat turns. Residual items are design constraints or Phase 4 handoffs, not Phase 2 gaps.
