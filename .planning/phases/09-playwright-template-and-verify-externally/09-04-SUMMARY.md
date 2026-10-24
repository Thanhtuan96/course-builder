---
phase: 09-playwright-template-and-verify-externally
plan: "04"
subsystem: ui
tags: [playwright, evidence, react, i18n, vitest, xss, self-reported, file-reader]

# Dependency graph
requires:
  - phase: 09-playwright-template-and-verify-externally
    plan: "01"
    provides: "parseEvidence / evidenceWarnings / summarizeEvidenceFacts and the normalized evidence payload + closed warning set"
provides:
  - "ExternalEvidenceForm: copyable run commands, paste/upload capture, live parse, facts + warnings, confirmation gate"
  - "EvidenceSummary: reusable 'self-reported evidence' facts block (also used by attempt history via `compact`)"
  - "evaluateEvidenceInput() and uploadRejection() — the DOM-free parse and size decisions"
  - "externalEvidence i18n namespace in en + vi (form chrome, six warning labels, literal selfReported)"
affects: [09-06, "phase-10 aggregation", "phase-12"]

# Actuals (#2632) — chars/4 over the realized diff (44 754 chars).
actuals:
  tokens: 11189
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Controlled evidence form: re-derives the parse from `result.text` every render, never keeps a private copy"
    - "Literal-key label maps (one t() call per value) so the i18n key scanner sees dynamic lookups"
    - "Pure helper extraction for DOM-free decisions (evaluateEvidenceInput, uploadRejection)"
    - "Escaping proved by rendering a hostile paste and asserting the escaped form + absence of the raw tag"

key-files:
  created:
    - studio/src/components/capstone/ExternalEvidenceForm.jsx
    - studio/src/components/capstone/EvidenceSummary.jsx
    - studio/src/lib/i18n/en/externalEvidence.json
    - studio/src/lib/i18n/vi/externalEvidence.json
    - studio/test/capstone-render.test.js
  modified: []

key-decisions:
  - "EVIDENCE_COMMANDS is a frozen three-entry list (JSON-to-file, JSON-to-stdout, list), each pinned to --project=chromium; no html reporter, blob, trace, screenshots or list,json"
  - "The form is controlled: result = { text, evidence, confirmed }; every text change emits confirmed:false and the parse comes from evaluateEvidenceInput()"
  - "The confirmation checkbox is disabled until a parsed evidence object exists and the required-tick hint shows while evidence is unconfirmed"
  - "Chromium confirmed renders with the accent tone, not success — a pasted run is never shown as verified"
  - "The evidence label maps (counts, warnings, Chromium, command captions, upload errors) hold literal t() calls per value so i18n-keys.test.js still guards every dynamic lookup"
  - "`facts` stays in the EvidenceSummary signature for 09-06 but is not rendered here; 09-06 passes only `evidence` and `compact`"

patterns-established:
  - "A pasted artifact is rendered exclusively as React text children; the hostile-paste test plus a literal source scan are the XSS gate for the phase"
  - "File-upload decisions are split: a pure size guard (unit-tested) and a FileReader branch documented as Manual-Only in 09-VALIDATION.md"

requirements-completed: [PW-03]

coverage:
  - id: D1
    description: "A learner sees the exact copyable Chromium run commands before any input field, with no unsafe reporter or artifact recipe"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-render.test.js#EVIDENCE_COMMANDS offers exactly three commands, all pinned to Chromium"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-render.test.js#ExternalEvidenceForm render smoke shows the copyable commands before the paste field"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pasting reporter output parses live into total/passed/failed/skipped/flaky, duration, version, projects, Chromium state, spec files and warning lines under the literal 'self-reported evidence' label, with no submission side effect"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-render.test.js#ExternalEvidenceForm render smoke parses a pasted list report into facts with the self-reported label"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-render.test.js#evaluateEvidenceInput parses a pasted list report into the normalized payload"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-render.test.js#EvidenceSummary: literal label, warnings and Chromium states maps all six codes to six distinct labels"
        status: pass
    human_judgment: false
  - id: D3
    description: "Evidence cannot move upward without an explicit confirmation tick, and submittedFiles/writeup reach evidenceWarnings so unknown_spec_files and claimed_pass_with_failures can appear"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-render.test.js#evaluateEvidenceInput feeds submittedFiles into evidenceWarnings (unknown_spec_files)"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-render.test.js#evaluateEvidenceInput feeds the write-up into evidenceWarnings (claimed_pass_with_failures)"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-render.test.js#ExternalEvidenceForm render smoke disables the confirmation checkbox until a report parses"
        status: pass
    human_judgment: false
  - id: D4
    description: "Hostile paste content stays inert: an <img onerror> in a test title is escaped in both the summary and the form, and neither component contains an HTML sink or a runner/provider/Playwright import"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-render.test.js#hostile pasted evidence stays inert (T-09-24, Gate B)"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-render.test.js#evidence components never build HTML or execute code (T-09-24, PW-05)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A .json/.txt upload reads through FileReader into the same state as a paste; over-size and unreadable files show a readable error instead of throwing"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-render.test.js#uploadRejection rejects files over 1 MB and accepts the exact boundary"
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/09-playwright-template-and-verify-externally/09-VALIDATION.md#Manual-Only Verifications (file picker upload path)"
        status: unknown
    human_judgment: true
    rationale: "renderToString cannot exercise FileReader or the file input; the browser read (and the onerror -> uploadUnreadable notice) is the documented Manual-Only row in 09-VALIDATION.md."

