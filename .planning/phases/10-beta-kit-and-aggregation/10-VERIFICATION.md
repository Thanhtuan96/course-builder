---
phase: 10-beta-kit-and-aggregation
verified: 2026-10-25T00:26:43+09:00
status: passed
score: 10/10 must-haves verified
re_verification: false
gaps: []
---

# Phase 10: Beta Kit and Aggregation Verification Report

**Phase Goal:** The owner has everything needed to recruit, onboard, check in with and analyze a
3–5 person cohort, with decision rules fixed in advance.
**Verified:** 2026-10-25T00:26:43+09:00
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md existed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `docs/beta/` contains an onboarding one-pager (3–5 builders, four weeks, macOS, requirements, what is asked, first steps) | ✓ VERIFIED | `docs/beta/participant/ONBOARDING.md` (39 lines): beta scope, macOS 13+/Node 22.5+/owned web project/terminal, four check-ins and two exports, numbered First steps ending with the consent reply. Links to the other three participant docs. |
| 2 | The macOS screener is one copy-paste block: five knockouts, three fit signals, written decision rule, no numeric score | ✓ VERIFIED | `SCREENER.md` fenced block has knockouts `macOS 13`, `Node 22.5`, `node:sqlite`, owned project, terminal, two exports; three fit signals; rule "Accept only if all five knockouts pass and at least two of three fit signals are true. Reject otherwise — do not score, do not average." Node floor cross-checked against `bin/node-version.js` (22.5.0). |
| 3 | Consent is one sendable paragraph plus collected / never-collected lists derived from the frozen report fields | ✓ VERIFIED | `CONSENT.md`: single blockquote paragraph (four weeks, stop anytime + delete files, local JSON sent by hand); collected bullets mirror activation, active days, `byKind`, revisions, retention, capstone; never-collected names course text, prompts, chat messages, code, answers, provider URLs, model names, API keys, repository ids, notes. |
| 4 | Check-in script fixes Day 0 / 3–4 / 7 / 14 and repeats the three behavioural questions verbatim; export step only on Day 7 and Day 14 | ✓ VERIFIED | Exactly four `## Day` headings; each question occurs 4× verbatim; export instruction appears only under Day 7 and Day 14; record template carries the six fixed columns for Phase 13. |
| 5 | Troubleshooting covers bridge/token, start/port, runner limits, export, and never recommends a relaxation | ✓ VERIFIED | `TROUBLESHOOTING.md` covers all four areas, closes with the pinned sentence "Never widen the allowed browser origins and never disable the agent's permission prompts to make something work. Ask for help instead."; `grep` for `STUDIO_ORIGINS=*`, `--dangerously-skip-permissions`, `STUDIO_ALLOW_NON_LOOPBACK`, `bypassPermissions`, `yolo` under `docs/beta` → none. |
| 6 | Aggregator rejects invalid reports, lists each with a one-line reason, exits 1, and still prints valid rows | ✓ VERIFIED | `invalid/` → exit 1, six `invalid <file>: <reason>` lines on stderr, header-only stdout, summary `0 valid, 6 invalid, 0 duplicate(s)`; `mixed/` → exit 1 with participant C row still on stdout; `--json` sets `ok:false`, `invalid.length === 6`, `participants: []` (mixed keeps C). No `node:internal`, no `    at ` stack frame, no repo path in reasons. |
| 7 | Dedupe keeps the higher `generatedAtDayOffset`, breaks a same-offset tie on the lexicographically greater filename, warns once per drop, never changes the exit code | ✓ VERIFIED | `duplicate/` → exit 0, one row at day 14, warning naming both d7 and d14 files, `duplicates[0]` kept/dropped correct; `duplicate-tie/` → one row, `w2Days` 5 and `source` ending `-b-d9.json`. |
| 8 | Output is raw per-participant counts only; a missing export shows `unknown`; no percentages or derived rates anywhere | ✓ VERIFIED | Valid table columns exactly `participant day activated activeDays loops revisions w1 w2 w2Days capSub capEvidence verdict`; roster F renders eleven `unknown` cells and JSON `null`s with `source: null`; no `%` in any stdout/stderr captured (all fixtures + adversarial runs), no JSON key/header matches `\b(percent|percentage|rate|average|avg)\b`, no `%` outside comments in the source, no division used for derived figures. |
| 9 | Continue / change / stop thresholds and metric formulas are written once, labelled DRAFT with an empty sign-off block, committed before cohort Day 0; the memo links but never restates them | ✓ VERIFIED | `THRESHOLDS.md`: six metric formulas defined from report fields, one three-row Continue/Change/Stop table, `**DRAFT — PENDING OWNER SIGN-OFF**`, empty `- Name:` / `- Date:` / `- Commit:` under `## Sign-off`, no `%`, no "Approved"/"Signed off" line. `DECISION-MEMO-TEMPLATE.md` links `THRESHOLDS.md`, contains no number and no `%`. Committed in `e88f51c`; cohort Day 0 is Phase 13, so the freeze precedes it. |
| 10 | Tests are real black-box CLI tests plus kit-doc guards; the phase file and the full suite are green; scope is confined to Phase 10 Owns | ✓ VERIFIED | `npx vitest run test/beta-aggregate.test.js --project root` → 35/35 passed in 3.12 s (table 3, json 1, invalid 9, usage 8, duplicate 2, roster 4, percentage 2, docs 6); `npm test` → 85 files / 1132 tests passed in 8.91 s. `git diff --name-status develop...HEAD` touches only `docs/beta/**`, `scripts/beta-aggregate.mjs`, `test/beta-aggregate.test.js`, `test/fixtures/beta-reports/**` and `.planning/phases/10-*/**`. No package.json, lockfile, migration or product-source edit; HEAD not merged into `develop`; no remote phase-10 branch. |

