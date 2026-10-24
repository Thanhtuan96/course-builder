# Phase 10: Beta Kit and Aggregation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 10-Beta Kit and Aggregation
**Areas discussed:** Aggregation CLI contract, Threshold pre-registration, Kit layout and audience
split, Screener and check-in mechanics

The interactive picker could not be displayed in the worker pane; the orchestrator answered the
discuss gate directly with locked decisions for three areas and delegated the fourth to agent
discretion.

---

## Aggregation CLI contract

| Option | Description | Selected |
|--------|-------------|----------|
| Plain table + machine flag | `<dir> [--json]`; table by default, one JSON document with `--json` | ✓ |
| JSON only | Always emit machine JSON and let the owner pipe it | |
| CSV output | Emit a CSV table for spreadsheet import | |

**User's choice:** `node scripts/beta-aggregate.mjs <dir> [--json]`; reads every `*.json` under the
directory; validates each against the frozen Phase 5 schema (read-only import); invalid files are
listed with the reason and never stop the run; exit 0 when all valid, 1 when any invalid; dedupe by
participant id keeping the highest day offset and warning per dropped duplicate; raw
per-participant counts only, missing export = `unknown`, never percentages.
**Notes:** The orchestrator explicitly banned percentages and averages from the output. The agent
added the optional `--roster <file>` mechanism so "missing export" can be represented when the
folder alone cannot reveal who was recruited.

---

## Threshold pre-registration

| Option | Description | Selected |
|--------|-------------|----------|
| One DRAFT thresholds file | `docs/beta/owner/THRESHOLDS.md`, proposed numbers marked pending owner sign-off | ✓ |
| Numbers inside the decision memo | Thresholds live only in the memo template | |
| Decided by the implementer | Treat the drafted numbers as final | |

**User's choice:** ONE file `docs/beta/THRESHOLDS.md` (placed at
`docs/beta/owner/THRESHOLDS.md` per the locked layout); continue/change/stop numbers are the
owner's decision — draft them from REQUIREMENTS/PROJECT, label them
`DRAFT — PENDING OWNER SIGN-OFF`, include an empty sign-off block (name, date, commit hash); never
present them as decided; the decision-memo template links to THRESHOLDS.md instead of duplicating
numbers.
**Notes:** BETA-05 (≥3 of 3–5 complete a real practice loop) and PROJECT.md's week-2 return metric
are the only authoritative anchors; anything else is a proposal.

---

## Kit layout and audience split

| Option | Description | Selected |
|--------|-------------|----------|
| Indexed owner/participant split | `docs/beta/README.md` + `owner/` + `participant/` | ✓ |
| Flat docs directory | All files directly under `docs/beta/` | |
| Single mega-document | One `BETA-KIT.md` with every section | |

**User's choice:** `docs/beta/README.md` index, `docs/beta/owner/` (check-in script, thresholds,
decision memo template, aggregation how-to) and `docs/beta/participant/` (onboarding one-pager,
screener, consent paragraph, troubleshooting); consent and screener are copy-paste-ready single
blocks; English only.
**Notes:** The split keeps participant-facing text safe to send verbatim and owner-only material
(thresholds, memo) out of the participant's inbox.

---

## Screener and check-in mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Knockout checklist + fit signals | Binary eligibility gates plus a small fit judgement | ✓ (agent discretion) |
| Scored questionnaire | Numeric scoring with a cut-off | |
| Unstructured interview guide | No fixed form | |

**User's choice:** Agent discretion. Chosen: knockout checklist (macOS 13+, Node ≥22.5 for
`node:sqlite`, owns a web project, will run terminal commands, will export twice) plus three fit
signals, all knockouts pass and at least two fit signals true. Check-in script fixes Day 0 / 3–4 /
7 / 14 and asks the three behavioral questions verbatim every time, with Day 7 and Day 14 carrying
the export step and a fixed per-participant answer record.
**Notes:** The three questions are behavioral (shipped artifact, last time stuck, output vs
Claude + notes + editor), not satisfaction ratings, because the cohort exists to test retention and
real output.

---

## the agent's Discretion

- Table column widths/wording, warning phrasing, and script module shape.
- Prose for onboarding, troubleshooting and memo template beyond locked facts and forbidden strings.
- Optional one-line counts total in table mode (no percentages/rates).
- Screener scoring mechanism and check-in answer-record fields.

## Deferred Ideas

- Filled decision memo, cohort table and dogfood notes — Phase 13.
- Vietnamese translation of the kit — future phase.
- `npm run beta:aggregate` alias — root `package.json` owner (Phase 12) at Wave 3.
- GUI/spreadsheet aggregation view — out of scope.
