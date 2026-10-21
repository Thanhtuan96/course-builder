---
phase: 06-studio-beta-debt
plan: 03
subsystem: security
tags: [loopback, pairing, csp, token-egress, settings]

requires:
  - phase: 06-studio-beta-debt
    provides: localized error catalog and the per-namespace i18n split (plans 06-01/06-02)

provides:
  - isLoopbackBridgeUrl / assertLoopbackBridgeUrl in settings.js
  - Sanitize-on-read and sanitize-on-persist for bridge URL/token
  - Bare #token= and #bridge=&token= pairing with URL scrubbing
  - Use-time loopback guards for bridge, runner and remote adapter
  - getProvider CSP origin preflight (csp_blocked)
  - ProviderForm inline role=status loopback warning

affects: [07-beta-report-ui, 08-revision-loop-ui, 11-product-boundary-docs, 13-private-beta-cohort]

actuals:
  tokens: 0
  tasks: 6
  commits: 1

tech-stack:
  added: []
  patterns: [WHATWG URL loopback predicate, sanitize-on-read security guard, fail-fast CSP preflight]

key-files:
  created:
    - studio/test/settings-loopback.test.js
    - studio/test/ai-loopback.test.js
    - studio/test/settings-provider-form.test.js
  modified:
    - studio/src/lib/settings.js
    - studio/src/lib/ai/errors.js
    - studio/src/lib/ai/bridge.js
    - studio/src/lib/runner/local.js
    - studio/src/lib/ai/index.js
    - studio/src/lib/repo/remote-adapter.js
    - studio/src/components/settings/ProviderForm.jsx
    - studio/src/lib/i18n/en/errors.json
    - studio/src/lib/i18n/vi/errors.json
    - studio/src/lib/i18n/en/provider.json
    - studio/src/lib/i18n/vi/provider.json
    - studio/test/settings-pairing.test.js
    - studio/test/runner-local.test.js

key-decisions:
  - "D-10/D-22: loopback = localhost/*.localhost/127.0.0.0-8 over http(s); IPv6 literals rejected"
  - "D-11: sanitize on read/migration; reject pairing; guard at use time"
  - "D-12/D-13: bare #token=/bare bridge fragment with default URL and scrub"
  - "D-19: ProviderForm inline message + getProvider CSP preflight"
  - "D-20: remote-adapter guard is URL-scoped, with or without a token"

requirements-completed: [SEC-12]

coverage:
  - id: D1
    description: "The bridge token is never sent to a non-loopback host"
    requirement: SEC-12
    verification:
      - kind: unit
        ref: "studio/test/settings-loopback.test.js, studio/test/ai-loopback.test.js, studio/test/runner-local.test.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pairing works from #token= and legacy fragments and scrubs the URL"
    requirement: SEC-12
    verification:
      - kind: unit
        ref: "studio/test/settings-pairing.test.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "Non-loopback bridge drafts show a non-blocking inline warning"
    requirement: SEC-12
    verification:
      - kind: unit
        ref: "studio/test/settings-provider-form.test.js"
        status: pass
    human_judgment: false
  - id: D4
    description: "Custom provider origins fail fast with a localized csp_blocked error"
    requirement: SEC-12
    verification:
      - kind: unit
        ref: "studio/test/ai-loopback.test.js (getProvider CSP preflight)"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 3: Loopback Bridge, Pairing and Token Egress Guards Summary

**Every path that attaches the pairing token now proves the endpoint is loopback first, pairing accepts the bare `#token=` fragment, and rejected URLs are scrubbed rather than persisted.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 6
- **Files changed:** 16

## Accomplishments

- Added a WHATWG-URL loopback predicate (`localhost`, `*.localhost`, `127.0.0.0/8`) that rejects all IPv6 literals, `0.0.0.0`, LAN IPs, domains, tunnels and non-http(s) schemes.
- Sanitized stored/tampered settings on read and migration; `saveSettings` keeps the live draft for the form but never persists a rejected URL or its token.
- Accepted bare `#token=` and `#bridge=…&token=` fragments (defaulting to `http://localhost:3000`), kept the legacy `#/settings?…` form, and scrubbed all of them.
- Guarded `createBridgeProvider`, `runnerBase`, and `remote-adapter` `post`/`health` before headers/fetch with the localized `loopback_required` error (remote adapter is URL-scoped, token or not).
- Added the `getProvider` CSP preflight (`csp_blocked`) for non-allowlisted OpenAI-compatible/Ollama origins and the non-blocking `role="status"` warning in the bridge form.

## Task Commits

1. **Tasks 1–6:** `6fac63d` — `feat(06-03): enforce loopback bridge and pairing`

## Files Created/Modified

- `studio/src/lib/settings.js` — helpers, sanitization, bare-fragment parsing, pairing rejection + scrub
- `studio/src/lib/ai/bridge.js`, `runner/local.js`, `repo/remote-adapter.js` — egress guards
- `studio/src/lib/ai/index.js` — CSP origin preflight
- `studio/src/components/settings/ProviderForm.jsx` — inline warning
- `studio/src/lib/i18n/{en,vi}/{errors,provider}.json` — `loopback_required`, `csp_blocked`, `loopbackOnly`
- New/extended security tests (5 files)

## Decisions Made

D-10 through D-13, D-19 and D-20. `saveSettings` does not hard-reject because the controlled bridge URL input saves on every keystroke; the invariant is enforced on read/persist, pairing, and at every use-time egress.

## Deviations from Plan

None. The test helper uses the real schema table name `courses` instead of the plan's illustrative `course`.

## Issues Encountered

None.

## Verification

- `npm --prefix studio test` → 49 files / 437 tests passed.
- Focused SEC-12 set passed; no fetch stub observed a non-loopback request.

## Next Phase Readiness

The bridge/runner/remote-adapter boundaries are safe for the beta; Wave 2 can rely on `assertLoopbackBridgeUrl`.
