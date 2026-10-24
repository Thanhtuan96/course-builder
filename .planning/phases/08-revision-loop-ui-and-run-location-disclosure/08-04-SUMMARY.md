---
phase: 08-revision-loop-ui-and-run-location-disclosure
plan: 04
subsystem: ui
tags: [react, ssr, i18n, rubric, criteria-delta, vitest]

# Dependency graph
requires:
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 02
    provides: history.js (parseReviewRecord, criteriaDelta, summarizeCriteria, reviewPassed) and REVIEW_STATUSES
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 01
    provides: revision i18n namespace (en + vi) with every status/review/revise/history key
provides:
  - "ReviseButton: the single source of the primary 'Revise this attempt' affordance"
  - "ReviewFeedback: criteria rows, status chips, exactly one Socratic question per unmet criterion, passing-gated CTA"
  - "ReviewMessage: chat_messages row → ReviewFeedback, with a plain-text fallback for malformed content, plus reviewSurface()"
  - "AttemptHistory: collapsible oldest→newest history with met-count summary and per-criterion transitions"
affects: [08-05, 08-06]

actuals:
  tokens: 3100
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Review/history rendering lives in prop-driven, effect-free components so every LOOP assertion is reachable under renderToString"
    - "Status labels use three literal t() branches (never a template key) to stay visible to the i18n key scanner"
    - "Persistence parsing stays in history.js; components call parseReviewRecord and fall back to plain text on null"

key-files:
  created:
    - studio/src/components/revision/ReviseButton.jsx
    - studio/src/components/revision/ReviewFeedback.jsx
    - studio/src/components/revision/ReviewMessage.jsx
    - studio/src/components/revision/AttemptHistory.jsx
  modified:
    - studio/test/revision-review.test.js
    - studio/test/revision-attempt-history.test.js

key-decisions:
  - "ReviseButton accepts onClick as an alias for onRevise and renders null without a handler, which satisfies both the plan's surface-decides rule and the 08-01 contract that passes onClick"
  - "ReviewFeedback decides passing with reviewPassed(criteria) (not the stored passing flag), so a non-passing CTA can never appear for an all-met rubric"
  - "AttemptHistory duplicates the three-branch statusLabel locally instead of exporting a cross-component util for three strings"
  - "reviewSurface(message) is exported from ReviewMessage so TutorPanel can filter quiz reviews without re-parsing content"

patterns-established:
  - "Chip tone mapping: met→success, partial→warning, not_met→neutral (Badge tones only, no new UI primitives)"
  - "No-change attempts render history.noChange instead of an empty transition list"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03]

coverage:
  - id: D1
    description: "Feedback renders one chip row per criterion (Met / Partly met / Not met) and exactly one Socratic question for each unmet criterion, none for a met one"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/revision-review.test.js#ReviewFeedback renders exactly one Socratic question per unmet criterion"
        status: pass
      - kind: unit
        ref: "studio/test/revision-review.test.js#ReviewFeedback renders one row per criterion with a status chip"
        status: pass
    human_judgment: false
  - id: D2
    description: "The revise affordance is a filled primary button labelled 'Revise this attempt' and does not render at all when every criterion is met"
    requirement: "LOOP-01"
    verification:
      - kind: unit
        ref: "studio/test/revision-review.test.js#ReviewFeedback shows no revise action when the criteria all pass"
        status: pass
      - kind: unit
        ref: "studio/test/revision-review.test.js#ReviewFeedback shows the revise action as the primary button when non-passing"
        status: pass
      - kind: unit
        ref: "studio/test/revision-review.test.js#ReviseButton is a primary button carrying the label and hint"
        status: pass
    human_judgment: false
  - id: D3
    description: "A malformed stored review renders as plain text, never as a rubric card and never as a crash"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/revision-review.test.js#ReviewMessage falls back to plain text for malformed content"
        status: pass
      - kind: unit
        ref: "studio/test/revision-review.test.js#reviewSurface reports the record surface and refuses malformed content"
        status: pass
    human_judgment: false
  - id: D4
    description: "Attempt history lists attempts oldest→newest inside <details> with a met-count summary and per-criterion transitions, and no code or text diff"
    requirement: "LOOP-03"
    verification:
      - kind: unit
        ref: "studio/test/revision-attempt-history.test.js#AttemptHistory summarises the met count across two attempts"
        status: pass
      - kind: unit
        ref: "studio/test/revision-attempt-history.test.js#AttemptHistory lists per-criterion transitions"
        status: pass
      - kind: unit
        ref: "studio/test/revision-attempt-history.test.js#AttemptHistory renders no code or diff text"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every literal i18n key used by the four components exists in both en and vi revision catalogs"
    requirement: "LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/i18n-keys.test.js (both cases) + studio/test/i18n-catalogs.test.js"
        status: pass
    human_judgment: false

