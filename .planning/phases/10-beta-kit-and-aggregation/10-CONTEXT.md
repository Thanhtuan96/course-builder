# Phase 10: Beta Kit and Aggregation - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the operational kit the owner needs to recruit, onboard, run check-ins for and analyze a
3–5 person macOS cohort, with the decision rules fixed before Day 0:

- `docs/beta/**` — indexed kit split into owner-facing and participant-facing docs: onboarding
  one-pager, macOS screener, consent paragraph, Day 0 / 3–4 / 7 / 14 check-in script with the three
  behavioral questions, troubleshooting guide, draft thresholds with an owner sign-off block, a
  decision-memo template, and an aggregation how-to.
- `scripts/beta-aggregate.mjs` — a read-only CLI that validates exported report files against the
  frozen Phase 5 report schema, dedupes per participant, and prints raw per-participant counts.
- `test/beta-aggregate.test.js` + `test/fixtures/beta-reports/**` — fixtures and tests for valid,
  invalid, duplicate and missing-export cases, plus guardrails on the kit docs.

Out of scope: any product UI, the export button itself (Phase 7), the report schema/builder
(Phase 5, consumed read-only), cohort execution and the decision memo's filled-in results
(Phase 13), package.json/lockfile changes, and any migration.
</domain>

<decisions>
## Implementation Decisions

### Aggregation CLI contract
- **D-01:** Invocation is `node scripts/beta-aggregate.mjs <dir> [--json] [--roster <file>]`. The
  script reads every `*.json` file directly under `<dir>` (non-recursive), sorted by filename for
  deterministic output. `--json` switches stdout to one machine-readable JSON document; the default
  is a plain aligned table.
- **D-02:** Every candidate file is validated against the frozen Phase 5 schema
  (`studio/src/lib/beta/report.js` → `reportSchema`) imported read-only. Invalid files are collected
  with a human-readable reason and listed — they never abort the run or hide valid reports.
- **D-03:** Exit codes: `0` when every discovered file is valid (duplicates are warnings, not
  failures); `1` when at least one discovered file is invalid, the directory is missing/empty, or
  usage is wrong. Diagnostics for invalid files go to stderr in table mode and into the `--json`
  document on stdout; the exit code carries the failure.
- **D-04:** Dedupe is by `participantId`, keeping the export with the highest
  `generatedAtDayOffset` (the latest report window) and printing one warning per dropped duplicate
  naming both files. A same-offset tie keeps the lexicographically greater filename so the result is
  stable across runs, and still warns.
- **D-05:** Output is raw per-participant counts only — participant id, export day offset, activated
  flag, active-day count, loop totals, revision counts, week-1/week-2 flags, week-2 meaningful days,
  capstone submissions/evidence/verdict. No percentages, no averages, no derived rate is printed;
  the owner does the arithmetic against THRESHOLDS.md.
- **D-06:** A participant with no export is shown as `unknown`, never omitted silently. Because a
  folder of reports cannot reveal who was recruited, the script accepts an optional
  `--roster <file>` (JSON array of participant ids, or newline/comma-delimited ids) and emits an
  `unknown` row for every roster id with no report. Without a roster only exported participants
  appear, and any field the report itself cannot supply (e.g. `capstone.verdict: null`) renders as
  `unknown`. The roster file is excluded from report scanning when it lives inside `<dir>`.

### Thresholds pre-registration
- **D-07:** Exactly one thresholds document: `docs/beta/owner/THRESHOLDS.md`. It states the metric
  formulas (activation, week-1, week-2 return, practice loop completion, artifact-in-real-project,
  qualitative evidence), the proposed continue / change / stop rule, and one table mapping each
  outcome to its numeric condition.
- **D-08:** The numbers are the owner's decision, not the implementer's. They are drafted from
  REQUIREMENTS.md / PROJECT.md (BETA-05: ≥3 of 3–5 participants complete a real practice loop;
  PROJECT.md success metric: week-2 return = ≥1 meaningful action on days 8–14) and clearly labelled
  **DRAFT — PENDING OWNER SIGN-OFF**, followed by an empty sign-off block (name, date, commit hash).
  No other document presents them as decided.
- **D-09:** `docs/beta/owner/DECISION-MEMO-TEMPLATE.md` links to THRESHOLDS.md and does not repeat
  or reinterpret the numbers; it only records per-participant evidence and the final decision.

### Kit layout and audience split
- **D-10:** `docs/beta/README.md` is the index and links every file with one line of purpose.
  Owner-facing docs live in `docs/beta/owner/`; participant-facing docs in `docs/beta/participant/`.
- **D-11:** `docs/beta/participant/CONSENT.md` and `docs/beta/participant/SCREENER.md` each contain
  one copy-paste-ready block (nothing to assemble): the consent paragraph is a single sendable
  paragraph plus a short bullet list of what is collected; the screener is a single checklist block
  the owner can paste into a message and score in place.
- **D-12:** Kit prose is English only. No Vietnamese translation is added in this phase; a future
  phase can translate without reworking the layout.

### Screener and check-in mechanics
- **D-13:** The macOS screener is a knockout checklist plus fit signals, not a numeric score.
  Knockouts include macOS 13+, Node ≥22.5 available (`node:sqlite`), an existing web project they
  own, willingness to run terminal commands, and willingness to export a report twice. All
  knockouts must pass and at least two of three fit signals must be true; the decision rule is
  written next to the checklist.
