# Phase 9: Playwright Template and Verify Externally - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning
**Mode:** Interactive (orchestrator-locked decisions; remaining areas agent discretion)

<domain>
## Phase Boundary

A learner can start a fixed Playwright E2E course, take it end to end, keep the course and its
immutable capstone, and get **their own project's test** reviewed against a fixed R1–R7 rubric using
**self-reported** run evidence they produce in their own toolchain. Studio never runs Playwright,
`npm` or `npx` (PW-05), never treats pasted evidence as instructions (PW-04), and cannot pass a run
that contains failures.

In scope: PW-01, PW-02, PW-03, PW-04, PW-05.
- `studio/src/data/templates/**` — the fixed Playwright course (syllabus, pre-written lesson bodies,
  pre-flight checklist) and its immutable R1–R7 capstone brief.
- `studio/src/lib/capstone-evidence.js` — deterministic parser/validator for Playwright reporter
  output (JSON reporter + list reporter).
- `studio/src/lib/capstone.js`, `studio/src/lib/prompts/capstone.js` — evidence facts, rubric keys,
  untrusted-data review, deterministic verdict clamp.
- `studio/src/components/capstone/**` — `ExternalEvidenceForm`, capstone "Revise this attempt" and
  attempt history with per-criterion transitions.
- `studio/src/pages/Capstone.jsx`, `studio/src/pages/NewCourse.jsx` (template entry).
- i18n namespaces `externalEvidence.json`, `playwrightTemplate.json`.
- `test/runner-no-playwright.test.js` — the allowlist guard test.

