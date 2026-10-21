---
phase: "2"
slug: "security-release-gate-and-legacy-gating"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-22"
---

# Phase 2 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Verification method:** every `<threat_model>` entry from `02-01..02-05-PLAN.md` was checked
against the implemented source (not the summaries), then against the test suite. The phase was
authored with a plan-time threat register (`register_authored_at_plan_time: true`), so this audit
verifies mitigation presence and does not scan for new threats. Execution used the generic-agent
workaround: typed `gsd-security-auditor` dispatch was unavailable in this session, so the audit ran
inline; no implementation file was modified.

**Blocking threshold:** `workflow.security_block_on: high` (ASVS L1). `threats_open: 0` counts open
threats at or above `high`. All 26 registered threats (19 high, 7 medium) were verified closed.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → loopback API | Any page in the user's browser can reach `127.0.0.1`; Host, Origin and the pairing token are the gates | Course files, exercises, chat prompts, runner jobs, DB rows |
| CLI → token file | Token lives at `~/.professor/studio-token` (mode 0600); same-user processes are inside the trust boundary | Bearer pairing token |
| Server → agent CLI | Server spawns Claude/Cursor/OpenCode/Gemini/Antigravity with a scrubbed env, temp cwd and shell-less argv | Prompts, provider credentials |
| Server → learner runner | Learner-supplied code runs as the same OS user under path containment, a command allowlist, timeout and output caps | Learner code and stdout/stderr |
| Registry → local install | HTTPS registry content is written to `learning/<slug>/` and `~/.claude/skills/<name>/` | Course/skill Markdown, `meta.json` |
| Legacy web client | Deprecated UI, opt-in only; same guards as Studio | Course content, chat, pairing token (fragment only) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation (source) | Test evidence | Status |
|-----------|----------|-----------|----------|-------------|---------------------|---------------|--------|
| T-02-01 | Information Disclosure | `web/security.js` token lifecycle | high | mitigate | `writeTokenFile` uses a temp file + rename and re-applies `0600` (`security.js:83-109`); `migrateLegacyToken` deletes the legacy file only after the new write (`:119-132`); `maskToken` never returns the input (`:173-177`); only masked token + pairing fragment are logged (`server.js:358-359`, `bin/commands/web.js:107,293`) | `test/security/token.test.js:54-218` | closed |
| T-02-02 | Tampering | Path containment (`resolveInside`) | high | mitigate | Exact slug/course-file/exercise allowlists (`security.js:242-302`); per-segment decode + re-validation rejects encoded/backslash/absolute vectors (`:311-336`); lexical + realpath/`lstat` containment rejects symlink escapes (`:364-402`); writes use `O_NOFOLLOW` (`:412-430`) | `test/security/paths.test.js:49-175`; `test/security/legacy.test.js:174-317`; `test/security/runner.test.js:212-297` | closed |
| T-02-03 | Elevation of Privilege | Agent env/argv construction | high | mitigate | `AGENT_ENV_ALLOWLIST` + deny prefixes (`security.js:627-735`); `buildAgentEnv` copies only allowlisted keys (`:762-778`); `assertSafeAgentInvocation` rejects bypass flags, permission modes and denied env before spawn (`:796-905`); Windows `.cmd` shims rejected (`:986-1001`) | `test/security/helpers.test.js:196-407`; `test/security/agents.test.js:110-226` | closed |
| T-02-04 | Spoofing | Host guard (DNS rebinding) | high | mitigate | Raw `Host` parsed by `new URL`, userinfo/whitespace/path rejected, exact `localhost`/`127.0.0.1`/`[::1]` allowlist (`security.js:443-475`); applied globally before routes/static (`server.js:121-135`, `guards.js:103-113`) | `test/security/helpers.test.js:40-110`; `test/security/guards.test.js:86-111`; `test/security/legacy.test.js:135-172` | closed |
| T-02-05 | Information Disclosure | CORS / Origin allowlist | high | mitigate | Exact `Set` membership, literal `null` rejected, absent Origin deferred to token guard, wildcard mode echoes the request origin and never emits `*` (`security.js:520-572`; `guards.js:115-146`) | `test/security/guards.test.js:68-230`; `test/security/helpers.test.js:111-148` | closed |
| T-02-06 | Spoofing | Pairing-token guard | high | mitigate | `installGuards` applies `timingSafeEqual` token check to every remaining route, including requests with no Origin (`guards.js:148-161`); Studio and legacy both call it (`studio-api.js:100`, `legacy-server.js:886-892`); runner is mounted inside the guarded router (`studio-api.js:105`) | `test/security/guards.test.js:54-66`; `test/security/no-side-effects.test.js:68-95,163-190`; `test/security/legacy.test.js:135-172` | closed |
| T-02-07 | Tampering | JSON content-type gate | high | mitigate | `requiresJsonContentType` runs before `express.json`, mapping non-JSON/bodyless mutations to 415 and parser errors to JSON 400/413/415 (`guards.js:163-200`; `security.js:591-623`) | `test/security/guards.test.js:112-157`; `test/security/no-side-effects.test.js:96-130` | closed |
| T-02-08 | Tampering | `createApp` / module import | medium | mitigate | No top-level listen, token write, mkdir, spawn or log; `startServer` is the only entry (`server.js:95-218` vs `:236-378`); import check emitted only `ok` and created no `PROFESSOR_HOME` directory | `node -e "import('./web/server.js')…"` (see Audit Trail); `test/security/no-side-effects.test.js:207-235` | closed |
| T-02-09 | Information Disclosure | API 404 / SPA fallback | medium | mitigate | `/api` JSON 404 is registered after both API routers and before any UI mount (`server.js:195-198`) | `test/security/entrypoints.test.js:146-215`; `test/security/no-side-effects.test.js:222-234` | closed |
| T-02-26 | Information Disclosure | Studio static port (DNS rebinding) | high | mitigate | `createStudioStaticServer` rejects bad/missing Host before delegating to `createStaticHandler` (`bin/commands/studio.js:209-220`); the main app has the same global Host guard before static mounting (`server.js:121-135,200-215`) | `test/security/studio-static.test.js:66-114` | closed |
| T-02-10 | Tampering | Legacy course/exercise paths | high | mitigate | Read/write paths go through `isSafeSlug`/`isSafeCourseFile`/`isSafeExerciseFilename` then `resolveInside`, with symlink checks and `safeWriteFile` (`legacy-server.js:240-300,334-474`; `security.js:242-430`) | `test/security/legacy.test.js:174-317`; `test/security/paths.test.js:49-175` | closed |
| T-02-11 | Tampering | LLM `<file>` writes | high | mitigate | Writes are scoped to the current slug; exactly one brand-new slug may be adopted; path must match `courses/<slug>/<allowlisted-file>` (`legacy-server.js:490-555`) | `test/security/legacy.test.js:318-388` | closed |
| T-02-12 | Elevation of Privilege | Legacy `/api/chat` spawn | high | mitigate | Legacy chat uses the shared hardened runners (`legacy-server.js:699-712,1080-1160`), which reuse `defaultAgentRunners` (temp cwd, allowlisted env, no shell, pre-spawn assertion) | `test/security/legacy-agents.test.js:111-237` | closed |
| T-02-13 | Elevation of Privilege | Legacy Vite dev spawn | medium | mitigate | `startLegacyDevServer` resolves the executable, uses `spawn(..., {shell:false})`, and is only reached in legacy dev (`legacy-server.js:764-806`; `server.js:338-346`) | `test/security/legacy-agents.test.js:238-272` | closed |
| T-02-14 | Information Disclosure | Legacy client token handling | high | mitigate | Token read only from `#token=` fragment, stored in `sessionStorage`, fragment scrubbed with `history.replaceState`; `#bridge=` must be loopback; token sent only as `X-Studio-Token` (`web/client/src/api/client.js:58-130,181-185`) | `test/security/client.test.js:58-145` | closed |
| T-02-15 | Elevation of Privilege | Bridge agent argv/env | high | mitigate | `assertSafeAgentInvocation` runs against the final argv/env immediately before spawn (`agents.js:143-154`); builders add no bypass flags (`agents.js:352-389`) | `test/security/helpers.test.js:292-378`; `test/security/agents.test.js:110-226`; `test/security/legacy-agents.test.js:111-177` | closed |
| T-02-16 | Information Disclosure | Agent cwd (`web/` token exposure) | high | mitigate | `runJsonCli` creates a fresh `professor-*` temp cwd for every agent unless explicitly disabled (`agents.js:34-51,156`); all bridge and legacy runners use it | `test/security/agents.test.js:228-290`; `test/security/legacy-agents.test.js:111-166` | closed |
| T-02-17 | Denial of Service | Windows `.cmd`/`.bat` shims | medium | mitigate | `resolveExecutable` never uses a shell; `resolveAgentCommand` and `spawnFailure` return a structured `unsupported_windows_shim` error (`security.js:915-1001`; `agents.js:81-91,129-137`) | `test/security/helpers.test.js:380-407`; `test/security/agents.test.js:204-226`; `test/security/legacy-agents.test.js:258-271` | closed |
| T-02-18 | Elevation of Privilege | Learner runner command surface | high | mitigate | Closed language→command map in `buildPipeline` plus `COMMAND_DENYLIST` and `shell:false` (`studio-runner.js:38-93,150-190,495-523`); all runner routes are behind the shared guards (`studio-api.js:100-105`) | `test/security/runner.test.js:107-139` | closed |
| T-02-19 | Denial of Service | Repeated Run requests | medium | mitigate | `createRunLimiter` caps concurrent runs; `tryAcquire` runs before workspace mkdir/write and returns 429 + `Retry-After` (`studio-runner.js:79-115,348-360`) | `test/security/runner.test.js:141-210` | closed |
| T-02-20 | Information Disclosure | Learner process environment | high | mitigate | `buildLearnerEnv` copies only a small allowlist, excluding API keys and loader/option variables (`security.js:656-679,785-793`); runner spawns with that env (`studio-runner.js:362-366,505-510`) | `test/security/runner.test.js:299-350`; `test/security/helpers.test.js:262-290` | closed |
| T-02-21 | Information Disclosure | Token display / delivery | high | mitigate | Banner and rotation output use `maskToken`; pairing URL carries the token only in the `#fragment` (`security.js:173-177`; `bin/commands/studio.js:149-157`; `bin/commands/web.js:104-108,293-316`; `server.js:348-359`) | `test/security/cli.test.js:34-52`; `test/security/token.test.js:169-184`; `test/security/client.test.js:104-121` | closed |
| T-02-22 | Spoofing | Token rotation | medium | mitigate | File-backed `createTokenGetter` re-reads on mtime/size change and is wired into the running routers (`security.js:185-238`; `server.js:267-268`); env tokens are immutable; the child server is not given a frozen generated token (`bin/commands/studio.js:383-392`) | `test/security/token.test.js:141-167,186-217`; `test/security/guards.test.js:232-256` | closed |
| T-02-23 | Repudiation | `doctor` health/posture | medium | mitigate | Token-aware probe (`X-Studio-Token` when a token exists), 401 reported as reachable-but-unpaired, and posture checks for legacy/bind/token mode/Bash/relaxed env (`bin/commands/doctor.js:116-270`) | `test/security/cli.test.js:88-178` | closed |
| T-02-24 | Tampering | Registry item name | high | mitigate | Strict `^[a-z0-9][a-z0-9-]*$` validator blocks `.`, `..`, `a..b`, separators and percent-encoding (`bin/registry-helpers.js:87-99`); wired into install/update/publish paths (`bin/cli.js:199,270,353,461`) | `test/cli.test.js:66-100` | closed |
| T-02-25 | Repudiation | Accepted-risk note | high | mitigate | One accepted risk (registry install integrity) with a complete mapped-not-accepted table and owner per finding (`docs/security/ACCEPTED-RISKS.md`); no Phase 2 high/medium CONCERNS item remains unfixed while accepted | Document review + `test/cli.test.js:66-100` (SEC-14 registry fix) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `high` count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Requirement Coverage (SEC-01..11, SEC-13, SEC-14)