- **D-14:** `docs/beta/owner/CHECK-IN-SCRIPT.md` fixes the call schedule (Day 0, Day 3–4, Day 7,
  Day 14), and every check-in includes the three behavioral questions verbatim: what they actually
  shipped/changed in their own project, a walkthrough of the last time they got stuck and what they
  did, and what better output Studio produced versus Claude + notes + editor. Day 7 and Day 14 also
  carry the report-export step. Answers are captured in a fixed per-participant record (date,
  participant id, question, verbatim answer, artifact/export reference) that Phase 13 can copy.
- **D-15:** `docs/beta/participant/TROUBLESHOOTING.md` covers bridge/pairing-token setup, Studio
  start/port issues, local-runner expectations, and report export, and never recommends
  `STUDIO_ORIGINS=*`, `--dangerously-skip-permissions` or any other relaxation.

### Testing
- **D-16:** Fixtures live under `test/fixtures/beta-reports/` with separate directories/cases for
  valid, invalid, duplicate and missing-export input, and roster files where a "missing export"
  needs an expected participant. Fixtures are generated by hand as literal JSON so the test pins
  the frozen schema instead of round-tripping through the builder.
- **D-17:** `test/beta-aggregate.test.js` runs the script as a child process (real exit codes and
  stream separation), asserts table and `--json` output, duplicate warnings, invalid reasons,
  `unknown` rows, and the no-percentages rule. It also asserts the kit invariants: every README
  link resolves, the check-in script contains the three questions for all four check-ins,
  THRESHOLDS.md is marked draft with an empty sign-off block, and the forbidden security strings
  appear nowhere in `docs/beta/**`.

### the agent's Discretion
- Exact table column widths/alignment, warning wording, and the internal module shape of the script
  (single file, small exported helpers for testing).
- Exact wording of the onboarding and troubleshooting prose beyond the locked facts and the
  forbidden-string rule.
- Whether the aggregation script also prints a one-line total of valid/invalid/duplicate counts
  (allowed as long as no percentage/rate appears).

### Folded Todos
None — no pending todos matched this phase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` §"Phase 10: Beta Kit and Aggregation" — goal, owns list, success criteria
- `.planning/REQUIREMENTS.md` — BETA-02, BETA-03, BETA-04 (and BETA-05 for threshold context)
- `.planning/PROJECT.md` §"Business Context" and §"Requirements > Private beta operation" —
  week-2 return definition and the beta kit intent
- `.planning/phases/05-beta-data-foundation/05-CONTEXT.md` — frozen report schema decision (D-11)
- `.planning/phases/05-beta-data-foundation/05-04-SUMMARY.md` — producer/validator lockstep and
  schema field semantics

### Frozen schema (read-only)
- `studio/src/lib/beta/report.js` — `reportSchema` (strict schemaVersion 1) and `buildBetaReport`
- `studio/src/lib/beta/metrics.js` — activation/week/retention definitions the report encodes
- `studio/src/lib/repo/events.js` — `EVENT_KINDS` enum used by `loops.byKind`

### Repository conventions
- `scripts/smoke-pack.mjs` — CLI script style (shebang, JSDoc, exported pure helpers, exit codes)
- `vitest.config.js` — root project includes `test/**/*.test.js`; Studio project runs separately
- `package.json` §engines/scripts — `npm test` entry; this phase adds no script or dependency
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `reportSchema` from `studio/src/lib/beta/report.js`: strict zod v1 validator. Reuse it directly
  so aggregation can never drift from what Studio exports; do not re-declare field lists.
- `scripts/smoke-pack.mjs`: established pattern for a `node scripts/*.mjs` CLI — shebang, top-level
  JSDoc, pure exported helpers, explicit exit codes, no new dependencies.
- `test/fixtures/migrations.sha256.json` + `test/migrations.test.js`: pattern for committed
  fixtures and content-guard tests in the root project.

### Established Patterns
- Root tests import Studio source directly when it is pure (e.g. migration/security tests read
  `studio/migrations`), and root `vitest` resolves `zod` from `studio/node_modules` for such
  imports. No new package entry is needed for a script or docs.
- Owner-facing tooling is not shipped: `scripts/` and `docs/` are outside `package.json` `files`,
  so this phase must not add packaging entries.
- Docs in this repo are plain Markdown with sentence-case headings and no emoji decoration.

### Integration Points
- The script consumes files exported by the Phase 7 "Export beta report" flow
  (`professor-beta-report-<pid>-d<N>.json`), but depends only on the JSON contract, not on Phase 7
  code, so it can be built in parallel.
- THRESHOLDS.md is consumed by Phase 13's decision memo; the memo template only links to it.
- No connection to the server, DB, migrations, or `bin/cli.js`; the script is pure filesystem +
  schema validation.
</code_context>

<specifics>
## Specific Ideas

- Orchestrator-locked decisions from the discuss gate: `docs/beta/{README.md,owner/,participant/}`
  split, one THRESHOLDS.md with a DRAFT sign-off block, `--json` machine output, invalid reports
  listed without stopping the run, highest-day-offset dedupe with warnings, `unknown` for a missing
  export, and never any percentage.
- Keep the owner workflow honest: the kit tells the owner to record what participants actually did,
  not what they say they liked.
</specifics>

<deferred>
## Deferred Ideas

- Filled decision memo, per-participant aggregated table and dogfood notes — Phase 13
  (`docs/beta/cohort/**`).
- Translating the kit into Vietnamese — future phase; layout supports it without rework.
- A `npm run beta:aggregate` script alias — root `package.json` belongs to Phase 12 in Wave 3;
  request it from the owner if wanted.
- A screenshot/GUI aggregation sheet — out of scope; raw table + JSON is enough for 3–5 reports.

### Reviewed Todos (not folded)
None.
</deferred>

---

*Phase: 10-Beta Kit and Aggregation*
*Context gathered: 2026-10-24*
