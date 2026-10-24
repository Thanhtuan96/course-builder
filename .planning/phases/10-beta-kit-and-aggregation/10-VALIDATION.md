---
phase: "10"
slug: "beta-kit-and-aggregation"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.0.5 (root project, `environment: node`) |
| **Config file** | `vitest.config.js` — root project includes `test/**/*.test.js` |
| **Quick run command** | `npx vitest run test/beta-aggregate.test.js --project root` |
| **Full suite command** | `npm test` (root + Studio projects) |
| **Estimated runtime** | ~5 seconds for the phase file, ~2 minutes for the full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run test/beta-aggregate.test.js --project root`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds (phase file)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | BETA-02 | T-10-01 / T-10-02 | Participant docs never teach a security relaxation and consent never overstates privacy | unit (fs/string) | `node -e "..."` doc sweep (plan) | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | BETA-02, BETA-04 | T-10-03 | Thresholds stay DRAFT with an empty sign-off block; memo links instead of restating | unit (fs/string) | `node -e "..."` doc sweep (plan) | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | BETA-02, BETA-04 | T-10-01 / T-10-03 | README index resolves every doc; forbidden literals absent from the whole kit | unit (fs/string) | `node -e "..."` doc sweep (plan) | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | BETA-03 | T-10-05 | Fixtures are literal JSON, no clock/UUID/paths; symlink and oversized cases exist | integration | `node scripts/beta-aggregate.mjs test/fixtures/beta-reports/valid` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | BETA-03 | T-10-04 / T-10-05 / T-10-06 / T-10-07 / T-10-08 | CLI rejects traversal, caps file size, discloses no absolute paths, prints no percentage | integration | `node scripts/beta-aggregate.mjs test/fixtures/beta-reports/valid --json` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 2 | BETA-02, BETA-03, BETA-04 | all | Full black-box coverage of the CLI contract plus doc guards | integration | `npx vitest run test/beta-aggregate.test.js --project root` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/fixtures/beta-reports/{valid,invalid,duplicate,duplicate-tie,missing-export,missing-export-list,empty,nested}/**` — literal JSON fixtures
- [ ] `docs/beta/**` — kit docs the doc guards read
- [ ] `scripts/beta-aggregate.mjs` — CLI under test

*No install needed: `vitest` is installed and `zod` resolves from `studio/node_modules` for the frozen schema import.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner signs off the thresholds before Day 0 | BETA-04 | Sign-off is a human decision, not an automated fact | Fill the `## Sign-off` block in `docs/beta/owner/THRESHOLDS.md` (name, date, commit hash) and re-run the docs guard; a filled block is allowed after sign-off |
| Screener is actually usable in a message thread | BETA-02 | Copy-paste quality is judgement | Paste the screener block into a draft message on macOS and confirm it renders as a single scorable checklist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