| Requirement | Evidence | Status |
|-------------|----------|--------|
| SEC-01 Studio-only default | `web/server.js:95-218`; `test/security/entrypoints.test.js:146-236`; `test/security/no-side-effects.test.js:222-234`; `test/security/subprocess-smoke.test.js:129-227` | closed |
| SEC-02 Legacy warning + banner | `server.js:299-305`; `client.test.js:147-160` (banner source); `entrypoints.test.js:238-313`; `subprocess-smoke.test.js:199-227` | closed |
| SEC-03 Host allowlist on every route/static | `security.js:443-475`; `server.js:121-135`; `bin/commands/studio.js:217`; `helpers.test.js`, `guards.test.js`, `studio-static.test.js`, `legacy.test.js` | closed |
| SEC-04 Exact Origin, no wildcard CORS | `security.js:520-572`; `guards.js:115-146`; `guards.test.js:68-230` | closed |
| SEC-05 Token on every API route, even without Origin | `guards.js:148-161`; `studio-api.js:100`; `legacy-server.js:886-892`; `guards.test.js`, `legacy.test.js`, `no-side-effects.test.js` | closed |
| SEC-06 Non-JSON mutations rejected pre-handler | `security.js:591-623`; `guards.js:163-200`; `guards.test.js:112-157`; `legacy.test.js`; `no-side-effects.test.js` | closed |
| SEC-07 Token 0600 / masked / fragment / rotate | `security.js:83-238`; `bin/commands/{web,studio}.js`; `token.test.js`, `client.test.js`, `security/cli.test.js` | closed |
| SEC-08 Containment for slug/filename/workspace | `security.js:242-430`; `studio-runner.js:287-346`; `paths.test.js`, `legacy.test.js`, `runner.test.js` | closed |
| SEC-09 No agent bypass, shell-less, temp cwd, scrubbed env | `security.js:627-905`; `agents.js:143-183,399-499`; `legacy-server.js:699-712`; `agents.test.js`, `legacy-agents.test.js`, `helpers.test.js` | closed |
| SEC-10 Runner allowlist, Bash off by default, concurrency cap | `studio-runner.js:38-115,250-360,495-523`; `runner.test.js`, `helpers.test.js` | closed |
| SEC-11 Loud escape hatches + doctor posture | `server.js:253-295`; `bin/commands/doctor.js:116-270`; `entrypoints.test.js:315-355`; `security/cli.test.js:107-178` | closed |
| SEC-13 Rejection suite, no side effects | `no-side-effects.test.js` (both child_process ids mocked; tree snapshots); `subprocess-smoke.test.js` | closed |
| SEC-14 CONCERNS fixed or accepted in writing | `docs/security/ACCEPTED-RISKS.md`; `test/cli.test.js:66-100` (`validateItemName`) | closed |