**Score:** 10/10 must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `docs/beta/README.md` | Index of the whole kit | ✓ VERIFIED | Links all eight owner/participant docs exactly once (8 targets, 13 relative links across the kit all resolve, zero orphans), `## Before Day 0` checklist names thresholds, screener, consent, reports folder, roster; English-only note. |
| `docs/beta/owner/CHECK-IN-SCRIPT.md` | Day 0 / 3–4 / 7 / 14 script | ✓ VERIFIED | 69 lines; four sections; three questions ×4; export step only on Day 7/14; six-column record template. |
| `docs/beta/owner/THRESHOLDS.md` | Pre-registered thresholds | ✓ VERIFIED | Formulas, three-row outcome table, DRAFT label, empty sign-off, no `%`; sole holder of the numbers. |
| `docs/beta/owner/DECISION-MEMO-TEMPLATE.md` | Memo skeleton | ✓ VERIFIED | Links `THRESHOLDS.md`; per-participant table, outcome pointer, decision block; repeats no threshold and no `%`. |
| `docs/beta/owner/AGGREGATION.md` | Aggregation how-to | ✓ VERIFIED | Three invocations, input conventions (name is convenience, flat folder, optional roster, unknown rows, dedupe), all 12 columns, exit codes 0/1, raw-counts-only rule. |
| `docs/beta/participant/ONBOARDING.md` | One-pager | ✓ VERIFIED | Complete, links resolve. |
| `docs/beta/participant/SCREENER.md` | macOS screener | ✓ VERIFIED | Single paste block with the decision rule; no scoring. |
| `docs/beta/participant/CONSENT.md` | Consent paragraph | ✓ VERIFIED | Sendable paragraph + collected/never-collected lists tied to report fields. |
| `docs/beta/participant/TROUBLESHOOTING.md` | Troubleshooting | ✓ VERIFIED | Four areas + pinned security sentence; no relaxation literal. |
| `scripts/beta-aggregate.mjs` | Read-only CLI | ✓ VERIFIED | 509 lines; shebang, JSDoc, `node:` imports plus one relative `reportSchema` import; exports `parseArgs`, `listReportFiles`, `validateReportFile`, `dedupe`, `readRoster`, `formatTable`, `buildJsonDocument`, `main`; `isMain()` realpath guard; no write/rename/unlink/mkdir call. |
| `test/beta-aggregate.test.js` | Black-box tests + doc guards | ✓ VERIFIED | 669 lines; spawns the real script with an absolute path, asserts exit codes and separated streams; also asserts fixture tree is mtime/size identical after a run, 1 MiB cap, symlink sentinel, D-17 doc guards. |
| `test/fixtures/beta-reports/**` | Literal JSON fixtures | ✓ VERIFIED | 9 directories, 22 files, 19 `*.json` (11 `professor-beta-report-*.json`, `roster.json`, six invalid JSON shapes); hand-written literal JSON, no timestamps, no absolute paths, no random ids; strict schema pin confirmed by the CLI rejecting six invalid shapes with distinct reasons. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `docs/beta/README.md` | 8 owner/participant docs | relative Markdown links | ✓ WIRED | 8 link targets all exist; recursive walk finds no orphan `.md` under `owner/` or `participant/`; all 13 links in the kit resolve. |
| `docs/beta/owner/DECISION-MEMO-TEMPLATE.md` | `THRESHOLDS.md` | relative link | ✓ WIRED | Link present; memo contains no numeric threshold and no `%`. |
| `docs/beta/participant/TROUBLESHOOTING.md` | the D-15 rule | prose sentence | ✓ WIRED | Both guard substrings present in lowercase text; forbidden literals absent from every kit file. |
| `scripts/beta-aggregate.mjs` | `studio/src/lib/beta/report.js` | static import of `reportSchema` (line 21) | ✓ WIRED | Schema imported read-only; no field list re-declared (grep finds no local byKind/revisions object literal). Valid fixtures pass, invalid fixtures fail at the exact expected paths. |
| `test/beta-aggregate.test.js` | `scripts/beta-aggregate.mjs` | `spawnSync(process.execPath, [SCRIPT, ...args])` (line 81) | ✓ WIRED | Real child process, real exit codes; every assertion states status and stream. |
| `test/beta-aggregate.test.js` | `docs/beta/**` | fs reads in the `docs` describe | ✓ WIRED | README link/orphan, four Day sections, three questions, export-only-on-7/14, troubleshooting sentence, DRAFT + empty sign-off, memo link, forbidden literals. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| BETA-02 | 10-01, 10-02 | Beta kit: onboarding one-pager, macOS screener, consent paragraph, Day 0 / 3–4 / 7 / 14 check-in script with three behavioural questions, troubleshooting guide | ✓ SATISFIED | Nine documents under `docs/beta/` (truths 1–5), all indexed and link-checked; `docs` tests guard the exact content contracts. |
| BETA-03 | 10-02 | Aggregation validates reports, dedupes, raw per-participant counts, missing export = unknown, no percentages | ✓ SATISFIED | Truths 6–8; manual CLI runs on valid/invalid/duplicate/missing-export/empty plus adversarial fixtures; 35/35 tests. |
| BETA-04 | 10-01 | Continue / change / stop thresholds written before cohort Day 0 | ✓ SATISFIED | `THRESHOLDS.md` committed in `e88f51c`, DRAFT label with empty sign-off; owner sign-off is a deliberate post-phase human act (D-08), not a missing deliverable. |
| BETA-05 | Phase 13 (context only) | 3–5 participants run the cohort; decision memo | — NOT THIS PHASE | Only used as provenance for the draft numbers; cohort execution and the filled memo belong to Phase 13 (`docs/beta/cohort/**`), correctly absent here. |

