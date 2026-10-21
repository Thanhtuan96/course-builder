# Phase 5: Beta Data Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 5-Beta Data Foundation
**Areas discussed:** Meaningful-event dictionary, Revision link API, Report schema v1, Schema version + health

---

## Meaningful-event dictionary

| Option | Description | Selected |
|--------|-------------|----------|
| Strict ROADMAP set | Only quiz, recall, answer-for-review, workspace run, exercise/self-check and capstone checkpoint count; lesson-done and app-open record nothing meaningful | ✓ |
| Research table as written | Also treat `lesson_completed` (marking a lesson done) as meaningful for week-2 | |
| Record everything with a meaningful flag | Store lesson-done/app-open rows but exclude them from activation and retention | |

**User's choice:** Strict ROADMAP set, including "each records exactly one event identically in
IndexedDB, memory and SQLite incl. CLI review/import." Lesson done and app open must not count.
**Notes:** ROADMAP success criteria win over research. Enum and meaningful flag are frozen in the
plan. Implied that revision counting must not double-emit an event (links are counted separately).

---

## Revision link API

| Option | Description | Selected |
|--------|-------------|----------|
| Optional `revisionOf` on every attempt write + 72 h inference | Phase 5 stores explicit and inferred links now, no UI callers; Phase 8 wires UI | ✓ |
| Defer all linking to Phase 8 | Add the parameter and table only when the UI exists | |
| Per-table `revises_id` columns | Add a revision column to each attempt table instead of a link table | |

**User's choice:** Optional `revisionOf` on every attempt-creating repo write; store links now;
explicit and 72 h same-artifact inference stored/counted separately; include criterion-4 negative
tests.
**Notes:** Different artifact, attempt-before-feedback, and >72 h must create no link.

---

## Report schema v1

| Option | Description | Selected |
|--------|-------------|----------|
| Strict zod v1 with content-free fields | Unknown keys rejected; enum kinds, numbers, local days only; sentinel-string test | ✓ |
| Tolerant schema | Allow extra fields/additions for later phases | |
| Plain object, no schema | Hand validation only | |

**User's choice:** Strict zod (`unknown keys rejected`), freeze schemaVersion 1 for Wave 2; sentinel
test proves no course text, prompts, code, answers or keys.
**Notes:** Provider must be a category, not a key/URL/model name.

---

## Schema version + health

| Option | Description | Selected |
|--------|-------------|----------|
| Highest applied migration prefix + one shared constant | Health reports 5 after 0005; `schema.js` and `studio-db.js` share the constant; IDB 4 → 5 | ✓ |
| Count of applied migrations | Report the number of rows in `d1_migrations` | |
| Static `SCHEMA_VERSION` only | Keep a hand-maintained literal in both files | |

**User's choice:** Highest applied migration prefix, one shared constant source, IDB `DB_VERSION`
4 → 5, backup/restore round-trips the new tables.
**Notes:** Anything else defaults to the agent's recommended design and is recorded in CONTEXT.md.

---

## the agent's Discretion

- Internal structure/naming inside `events.js`, `metrics.js`, `report.js`; zod error wording.
- Exact D1-compatible DDL details (column order, extra indexes) within the frozen column set.
- Test file split and fixture shapes.

## Deferred Ideas

- Report UI and day-7/day-14 nudges — Phase 7.
- Revision UI, attempt history and criteria delta — Phase 8.
- Playwright external evidence parsing — Phase 9.
- Cohort aggregation and thresholds — Phase 10.
- Optional `run_results.code_json`/`code_hash` columns — later phase if needed.
