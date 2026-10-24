---
phase: 10-beta-kit-and-aggregation
plan: 01
status: complete
requirements:
  - BETA-02
  - BETA-04
files_modified:
  - docs/beta/README.md
  - docs/beta/owner/CHECK-IN-SCRIPT.md
  - docs/beta/owner/THRESHOLDS.md
  - docs/beta/owner/DECISION-MEMO-TEMPLATE.md
  - docs/beta/owner/AGGREGATION.md
  - docs/beta/participant/ONBOARDING.md
  - docs/beta/participant/SCREENER.md
  - docs/beta/participant/CONSENT.md
  - docs/beta/participant/TROUBLESHOOTING.md
commits:
  - bbeeebd: "docs(10): add participant beta kit — onboarding, screener, consent, troubleshooting"
  - e88f51c: "docs(10): add owner beta kit — check-in script, thresholds, memo, aggregation"
  - 4eb7653: "docs(10): index the beta kit from one README"
---

# Phase 10 Plan 01: Beta kit and pre-registered thresholds Summary

**Nine Markdown documents under `docs/beta/` give the owner a complete recruit → screen → consent →
Day 0/3–4/7/14 check-in → aggregate → decide loop, with the continue/change/stop numbers frozen as a
draft awaiting sign-off before cohort Day 0.**

## What was built

Participant set (`docs/beta/participant/`):

- `SCREENER.md` — one copy-paste block: five knockouts (macOS 13+, Node 22.5+ with `node:sqlite`, an
  existing web project, willing to run terminal commands, willing to export twice) plus three fit
  signals, with the written rule "Accept only if all five knockouts pass and at least two of three fit
  signals are true. Reject otherwise — do not score, do not average." No numeric score anywhere.
- `CONSENT.md` — one sendable blockquote paragraph (four weeks, stop at any time and ask for files to
  be deleted, exports are local JSON files sent by hand), then collected-fields bullets that mirror
  the frozen report fields only, then a never-collected list naming course text, lesson content,
  prompts, code, answers, chat messages, provider URLs, model names, API keys, repository ids and
  free-form notes.
- `ONBOARDING.md` — the one-pager: what the beta is (3–5 builders, four weeks, macOS), requirements,
  what is asked (four check-ins, two exports), time cost, what they get, and a numbered "First steps"
  list ending with "read the consent note and reply yes". Links the other three participant documents.
- `TROUBLESHOOTING.md` — pairing token/bridge, start-and-port collisions, local-runner limits (scratch
  directory, no package installs, no network), the export path and file name, and when to ask for
  help. Closes with the pinned security sentence verbatim and recommends no relaxation.

Owner set (`docs/beta/owner/`):

- `CHECK-IN-SCRIPT.md` — how to use (record what happened, never what they liked; verbatim answers),
  a call-schedule table, exactly four sections `## Day 0`, `## Day 3–4`, `## Day 7`, `## Day 14` each
  repeating the three pinned questions verbatim and in order, the export step only in Day 7 and
  Day 14, and the six-column record template Phase 13 copies.
- `THRESHOLDS.md` — the sole holder of the numbers: the `DRAFT — PENDING OWNER SIGN-OFF` label, one
  bullet per metric formula expressed only in report fields, the proposed rule, one three-row
  outcome table (Continue / Change / Stop), the provenance sentence (REQUIREMENTS.md BETA-05 and
  PROJECT.md), and an empty `## Sign-off` block with `- Name:`, `- Date:`, `- Commit:`. No percent
  sign anywhere.
- `DECISION-MEMO-TEMPLATE.md` — links `THRESHOLDS.md`, repeats no number: cohort, per-participant
  evidence table, outcome-vs-thresholds pointer, decision block, what we would change.
- `AGGREGATION.md` — the three invocations, input conventions (name pattern, flat folder, optional
  roster, `unknown` rows, highest-offset dedupe), the full column table, exit codes 0/1, and the
  raw-counts-only rule pointing arithmetic at `THRESHOLDS.md`.

Index: `docs/beta/README.md` links all eight documents once with one line of purpose, carries the
`## Before Day 0` checklist (sign thresholds, screen, written consent, shared reports folder, roster),
and notes the kit is English only for this cohort.

## Pinned strings as written

- `## Day 0`, `## Day 3–4` (en dash), `## Day 7`, `## Day 14`
- `What did you actually ship or change in your own project since we last spoke?`
- `Walk me through the last time you got stuck — what did you do next?`
- `What did Studio produce that was better than Claude + your notes + your editor?`
- `**DRAFT — PENDING OWNER SIGN-OFF** — these numbers are proposals, not decisions.`
- `## Sign-off` with empty `- Name:`, `- Date:`, `- Commit:`
- `Never widen the allowed browser origins and never disable the agent's permission prompts to make something work. Ask for help instead.`
- Export file name `professor-beta-report-<participantId>-d<day>.json`

## Verification

All three plan `<automated>` commands run from the repo root, in order:

1. Participant kit sweep → `participant kit ok` (screener/consent/troubleshooting/onboarding required
   strings present, no forbidden security literal in any participant doc).
2. Owner kit sweep → `owner kit ok` (exactly 4 Day sections, 3/3 questions each, export step in Day 7
   and Day 14, record table present, DRAFT label, empty sign-off lines, no percent sign in
   THRESHOLDS/memo, memo links THRESHOLDS, AGGREGATION covers all three invocations plus exit codes).
3. README invariant sweep → `kit ok: 9 docs, 8 links` (every link resolves, no orphan doc, no
   forbidden literal anywhere under `docs/beta/`).

Extra checks beyond the plan commands:

- All 13 relative links across the nine documents resolve; no non-ASCII Latin text and no emoji in any
  kit file (English-only guard, D-12).
- Day 0 and Day 3–4 sections contain no export instruction; only Day 7 and Day 14 do.
- `AGGREGATION.md` contains no percent sign (D-05 spirit extended to the how-to).
- `git diff --stat package.json package-lock.json` empty; `docs/` and `scripts/` not added to
  `package.json` `files`.
- Working tree after the three task commits holds only the nine new `docs/beta/**` files plus the two
  pre-existing untracked planning files.

## Deviations from Plan

None of Rules 1–4 were triggered: no bug, missing functionality or blocker appeared, and no
architectural decision was needed.

One authoring adjustment, inside the plan's own wording rather than against it: the README
`## Before Day 0` checklist originally repeated two Markdown links to `THRESHOLDS.md` and
`SCREENER.md`. The plan requires each of the eight documents be linked "each once", so the checklist
now names those files in code spans instead of linking them a second time. Link count went from 10 to
8 distinct targets; the automated README sweep still reports `9 docs, 8 links`.

## Self-Check: PASSED

- `docs/beta/README.md`, `docs/beta/owner/{CHECK-IN-SCRIPT,THRESHOLDS,DECISION-MEMO-TEMPLATE,AGGREGATION}.md`,
  `docs/beta/participant/{ONBOARDING,SCREENER,CONSENT,TROUBLESHOOTING}.md` — all nine exist.
- Commits `bbeeebd`, `e88f51c`, `4eb7653` present on `gsd/phase-10-beta-kit`.