No orphaned requirements: ROADMAP maps exactly BETA-02/03/04 to Phase 10, and all three appear in the plans' `requirements` frontmatter.

### Evidence — commands run

All run from the worktree root (`/Users/tuankhuat/Documents/Pet-Projects/course-learning-plugin/.worktrees/phase-10`):

1. `npx vitest run test/beta-aggregate.test.js --project root` → `Test Files 1 passed (1)`, `Tests 35 passed (35)`, 3.12 s.
2. `npm test` → `Test Files 85 passed (85)`, `Tests 1132 passed (1132)`, 8.91 s (root + Studio).
3. CLI on committed fixtures, capturing exit code, stdout and stderr separately:
   - valid → exit 0, two rows (`A`: day 14, yes, 5, 7, `1/0/1/0`, yes, yes, 3, 1, 0, unknown), stderr `2 valid, 0 invalid, 0 duplicate(s)`.
   - invalid → exit 1, six one-line `invalid <file>:` reasons on stderr, header-only stdout.
   - duplicate → exit 0, one day-14 row, one `duplicate participant …` warning naming both files.
   - `missing-export --roster roster.json` → exit 0, A row plus F as eleven `unknown` cells.
   - empty → exit 1, stdout 0 bytes, `no report files in …` on stderr.
4. `grep -n '%'` over every captured stream → no match; `grep` for the absolute worktree path → no match.
5. `node scripts/beta-aggregate.mjs --help` → exit 0 on stdout; no args → exit 1, stdout empty, `Usage:` on stderr.
6. `missing-export` without `--roster` → exit 1 because `roster.json` is scanned and rejected; `mixed --json` → `ok=false`, 1 participant, 1 invalid.
7. Link/guard sweep: 13 relative links, 0 dead; 8 README targets; 0 orphans; four Day sections; each question 4×; no forbidden literal; no `%` under `docs/beta`.
8. Scope: `git diff --name-status develop...HEAD` → only `docs/beta/**`, `scripts/beta-aggregate.mjs`, `test/beta-aggregate.test.js`, `test/fixtures/beta-reports/**`, `.planning/phases/10-*/**`. `git diff --name-only develop...HEAD -- package.json package-lock.json studio/package.json studio/package-lock.json` empty; no `studio/src`, `web/`, `bin/`, `shared/`, migration, `ROADMAP.md`, `STATE.md` change.
9. Branch state: `HEAD` = `gsd/phase-10-beta-kit` (12 commits); `git merge-base --is-ancestor HEAD develop` false (not merged); `git ls-remote --heads origin '*phase-10*'` empty (not pushed); working tree clean.
10. `git merge-tree --write-tree HEAD develop` → exit 0, no conflicts; the 2 commits `develop` has that this branch lacks are Phase 7's own paths (`studio/src/components/data/BetaReportPanel.jsx`, `DataPanel.jsx`, `pages/Home.jsx`, `pages/Settings.jsx`, i18n `betaReport.json`, `studio/test/beta-report-panel*`, planning docs) — no overlap with Phase 10 Owns and no package/lockfile change.

