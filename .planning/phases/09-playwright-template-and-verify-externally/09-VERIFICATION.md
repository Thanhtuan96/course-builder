---
phase: "09"
status: passed
score: 10/10
verified: 2026-10-25
re_verification:
  previous_status: none
  note: "Initial verification — no prior 09-VERIFICATION.md existed"
human_verification_deferred_to: "Phase 12 (manual real-provider UAT gate, ROADMAP)"
human_verification_deferred_by: "orchestrator, 2026-10-25 — accepted the 10/10 automated verification; the six manual items below were NOT executed in this phase and MUST be run in Phase 12's UAT"
human_verification_not_executed: true
human_verification:
  - behavior: "Start the Playwright template in a real browser: tick all five pre-flight items, use the CTA, land on the seeded course, open a lesson and a quiz."
    why: "Render smoke tests prove the markup and the disabled CTA, but `renderToString` cannot click checkboxes, navigate, or persist a seeded course. Adding jsdom/RTL would be a dependency change this phase forbids."
    test: "Run the Studio app, open New Course, tick every pre-flight box, press 'Start the Playwright course'. Confirm the CTA stays disabled until all five are ticked, the new course has five readable lessons with quizzes, and its capstone is R1–R7 with no runner."
  - behavior: "Copy the suggested command, run Playwright in the learner's own project, and paste/upload the real JSON-reporter and list-reporter output."
    why: "Fixtures are static captures pinned to @playwright/test@1.64.1 and `FileReader`/`navigator.clipboard` are browser APIs; a learner's real Playwright version and terminal output may differ from the fixtures."
    test: "In a real project run `npx playwright test --reporter=json --project=chromium` and the list variant (one green run, one with a failure). Paste and upload each. Compare the shown total/passed/failed/skipped/flaky, duration, version, projects, Chromium state and spec files to the terminal output, and verify the mismatch warnings and the literal 'self-reported evidence' label."
  - behavior: "Get a real-provider review of a real spec and write-up against R1–R7."
    why: "Unit tests use deterministic model stubs and the code-owned finaliser; live model behaviour, wording and localisation cannot be asserted without a provider."
    test: "Configure a provider, submit a deliberately weak spec (CSS locators, waitForTimeout, force: true) and a strong one. Confirm exactly one met/partial/not_met entry per R1–R7, one Socratic question for every unmet criterion, no corrected code or rewritten test, and a verdict that can only pass the strong, green Chromium run."
  - behavior: "Complete the revise loop in the browser: failing run → revise → clean passing Chromium run → course_complete, with per-attempt evidence and criterion transitions in the history."
    why: "The revision link, stored evidence and transitions are proven at the repo/render level, but the multi-step interactive flow (state, navigation, refresh) needs a browser."
    test: "Submit a failing run, use 'Revise this attempt', submit a clean passing Chromium run with the spec code, then inspect the attempt history and the completion export."
  - behavior: "Exercise the upload guard and the clipboard fallback in a browser."
    why: "Only the pure decisions (`uploadRejection`, `evaluateEvidenceInput`) and source scans are tested; `FileReader` and clipboard permissions are browser-only."
    test: "Upload a >1 MB file and an unreadable/binary file, then press Copy with clipboard permission denied. Expect the localised size/unreadable errors and the `copyFailed` fallback, never a crash."
  - behavior: "Run the Vietnamese variant end to end."
    why: "Catalog parity and variant selection are unit-tested; the actual rendered Vietnamese lesson, rubric labels and form copy were not rendered in a browser."
    test: "Switch the UI/course language to Vietnamese, start the template, and read a lesson, the five pre-flight labels and the R1–R7 rubric."
---

# Phase 09: Playwright Template and Verify Externally — Verification Report

**Phase Goal:** A learner can take the Playwright E2E course end-to-end and get their own project's test reviewed against a fixed rubric using self-reported run evidence — without Studio ever running Playwright.
**Verified:** 2026-10-25
**Status:** passed (10/10 automated truths verified). The six manual items under **Human Verification
Required** were **not executed** in this phase — the orchestrator deferred them to Phase 12's manual
real-provider UAT gate, which the ROADMAP already owns.
**Re-verification:** No — initial verification
**Phase base:** `251d874` (parent of `cdec8cd docs(09): capture phase context`); 36 commits, 56 files changed.

## Verification Performed

