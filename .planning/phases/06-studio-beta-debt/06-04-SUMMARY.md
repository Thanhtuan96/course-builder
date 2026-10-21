---
phase: 06-studio-beta-debt
plan: 04
subsystem: security
tags: [csp, vite, dev-server, build]

requires: []

provides:
  - Strict production Content-Security-Policy meta in studio/index.html
  - studio-dev-csp serve-only Vite plugin + relaxCspForDev helper
  - CSP directive/relaxation/build regression test

affects: [11-product-boundary-docs, 12-full-loop-e2e, 13-private-beta-cohort]

actuals:
  tokens: 0
  tasks: 4
  commits: 1

tech-stack:
  added: []
  patterns: [meta CSP production contract, serve-only dev relaxation]

key-files:
  created:
    - studio/test/settings-csp.test.js
  modified:
    - studio/index.html
    - studio/vite.config.js

key-decisions:
  - "D-14: strict meta CSP (default-src 'self', no unsafe-eval, no frame-ancestors)"
  - "D-15: automated directive/strictness test"
  - "D-16: serve-only vite relaxation for React refresh/HMR"
  - "D-17: 'wasm-unsafe-eval' + cdn.jsdelivr.net for SQL/Pyodide; dedicated workers keep the JS runner working"
  - "D-18: connect-src includes loopback http+https and the shipped provider origins"

requirements-completed: [SEC-12]

coverage:
  - id: D1
    description: "The built Studio SPA ships a strict CSP that protects localStorage BYOK keys"
    requirement: SEC-12
    verification:
      - kind: unit
        ref: "studio/test/settings-csp.test.js"
        status: pass
      - kind: integration
        ref: "npm --prefix studio run build -- -/tmp/phase6-dist + built-HTML assertions"
        status: pass
    human_judgment: false
  - id: D2
    description: "npm run dev still boots under a dev-only relaxed policy while production stays strict"
    requirement: SEC-12
    verification:
      - kind: unit
        ref: "studio/test/settings-csp.test.js (relaxCspForDev + plugin apply='serve')"
        status: pass
    human_judgment: true
    rationale: "Confirming the React-refresh preamble and HMR websocket actually work requires a running dev server and browser console."

duration: 10min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 4: Content-Security-Policy Summary

**Studio now ships a strict CSP in both source and the production build, with a serve-only relaxation that keeps the Vite dev server usable.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 4
- **Files changed:** 3

## Accomplishments

- Added the locked CSP meta as the first policy tag in `studio/index.html`: `default-src 'self'`, strict `script-src` with `'wasm-unsafe-eval'` + Pyodide CDN, inline styles allowed, data: images/fonts, loopback http+https, Anthropic/OpenAI/OpenRouter/Groq/CDN connect targets, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`; no `'unsafe-eval'`, no `frame-ancestors`.
- Added `relaxCspForDev(html)` and a `studio-dev-csp` plugin with `apply: 'serve'` so React refresh (inline preamble) and Vite HMR (ws loopback) work in dev without weakening the build.
- Added `studio/test/settings-csp.test.js` covering directives, strictness, the dev helper, the serve-only plugin, and the unchanged source meta.
- Built to `/tmp/phase6-dist` and verified the meta survives, no inline script body, no dev ws source, no `unsafe-eval`, no `frame-ancestors`.

## Task Commits

1. **Tasks 1–4:** `d99ced5` — `feat(06-04): ship strict CSP with dev-only relaxation`

## Files Created/Modified

- `studio/index.html` — strict CSP meta
- `studio/vite.config.js` — `relaxCspForDev` + `studio-dev-csp` plugin
- `studio/test/settings-csp.test.js` — new regression suite

## Decisions Made

D-14 through D-18, as corrected by D-21/D-22. Browser workspace backends: JS, SQL/WASM and Python/Pyodide all keep working because dedicated workers loaded from same-origin URLs do not inherit the document meta CSP.

## Deviations from Plan

None.

## Issues Encountered

None.

## Verification

- `npm --prefix studio test` → 49 files / 437 tests passed.
- `npm --prefix studio run build -- --outDir /tmp/phase6-dist --emptyOutDir` exited 0; the built-HTML assertions printed `ok`.

## Known beta limitations (recorded for the phase SUMMARY)

- The HTML/CSS preview is served from `public/preview.html` (not `srcdoc`) so learner inline scripts are not blocked by the app meta CSP (D-21).
- Custom OpenAI-compatible provider origins outside the allowlist are CSP-blocked; the localized `csp_blocked` error names the limitation.
- `127.0.0.2`–`127.255.255.254` pass `isLoopbackBridgeUrl` but are CSP-blocked (CSP cannot express a CIDR); use `localhost` or `127.0.0.1`. IPv6 loopback is rejected by the predicate (D-22).
- `frame-ancestors` cannot be set from a meta tag; the server header (if wanted) belongs to Phase 2.