### Adversarial checks (beyond the committed suite)

| Check | Result |
|---|---|
| Extra unknown key nested inside `retention` (`percentReturn`) | Rejected: exit 1, `retention: unrecognized_keys: Unrecognized key: "percentReturn"`, `ok=false`, no participant row. Strict schema holds at depth. |
| Folder also holding `.DS_Store`, `notes.txt`, `report.md`, `.hidden.json` | Ignored silently; only the `valid.json` report counted; exit 0, `1 valid, 0 invalid`. |
| Roster repeating an id that already has an export (A twice + F) | Roster ids collapse; A appears once with its data and file source, F once as `unknown`; no duplicate row, no duplicate warning. |
| Roster id whose only export is invalid | Exit 1; the invalid file is listed **and** that id renders as an all-null `unknown` row (an honest "no valid export"; the invalid listing explains why). |
| Symlinked `.json` pointing at a sentinel file | Exit 1, `invalid link.json: not a regular file`, sentinel content appears in neither stream, the valid row still prints. |
| Subdirectory named `dir.json` | Reported `not a regular file`, exit 1, other participants still print. |
| Folder containing only a roster and no reports | Exit 1, stdout empty, `no report files in <dir>` — the pinned empty-directory contract wins over emitting all-unknown rows. |
| Reports folder passed as a symlink to a real directory | Rejected as `not a directory` (exit 1) unless a trailing slash is used; no false positives, no writes. Low-severity UX edge, noted below. |
| Source scan for derived math | No `%` outside comments, no write/rename/unlink/mkdir call, no division used for output. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | TODO / FIXME / placeholder / "coming soon" under `docs/beta`, the script or the test | ℹ️ None found | No stub docs, no placeholder CLI behaviour. |
| `docs/beta/owner/AGGREGATION.md` | 26 | Says "subfolders are ignored" but does not warn that a symlinked reports folder is rejected without a trailing slash | ℹ️ Info | Purely a UX edge; the documented flat-folder workflow is unaffected. Candidate for a future note or a follow-up ticket, not a Phase 10 gap. |
| `docs/beta/owner/CHECK-IN-SCRIPT.md` / `AGGREGATION.md` | 46–58 / 25 | Kit names exports `professor-beta-report-<participantId>-d<day>.json`; Phase 7 (merged in `develop`) writes the first 8 characters of the id | ℹ️ Info | Filename is explicitly documented as a convenience — identity is the `participantId` inside the file — so aggregation is unaffected. |
| `10-02-SUMMARY.md` | 33 | Claims "22 literal JSON files"; actual inventory is 22 files of which 19 are `*.json` | ℹ️ Info | Summary-only miscount; fixtures and tests are correct. No product impact. |