| Check | Command | Result |
|-------|---------|--------|
| Full suite (root + Studio) | `npm test` | **90 files / 1317 tests passed** |
| Security regression | `npm run test:security` | **14 files / 203 tests passed** |
| Focused capstone suites | `npm --prefix studio test -- --run test/capstone-evidence.test.js test/capstone-template.test.js test/capstone-external.test.js test/capstone-render.test.js test/capstone-attempts.test.js test/prompts-capstone.test.js` | **6 files / 207 tests passed** |
| Runner allowlist guard | `npx vitest run test/runner-no-playwright.test.js --project root` | **1 file / 29 tests passed** |
| Scope diff | `git diff --stat 251d874..HEAD` | 56 files: planning docs + owned sources/tests + the approved `web/studio-runner.js` exception. No migration, `package.json`, lockfile, `STATE.md`, `ROADMAP.md` or `CLAUDE.md` change. |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PW-01: a fixed, reviewed Playwright course exists — bilingual EN/VI, five fully written lessons with quizzes, a five-item pre-flight checklist, and an immutable R1–R7 capstone (`tests: null`, `external_id: template:playwright-e2e`) — and seeding makes zero model/provider calls and is idempotent | ✓ VERIFIED | `studio/src/data/templates/playwright-e2e.js` (`PLAYWRIGHT_TEMPLATE` L491, `preflight` L506, `capstone` L518, `lessons` L529, `playwrightTemplateFor` L834, `seedPlaywrightTemplate` L872); `playwright-e2e.vi.js`; `capstone-template.test.js` (24 tests: 5 lessons, quiz shape, rubric keys, parity, row counts, second seed no-op, concurrent seed collapse, zero `fetch`, no provider import) |
| 2 | PW-01: the New Course page shows the pre-flight checklist before starting and blocks the CTA until every item is ticked | ✓ VERIFIED | `studio/src/pages/NewCourse.jsx` L56 `templateReady`, L149–159 `startTemplate` early-return, L176–210 card + disabled CTA; `capstone-template.test.js` renders the card above the free-text form, asserts all five labels and the disabled `notReady` button |
| 3 | PW-03: the learner sees copyable commands before the input, can paste or upload, Studio auto-detects JSON/list and shows the extracted facts under the literal "self-reported evidence" label | ✓ VERIFIED | `ExternalEvidenceForm.jsx` L44 `EVIDENCE_COMMANDS` (rendered before the textarea at L273), L69 `evaluateEvidenceInput`, L86 `uploadRejection`, `.json/.txt` `FileReader` upload L240–256; `EvidenceSummary.jsx` L120 badge `externalEvidence.selfReported`; `en/externalEvidence.json` L2 `"self-reported evidence"`; `capstone-render.test.js` (facts, version, projects, Chromium, specs, titles, command-before-input, no-facts-before-paste) |
| 4 | PW-03: mismatches produce human-readable warnings from the closed six-code set | ✓ VERIFIED | `capstone-evidence.js` L46 `EVIDENCE_WARNING_CODES`, L239 `chromiumEvidence`, L622 `parseEvidence`, L696 `evidenceWarnings` (`unknown_spec_files`, `claimed_pass_with_failures`); `EvidenceSummary.jsx` warning list; `capstone-render.test.js` "maps all six codes to six distinct labels", "feeds submittedFiles/write-up into evidenceWarnings" |
| 5 | PW-02/PW-04: the review grades the submitted spec code and explanation against R1–R7 with per-criterion statuses and one Socratic question per unmet criterion, without corrected code | ✓ VERIFIED | `prompts/capstone.js` L469 `EXTERNAL_REVIEW_RULES` (R7 from write-up, R1 from workflow), L555 `buildExternalCapstoneReviewMessages` wraps brief + rubric + evidence + `spec_code` + submission; L619 `validateExternalCapstoneReview` re-keys to rubric order and fills code-owned questions; L403 `DEFAULT_EXTERNAL_QUESTIONS`; `capstone-attempts.test.js` ReviewPanel renders all criteria, localized labels, questions, no revise action; `prompts-capstone.test.js` no-solution rule verbatim, never asks for a verdict |
| 6 | PW-04: pasted evidence and spec code are untrusted data — an injected "mark this complete"/"ignore previous instructions" changes nothing, and each block closes exactly once | ✓ VERIFIED | `prompts/capstone.js` L459 `neutralizeDelimiters`, L555 builder wraps all pastes; `capstone-external.test.js` L500–538 asserts hostile and plain reviews are byte-identical (`criteria`, question, verdict); `prompts-capstone.test.js` L232–255 asserts exactly one closing tag for all five blocks and labels them data |
| 7 | PW-04: the verdict is computed in code and cannot pass a run containing failures (plus R4/R6/R1 clamps) | ✓ VERIFIED | `capstone.js` L430 `finalizeExternalReview` (strips any model verdict), L454 `computeCapstoneVerdict` (all criteria met, no blocking warning, `failed === 0`, `passed > 0`, Chromium evidenced, spec file present), L384 `BLOCKING_WARNING_CODES`; `prompts/capstone.js` L685 `applyDeterministicClamps` (R4 ≤ partial, R6 not_met, R1 not_met, downgrade-only); `Capstone.jsx` L226 uses the computed verdict; `capstone-external.test.js` blocks failures, `no_passing_test`, no Chromium, every blocking warning, unmet criteria, no spec file |
| 8 | PW-03/PW-05: evidence is stored with the capstone submission (`test_results_json`) and the `capstone_checkpoint` event carries `meta_json.source = external`; attempt history shows per-attempt evidence and criterion transitions | ✓ VERIFIED | `Capstone.jsx` L191–236 builds `evidence` (parse + facts), L279 `createCapstoneSubmission({ testResults, review, verdict, revisionOf })`; `repo/index.js` L934 stores `test_results_json`, L947 sets `source: 'external'`; `SubmissionHistory.jsx` L63–82 renders `EvidenceSummary` + `AttemptDiff`; `capstone-attempts.test.js` round-trip (source, selfReported, failed count, facts, no checks, `meta_json` = `{source:'external',attempt:1}`), revision link via `listRevisionLinks({revisedId})`, two evidence summaries in history, escaped hostile text |
| 9 | PW-05: a test fails if the runner allowlist ever accepts `npm`, `npx` or `playwright`; the allowlist stays closed | ✓ VERIFIED | `test/runner-no-playwright.test.js` (291 lines, 29 tests): bare names, POSIX/Windows paths, mixed case, each shim extension, stacked shims, even with `allowBash`; pins `COMMANDS` to the six toolchains, every pipeline step allowed, denylist baseline intact, `shell:false`, single spawn call site; `web/studio-runner.js` diff is only `normalizeCommandName`/`COMMAND_SHIM_EXTENSIONS` exports + its use inside `assertCommandAllowed` |
| 10 | Harness invariants: no migration or `DB_VERSION` bump; no dependency/lockfile change; no edit to an existing i18n namespace; `web/studio-runner.js` changed only in `assertCommandAllowed` (+ additive exports); no `components/revision/**` import; no PW-06/07/08 work | ✓ VERIFIED | `git diff --name-only 251d874..HEAD`: no `*.sql`, `package*.json`, lockfiles, `STATE/ROADMAP/CLAUDE`; only the four new i18n files; runner diff exactly the 32-line normalization block; `grep -r components/revision studio/src` → no match; no R8/second template/static-lint UI in the owned sources |

