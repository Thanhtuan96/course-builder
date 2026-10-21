# Accepted Security Risks — Beta

- **Scope:** local `course-professor` beta (Studio, legacy web UI, bridge agents and the learner runner).
- **Date:** 2026-10-22
- **Owner:** post-beta security follow-up (DEBT-05); reviewed by the Phase 2 release gate.
- **Source of findings:** `.planning/codebase/CONCERNS.md` (Priority Summary #1–#10 and the
  Security Considerations section).

This note records the **single** risk accepted for the beta. Every other security finding is either
fixed in Phase 2 or explicitly mapped to the phase that owns it; mapped findings are **not**
accepted here.

## Accepted risk

### Community registry install integrity

- **What is accepted:** `course-professor install` / `update` fetch `index.json` and course/skill
  files over HTTPS from the registry's `main` branch and write them into `learning/<slug>/` or
  `~/.claude/skills/<name>/` without a signature or checksum.
- **Why:** installs are user-initiated, HTTPS-only and scoped to a per-user directory. Registry
  content is agent instructions/course material, not executable code installed system-wide, and
  the beta has no signing infrastructure.
- **Compensating controls:** HTTPS only; the user chooses the item; install/update prints the
  source and prompts before overwriting; install paths are slug-validated
  (`^[a-z0-9][a-z0-9-]*$`) so registry names cannot escape the install root.
- **Revisit trigger:** registry publishes a signed index or per-file checksums, **or** at beta exit
  (whichever comes first). Owner: post-beta (DEBT-05).

## Disposition table

| # | Finding | Severity | Disposition | Owner |
|---|---|---|---|---|
| 1 | Legacy `web/server.js` was unauthenticated, used `cors()` for every origin, and `/api/chat` spawned `claude` with `--dangerously-skip-permissions` in `web/` | Critical | Fixed in Phase 2 — composed Host→Origin→token→JSON guards, legacy opt-in, safe shell-less runners | Phase 2 |
| 2 | Legacy course routes allowed path traversal on read and write | High | Fixed in Phase 2 — exact slug/file allowlists plus `resolveInside`/symlink checks | Phase 2 |
| 3 | Installed `SKILL.md` is a stale copy of the canonical skill | High | Mapped to Phase 3 (plugin drift) | Phase 3 |
| 4 | `generateJson` silently returns a wrong-language result | High | Mapped to Phase 6 | Phase 6 |
| 5 | Studio's test files are not run by root `npm test`/CI | Medium | Mapped to Phase 4 (CI wiring) | Phase 4 |
| 6 | Synchronous capability probes ran on every legacy `/api/chat` request | Medium | Fixed in Phase 2 — authenticated/gated route plus TTL capability cache and injected probes | Phase 2 |
| 7 | Claude bridge CLI ran with its working directory in `web/` (which held the token) | Medium | Fixed in Phase 2 — every agent runs in a fresh temp cwd with an allowlisted env | Phase 2 |
| 8 | Schema version is hard-coded to 1 and snapshot data is packed into `checks_json` | Medium | Mapped to Phase 5 (schema/migration) | Phase 5 |
| 9 | Module-level language state mutated during React render | Medium | Mapped to Phase 6 | Phase 6 |
| 10 | Community registry content is installed without an integrity check | Medium | **Accepted** (install integrity only — see above); `validateItemName` traversal is fixed in Phase 2 | Post-beta (DEBT-05) |
| — | Studio client sends the bridge token to any configured `bridgeUrl` | Medium | Mapped to Phase 6 (SEC-12) | Phase 6 |
| — | BYOK keys and the bridge token live in `localStorage`; no CSP | Medium | Mapped to Phase 6 (CSP/BYOK) | Phase 6 |
| — | Legacy OpenCode spawn had permissive defaults and no temp cwd/profile | High | Fixed in Phase 2 — shared safe argv/env/temp-cwd runner | Phase 2 |
| — | `doctor` health probe had no token | Medium | Fixed in Phase 2 — token-aware probe; 401 means reachable but unpaired | Phase 2 |
| — | Legacy client used token-less GET `EventSource` with a query-string message | Medium | Fixed in Phase 2 — fragment pairing, `sessionStorage`, `X-Studio-Token`, fetch POST SSE | Phase 2 |
| — | Root `package.json` `files` omitted the new security modules | High (release blocker) | Handoff recorded below (Phase 4 owns `package.json`) | Phase 4 |
| — | Learner/imported code runs in a same-origin Worker (not a sandbox) | Medium | Mapped post-beta (worker/Pyodide isolation) | Post-beta |
| — | Pyodide is loaded from a CDN without SRI | Low–Medium | Mapped post-beta (worker/Pyodide isolation) | Post-beta |
| — | Shell interpolation in the publish flow (`execSync` strings) | Low | Mapped post-beta (outside Phase 2 ownership) | Post-beta |

**Mapped, not accepted:** CSP/BYOK/SEC-12 (Phase 6), schema version and snapshot columns (Phase 5),
Studio CI/`npm test` (Phase 4), plugin drift (Phase 3), worker/Pyodide isolation and publish-shell
interpolation (post-beta). Listing a finding in this table never means it may ship unowned; it means
another phase owns the fix.

## Escape hatches

These remain available for the beta but are loud and non-combinable:

- `STUDIO_ORIGINS=*` — echoes the exact request Origin (never `*`) after rejecting `null`, and
  prints a warning. It is refused together with `STUDIO_ALLOW_NON_LOOPBACK`.
- `STUDIO_ALLOW_NON_LOOPBACK` — relaxes the Host/client-address loopback check after a loud warning.
- `PROFESSOR_ALLOW_BASH=1` — lets learner exercises from the explicit `bash` language run.
- `PROFESSOR_ALLOW_NON_LOOPBACK_OLLAMA=1` — lets the Ollama host leave loopback.

`course-professor doctor` reports all of them, and the release gate refuses the wildcard-Origin +
non-loopback combination before binding.

## Residual risks (accepted as design constraints)

- **Same-user access is not isolated.** Any process running as the same OS user can read
  `~/.professor/studio-token` and `professor.db`; the token is not an OS sandbox.
- **The local runner is not a sandbox.** Learner code runs as the user with a scrubbed environment,
  contained paths, a command allowlist and a timeout — not an OS/container boundary.
- **Loopback is a trust boundary, not an authentication boundary.** The token, Host and Origin
  guards defend against cross-site and non-loopback access; they do not defend against a hostile
  process already running as the user.
- **Windows file modes are per-user ACLs.** `0600` is re-applied on every write where the platform
  supports it; Windows relies on profile ACLs.

## Handoff

`package.json.files` must include `web/security.js` and `web/legacy-server.js` before the next
release. Phase 2 does not edit `package.json` (D-27); Phase 4's tarball smoke must assert both are
packed and fail the release otherwise. This is a release blocker, not an accepted risk.
