---
phase: "7"
slug: "beta-report-ui-and-nudges"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 |
| **Config file** | `studio/vite.config.js` (with `define`) **or** root `vitest.config.js` `projects[studio]` (**without** `define`) — both must pass |
| **Quick run command** | `cd studio && npx vitest run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js` |
| **Full suite command** | `npm --prefix studio test` **and** `npm test` (root aggregate = what CI runs) |
| **Estimated runtime** | ~3 seconds (Studio suite baseline: 55 files / 527 tests, ~2.5 s) |

---

## Sampling Rate

- **After every task commit:** `cd studio && npx vitest run test/beta-report-panel.test.js test/beta-report-panel-nudge.test.js`
- **After every plan wave:** `npm --prefix studio test` and `npm test` (the root aggregate is the only path where `__APP_VERSION__` is *not* defined — it is the CI contract)
- **Before `/gsd-verify-work`:** both suites green, plus one `cd studio && npx vite build --outDir /tmp/phase7-dist --emptyOutDir`
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | INSTR-05 | T-07-01 | Payload is schema-valid, content-free and never emitted on schema failure | unit | `cd studio && npx vitest run test/beta-report-panel.test.js` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | INSTR-05 | T-07-02 | Preview bytes equal downloaded bytes; no key/model/URL/course text in payload | unit (SSR + Blob stub) | same | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | INSTR-05 | T-07-03 | `app.version` provenance: define matches root package.json in both runners | unit | same (must pass under `npm test` too) | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | INSTR-06 | T-07-04 | Nudge fires only at offsets 7/14; markers per checkpoint; no writes to repo | unit (pinned clock) | `cd studio && npx vitest run test/beta-report-panel-nudge.test.js` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | INSTR-05, INSTR-06 | T-07-05 | Settings/Data wiring scrolls to the panel; nudge links to `#/settings?report=1` | render smoke | same + `test/beta-report-panel.test.js` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | INSTR-05, INSTR-06 | — | i18n coverage: `betaReport` namespace in en+vi, parity holds | unit | `cd studio && npx vitest run test/i18n-keys.test.js test/i18n-catalogs.test.js` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Existing infrastructure covers all phase requirements (Vitest 5 node env, `renderToString` smoke pattern, `translate()` assertions, memory adapter, DOM/Blob stubs).
- [ ] `studio/test/beta-report-panel.test.js` — payload/export/preview/version tests
- [ ] `studio/test/beta-report-panel-nudge.test.js` — nudge predicate, markers, banner render, router marker

*No framework install, no `test.include` change, no new dependency.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The downloaded file opens as valid JSON in a real browser and the preview matches it visually | INSTR-05 | The automated test captures Blob text in Node; only a browser proves the anchor download path (`a.download`) fires | Settings ▸ Data → "Export beta report" → compare the preview to the saved file name/content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