**Score:** 10/10 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `studio/src/data/templates/playwright-e2e.js` | Bilingual template data, rubric keys, pre-flight, idempotent seeding | ✓ VERIFIED | 925 lines; exports all planned symbols; no provider/network/capstone-generation import |
| `studio/src/data/templates/playwright-e2e.vi.js` | Vietnamese variant, structural parity | ✓ VERIFIED | 803 lines; parity + translation tests pass |
| `studio/src/lib/capstone-evidence.js` | Pure deterministic reporter parser | ✓ VERIFIED | 758 lines; zero imports, no network/process/eval; caps + closed warning set; 583-line test suite over 14 fixtures |
| `studio/src/lib/capstone.js` | Evidence mode, deterministic facts, finalisation, code verdict | ✓ VERIFIED | `capstoneEvidenceMode` L105, `lintSpecCode` L307, `computeCapstoneFacts` L371, `finalizeExternalReview` L430, `computeCapstoneVerdict` L454, `normalizeStoredReview` L495 |
| `studio/src/lib/prompts/capstone.js` | Untrusted external review prompt, delimiter neutralisation, validators, clamps | ✓ VERIFIED | `neutralizeDelimiters` L459, `EXTERNAL_REVIEW_RULES` L469, builder L555, validator L619, clamps L685; prompt contains no `verdict` field |
| `studio/src/components/capstone/ExternalEvidenceForm.jsx` | Copyable command, paste/upload, live parse, facts + warnings, confirmation gate | ✓ VERIFIED | 377 lines; commands before input; confirmation required and reset on change; escapes text only |
| `studio/src/components/capstone/EvidenceSummary.jsx` | Reusable "self-reported evidence" facts block | ✓ VERIFIED | 217 lines; literal label, counts, duration, version, projects, Chromium, specs, warnings; no HTML sink |
| `studio/src/components/capstone/AttemptDiff.jsx` / `SubmissionHistory.jsx` / `ReviewPanel.jsx` / `SubmissionForm.jsx` | Capstone revision surface, history, rubric statuses, external spec input | ✓ VERIFIED | Render + escaping tests; one primary revise surface; no `dangerouslySetInnerHTML`/`innerHTML` |
| `studio/src/pages/NewCourse.jsx` | Template entry behind the checklist | ✓ VERIFIED | Seeding through `seedPlaywrightTemplate`, CTA disabled until all five boxes |
| `studio/src/pages/Capstone.jsx` | External-mode branch, no runner, evidence + revision linking | ✓ VERIFIED | `capstoneEvidenceMode` gate before the in-app branch; `runCapstoneTests` only in the `else` branch; verdict computed in code |
| `studio/src/lib/i18n/{en,vi}/externalEvidence.json`, `.../playwrightTemplate.json` | Two new namespaces per language | ✓ VERIFIED | New files only; `selfReported`, six warning labels, `rubric.r1…r7`; catalog/key tests pass |
| `studio/test/fixtures/playwright/**` | Pinned static reporter fixtures | ✓ VERIFIED | 14 fixtures + README pinning `@playwright/test@1.64.1`; no CI regeneration |
| `studio/test/capstone-{evidence,template,external,render,attempts}.test.js`, `prompts-capstone.test.js` | Behavioural coverage | ✓ VERIFIED | 207 focused tests pass |
| `test/runner-no-playwright.test.js` | Allowlist guard | ✓ VERIFIED | 291 lines / 29 tests pass; covers every path/case/shim form and the closed allowlist |
| `web/studio-runner.js` | Approved normalization only | ✓ VERIFIED | Diff limited to `normalizeCommandName`, `COMMAND_SHIM_EXTENSIONS`, and their use in `assertCommandAllowed` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `NewCourse.jsx` | `playwright-e2e.js` | `seedPlaywrightTemplate` | ✓ WIRED | L19 import, L154 call, navigation to the seeded course |
| `playwright-e2e.js` | repo | `createCourse` + `createCapstone` | ✓ WIRED | L900 `createCourse` (lessons with `content_md`/`quiz_seed`), L915 `createCapstone` with `externalId`; round-trip test proves persisted rows |
| `ExternalEvidenceForm.jsx` | `capstone-evidence.js` | `parseEvidence` + `evidenceWarnings` + `summarizeEvidenceFacts` | ✓ WIRED | `evaluateEvidenceInput` L69–76 |
| `ExternalEvidenceForm.jsx` | `EvidenceSummary.jsx` | facts block | ✓ WIRED | Rendered L360 with the self-reported label |
| `Capstone.jsx` | `capstone.js` | `computeCapstoneFacts` + `finalizeExternalReview` + `computeCapstoneVerdict` | ✓ WIRED | L191, L220, L226 |
| `Capstone.jsx` | `prompts/capstone.js` | `buildExternalCapstoneReviewMessages` | ✓ WIRED | L198; spec code is passed as `submission.files` |
| `Capstone.jsx` | repo | `createCapstoneSubmission({ testResults, revisionOf })` | ✓ WIRED | L279; round-trip test proves `test_results_json`, `meta_json.source` and the revision link |
| `SubmissionHistory.jsx` | `EvidenceSummary` / `AttemptDiff` | per-attempt evidence + transitions | ✓ WIRED | L78, L82; history render tests |
| `test/runner-no-playwright.test.js` | `web/studio-runner.js` | `assertCommandAllowed` / `COMMANDS` / `COMMAND_DENYLIST` | ✓ WIRED | 29 tests pass |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PW-01 — start the fixed course with a pre-flight checklist | ✓ SATISFIED | Bilingual 5-lesson template with quizzes + five pre-flight items + CTA gate (`NewCourse.jsx`, `capstone-template.test.js`); seeding is provider-free and idempotent |
| PW-02 — rubric R1–R7 grading of the learner's own app | ✓ SATISFIED | Fixed seven-criterion rubric seeded immutably; deterministic facts + prompt + review finalisation; `capstone-external.test.js` |
| PW-03 — "Verify externally": command → run → paste/upload → auto-detect → facts → mismatch warnings → "self-reported evidence" | ✓ SATISFIED | `EVIDENCE_COMMANDS`, `parseEvidence` (JSON/list/line), `evidenceWarnings`, `EvidenceSummary` literal label, form + history render; 583 parser tests + 337 render tests |
| PW-04 — untrusted pasted evidence, cannot pass failures, reviews code + explanation | ✓ SATISFIED | Delimiter neutralisation + exactly-one-closing-tag test; injection byte-identical test; `computeCapstoneVerdict` + downgrade-only clamps; no-solution rule |
| PW-05 — evidence stored with the submission and never spawn `npm`/`npx`/`playwright` | ✓ SATISFIED | `test_results_json` + `meta_json.source='external'` round-trip; history evidence; 29-test runner guard |