SEC-12 is out of Phase 2 scope (Phase 6, CSP/BYOK) per `.planning/REQUIREMENTS.md`.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | same-user token/DB access (residual, no register threat) | Any process running as the same OS user can read `~/.professor/studio-token` and `professor.db`; loopback is a trust boundary, not an authentication boundary | Phase 2 release gate, documented in `docs/security/ACCEPTED-RISKS.md` | 2026-10-22 |
| AR-02 | local learner runner (residual, no register threat) | Learner code runs as the user; the runner is containment + allowlist + timeout, never an OS/container sandbox | Phase 2 release gate, documented in `docs/security/ACCEPTED-RISKS.md` | 2026-10-22 |
| AR-03 | community registry install integrity (CONCERNS #10) | HTTPS, user-initiated, slug-validated; no signing infrastructure in the beta | Phase 2 release gate, owner Phase 3/DEBT-05 | 2026-10-22 |

*Accepted risks do not resurface in future audit runs.*

---

## Residual Risks and Hardening Notes

These are not open register threats; they are honest limits of the verified implementation.

- **Same-user and non-sandbox limits:** AR-01/AR-02 above. The runner and agent CLIs are not
  sandboxes.
- **Windows mode bits:** `0600` is best-effort; Windows relies on profile ACLs (documented in
  `docs/security/ACCEPTED-RISKS.md`).
- **Legacy dev inherits the full environment:** `startLegacyDevServer` passes the parent `env` to
  `npm run dev` (`legacy-server.js:788-793`). This is dev-only, legacy-only, and deprecated; the
  agent paths themselves use `buildAgentEnv`/`buildLearnerEnv`.
- **Runner defense-in-depth nuance:** the spawn-site recheck (`assertCommandAllowed`) is a denylist;
  the effective allowlist is the closed `buildPipeline` language→command map, which is the only way
  a route can produce a step. No user-supplied command reaches spawn.
- **`STUDIO_ALLOW_NON_LOOPBACK` is explicit:** only `1`/`true` or an explicit host list enables
  it; `0`/`false`/`no`/`off` are treated as disabled. The `STUDIO_ORIGINS=*` combination is still
  refused before bind, and host allowlisting plus the loopback default bind still apply.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-22 | 26 | 26 | 0 | opencode orchestrator (gsd-secure-phase, generic-agent workaround; inline) |

### Commands run

```text
npx vitest run test/security
→ 14 files passed, 202 tests passed

npx vitest run test/cli.test.js test/cli-studio.test.js test/studio-api.test.js \
  test/studio-api-agents.test.js test/studio-runner.test.js
→ 5 files passed, 179 tests passed

out=$(PROFESSOR_HOME=/tmp/professor-import-check-$$ node -e "import('./web/server.js').then(m=>{for(const k of ['createApp','startServer'])if(typeof m[k]!=='function')throw new Error('missing '+k);console.log('ok')})" 2>&1)
→ OUTPUT=[ok]; temporary PROFESSOR_HOME directory was not created
```

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-22