### Human Verification (deferred, not blocking this phase)

1. **Owner signs the thresholds before cohort Day 0**
   - Test: fill `## Sign-off` in `docs/beta/owner/THRESHOLDS.md` (name, date, commit of the freezing commit) and adjust any number the owner disagrees with first.
   - Expected: the numbers become the pre-registered rule; the `docs` guard still passes once the block is filled (only the empty-block assertions are phase-time).
   - Why human: D-08 makes the numbers an owner decision; the phase deliverable is explicitly the draft plus an empty block.
2. **Screener renders as one scorable block in a real message thread**
   - Test: paste the fenced block from `SCREENER.md` into a macOS Messages/Slack draft.
   - Expected: five knockouts, three fit signals and the decision rule arrive as one paste with nothing to assemble.
   - Why human: copy-paste quality is a judgement call.

### Gaps Summary

No gaps. All three ROADMAP success criteria and all three owned requirements (BETA-02, BETA-03,
BETA-04) are true in the committed code and docs, independently of the summaries: the kit exists with
every mandated document and pinned sentence, the aggregator rejects/dedupes/reports raw counts with
`unknown` for missing exports and no percentage in any stream, and the pre-registered thresholds are
DRAFT with an empty sign-off block before any cohort Day 0. Tests pass at 35/35 (phase file) and
1132/1132 (full suite); scope is limited to Phase 10 Owns plus phase planning artifacts; nothing was
merged into `develop` or pushed.

Observations only (no action required for goal achievement): the reports-folder symlink UX edge, the
`<participantId>` filename wording versus Phase 7's 8-character prefix, and a fixture count typo in
`10-02-SUMMARY.md`. The branch is 2 commits behind `develop` (Phase 7 merged there); `git merge-tree`
is conflict-free and the delta does not touch Phase 10 paths, so the orchestrator's rebase/merge-gate
run of the full suite remains the only outstanding merge-discipline step.

---

_Verified: 2026-10-25T00:26:43+09:00_
_Verifier: Claude (gsd-verifier)_
