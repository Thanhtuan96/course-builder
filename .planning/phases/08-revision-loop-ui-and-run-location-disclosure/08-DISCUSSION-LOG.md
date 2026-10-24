# Phase 8: Revision Loop UI and Run-Location Disclosure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 8-revision-loop-ui-and-run-location-disclosure
**Areas discussed:** Rubric source + feedback format, Revision wiring per surface, Attempt history + criteria delta, Run-location disclosure UX, plus an orchestrator-requested extra task (best-effort event emission)

---

## Rubric source + feedback format

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed per-surface rubric with stable keys | Workspace uses self-check ids, quiz uses question ids, tutor generates once and reuses — real criteria delta | ✓ |
| Model-invented criteria per attempt | Fresh criteria each review; delta becomes meaningless | |
| Course-level rubric stored in data | Needs a schema change/migration — forbidden this phase | |

**User's choice:** Stable criterion keys per task, never invented fresh per attempt. Workspace uses
the exercise self-check ids; quiz uses question ids; tutor review generates criteria once on the first
review of a task, persists them, and reuses the same keys on later reviews. Review output is strict
JSON validated with zod (`{criteria:[{key,label,status:met|partial|not_met,question}]}`, one Socratic
question per unmet/partial), rendered as rows; invalid JSON after one repair retry surfaces a
retryable error. Add the regression test that review output for the learner's own task contains no
corrected code.
**Notes:** A review record is persisted as an assistant `chat_messages` row with `mode: 'review'` and
JSON content including `attemptTable`/`attemptId`, which also matches Phase 5's quiz inference
predicate. Quiz/workspace statuses are deterministic-first so a review always exists without a
provider; only the Socratic questions need the model.

---

## Revision wiring per surface

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit `revisionOf` on the exact feedback row | Quiz retake → assistant review message; tutor → new check_answer message; workspace → next run | ✓ |
| Inferred links only | Rely on the 72 h repo inference; no explicit linkage from the UI | |

**User's choice:** Exactly as proposed. Quiz retake carries `revisionOf` the assistant review message;
tutor sends a new `check_answer` message with `revisionOf` the previous assistant review row;
workspace's next run carries `revisionOf` the failing `run_results` row. "Revise this attempt" is the
primary button only after non-passing feedback.
**Notes:** Quiz falls back to `{feedbackTable:'quiz_attempts', feedbackId:<attempt>}` when no review
message could be stored. Passing attempts show no revision CTA at all.

---

## Attempt history + criteria delta

| Option | Description | Selected |
|--------|-------------|----------|
| Shared inline collapsible panel | One `AttemptHistory` under `components/revision`, rendered in each surface | ✓ |
| Separate drawer per surface | Three bespoke drawers, more code and drift | |
| Full code/text diff | Rich but heavy and not required by LOOP-03 | |

**User's choice:** One shared `AttemptHistory` component under `components/revision`, rendered inline
and collapsible in each surface; show per-criterion transitions between consecutive attempts (e.g.
not_met → met) plus a met-count summary; no code diff.
**Notes:** Pure delta helpers live in `components/revision/history.js` so they are unit-testable
without React.

---

## Run-location disclosure UX

| Option | Description | Selected |
|--------|-------------|----------|
| Badge + pre-run notice + explicit ack | `Browser`/`Local machine`, "Code runs on your machine" before the first local run, acknowledged once | ✓ |
| Badge only | Cheapest, but the learner never sees the trust statement | |
| Modal acknowledgement on every first local run | Intrusive and re-shows on refresh | |

**User's choice:** Badge text `Browser` / `Local machine`; before the first local run show an inline
notice next to Run stating "Code runs on your machine" with an explicit acknowledge action; store the
acknowledgement in persisted Studio settings and re-show it when the runner URL changes; add a test
that the word "sandbox" never appears in local-runner copy (en and vi).
**Notes:** `settings.js` is Phase 6-owned, so the acknowledgement is persisted in `localStorage`
(`professor.runnerNotice.ack`, `{url, acknowledgedAt}`) scoped to `settings.bridge.bridgeUrl`; a URL
change re-shows the notice. The first local Run/Check click is intercepted until acknowledged.

---

## Extra task — best-effort event emission

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort wrapper (approved exception) | Event/revision-link failures after the primary write never reject the learner action | ✓ |
| Leave strict propagation | A metrics bug blocks saving the attempt | |

**User's choice:** Make event emission best-effort in `studio/src/lib/repo/index.js` —
`recordEvent`/`maybeLinkRevision` failures after the primary write must not reject the learner's
action (catch, log in dev, keep validation strict so privacy guards still fail loudly in tests). Add
tests that a failing event write leaves the primary row saved and the call resolved. Editing
`repo/index.js` is an approved ownership exception (no Wave 2 phase owns it).
**Notes:** Only the post-write emission/link calls are wrapped; the primary `put`, returned row and
`emit(...)` behavior stay unchanged. `createCapstoneSubmission` is covered because it shares the path.

---

## the agent's Discretion

- Exact zod wording, internal file split inside `components/revision/**`, status-chip styling, exact
  en/vi copy, and whether quiz/workspace question enrichment calls the provider eagerly or lazily.
- Whether the tutor review action is a quick-action chip or a dedicated button, as long as it is
  reachable without typing and disabled while streaming.

## Deferred Ideas

- Capstone revision UI/history/rubric — Phase 9.
- Code/text diff between attempts — out of scope for LOOP-03.
- Moving the runner acknowledgement into persisted settings/schema — Phase 6 owns `settings.js`.
- Removing the legacy `workspace.localServer`/`workspace.browser` copy keys.
