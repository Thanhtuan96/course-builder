---
phase: "09"
slug: "playwright-template-and-verify-externally"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-24"
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5 (two projects: `root`, `studio`) |
| **Config file** | `vitest.config.js` (projects) + `studio/vite.config.js` (`test.include`) |
| **Quick run command** | `npx vitest run studio/test/capstone-evidence.test.js --project studio` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~90 seconds (root + Studio) |

---

## Sampling Rate

- **After every task commit:** Run the focused test file for that task.
- **After every plan wave:** Run `npm test` (root + Studio).
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~30 seconds per focused run.

---

## Per-Task Verification Map

Derived from the final six plans (17 tasks). Waves: 1 = 09-01/09-02/09-05, 2 = 09-03/09-04, 3 = 09-06
(09-03 imports `parseEvidence` from 09-01, so it is wave 2).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | PW-03 | T-09-08 | Fixtures are static files; nothing imports Playwright | unit + fixtures | `npx vitest run studio/test/capstone-evidence.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | PW-03 | T-09-05 | Detection/parse is capped and never throws on empty or truncated input | unit | `npx vitest run studio/test/capstone-evidence.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | PW-03 | T-09-06 / T-09-14 | Warning codes are a closed set; the module cannot spawn/exec/fetch | unit + static scan | `npx vitest run studio/test/capstone-evidence.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 1 | PW-01, PW-02 | T-09-16 | Bilingual structural parity; rubric keys R1–R7 fixed | unit (content) | `npx vitest run studio/test/capstone-template.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 1 | PW-01 | T-09-07 / T-09-15 | Seeding is idempotent, immutable and provider-free | unit (repo, memory adapter) | `npx vitest run studio/test/capstone-template.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-02-03 | 02 | 1 | PW-01 | — | Template card + pre-flight render; both catalogs complete | render smoke + i18n | `npx vitest run studio/test/capstone-template.test.js studio/test/i18n-keys.test.js studio/test/i18n-catalogs.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 2 | PW-02, PW-04 | T-09-17 | Facts ignore comments/strings; evidence mode is null-safe | unit | `npx vitest run studio/test/capstone-external.test.js studio/test/capstone.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-03-02 | 03 | 2 | PW-04 | T-09-01 / T-09-03 | Pasted blocks close exactly once; no verdict field requested | unit | `npx vitest run studio/test/prompts-capstone.test.js studio/test/capstone-external.test.js --project studio` | ✅ extend | ⬜ pending |
| 09-03-03 | 03 | 2 | PW-02, PW-04 | T-09-28 / T-09-09 | Verdict computed in code; an obedient model cannot pass a failing run | unit | `npx vitest run studio/test/capstone-external.test.js studio/test/prompts-capstone.test.js studio/test/capstone.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-04-01 | 04 | 2 | PW-03 | T-09-24 / T-09-18 | Literal "self-reported evidence" label; catalog parity | i18n + render | `npx vitest run studio/test/i18n-keys.test.js studio/test/i18n-catalogs.test.js --project studio` | ✅ extend | ⬜ pending |
| 09-04-02 | 04 | 2 | PW-03 | T-09-25 / T-09-19 | Upload size guard and parse decision are pure + unit-tested; unsafe reporter recipes absent | unit (helper) + render | `npx vitest run studio/test/capstone-render.test.js studio/test/i18n-keys.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-04-03 | 04 | 2 | PW-03 | T-09-24 | Hostile paste renders inert (escaped, never HTML) | render smoke + static scan | `npx vitest run studio/test/capstone-render.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-05-01 | 05 | 1 | PW-05 | T-09-04 | npm/npx/playwright denied in every path/case/shim form | unit (root) | `npx vitest run test/runner-no-playwright.test.js --project root` | ❌ W0 | ⬜ pending |
| 09-05-02 | 05 | 1 | PW-05 | T-09-20 / T-09-21 | Allowlist closed; every pipeline step allowed and none is a package manager | unit (root) | `npx vitest run test/runner-no-playwright.test.js --project root && npm run test:security` | ❌ W0 | ⬜ pending |
| 09-06-01 | 06 | 3 | PW-02, PW-03, PW-04 | T-09-27 / T-09-23 | Evidence + code verdict stored; spec code reaches facts; no test run; link read by `revisedId` | unit (repo) + source | `npx vitest run studio/test/capstone-attempts.test.js studio/test/capstone.test.js studio/test/i18n-keys.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-06-02 | 06 | 3 | PW-02, PW-03 | T-09-26 / T-09-18 | Localized R1–R7 labels; one revise surface; spec path/code wired to `submittedFiles` | render smoke + i18n | `npx vitest run studio/test/capstone-attempts.test.js studio/test/capstone-render.test.js studio/test/i18n-keys.test.js studio/test/i18n-catalogs.test.js --project studio` | ❌ W0 | ⬜ pending |
| 09-06-03 | 06 | 3 | PW-03, PW-04 | T-09-26 / T-09-22 | Criterion transitions + per-attempt evidence; stored text escaped | unit + render | `npx vitest run studio/test/capstone-attempts.test.js studio/test/capstone-render.test.js studio/test/i18n-keys.test.js studio/test/i18n-catalogs.test.js --project studio` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `studio/test/fixtures/playwright/` — 14 static reporter fixtures (`json-pass`, `json-fail`,
      `json-flaky`, `json-multi-project`, `json-zero-tests`, `json-config-error`,
      `json-expected-failure`, `list-pass`, `list-fail`, `list-color`, `list-1.4x`,
      `line-fail`, `mixed-list-json`, `truncated`) + `README.md` pinning `@playwright/test@1.64.1`
      (15 committed files)
- [ ] `studio/test/capstone-evidence.test.js` — parser, detection, caps, warning codes (PW-03)
- [ ] `studio/test/capstone-template.test.js` — template content, rubric keys, bilingual parity,
      seeding idempotence (PW-01, PW-02)
- [ ] `studio/test/capstone-external.test.js` — facts, clamp, verdict gate, injection (PW-02, PW-04)
- [ ] `studio/test/capstone-render.test.js` — evidence form + summary render smoke, escaping,
      `evaluateEvidenceInput`/`uploadRejection` helpers (PW-03)
- [ ] `studio/test/capstone-attempts.test.js` — repo round-trip, `revision_links` via `revisedId`,
      `meta_json` event source, criterion transitions, legacy review shapes (PW-02, PW-03, PW-04)
- [ ] `test/runner-no-playwright.test.js` — allowlist guard (PW-05)
- [ ] No framework install needed — Vitest 5 is already configured in both projects.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The learner's tested workflow is real and runs in their own app | PW-02 (R1) | Studio cannot see the learner's project; the evidence is self-reported by design | Run the template course; paste a real reporter output from your own project; confirm the form labels it "self-reported evidence" and the review discusses the workflow |
| Copyable `npx playwright test --reporter=json` command actually works in a learner project | PW-03 | Requires an external Playwright install | Copy the command from the form into a project with Playwright installed; confirm it prints JSON that the form then parses |
| File picker upload path (`.json`/`.txt` → `FileReader.readAsText`) parses exactly like pasting the same text | PW-03 | `renderToString` cannot exercise `FileReader`/the file input; the size guard (`uploadRejection`) and the parse decision (`evaluateEvidenceInput`) are unit-tested, the browser read is not | In Studio, open the template capstone; click "Upload", pick a `.json` reporter file, and confirm the same facts/warnings appear as when you paste that file's text; then pick a renamed binary `.txt` and confirm a readable `uploadUnreadable` error appears instead of a crash |
| Confirming the parsed facts is required before submit, and editing the paste resets the confirmation | PW-03 | Checkbox state transitions are not reachable through server-side render | Paste a passing report, tick confirm, then edit one character: the confirm box must clear and the submit action must become disabled until re-ticked |
| "Revise this attempt" after a non-passing review creates the attempt-2 link and the history shows the criterion changes | PW-02, LOOP-01/03 | Needs a configured provider plus two real attempts in the running app | Submit a failing attempt, press "Revise this attempt" (the only primary action), submit a second attempt, then check the attempt history shows both evidence summaries and only the changed R1–R7 criteria |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-25 (10/10 truths verified; 1317 root+Studio tests green)
