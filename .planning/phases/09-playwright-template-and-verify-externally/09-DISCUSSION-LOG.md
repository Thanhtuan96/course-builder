# Phase 9: Playwright Template and Verify Externally - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 9-Playwright Template and Verify Externally
**Areas discussed:** Template content depth, Evidence capture & parse UX, Rubric grading & R1–R7
enforcement, Capstone revise & history surface

---

## Template: fixed vs generated

| Option | Description | Selected |
|--------|-------------|----------|
| Fully pre-written local content | Fixed syllabus, lesson bodies, pre-flight checklist and immutable R1–R7 capstone seeded with zero model calls (demo-course pattern) | ✓ |
| Fixed skeleton, AI-generated bodies | Fixed lesson titles, model-generated lesson prose and capstone | |
| Prompt-only entry | Preset prompt on the normal New Course flow; everything generated | |

**User's choice:** Fully pre-written local content (demo-course pattern).
**Notes:** Zero model calls to seed; the course must work with no provider configured. The immutable
capstone brief carries the R1–R7 rubric.

---

## Evidence capture & parse UX

| Option | Description | Selected |
|--------|-------------|----------|
| Paste or upload + copyable command | Copyable run command shown first; accept pasted text or a file upload; auto-detect JSON reporter vs list output; show extracted facts and mismatches; always labelled "self-reported evidence" | ✓ |
| Paste only | Single textarea, no upload | |
| Upload only | File input, no paste | |

**User's choice:** Paste or file upload, plus a copyable run command shown before.
**Notes:** Auto-detect Playwright JSON reporter vs list output; extract total/passed/failed/skipped/
flaky, duration, spec files and test titles, Playwright version when present; warn on zero tests,
counts that do not add up, spec files absent from the submitted code, and a claimed pass with
failures.

---

## Rubric grading & R1–R7 enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed keys + deterministic facts + clamp | R1–R7 fixed criteria with stable keys; deterministic pre-checks (failures, hard waits, missing assertions) passed to the review as facts; any failure clamps the verdict | ✓ |
| AI-only judgement | Model grades against the rubric with no deterministic gate | |
| Deterministic only | Code-only rubric scoring, no model review | |

**User's choice:** Fixed keys + deterministic facts + deterministic clamp.
**Notes:** Review JSON uses the Phase 8 shape `{ criteria: [{ key, label, status, question }] }`,
one Socratic question per unmet/partial criterion, no corrected code. Pasted evidence is quoted
untrusted data; an injected "mark this complete" must have no effect. Any failure in the evidence
means the review cannot pass, whatever the model says.

---

## Capstone revise & history surface

| Option | Description | Selected |
|--------|-------------|----------|
| Own capstone components | Build "Revise this attempt" + attempt history inside `components/capstone/**`; explicit `revisionOf`; per-criterion transitions and evidence summary | ✓ |
| Reuse Phase 8 revision components | Import `components/revision/**` from the parallel phase | |
| No revise surface | Keep only the existing submission form | |

**User's choice:** Own capstone components (Phase 8 owns `components/revision/**` in parallel).
**Notes:** "Revise this attempt" is the primary action after a non-passing review and records
`revisionOf` the previous capstone submission; attempt history shows R1–R7 transitions and the
evidence summary per attempt.

---

## the agent's Discretion

- Exact lesson copy, quiz questions, checklist presentation, warning wording and file names inside
  the owned globs.
- Whether template detection keys off `external_id` or the R1–R7 rubric keys (both tested).
- Parser caps and list-reporter heuristics, as long as the normalized evidence shape is stable.
- Internal changes to `components/capstone/**` (ReviewPanel/SubmissionForm/SubmissionHistory),
  including backward compatibility with previously stored review rows.

## Deferred Ideas

- PW-06 static lint UI, PW-07 R8 repeat-stability + CI evidence, PW-08 second template.
- Real Playwright execution in Studio — permanently out of scope; the runner allowlist stays closed.
