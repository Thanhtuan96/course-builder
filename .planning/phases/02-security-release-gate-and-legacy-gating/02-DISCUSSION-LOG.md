# Phase 2: Security Release Gate and Legacy Gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 2-Security Release Gate and Legacy Gating
**Areas discussed:** Token + pairing contract, Legacy gating + entry points, Guard policy + escape
hatches, Agent + runner hardening, Accepted risks + test shape

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Token + pairing contract | Token location, fragment format, static assets vs API auth, migration, rotation | ✓ |
| Legacy gating + entry points | Default Studio-only, `--legacy`/env, Vite spawn, banner/404 | ✓ |
| Guard policy + escape hatches | Host/origin/token/JSON order, status codes, wildcard/non-loopback refusal | ✓ |
| Agent + runner hardening | Env scrub, temp cwd, Windows shims, concurrency cap, Bash | ✓ |
| Accepted risks + test shape | Which CONCERNS findings are fixed vs accepted; no-side-effect suite | ✓ |

**User's choice:** Orchestrator locked all five areas in one response with explicit decisions.
**Notes:** Follow SEC-01..SEC-11, SEC-13, SEC-14 literally where they speak. Anything not covered
uses the agent's recommended default and is recorded in CONTEXT.md without further questions
unless destructive or contradicting the roadmap.

---

## Token + pairing contract

| Option | Description | Selected |
|--------|-------------|----------|
| `~/.professor/` + 0600, `#token=` fragment | Shared helper for every entry point; static assets public; API always token-gated; legacy `web/.studio-token` migrated then deleted | ✓ |
| Keep `web/.studio-token` | Less migration work but leaves the token in the repo tree and keeps mode bugs | |
| Server-injected HTML token | Avoids fragment but complicates static/Vite serving and Phase 6 contract | |

**User's choice:** `~/.professor/studio-token`, mode 0600 re-applied after every write, `#token=<value>`
fragment only, static assets public, migrate and delete `web/.studio-token`. `--rotate-token`
invalidates immediately and prints the new pairing URL.
**Notes:** `#token=<value>` is the Phase 6 contract; never a query string.

---

## Legacy gating + entry points

| Option | Description | Selected |
|--------|-------------|----------|
| Studio-only default | `web`/`npm start`/`node web/server.js` mount Studio only; legacy 404 unless opted in | ✓ |
| Legacy default with warning | Safer transition but contradicts SEC-01 | |
| Delete legacy now | Out of roadmap scope and breaks existing courses UI | |

**User's choice:** Studio-only by default; `--legacy` / `PROFESSOR_LEGACY=1` mounts legacy; Vite
spawn only in legacy mode; stderr warning every start; persistent banner in the legacy UI.
**Notes:** Keep `npm start` working unchanged.

---

## Guard policy + escape hatches

| Option | Description | Selected |
|--------|-------------|----------|
| Host → Origin → token → JSON, exact codes | 403/403/401/415; exact allowlists; refuse `*` + non-loopback | ✓ |
| Token first | Simpler but leaks host/origin behavior and weakens rebinding defense | |
| Warn only for `*` + non-loopback | Contradicts the requirement to refuse the combination | |

**User's choice:** Host → Origin → token → content-type → handler; 403 for Host/Origin, 401 for
token, 415 for non-JSON state changes; exact allowlists; `STUDIO_ORIGINS=*` with
`STUDIO_ALLOW_NON_LOOPBACK` refused with non-zero exit; each alone is loud.
**Notes:** No request without an `Origin` is trusted; the token is still required.

---

## Agent + runner hardening

| Option | Description | Selected |
|--------|-------------|----------|
| Denylist of bypass flags + env allowlist | No bypass ever, shell-less, temp cwd, scrubbed env, `.cmd` unsupported | ✓ |
| Flag denylist only | Leaves credential/injection env reachable | |
| Deny Bash entirely | Contradicts the existing opt-in escape hatch | |

**User's choice:** No bypass flags/env, no shell, temp cwd, env **allowlist**; Windows `.cmd` shims
documented unsupported with a clear error; runner rejects npm/npx/playwright/sh/bash, Bash off by
default, small concurrency cap.
**Notes:** Agent-specific credentials required by a CLI stay in the allowlist; everything else is
dropped. Learner-run child processes are scrubbed too.

---

## Accepted risks + test shape

| Option | Description | Selected |
|--------|-------------|----------|
| Accept only registry integrity | Fix all high/medium findings in owned files; map out-of-ownership to their phases; no-side-effect suite | ✓ |
| Accept several medium findings | Faster but weakens the beta release gate | |
| Fix everything including other phases' files | Violates exclusive ownership | |

**User's choice:** Accept only registry install integrity in `docs/security/ACCEPTED-RISKS.md`; fix
every other high/medium CONCERNS finding, including `validateItemName('..')`; security suite drives
every entry point and asserts no file written / no process spawned via temp-dir snapshot and
child_process spy.
**Notes:** Out-of-ownership findings are mapped to Phase 3/4/5/6 or post-beta, not accepted.

---

## the agent's Discretion

- Helper names and module boundaries inside `web/security.js`, `web/legacy-server.js` and
  `web/studio-api/*`.
- Mask format, warning wording, retry hint.
- Legacy client token retrieval (`sessionStorage` after `#token=` is acceptable).
- Test file granularity and fixtures inside `test/security/**`.

## Deferred Ideas

- CSP / BYOK protection, Studio `#token=` reader, loopback-only bridge URL (Phase 6).
- Schema version + snapshot columns (Phase 5).
- Studio suite in `npm test`/CI (Phase 4).
- Opaque-origin sandbox for learner code, Pyodide SRI (post-beta, outside ownership).
