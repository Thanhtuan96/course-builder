---
phase: 10-beta-kit-and-aggregation
status: passed
checked: 2026-10-25
plans: [10-01, 10-02]
revision: e65e842
---

# Phase 10 plan check (re-verification)

Re-check of `10-01-PLAN.md`, `10-02-PLAN.md` and `10-VALIDATION.md` after revision
`e65e842`, against ROADMAP Phase 10 (3 success criteria), REQUIREMENTS BETA-02/03/04,
CONTEXT D-01..D-17, the frozen `studio/src/lib/beta/report.js` schema, and the Owns list.

## Verdict

**PASS.** All three previous blockers and all eight warnings are resolved in the
revised plan text. No regression was found in requirements coverage, scope, task
structure, dependencies, threat-model mapping, or verify-command runnability.
`10-VALIDATION.md` now exists and satisfies the Nyquist existence gate; checks
8a-8d also pass.

## Blocker resolution

| ID | Previous issue | Resolution in the revised text |
|----|----------------|-------------------------------|
| B1 | `percentage` regex `/percent|rate|average|%/i` false-matched `generatedAtDayOffset` | 10-02 must_haves truth 6, T-10-07, the CLI contract, Task 2 action, and Task 3 `percentage` now use `/\b(percent|percentage|rate|average|avg)\b/i` with word boundaries and explicitly state that `generatedAtDayOffset` must pass. The test also asserts `stdout`/`stderr` contain no `%` and walks JSON keys at every depth. |
| B2 | Symlink case asserted exit 0, contradicting the invalid-file exit-1 contract | 10-02 must_haves truth 8, T-10-08, Task 2 action, and Task 3 now assert exit **1**, an `invalid link.json: ... not a regular file` line, the valid `ok.json` row still printing, the sentinel unread, and a JSON `invalid` entry for `link.json` while `participants` still holds the valid report. |
| B3 | `10-VALIDATION.md` missing | `10-VALIDATION.md` now exists (80 lines) with test infrastructure, sampling rate, a per-task verification map for 10-01-01..10-02-03, Wave 0 requirements, manual-only checks, and a sign-off section. 8a: every task has `<automated>`; 8b: no watch/E2E and ~5s quick run; 8c: both waves are 3/3 automated; 8d: no `MISSING` references. |

## Warning resolution

| ID | Previous warning | Resolution in the revised text |
|----|------------------|-------------------------------|
| W1 | `invalid` test assumed every stderr line starts with `invalid `, conflicting with the optional summary line | 10-02 Task 3 now allows each stderr line to be either the summary matching `/^\d+ valid, \d+ invalid, \d+ duplicate\(s\)$/` or an `invalid ` line, and asserts the filename-bearing line separately. |
| W2 | `nested/` fixture was never exercised | 10-02 Task 3 `table` now asserts the `nested` dir exits 0, has exactly one data row (G), and neither stream mentions H or `nested/sub`. |
| W3 | Invalid files + `--json` were untested | 10-02 Task 3 `invalid` now covers invalid + `--json` (exit 1, one parseable document, `ok: false`, six non-empty reasons, empty `participants`, no stack) and mixed + `--json` (one invalid, C still present). |
| W4 | `no report files` was asserted but not pinned | The CLI contract, Task 2 action, acceptance criteria, Task 2 verify and Task 3 now pin `not a directory` and `no report files` as contract substrings and test them. |
| W5 | Troubleshooting security prose was unguarded | 10-01 now pins the exact sentence plus two guard substrings; Task 1 action/acceptance/verify assert both halves, and the 10-02 `docs` describe re-asserts them. |
| W6 | `EVENT_KINDS` import contradicted "vitest and `node:` only" | 10-02 Task 3 now explicitly allows importing `EVENT_KINDS` from `../studio/src/lib/repo/events.js`, noting the chain is pure and needs no dependency/config change. |
| W7 | `duplicate-tie` used the JSON key `week2MeaningfulDays` without specifying the mode | 10-02 Task 3 now states the mode for every assertion: `--json` uses `week2MeaningfulDays === 5` and the `-b-d9.json` source; table mode asserts the `w2Days` cell. |
| W8 | The `%` source check was stricter than the stated acceptance | 10-02 Task 2 now says no `%` outside comments, comments may mention the rule, and the verify strips block/line comments before scanning. Acceptance says "outside comments". |