Out of scope (other phases): any migration or `DB_VERSION` bump (Phase 5 owns `0005`; none is
needed here), `web/studio-runner.js` changes (read-only — the allowlist stays closed), generic
quiz/tutor/workspace revision UI (Phase 8), the beta report UI (Phase 7), the runner-location badge
(Phase 8), CI/E2E wiring (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Template course (PW-01)
- **D-01:** `studio/src/data/templates/playwright-e2e.js` ships the whole course as **pre-written
  local content** — the same pattern as `studio/src/data/demo-course.js`, but bilingual (an English
  and a Vietnamese variant selected with `normalizeLanguage`, mirroring `demo-course.vi.js`) so a
  Vietnamese learner is never served wrong-language content (DEBT-01 spirit). It exports:
  - a fixed syllabus: title `Ship your first reliable Playwright E2E test for a real web workflow`,
    description, `level: 'Intermediate'`, `kind: 'programming'`, goal, artifact and 5 lessons with
    pre-written `content_md` and `quiz_seed`;
  - the **immutable** R1–R7 capstone: `brief_md`, `rubric` (seven criteria with stable keys
    `R1`…`R7`), `artifact`, `tests: null` (Studio must not run anything for this course) and
    `external_id: 'template:playwright-e2e'`;
  - the pre-flight checklist: learner has their own web app to test, Node installed, Playwright
    installed and able to run once (`npx playwright --version`).
  Seeding makes **zero model calls** and works with no provider configured.
  — **Reversibility:** costly — lesson text and the rubric are learner-visible and part of the
  pre-registered beta course; changing them after a cohort starts splits learner outcomes.
- **D-02:** The template entry lives on `NewCourse.jsx` ("Start from a template"): the learner picks
  the Playwright course, ticks the pre-flight checklist, and Studio seeds course + lessons +
  immutable capstone through the existing repo APIs (`createCourse` with `source: 'manual'`,
  lessons via `content_md`, `createCapstone`). No schema change, no migration, no `DB_VERSION` bump.
  A template course is identified by its capstone `external_id` starting with `template:` (the
  repo row already has that column), so no new course column is introduced.
- **D-03:** `capstoneEvidenceMode(capstone)` in `lib/capstone.js` returns `'external'` when the
  capstone id starts with `template:` (or when its rubric carries the R1–R7 keys) and `'in_app'`
  otherwise. In external mode the capstone page never calls `runCapstoneTests`; the evidence form is
  the only source of run facts. `capstoneHasTests` stays false for the template (no `tests`).

### Evidence capture and parsing (PW-03)
- **D-04:** `studio/src/lib/capstone-evidence.js` is pure and deterministic — no network, no
  spawning, no `eval`, no execution of pasted code. It exports `detectEvidenceFormat(text)` and
  `parseEvidence(text)` returning
  `{ source: 'external', selfReported: true, format: 'json'|'list'|'unknown', stats: { total, passed, failed, skipped, flaky, durationMs, playwrightVersion|null }, specs: [{ file, tests: [{ title, status, durationMs }] }], warnings: [{ code, detail }], truncated }`.
  Exact caps are agent discretion (parse input capped, stored summary capped); the stored payload
  never contains the raw file beyond a small truncated excerpt.
  — **Reversibility:** costly — stored evidence summaries are read back by attempt history and by
  Phase 10/12 aggregation, so the normalized shape is a cross-phase contract.
- **D-05:** Warning codes are a closed set: `no_tests`, `count_mismatch`,
  `unknown_spec_files`, `claimed_pass_with_failures`, `unrecognized_format`, `truncated`.
  `unknown_spec_files` compares parsed spec paths with the file paths of the submitted code.
  "Mismatches" means exactly these codes; the UI always shows the label **"self-reported evidence"**
  next to the facts and in the review prompt.
- **D-06:** `ExternalEvidenceForm.jsx` (`components/capstone/**`) shows a copyable run command
  (`npx playwright test --reporter=json` and the list variant) **before** the input, accepts either
  a paste or a file upload (`.json`/`.txt` via `FileReader`), parses on change, and displays the
  extracted facts (total/passed/failed/skipped/flaky, duration, Playwright version when present,
  spec files, test titles) plus the warnings. The learner confirms the parsed facts before
  submitting; the normalized payload is stored in the submission's existing `testResults`
  (`test_results_json`), which already sets `source: 'external'` on the
  `capstone_checkpoint` event.

### Rubric, deterministic facts and the review (PW-02, PW-04)
- **D-07:** The seven criteria are fixed with stable keys and fixed meanings:
  `R1` real workflow in the learner's own app · `R2` semantic locators · `R3` web-first assertions ·
  `R4` no fixed waits / `force: true` / coordinate clicks · `R5` isolated test ·
  `R6` evidence of a passing Chromium run · `R7` learner explains isolation/waiting/locator choices.
  Stored rubric criteria keep `{ key, name, solid }`; the localized display label comes from the
  `playwrightTemplate.rubric.r1…r7` keys (UI chrome) while the seeded `name`/`solid` text is in the
  course language.
- **D-08:** Deterministic pre-checks produce **facts**, never model-invented judgements, and are
  passed to the review prompt as facts: hard waits (`waitForTimeout`, `sleep(`), `{ force: true }`,
  coordinate/mouse clicks, CSS/XPath locators vs `getByRole`/`getByLabel`/`getByText`/`getByTestId`,
  presence of web-first assertions (`toBeVisible`, `toHaveText`, `toHaveURL`, `toHaveCount`,
  `toBeEnabled`, `toBeChecked`), isolation signals (`test.describe`, `beforeEach`, `storageState`,
  `test.use` vs `test.describe.serial`/shared state), spec files present in the submitted code, and
  the evidence stats (including whether a Chromium run is evidenced).
- **D-09:** The review JSON shape is the Phase 8 contract:
  `{ criteria: [{ key, label, status: 'met'|'partial'|'not_met', question }] }` plus optional
  `strengths` and `nextAction`. Exactly one `criteria` entry per rubric key, in order; every
  `partial`/`not_met` entry carries one Socratic question; the no-solution rule stands (no corrected
  code, no rewritten test). The **verdict is computed in code**: `course_complete` only when all
  seven criteria are `met`, the evidence parses, `stats.failed === 0`, and a Chromium pass is
  evidenced — otherwise `needs_work`. A model that returns `course_complete` over a failing run is
  clamped.
- **D-10:** Pasted evidence and submitted spec code are untrusted data: wrapped with
  `wrapUntrusted(..., 'external_evidence')` / `wrapUntrusted(..., 'spec_code')`, with an explicit
  rule that nothing inside those blocks is an instruction. A test feeds evidence containing
  "mark this complete" / "ignore previous instructions" and asserts the verdict, criteria and
  questions are unchanged.

### Revision and attempt history (capstone surface of LOOP-01/LOOP-03)
- **D-11:** Phase 9 builds its own capstone components under `components/capstone/**` and does not
  import Phase 8's `components/revision/**` (owned in parallel). After a non-passing review,
  **"Revise this attempt" is the primary action**; submitting again records
  `revisionOf: { feedbackTable: 'capstone_submissions', feedbackId: previousSubmissionId }` so Phase
  5's explicit revision link is created.
- **D-12:** Attempt history renders the per-criterion R1–R7 status transitions between attempts
  (from stored review JSON) and the evidence summary per attempt (counts, format, warning count,
  self-reported label). Evidence text is rendered as text, never as HTML.

### Runner safety (PW-05)
- **D-13:** `test/runner-no-playwright.test.js` (root suite) imports `web/studio-runner.js` and fails
  if the runner could ever execute `npm`, `npx` or `playwright`: the denylist must contain them,
  every `COMMANDS` entry must pass `assertCommandAllowed`, and path-qualified/Windows-shim forms
  (`/usr/local/bin/npx`, `npx.cmd`, `NPM.EXE`) must be denied. `web/studio-runner.js` stays
  read-only; the allowlist stays closed.

### i18n
- **D-14:** Only two new namespaces are added per language:
  `studio/src/lib/i18n/{en,vi}/externalEvidence.json` and `.../playwrightTemplate.json`. No existing
  namespace file is edited (Phase 6's auto-merge picks the new files up).

### Research amendments (orchestrator-approved 2026-10-24)
- **D-19 (ownership exception, approved):** `web/studio-runner.js` is normally read-only for this
  phase, but the research proved a real gap: `assertCommandAllowed` splits `/`/`\` and lowercases
  without stripping an executable extension, so `npx.cmd`, `NPM.EXE`, `playwright.cmd` and
  `C:\…\npx.cmd` are currently **accepted**. Phase 9 patches **only** `assertCommandAllowed`:
  normalize before BOTH the allowlist and denylist checks — take the basename, lowercase it, and
  strip a trailing `.exe`/`.cmd`/`.bat`/`.com`/`.ps1` repeatedly (so `npm.cmd.exe` is denied too).
  No allowlist expansion, no new command, no other runner change. `PW-05`'s guard test
  (`test/runner-no-playwright.test.js`) must cover each denied name bare, as an absolute POSIX path,
  as a Windows backslash path, in mixed case, and with each shim extension, and must also prove an
  allowlisted command (`node`) still passes.
  — **Reversibility:** reversible (a one-line normalization; no data or contract change).
- **D-20 (R6 Chromium when unnamed):** a single default project reports `projectName: ''`; that run
  counts as Chromium with `chromium: 'assumed'` (the default browser is Chromium). The UI shows
  "Chromium (assumed)". An explicitly named non-Chromium project does not satisfy R6.
- **D-21 (mismatch warnings are non-blocking):** `unknown_spec_files` and
  `claimed_pass_with_failures` are shown to the learner and to the reviewer, but they do not by
  themselves block a pass. The verdict gate blocks on: `unrecognized_format`, `no_tests`,
  `truncated`, `count_mismatch`, `failed > 0`, no Chromium evidence, or any unmet criterion.
- **D-22 (R4 clamp):** when the deterministic pre-pass finds `waitForTimeout`/`sleep`, `force: true`
  or coordinate/mouse clicks, `R4` is clamped to at most `partial` even if the model says `met`;
  the model may still downgrade it to `not_met`. The same clamp never upgrades a model rating.
- **D-23 (fixture provenance):** reporter fixtures are committed **static files** under
  `studio/test/fixtures/playwright/` captured with `@playwright/test@1.64.1`, with a `README.md`
  recording the version and the exact regeneration commands. They are never regenerated in CI
  (root `package.json` declares `^1.50.0`, so CI may resolve a different minor). One hand-authored
  "1.4x-style" list fixture without the project bracket covers the older layout.
- **D-24 (no model verdict in external mode):** the external review prompt does **not** ask the
  model for `verdict` at all; the verdict is a pure function of clamped criteria + evidence facts.
  `clampReviewVerdict` is kept as defense-in-depth for backward compatibility with previously
  stored rows that carry a model verdict.
- **D-25 (blocked-paste neutralization at the call site):** `wrapUntrusted` in
  `lib/prompts/base.js` (not owned) can be broken out of by pasting `</external_evidence>`.
  `lib/prompts/capstone.js` (owned) must neutralize tag-shaped sequences in pasted evidence and
  spec code before wrapping, and a test asserts exactly one closing tag for each block.
- **D-26 (deterministic facts pre-pass):** spec-code facts are computed after a small
  `stripCommentsAndStrings()` pre-pass so matches inside comments/strings do not create false
  positives.

### the agent's Discretion
- Exact lesson copy, quiz questions, warning/detail wording, the pre-flight checklist presentation,
  the file-upload UI, and file names inside the owned globs.
- Whether `capstoneEvidenceMode` keys off `external_id` or the R1–R7 keys, as long as both template
  detection paths are covered by tests.
- Parser caps (input size, stored summary size) and the exact list-reporter heuristics, as long as
  the normalized shape in D-04 stays stable.
- Any change to `ReviewPanel`/`SubmissionForm`/`SubmissionHistory` (all inside
  `components/capstone/**`), including keeping backward compatibility with the previous
  `{ verdict, criteria[].rating }` review rows already stored by earlier versions.

### Defaults applied without asking (orchestrator: use recommended default)
- **D-15:** The template is offered from `NewCourse.jsx` (a card + checklist) rather than a new
  route, so no router change is needed.
- **D-16:** The copyable command is shown, not executed, and the form accepts both paste and upload;
  no clipboard permission is required (a copy button uses `navigator.clipboard` with a plain-text
  fallback).
- **D-17:** The template capstone is `kind: 'programming'` with `tests: null`; the app never runs
  the capstone's own tests for this course, and `R6` is judged from the pasted evidence only.
- **D-18:** Evidence parsing tolerates the JSON reporter's `{ suites: [...] }` tree and the list
  reporter's textual summary; anything unrecognized yields `format: 'unknown'` plus an
  `unrecognized_format` warning instead of throwing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` § "Phase 9: Playwright Template and Verify Externally" — goal, Owns, touch
  points, success criteria.
- `.planning/ROADMAP.md` § "Execution Rules" — exclusive ownership, migrations, lockfiles,
  planning-doc ownership (STATE/ROADMAP/CLAUDE are orchestrator-only).
- `.planning/REQUIREMENTS.md` — PW-01…PW-05 (lines 66–70); PW-06…PW-08 are explicitly deferred.
- `.planning/PROJECT.md` — core value, beta constraints, "Playwright runs in the learner's
  toolchain; Studio reviews pasted evidence".

### Frozen upstream contracts (Wave 1)
- `.planning/phases/05-beta-data-foundation/05-CONTEXT.md` — D-02/D-04 (`capstone_checkpoint`,
  `meta.source = external|in_app`), D-06 (`revisionOf: { feedbackTable, feedbackId }`), D-11 report
  schema.
- `.planning/phases/06-studio-beta-debt/06-CONTEXT.md` — D-06 (`i18n/<lang>/<namespace>.json`
  auto-merge; Wave 2 adds only new namespaces), D-08 (`useT` render safety).
- `.planning/phases/05-beta-data-foundation/05-PLAN*.md` — the exact repo write signatures and the
  revision/tests conventions this phase builds on.

### Source of truth (read before changing)
- `studio/src/lib/capstone.js` — `capstoneHasTests`, `runCapstoneTests`, `generateCapstoneForCourse`,
  `toCompletionMarkdown`, `capstoneCopy`.
- `studio/src/lib/prompts/capstone.js` — `buildCapstoneReviewMessages`, `CAPSTONE_REVIEW_RULES`,
  `NO_SOLUTION_REVIEW_RULE`, `validateCapstoneReview`, `clampReviewVerdict`, `parseRubricFromMarkdown`.
- `studio/src/pages/Capstone.jsx` — submit flow, `createCapstoneSubmission`, `runCapstoneTests`.
- `studio/src/pages/NewCourse.jsx` — template entry point and seeding flow.
- `studio/src/components/capstone/**` — `SubmissionForm`, `SubmissionHistory`, `ReviewPanel`,
  `RubricList`, `ArtifactCard`, `CompletionPanel`.
- `studio/src/data/demo-course.js` + `studio/src/data/demo-course.vi.js` — the pre-written-content
  precedent (English + Vietnamese variants).
- `studio/src/lib/repo/index.js` — `createCourse`, `createCapstone`, `createCapstoneSubmission`
  (`revisionOf`, `testResults`), `listCapstoneSubmissions`.
- `studio/src/lib/prompts/base.js` — `wrapUntrusted`, `buildSystemPrompt`, `withLanguage`.
- `web/studio-runner.js` — `COMMANDS`, `COMMAND_DENYLIST`, `assertCommandAllowed` (read-only).
- `studio/src/lib/i18n/index.js` — namespace auto-merge and `useT`.

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — repo layer, pages/components split.
- `.planning/codebase/TESTING.md` — root vs Studio Vitest split (`test/` vs `studio/test/`).
- `.planning/codebase/CONVENTIONS.md` — ES modules, JSDoc, 2-space style, kebab-case files.
- `.planning/codebase/CONCERNS.md` — runner/security constraints that must not regress.

### External references (research flag)
- Playwright docs: JSON reporter schema (`--reporter=json`), list reporter output, test isolation and
  web-first assertions — to ground parser fixtures and lesson content. Fetch at plan time; cite the
  version used for the fixtures.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `studio/src/data/demo-course.js` + `demo-course.vi.js` — exact pattern for a bundled, pre-written,
  zero-model-call course (lessons with `content_md`, `quiz_seed`, a pre-written capstone).
- `wrapUntrusted` / `buildSystemPrompt` (`lib/prompts/base.js`) — already used for the capstone brief,
  rubric and submission; evidence and spec code use the same wrapper.
- `clampReviewVerdict` and the `testsFailed` cap — the precedent for "a failing run can never pass";
  Phase 9 extends it with evidence facts.
- `createCapstoneSubmission({ testResults, revisionOf })` — already stores `test_results_json`, emits
  `capstone_checkpoint` with `meta.source = external` and links an explicit revision.
- `listCapstoneSubmissions` — oldest-first attempts, the input for the per-criterion history.
- `ErrorNotice`, `useStream`, `Card`, `Button`, `Badge`, `Markdown` — existing UI primitives.
- `FileReader`-based upload precedent exists in the backup/restore UI (`DataPanel`).

### Established Patterns
- Studio Vitest (`studio/vite.config.js`, `test/**/*.test.js`) plus a root suite for `web/**` and CLI.
- Render smoke tests use `react-dom/server` `renderToString` on `.test.js` files.
- i18n catalogs are flat JSON per namespace with a `one|other` plural convention; `i18n-keys.test.js`
  scans `src/**` for literal `t('…')` keys, so new keys must exist in both `en` and `vi`.
- Repo code is adapter-agnostic; no component writes rows directly.
- Tests never call a real model: provider stubs or pure validators only.

### Integration Points
- `NewCourse.jsx` → template seeding (`createCourse`, `createCapstone`) and navigation to the course.
- `Capstone.jsx` → evidence form → `createCapstoneSubmission` (with `testResults` + `revisionOf`).
- `lib/capstone.js` → evidence mode, lint facts, verdict computation, completion export.
- `lib/prompts/capstone.js` → review prompt (facts + untrusted blocks) and validators.
- `web/studio-runner.js` → asserted read-only by the new root test.

</code_context>

<specifics>
## Specific Ideas

- The pre-flight checklist must be visible **before** the course starts and must not block reading
  it afterwards: own web app, Node, Playwright installed (`npx playwright --version`).
- "Self-reported evidence" is a literal label, not a paraphrase — it appears on the form, on the
  stored summary and on the review panel.
- The review must never echo pasted evidence as instructions; the injected-text test is mandatory.
- Failure gates in code, not in the prompt: a model claim of success over `failed > 0` cannot pass.
- The template capstone is immutable: seeded once, never regenerated or edited.

</specifics>

<deferred>
## Deferred Ideas

- PW-06 static lint of pasted spec code for R2/R4 signals beyond the deterministic facts used for
  review (kept as facts, not a blocking lint UI).
- PW-07 R8 repeat-stability criterion and CI-integrated evidence.
- PW-08 a second course template.
- Real Playwright execution in Studio (explicitly out of scope for the milestone; the runner stays
  closed).

</deferred>

---

*Phase: 9-Playwright Template and Verify Externally*
*Context gathered: 2026-10-24*