duration: 6 min
completed: 2026-10-25
status: complete
---

# Phase 8 Plan 4: Review, Revise and Attempt-History Components Summary

**Four prop-driven revision components turn every LOOP-01/02/03 UI assertion into renderToString-ready output: rubric chips with one Socratic question per unmet criterion, a passing-gated filled "Revise this attempt" button, a plain-text fallback for malformed reviews, and a collapsible attempt history carrying met-count summaries plus per-criterion transitions.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-25T00:50:00Z (approx)
- **Completed:** 2026-10-25T00:54:00Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 test files extended)

## Accomplishments

- `ReviewFeedback` renders one `<li>` per criterion with a `Badge` chip (`success`/`warning`/`neutral`), the label exactly once, and a question block only when `status !== 'met'` — the "one question per unmet criterion" invariant is structural, not conditional copy.
- `ReviseButton` is the only place the CTA wording and the primary variant live, so plans 05/06 cannot accidentally render a secondary or always-on revise affordance.
- `ReviewMessage` tolerates legacy/corrupt rows: `parseReviewRecord` returns `null`, the raw content renders as a plain `<p>`, and `reviewSurface()` gives `TutorPanel` a cheap filter that shares the same parse.
- `AttemptHistory` shows `2 → 4 of 5 met` across two attempts, `4 of 5 met` for a lone attempt (no arrow), `q3: Not met → Met`, `q7: new`, `q9: removed`, and `noChange` when nothing moved — all inside `<details>` with "Attempt history (N)".

## Component prop surfaces

| Component | Props |
| --- | --- |
| `ReviseButton` | `{ onRevise?, onClick?, hint?, disabled?, className? }` — renders `null` when neither handler is a function |
| `ReviewFeedback` | `{ criteria?, title?, showRevise?, onRevise?, reviseHint?, className? }` |
| `ReviewMessage` | `{ message, onRevise?, reviseHint?, title? }`; also exports `reviewSurface(message)` |
| `AttemptHistory` | `{ attempts?, title?, defaultOpen?, className? }`, attempts oldest→newest as `{ id?, label?, criteria }` |

## Status-label mapping

`met → t('revision.status.met')` = "Met" (Badge `success`) · `partial → t('revision.status.partial')` = "Partly met" (`warning`) · `not_met → t('revision.status.not_met')` = "Not met" (`neutral`). The three branches are literal `t()` calls in both `ReviewFeedback` and `AttemptHistory` because `i18n-keys.test.js` scans literals only.

## Delta rendering rules

- Attempt 1: `t('revision.history.firstSummary', { to, total })`.
- Later attempts: `t('revision.history.summary', { from: previousMet, to: currentMet, total })`.
- Changes with `kind === 'unchanged'` are dropped. `improved`/`worsened` → `t('revision.history.transition', { key, from, to })`; `added` → `` `${key}: ${t('revision.history.new')}` ``; `removed` → `` `${key}: ${t('revision.history.removed')}` ``.
- Zero surviving changes → `t('revision.history.noChange')` instead of an empty list.

## Literal i18n keys used

`revision.status.met`, `revision.status.partial`, `revision.status.not_met`, `revision.review.empty`, `revision.review.questionLabel`, `revision.revise.label`, `revision.history.empty`, `revision.history.toggle`, `revision.history.attempt`, `revision.history.summary`, `revision.history.firstSummary`, `revision.history.new`, `revision.history.removed`, `revision.history.transition`, `revision.history.noChange` — no new keys invented; all pre-exist in en + vi.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ReviseButton and ReviewFeedback** - `3771804` (feat)
2. **Task 2: Create ReviewMessage with the tolerant fallback** - `ddaf47c` (feat)
3. **Task 3: Create AttemptHistory with the criteria delta** - `a5b791f` (feat)

