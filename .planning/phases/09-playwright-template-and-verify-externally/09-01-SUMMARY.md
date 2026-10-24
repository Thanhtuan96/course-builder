---
phase: 09-playwright-template-and-verify-externally
plan: "01"
subsystem: lib
tags: [playwright, evidence-parser, vitest, esm, pure-function, fixtures, security]

# Dependency graph
requires: []
provides:
  - "Pure Playwright reporter detection/parsing module (schema version 1 normalized evidence payload)"
  - "14 static reporter fixtures pinned to @playwright/test@1.64.1 + provenance README"
  - "Closed warning-code set, fact summary and serialized-size clamp for pasted evidence"
affects: [09-02, 09-03, 09-04, 09-05, "phase-10 aggregation", "phase-12"]

# Actuals (#2632) — chars/4 over the realized diff.
actuals:
  tokens: 18022
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Pure synchronous parser module: zero imports, no network/process/eval, string in → normalized payload out"
    - "Fixtures-first: static captures committed before the parser exists; tests never import @playwright/test"
    - "Closed warning-code set with addWarning() dedupe by code"
    - "Byte clamp after count computation: drop tests → specs → excerpt, never stats"

key-files:
  created:
    - studio/src/lib/capstone-evidence.js
    - studio/test/capstone-evidence.test.js
    - studio/test/fixtures/playwright/README.md
    - studio/test/fixtures/playwright/*.json (7)
    - studio/test/fixtures/playwright/*.txt (6)
  modified: []

key-decisions:
  - "JSON normalization groups specs by file (one { file, tests[] } entry per spec file), merging the reporter's per-test `specs[]` nodes; the list path uses the same shape"
  - "detectEvidenceFormat anchors embedded JSON on the last `{\\n  \"config\":` line; a mixed --reporter=list,json paste is parsed as JSON exactly once (plan A4)"
  - "chromiumEvidence treats a green test as status === 'expected' && expectedStatus === 'passed' on already-normalized specs, while stats.passed additionally requires a passed result during the JSON walk"
  - "Text pastes carry no config object, so chromiumEvidence receives { projects: [] }: an all-unnamed green run is 'assumed'"
  - "Skipped list rows store durationMs: null (no duration reported), not 0"
  - "Text stats.project lists distinct non-empty project names; stats.playwrightVersion is null for list/line output"

patterns-established:
  - "Reporter fixtures are static, pinned files; regeneration is a manual, version-locked step and never runs in CI"
  - "Warning nodes are always { code, detail } with detail ≤ 120 chars and codes from EVIDENCE_WARNING_CODES"
  - "Size/privacy guards are asserted on the structured payload with excerpt excluded, because excerpt deliberately mirrors raw reporter text (≤ 2 000 chars)"

requirements-completed: [PW-03]

coverage:
  - id: D1
    description: "JSON reporter paste becomes authoritative counts, version, spec files and Chromium evidence; attachments/stdout/stderr never survive"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#reads counts, version, project and Chromium evidence from a passing run"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#counts a failing run and never stores attachments, stdout or stderr"
        status: pass
    human_judgment: false
  - id: D2
    description: "List and line reporter pastes parse deterministically, including ANSI colour, retries, skipped rows without duration and the older 1.4x layout"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#parses a colourised list paste identically to the plain one"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#derives counts from the summary block for the line reporter"
        status: pass
    human_judgment: false
  - id: D3
    description: "Mismatch warnings (unknown_spec_files, claimed_pass_with_failures, count_mismatch) and the flat self-reported fact summary"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#flags spec files the learner did not submit"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#flags a write-up that claims success over a failing run"
        status: pass
    human_judgment: false
  - id: D4
    description: "Hostile input is bounded (200 000-char parse cap, 32 000-char payload clamp) and the module is statically incapable of executing, spawning or fetching"
    requirement: PW-03
    verification:
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#clamps a hostile 400-test report without losing the counts"
        status: pass
      - kind: unit
        ref: "studio/test/capstone-evidence.test.js#is statically incapable of spawning, fetching or evaluating code"
        status: pass
    human_judgment: false

metrics:
  duration: 8min
  completed: 2026-10-25
  status: complete
---

# Phase 9 Plan 01: Playwright Evidence Parser Summary

**Pure, dependency-free Playwright reporter parser that turns a pasted JSON/list/line run into a 32 KB-clamped, attachment-free evidence payload with a closed warning set**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-24T15:33:00Z (first fixture write, approx.)
- **Completed:** 2026-10-24T15:41:16Z
- **Tasks:** 3
- **Files modified:** 17 (15 fixtures/README + module + test)

## Accomplishments

- 14 static reporter fixtures captured from `@playwright/test@1.64.1` plus a provenance README that
  pins the version, lists the one-off regeneration commands and forbids CI regeneration and
  `@playwright/test` imports from Studio.
- `studio/src/lib/capstone-evidence.js`: zero imports, synchronous, pure; detects `json` / `list` /
  `unknown` and normalizes JSON (nested `suites`), list (incl. colour and 1.4x) and line output.
- Closed warning set implemented with dedupe: `no_tests`, `count_mismatch`, `unknown_spec_files`,
  `claimed_pass_with_failures`, `unrecognized_format`, `truncated`.
- Integrity guard: `stats.expected` is never a pass — `test.fail()` yields `passed: 0` and
  `chromium: 'none'`; a broken config cannot evidence Chromium even with one unnamed project.
- Privacy/size guards: attachments, `errors`, `errorLocation`, `stdout`, `stderr` are dropped by
  construction; the payload is clamped to ≤ 32 000 chars and the excerpt to 2 000.
- 41 focused tests green; full Studio suite 568 passed / 56 files (no i18n or other regressions).

## Task Commits

Each task was committed atomically. Tasks 2 and 3 are TDD, so each has a RED commit followed by a
GREEN commit:

1. **Task 1: Commit the static reporter fixtures with pinned provenance** - `2639a79` (feat)
2. **Task 2 RED: failing tests for detection + JSON reporter path** - `d281e02` (test)
3. **Task 2 GREEN: JSON reporter parsing** - `7a46e31` (feat)
4. **Task 3 RED: failing tests for text path, warnings and size guards** - `9501a00` (test)
5. **Task 3 GREEN: list/line parsing, warnings and fact summary** - `5c1c42d` (feat)

**Plan metadata:** committed separately after this SUMMARY (docs: complete plan).

## Files Created/Modified

- `studio/src/lib/capstone-evidence.js` — detection, parsing, warnings, fact summary, clamp
- `studio/test/capstone-evidence.test.js` — 41 tests: detection, JSON, list/line, warnings, purity, caps
- `studio/test/fixtures/playwright/README.md` — provenance, inventory, regeneration commands
- `studio/test/fixtures/playwright/json-pass.json` — 1 project, 2 green tests, `config.version: '1.64.1'`
- `studio/test/fixtures/playwright/json-fail.json` — 1 pass + 1 `toBeVisible() failed` with attachments/stdout/errors
- `studio/test/fixtures/playwright/json-flaky.json` — retry 0 failed → retry 1 passed, `status: 'flaky'`
- `studio/test/fixtures/playwright/json-multi-project.json` — chromium green + firefox red in one spec
- `studio/test/fixtures/playwright/json-zero-tests.json` — `suites: []`, `errors: ["No tests found"]`
- `studio/test/fixtures/playwright/json-config-error.json` — every test unexpected, `projectName: ''`
- `studio/test/fixtures/playwright/json-expected-failure.json` — `test.fail()`, `stats.expected: 1`
- `studio/test/fixtures/playwright/list-pass.txt` — 2 `✓` rows, 2 passed
- `studio/test/fixtures/playwright/list-fail.txt` — retry row, skipped row without duration, failure body
- `studio/test/fixtures/playwright/list-color.txt` — list-pass wrapped in real SGR escapes
- `studio/test/fixtures/playwright/list-1.4x.txt` — hand-authored layout without `[project] ›`
- `studio/test/fixtures/playwright/line-fail.txt` — `[i/total]` progress lines + summary
- `studio/test/fixtures/playwright/mixed-list-json.txt` — locator containing `{` before a full JSON report
- `studio/test/fixtures/playwright/truncated.json` — report cropped mid-`suites`, no `config` key

## Final Normalized Shape (schema version 1 — cross-phase contract)

```
{
  schemaVersion: 1,
  source: 'external',
  selfReported: true,
  format: 'json' | 'list' | 'unknown',
  reporter: 'json' | 'list' | 'line' | null,
  stats: {
    total, passed, failed, skipped, flaky,          // integers
    durationMs,                                     // integer ms
    playwrightVersion,                              // '1.64.1' | null
    projects,                                       // string[] (lists may be [''] for unnamed)
    chromium,                                       // 'confirmed' | 'assumed' | 'none'
  },
  specs: [{ file, tests: [{ title, project, status, expectedStatus, retryCount, durationMs }] }],
  warnings: [{ code, detail }],
  truncated,                                        // boolean
  excerpt,                                          // ≤ 2000 chars, raw paste head (audit only)
}
```

`specs` is one entry per **file** (the JSON walk merges the reporter's per-test `specs[]` nodes);
tests keep the report's declaration order. `durationMs` is `null` for a skipped list row.

## Warning Codes Implemented (closed set, D-05)

`no_tests`, `count_mismatch`, `unknown_spec_files`, `claimed_pass_with_failures`,
`unrecognized_format`, `truncated` — exported as the frozen `EVIDENCE_WARNING_CODES`, added only via
`addWarning()` (unknown codes are ignored, duplicates by code are dropped, details ≤ 120 chars).

## Clamp Rule and Measured Sizes

- Parse cap: `MAX_EVIDENCE_INPUT_CHARS = 200 000`; slicing sets `truncated: true` + one `truncated`
  warning.
- Collection caps: `MAX_EVIDENCE_SPECS = 50`, `MAX_EVIDENCE_TESTS = 400`, title ≤ 120, file ≤ 200.
- Serialized clamp: while `JSON.stringify(payload).length > 32 000`, drop in order — the last test of
  the last spec, then whole specs from the end, then `excerpt = ''`; set `truncated: true` and ensure
  exactly one `truncated` warning. Counts are computed before the clamp and are never altered.
- Hostile regression case (400 tests × 120-char titles): input **51 979 chars** → payload
  **31 869 chars** (cap 32 000), **126 of 400 tests retained**, `stats.total === 400`,
  `stats.passed === 400`, `truncated: true`, exactly one `truncated` warning.

## Decisions Made

- **Specs grouped by file.** The reporter emits one `specs[]` node per test title; normalizing one
  entry per node would give `specs.length === 2` for a two-test file and conflict with the list path.
  Grouping by file keeps `specs` a file list and preserves declaration order inside each file.
- **Mixed `list,json` is `format: 'json'`** (plan A4, deliberate divergence from RESEARCH §F): the
  JSON report carries the authoritative per-test counts while list rows are lossy. Detection anchors
  on `{\s*"config":` and extraction slices from the **last** `\n{\n  "config":` line, so the locator
  `{ name: "Buy" }` before the report cannot fool it.
- **Unparseable embedded JSON falls back to `unknown`.** If detection says `json` but extraction
  fails, the payload is `format: 'unknown'` + `unrecognized_format` (this is what `truncated.json`
  exercises).
- **`chromiumEvidence(specs, config)` is pair-based on normalized tests** (`status === 'expected' &&
  expectedStatus === 'passed'`), documented as relying on the JSON walk having already required a
  `passed` result before counting `stats.passed`. `'assumed'` requires every green project empty
  **and** `(config.projects ?? []).length <= 1`.
- **Text path passes `{ projects: [] }`**, so a single unnamed project (the 1.4x layout) is
  `'assumed'`, and a line-only paste with no outcomes is `'none'`.
- **Retry grouping by `project|file:line:column`.** A test's rows collapse to one entry: >1 attempt
  with a final pass is `flaky` (retryCount 1), a final fail stays `unexpected`, a skipped row keeps
  `durationMs: null`.
- **Counts from the summary block.** Per-test rows only detect disagreement (`count_mismatch`); the
  summary values win, matching the researched edge-case table.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSON normalization grouped by file instead of one entry per `specs[]` node**
- **Found during:** Task 2 GREEN (first test run: `specs` length 2 instead of 1)
- **Issue:** The plan's wording ("for each `specs[]` entry emit `{ file, tests }`") produces one
  normalized spec per test title, because the JSON reporter emits one `specs[]` node per title. That
  contradicts the `specs: [{ file, tests }]` contract and would differ from the list path.
- **Fix:** Walk into an insertion-ordered `Map` keyed by file and append tests in report order.
- **Files modified:** `studio/src/lib/capstone-evidence.js`
- **Verification:** `json-pass` → 1 spec / 2 tests; `mixed-list-json` → 1 spec / 3 tests.
- **Committed in:** `7a46e31`

**2. [Rule 3 - Blocking] Replaced `RegExp.prototype.exec()` with `String.prototype.match()`**
- **Found during:** Task 3 GREEN (static purity scan failed on its own module)
- **Issue:** The mandated literal `exec(` scan matched `SUMMARY_RE.exec(line)` / `LIST_ROW_RE.exec(line)`,
  which are regex executions, not process execution — but the scan is deliberately a dumb literal.
- **Fix:** Use `line.match(regex)` and `.trim().match(...)`; the source now contains no `exec(`.
- **Files modified:** `studio/src/lib/capstone-evidence.js`
- **Verification:** Purity test passes; 41 tests green.
- **Committed in:** `5c1c42d`

### Notes (not deviations)

- The `LIST_ROW_RE` / `LINE_ROW_RE` literals are single 190+ character lines — the researched
  regexes are copied verbatim and cannot be wrapped without changing their semantics. Existing repo
  files (`studio/src/lib/prompts/capstone.js`, 33 lines > 100 chars) follow the same practice.
- `truncated.json` deliberately has **no** `config` key so no anchor can be used, per the plan; the
  JSON-failure fallback was added anyway so a real cropped paste can never throw.
- Tasks 2 and 3 produced two commits each (test → feat), as required for TDD tasks.

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both are correctness fixes inside the owned file; no scope creep, no contract
change. The stored payload shape matches the plan's "Artifacts this plan produces" section exactly.

## Fixture Provenance (D-23)

All fixtures are **static committed files** captured with `@playwright/test@1.64.1`, recorded in
`studio/test/fixtures/playwright/README.md` together with the regeneration commands. CI never
regenerates them (root `package.json` declares `^1.50.0`, so CI could resolve a different minor), and
Studio code/tests never import `@playwright/test`. `list-1.4x.txt`, `list-color.txt` and
`truncated.json` are hand-authored variants of verified formats (older layout, colour wrapping,
broken paste).

## Task 1 note (fixtures-first ordering)

Task 1 committed **15 inert files** (14 fixtures + `README.md`) which nothing imports. That is
deliberate: Reversibility Gate A required the fixture shapes to be reviewable and revertable for free
before any parser code depended on them. Tasks 2–3 are their only consumers.

## Issues Encountered

- None beyond the two auto-fixes above. The only inter-tool friction was the literal purity scan
  matching `.exec(` (fixed by switching to `.match()`).

## Verification

- `npm --prefix studio test -- --run test/capstone-evidence.test.js` → **41 passed / 1 file**
- `npm --prefix studio test -- --run test/i18n-keys.test.js test/i18n-catalogs.test.js` → **7 passed / 2 files**
- `npm --prefix studio test` → **568 passed / 56 files**
- No `package.json`, lockfile, migration, `STATE.md`, `ROADMAP.md` or other owned-by-others file changed.

## Next Phase Readiness

- The normalized payload and warning codes are frozen for 09-02/09-04 (verdict gate, review prompt)
  and for Phase 10/12 aggregation. Do not rename fields.
- Downstream consumers should call `summarizeEvidenceFacts(evidence, facts)` for display/prompt facts
  and `evidenceWarnings(evidence, { files, contentMd })` for the two submission-level warnings; the
  verdict gate blocks on `unrecognized_format`, `no_tests`, `truncated`, `count_mismatch`,
  `stats.failed > 0`, no Chromium evidence, or an unmet criterion (D-21).
- `stats.chromium === 'assumed'` must be surfaced as "Chromium (assumed)" in 09-04's UI.

---

*Phase: 09-playwright-template-and-verify-externally*
*Completed: 2026-10-25*

## Self-Check: PASSED

- All 17 plan files exist on disk (`capstone-evidence.js`, `capstone-evidence.test.js`, 14 fixtures, README)
- All 5 task commits exist in history: `2639a79`, `d281e02`, `7a46e31`, `9501a00`, `5c1c42d`
- `npm --prefix studio test -- --run test/capstone-evidence.test.js` → 41 passed
- `npm --prefix studio test` → 568 passed / 56 files

