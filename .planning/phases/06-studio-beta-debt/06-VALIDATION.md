---
phase: "6"
slug: "studio-beta-debt"
status: draft
nyquist_compliant: false
wave_0_complete: true
created: "2026-10-22"
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`studio/vite.config.js` `test`) |
| **Config file** | `studio/vite.config.js` (`environment: 'node'`, `include: ['test/**/*.test.js']`) |
| **Quick run command** | `npm --prefix studio test -- --run test/ai.test.js test/settings-pairing.test.js test/runner-local.test.js` |
| **Full suite command** | `npm --prefix studio test` |
| **Estimated runtime** | ~2 seconds (full studio suite), <1 second focused |

---

## Sampling Rate

- **After every task commit:** Run the task's focused `npx vitest run <files>` command.
- **After every plan wave:** Run `npm --prefix studio test`.
- **Before `/gsd-verify-work`:** Full suite must be green plus `npx vite build` for the CSP.
- **Max feedback latency:** 10 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-xx | 01 | 1 | DEBT-02 | T-06-04, T-06-05 | Render does not mutate shared i18n state; required namespaces present as a subset with en/vi file-set and per-namespace key parity | unit | `npm --prefix studio test -- --run test/i18n-catalogs.test.js test/i18n-render.test.js test/i18n-keys.test.js` | ✅ / ❌ W0 | ⬜ pending |
| 06-02-xx | 02 | 2 | DEBT-01 | T-06-01, T-06-06 | Wrong-language JSON never returned; typed High-severity error | unit | `npm --prefix studio test -- --run test/ai.test.js` | ✅ / ❌ W0 | ⬜ pending |
| 06-03-xx | 03 | 3 | SEC-12 | T-06-02, T-06-09, T-06-10 | No token/request to a non-loopback host (remote adapter guarded on URL alone); `errors.loopback_required` and `errors.csp_blocked` proven in en and vi | unit | `npm --prefix studio test -- --run test/settings-loopback.test.js test/settings-pairing.test.js test/runner-local.test.js test/ai-loopback.test.js test/settings-provider-form.test.js` | ✅ / ❌ W0 | ⬜ pending |
| 06-04-xx | 04 | 1 | SEC-12 | T-06-03, T-06-07, T-06-08 | CSP present, strict, dev-compatible | unit + build | `npm --prefix studio test -- --run test/settings-csp.test.js && (cd studio && npx vite build --outDir /tmp/phase6-dist --emptyOutDir)` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infra covers all phase requirements (Vitest 5, renderToString smoke pattern, node env).
`errors.js` is the only pre-existing non-owned file needed (orchestrator-approved error plumbing).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dev server boots under the dev-relaxed CSP | SEC-12 | Requires a real browser + Vite dev transform | `npm --prefix studio run dev`, open the page, confirm no CSP violations block React refresh |
| Production preview obeys the strict meta CSP | SEC-12 | Requires browser console | `cd studio && npx vite build --outDir /tmp/phase6-dist --emptyOutDir && npx vite preview --outDir /tmp/phase6-dist`, check console for CSP violations and KaTeX/Mermaid rendering |
| HTML preview executes learner inline scripts without weakening the app CSP | SEC-12 | Browser-only behavior | Run an HTML exercise in preview; confirm the inline script runs (served from `public/preview.html`, not `srcdoc`) |
| Wrong-language error is visible + retryable | DEBT-01 | Real provider needed | Trigger with a stub/real provider that answers in the wrong language twice; confirm the localized error and that the existing Generate/Regenerate action remains available as the retry |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