## Files Created/Modified

- `studio/src/components/revision/ReviseButton.jsx` — primary "Revise this attempt" button plus optional hint; `null` without a handler.
- `studio/src/components/revision/ReviewFeedback.jsx` — criteria rows, tone-mapped chips, one question per unmet criterion, passing-gated CTA, empty state.
- `studio/src/components/revision/ReviewMessage.jsx` — stored review row → `ReviewFeedback`, plain-text fallback, `reviewSurface()`.
- `studio/src/components/revision/AttemptHistory.jsx` — collapsible history with met-count summary, transitions and no-change line.
- `studio/test/revision-review.test.js` — imported `reviewSurface` and added its contract test (existing assertions untouched).
- `studio/test/revision-attempt-history.test.js` — added the identical-attempts/no-change case (existing assertions untouched).

## Decisions Made

- `ReviseButton` treats `onClick` as an alias for `onRevise`; the 08-01 contract passes `onClick`, and the surfaces keep passing `onRevise`.
- `ReviewFeedback` computes `passing` with `reviewPassed(criteria)` even though `ReviewMessage` passes `!record.passing`, so a stored record that contradicts its own criteria still cannot show a revise CTA.
- `AttemptHistory` keeps `statusLabel` local (three strings) rather than exporting a shared util.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1's filtered verify command could not run before Task 2 existed**
- **Found during:** Task 1 (ReviseButton + ReviewFeedback)
- **Issue:** `test/revision-review.test.js` statically imports `ReviewMessage.jsx`, so both `-t "ReviewFeedback"` and `-t "ReviseButton"` runs failed at import time before the Task 2 module existed.
- **Fix:** verified Task 1 with a temporary, never-committed vitest file asserting the same Task 1 acceptance criteria (4 tests, all green), then deleted it; the real file went green (8 tests) as soon as Task 2 landed.
- **Files modified:** none committed (temporary file removed)
- **Commit:** `3771804`

**2. [Rule 1 - Bug] JSDoc wording tripped the literal i18n key scanner**
- **Found during:** Task 3 (full studio verification)
- **Issue:** The comments in `ReviewFeedback.jsx`/`AttemptHistory.jsx` contained a literal `t('…')` example, which `i18n-keys.test.js`'s text regex read as a used key `…`, failing `missing from the English catalogs: …`.
- **Fix:** reworded both comments to `t()` / "translation keys" with no quoted pseudo-key; `i18n-keys.test.js` and `i18n-catalogs.test.js` are green.
- **Files modified:** `studio/src/components/revision/ReviewFeedback.jsx`, `studio/src/components/revision/AttemptHistory.jsx`
- **Commit:** `a5b791f`

## Deferred Issues

Out of scope for this plan (Wave-0 contracts owned by plans 05/06, red before and after these commits):

- `studio/test/revision-runner-notice.test.js` — suite fails at import: `RunnerNotice.jsx` is plan 06's deliverable.
- `studio/test/revision-surfaces.test.js#TutorPanel offers the review action` and four source-order cases in `studio/test/revision-wiring.test.js` — the surfaces are wired by plans 05/06; no surface file was touched here.

## Verification

```
npx vitest run --project studio test/revision-attempt-history.test.js test/revision-review.test.js \
  test/i18n-keys.test.js test/i18n-catalogs.test.js test/tutor-panel.render.test.js
→ Test Files 5 passed (5) · Tests 25 passed (25)
```

- `studio/test/revision-review.test.js` — 9 tests green.
- `studio/test/revision-attempt-history.test.js` — 7 tests green.
- Full studio project: 596 passed, 5 failed — all 5 are the deferred surface/runner-notice contracts above.

## Self-Check

- Files exist: `ReviseButton.jsx`, `ReviewFeedback.jsx`, `ReviewMessage.jsx`, `AttemptHistory.jsx` — verified.
- Commits exist: `3771804`, `ddaf47c`, `a5b791f` — verified via `git log`.
- No `STATE.md` / `ROADMAP.md` / `REQUIREMENTS.md` edits; no surface, repo, prompt, catalog, package or settings file touched.