# Metrics
duration: 8min
completed: 2026-10-25
status: complete
---

# Phase 9 Plan 04: Verify Externally — Capture Surface Summary

**Copyable Chromium commands, paste-or-upload Playwright evidence parsed live into facts and mismatch warnings under a literal "self-reported evidence" label, gated behind an explicit confirmation tick**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-25T01:11:00Z (approx., first focused run 01:12)
- **Completed:** 2026-10-25T01:18:00Z
- **Tasks:** 3
- **Files modified:** 5 (all new)

## Accomplishments

- `ExternalEvidenceForm.jsx` leads with the three copyable commands (`EVIDENCE_COMMANDS`), then a paste
  textarea and an `.json`/`.txt` upload that share one state, a live parse, the facts block, and a
  confirmation checkbox that stays disabled until evidence exists.
- `EvidenceSummary.jsx` is the reusable facts block: counts (failed in a warning tone), duration,
  Playwright version (or "unknown"), projects, Chromium state, spec files with test titles, and one
  localised line per warning code — always beside the literal `self-reported evidence` badge.
- The parse/size decisions are exported pure functions (`evaluateEvidenceInput`, `uploadRejection`,
  `MAX_UPLOAD_BYTES`), so everything except the `FileReader` read is unit-testable without a DOM.
- Hostile paste is provably inert: `<img src=x onerror=alert(1)>` in a test title renders as
  `&lt;img src=x onerror=alert(1)&gt;` in both the summary and the form, and a source scan finds no
  HTML sink, no code evaluation and no runner/provider/Playwright import in either component.
- The `externalEvidence` namespace ships in English and Vietnamese with identical keys; the shared
  i18n key/catalog tests stayed green and were never edited.

## Task Commits

Each task was committed atomically:

1. **Task 1: EvidenceSummary + the two externalEvidence catalogs** - `cfe4130` (feat)
2. **Task 2: ExternalEvidenceForm (commands, paste/upload, live parse, confirm) + render/helper tests** - `4550b56` (feat)
3. **Task 3: escaping proof, warning-label coverage and the forbidden-API source scan** - `a8f07ca` (test)

**Plan metadata:** `docs(09): complete the verify-externally capture plan` (this SUMMARY)

## Files Created/Modified

- `studio/src/components/capstone/EvidenceSummary.jsx` (217 lines) — facts block: label badge, counts,
  duration/version/projects/Chromium, spec list (first 10 titles), warnings; `compact` drops the hint,
  spec list and titles; `formatDuration` helper.
- `studio/src/components/capstone/ExternalEvidenceForm.jsx` (377 lines) — `EVIDENCE_COMMANDS`
  (frozen), `MAX_UPLOAD_BYTES`, `evaluateEvidenceInput`, `uploadRejection`, copy-with-fallback, paste,
  upload, clear, confirm gate, `ErrorNotice`.
- `studio/src/lib/i18n/en/externalEvidence.json` (57 lines) — English chrome + six warning labels.
- `studio/src/lib/i18n/vi/externalEvidence.json` (57 lines) — Vietnamese chrome + six warning labels.
- `studio/test/capstone-render.test.js` (337 lines) — 29 tests: commands, empty/parsed form renders,
  helper purity, upload boundaries, warning-label uniqueness, Chromium states, hostile paste,
  source scans.

## The Contract Handed to 09-06