**Coverage:** 5/5 phase requirements satisfied. No orphaned requirements: `REQUIREMENTS.md` maps exactly PW-01…PW-05 to Phase 9, all claimed by the six plans. PW-06…PW-08 remain deferred and were not implemented.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TODO`/`FIXME`/`XXX`/`HACK`/placeholder, no empty implementations, no `console.*` in any changed source file | — | Clean |
| — | — | No `dangerouslySetInnerHTML`/`innerHTML` in `components/capstone/**` or `Capstone.jsx`; no `child_process`/`exec`/`spawn`/`eval`/`fetch` in the evidence parser; no `@playwright/test` import in Studio | — | Clean |
| `studio/src/lib/prompts/capstone.js` | 469–489 | The review prompt never spells the literal label "self-reported evidence" (D-05 asks for it in the prompt as well as the UI); it says "a test they ran in their own project" and "Verified facts from the learner's own run" | ℹ️ Info | Cosmetic/locked-decision nuance only. The UI, the stored payload (`selfReported: true`, `label`) and history carry the literal label; the prompt still forbids trusting pasted counts and the verdict is code-owned, so no requirement or success criterion is affected |
| `studio/src/lib/capstone.js` | 307–352 | `lintSpecCode` detects `test.describe.serial` but not the equivalent `mode: 'serial'` (documented deliberate limitation in 09-03-SUMMARY) | ℹ️ Info | R5 remains a model judgement over other facts; no acceptance criterion depends on it |
| `studio/src/components/capstone/*.jsx`, `studio/src/pages/*.jsx` | — | Interactive behaviour (checkbox gate, `FileReader`, clipboard, navigation) is proven through pure helpers + source assertions + `renderToString`, not a DOM test | ℹ️ Info | Expected: adding jsdom/RTL would be a forbidden dependency change; covered by human verification |

### Gaps

None blocking. All four ROADMAP success criteria and all five requirements (PW-01…PW-05) are verified against the code and the passing suite. The harness invariants hold (no migration/`DB_VERSION`, no dependency/lockfile, no existing i18n edit, runner change scoped to `assertCommandAllowed` plus additive exports, no `components/revision/**` import, no PW-06/07/08 work).

### Human Verification Required

> **Deferred to Phase 12** by the orchestrator on 2026-10-25. None of the six items below were run in
> this phase; they are the manual real-provider UAT gate that Phase 12 owns in the ROADMAP. They stay
> listed here so Phase 12 cannot lose them.

1. **Start the template in a real browser** — tick all five pre-flight items, use the CTA, open a lesson and a quiz. Expected: the CTA enables only when all five are ticked; the course has five lessons and an R1–R7 capstone with no runner.
2. **Run Playwright in the learner's own project and submit real output** — paste and upload JSON and list output (one green, one failing). Expected: facts, version, Chromium state, spec files and mismatch warnings match the terminal; the literal "self-reported evidence" label is shown.
3. **Real-provider review against R1–R7** — submit a weak and a strong spec. Expected: one status per criterion, one Socratic question per unmet criterion, no corrected code, and only the clean green Chromium run can pass.
4. **Full revise loop in the browser** — failing run → revise → clean run → `course_complete`, then inspect history and completion export. Expected: linked attempts, per-attempt evidence, only changed criteria listed.
5. **Upload/clipboard edge cases** — >1 MB file, binary file, clipboard permission denied. Expected: localised errors and `copyFailed`, never a crash.
6. **Vietnamese variant** — switch language and start the template. Expected: Vietnamese checklist, lessons, rubric labels and evidence form copy.

---

_Verified: 2026-10-25_
_Verifier: Claude (gsd-verifier)_

## VERIFICATION PASSED