## Regression check

- **Requirements:** 10-01 still declares BETA-02/BETA-04; 10-02 still declares
  BETA-02/BETA-03/BETA-04. BETA-05 remains correctly deferred to Phase 13.
- **ROADMAP success criteria:** SC1 (kit docs), SC2 (aggregation), SC3
  (thresholds + formulas, draft, sign-off) still each have delivering tasks.
- **Locked decisions:** D-01..D-17 still each have an implementing task; the
  revised text closes the two contract/test contradictions rather than weakening
  D-03, D-05 or D-15.
- **Owns:** `files_modified` is still exactly `docs/beta/**`,
  `scripts/beta-aggregate.mjs`, `test/beta-aggregate.test.js`, and
  `test/fixtures/beta-reports/**`. No package.json, lockfile, ROADMAP/STATE, or
  product-source edits; the schema import remains read-only.
- **Verify commands:** all still runnable from the repo root, including
  `npx vitest run test/beta-aggregate.test.js --project root`; the new
  `not a directory` / `no report files` greps and the comment-stripped source
  check are runnable shell/Node commands.
- **Dependencies:** 10-01 is wave 1 with no deps; 10-02 is wave 2 depending on
  10-01; no cycles or forward references.
- **Task structure:** every task still has files, a specific action, an
  `<automated>` verify, and acceptance criteria.
- **Threat model:** T-10-01..T-10-08 remain mapped to tests; T-10-07 now uses word
  boundaries and T-10-08 now requires exit 1.
- **Zod issue codes:** the asserted codes still match the real `reportSchema`
  (`invalid_value` on `schemaVersion`, `invalid_type` under `loops.byKind`,
  `unrecognized_keys` for the extra key, `invalid_format` on `app.provider`,
  `(root): invalid_type` for `[]`).
- **Fixtures:** the canonical A report is valid; `invalid/broken.json` is the only
  non-parsing JSON; `nested/sub` remains the non-recursive case; the new
  `roster-comma.txt` fixture and its verify are consistent with the existing
  `roster.txt` case.

## Remaining non-blocking notes

- `10-VALIDATION.md` is a plan-time draft: `status: draft`,
  `nyquist_compliant: false`, `wave_0_complete: false`, and the sign-off boxes are
  unchecked. The existence gate and 8a-8d are satisfied; the sign-off is an
  execution/verification-time item, not a plan defect.
- The validation doc's Wave 0 list omits the `mixed` fixture directory; the plan's
  Task 1 creates it and the 10-02-03 "all" row covers it. Minor documentation
  completeness nit.
- The troubleshooting security sentence is guarded by its two halves rather than
  the full exact sentence and its closing position. The action pins the exact
  sentence; the committed guards catch paraphrase of either half. Minor residual.
- 10-02 still creates ~22 tiny literal-JSON fixture files, above the generic
  file-count threshold, but they are one conceptual artifact; no split needed.
- Unchanged doc-guard breadth: README "each once", the Before Day 0 checklist,
  onboarding internal links, the AGGREGATION columns table and the THRESHOLDS
  outcome table are not machine-guarded; Day 0/3-4 "no export" is now guarded, but
  a fifth `## Day 5` section is still not caught by the 0/3-4/7/14 regex.
- DECISION-MEMO "no numbers" is still guarded only by the `%` check.

## What passed

- The phase goal, all three ROADMAP success criteria, and BETA-02/03/04 are
  covered by the two plans.
- Every locked decision D-01..D-17 has an implementing task and a matching guard
  or test.
- Scope, Owns, dependency graph, task structure, verify runnability, threat-model
  coverage and the frozen-schema assertions are all intact after the revision.