```
result    = { text: string, evidence: object|null, confirmed: boolean }
onChange  = (nextResult) => void            // text change always emits confirmed: false
props     = { result, onChange, submittedFiles: Record<path, content>|null, writeup: string,
              busy, error, onDismissError }
```

- The parent may submit evidence **only** when `result.confirmed === true`; the form itself never
  invokes a callback with `confirmed: true` unless the learner ticked the box.
- `evidence` emitted by the form is already the parser payload **plus** `evidenceWarnings(parsed,
  { files: submittedFiles, contentMd: writeup })`, so 09-06 can merge its spec-code facts directly.
- DOM-free reuse: `evaluateEvidenceInput({ text, submittedFiles, writeup })` returns
  `{ evidence, summary }` (`{ null, null }` for blank text); `uploadRejection({ size, maxBytes })`
  returns `'uploadTooLarge' | null` (`>` not `>=`).
- `<EvidenceSummary evidence={testResults} />` is also the attempt-history block with `compact`.

## `EVIDENCE_COMMANDS` (the only commands the UI ever suggests)

| id | command |
|----|---------|
| `json_file` | `PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test --reporter=json --project=chromium` |
| `json_stdout` | `npx playwright test --reporter=json --project=chromium` |
| `list` | `npx playwright test --reporter=list --project=chromium` |

None contains `--reporter=html`, `blob`, `--trace`, `screenshot` or `list,json` (asserted). They are
text to copy — Studio never executes them (PW-05).

## i18n Keys Added (`externalEvidence.*`, identical in `en` and `vi`)

Chrome: `title`, `intro`, `commandTitle`, `commandWhyChromium`, `copy`, `copied`, `copyFailed`,
`pasteLabel`, `pastePlaceholder`, `uploadLabel`, `uploadHint`, `uploadTooLarge`, `uploadUnreadable`,
`clear`, `unrecognized`, `confirmLabel`, `confirmHint`, `confirmRequired`.

Facts: `selfReported` (`self-reported evidence` / `bằng chứng tự khai báo`), `selfReportedHint`,
`factsTitle`, `total`, `passed`, `failed`, `skipped`, `flaky`, `durationLabel`, `versionLabel`,
`versionUnknown`, `projectsLabel`, `noProjects`, `chromiumLabel`, `chromiumConfirmed`,
`chromiumAssumed`, `chromiumNone`, `formatLabel`, `formatValue`, `specsTitle`, `noSpecs`,
`testCount`, `warningsTitle`, `warningNone`.

Nested: `command.{json_file,json_stdout,list}` and
`warning.{no_tests,count_mismatch,unknown_spec_files,claimed_pass_with_failures,unrecognized_format,truncated}`.

No existing namespace file was touched.

## Escaping Evidence (T-09-24, Gate B)

The hostile paste is a real list-reporter paste whose single test title is
`<img src=x onerror=alert(1)>`; the parser keeps it verbatim, and both surfaces render it as one
text node:

- `EvidenceSummary` HTML contains `&lt;img src=x onerror=alert(1)&gt;`
- it does **not** contain `<img`, the raw payload `<img src=x onerror=alert(1)>`, or the raw tag
  terminator `onerror=alert(1)>`
- the same assertions pass for `ExternalEvidenceForm` (textarea + summary in one render)
- source scan: neither component contains `dangerouslySetInnerHTML`, `innerHTML`, `eval(` or
  `new Function`; neither imports `@playwright/test`, `child_process`, `components/ui/Markdown`,
  `web/studio-runner` or calls `fetch(`

## Decisions Made

- **Controlled, re-parsing form.** The component ignores `result.evidence` for display and recomputes
  it from `result.text` on every render, so a stale payload from the parent can never be shown or
  submitted. `onChange` is the only writer.
- **Literal-key label maps.** Counts, warnings, Chromium states, command captions and upload errors
  are each resolved through a small object of literal `t('…')` calls; a template-built key
  (`` `warning.${code}` ``) would be invisible to `i18n-keys.test.js`.
- **Chromium `confirmed` is accent, not success.** A green pasted report is still self-reported, so
  no badge on this surface is allowed to look like a verified result (T-09-18).
- **Upload errors are text, not toasts.** `uploadTooLarge` / `uploadUnreadable` render inline with
  `role="alert"`; an over-size file is rejected before `FileReader` ever runs (T-09-25).
- **Clear is total.** `t('externalEvidence.clear')` wipes the text, the upload name, the error and
  the confirmation in one `onChange({ text: '', evidence: null, confirmed: false })`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The mandated literal source scan matched the component's own doc comment**
- **Found during:** Task 3 (source scan)
- **Issue:** `EvidenceSummary.jsx` explained that it uses no `dangerouslySetInnerHTML` and no
  `innerHTML`; the scan is a deliberately dumb literal `String.includes`, so it failed on the file
  that documents the rule.
- **Fix:** Reworded the comment ("no raw markup escape hatch and no Markdown path") instead of
  weakening the scan — the check keeps its teeth.
- **Files modified:** `studio/src/components/capstone/EvidenceSummary.jsx`
- **Verification:** `capstone-render.test.js` source-scan cases pass for both components.
- **Committed in:** `a8f07ca`

**2. [Rule 1 - Bug] The `en` `warning.count_mismatch` label could not be matched after escaping**
- **Found during:** Task 3 (six-label uniqueness case)
- **Issue:** The label was `The report's counts do not add up.`; React escapes the apostrophe to
  `&#x27;`, so the rendered HTML never contains the catalog string and the label assertion would
  have to know about entity escaping.
- **Fix:** Reworded the English label to `The counts in the report do not add up.` (same meaning).
- **Files modified:** `studio/src/lib/i18n/en/externalEvidence.json`
- **Verification:** all six labels render exactly once (`maps all six codes to six distinct labels`).
- **Committed in:** `a8f07ca`

### Deliberate divergence from the plan's literal wording

**Hostile-paste assertion.** Task 3 asked to assert the HTML does not contain `onerror=`. That
substring legitimately survives React text escaping (it is inert text, not an attribute), so the
test instead asserts the escaped payload is present and the **raw tag** forms are absent:
`&lt;img …` present; `<img`, the full raw payload, and the raw terminator `onerror=alert(1)>`
absent. This is the strictest assertion that is also true; asserting `onerror=` absent would fail
for the correct implementation.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug) + 1 deliberate, documented assertion refinement.
**Impact on plan:** No scope creep. Nothing outside the five owned files changed; the payload contract
and the 09-06 prop contract are exactly as planned.

## Issues Encountered

- `renderToString` cannot fire `onChange` and `FileReader` needs a browser, so "typing re-parses and
  ticks the box" (Task 2 acceptance) is proven two ways instead of by event simulation: the form
  re-derives every render from `text` alone (an empty-state render shows no facts; a text-only
  `result` shows them), and the parse decision itself is the exported pure `evaluateEvidenceInput`.
  The file stays `react-dom/server`-only, as Task 3 requires. The browser read branch remains the
  Manual-Only row in `09-VALIDATION.md`.
- `vi` translations were written fresh (no machine-parity in this file) but are key-identical and
  checked by the untouched `i18n-catalogs.test.js`.

## User Setup Required

None — no new dependency, migration, `DB_VERSION` change or environment variable.

## Verification

- `npm --prefix studio test -- --run test/capstone-render.test.js` → **29 passed / 1 file**
- `npm --prefix studio test -- --run test/capstone-render.test.js test/i18n-keys.test.js test/i18n-catalogs.test.js`
  → **36 passed / 3 files**
- `npm --prefix studio test` → **679 passed / 59 files** (no regression in existing render or i18n tests)
- `git diff --stat` for this plan touches only the five owned files (1045 added lines, 0 removed).

## Next Phase Readiness

- 09-06 can render `<ExternalEvidenceForm result={evidenceResult} onChange={setEvidenceResult} … />`
  above `SubmissionForm`, and must refuse to submit unless `evidenceResult.confirmed === true`.
- 09-06 should merge `computeCapstoneFacts({ files, contentMd })` into the emitted evidence as
  `{ ...evidenceResult.evidence, facts }` before reviewing — the form deliberately does not know
  about spec-code facts.
- Attempt history can reuse `<EvidenceSummary evidence={submission.testResults} compact />` for the
  per-attempt counts, format and warning count.

---

*Phase: 09-playwright-template-and-verify-externally*
*Completed: 2026-10-25*

## Self-Check: PASSED

- All five owned files exist: `ExternalEvidenceForm.jsx` (377 lines), `EvidenceSummary.jsx` (217),
  `en/externalEvidence.json` (57), `vi/externalEvidence.json` (57), `capstone-render.test.js` (337)
- All three task commits exist in history: `cfe4130`, `4550b56`, `a8f07ca`
- `npm --prefix studio test -- --run test/capstone-render.test.js` → 29 passed
- `npm --prefix studio test` → 679 passed / 59 files
