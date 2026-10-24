---
phase: 08-revision-loop-ui-and-run-location-disclosure
plan: 05
subsystem: ui
tags: [react, ssr, i18n, revision-loop, strict-json, attempt-history, vitest]

# Dependency graph
requires:
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 02
    provides: history.js (buildQuizReview, buildReviewRecord, parseReviewRecord, quizPassed, mergeReviewQuestions, intents, tutorRubricFromReviews), review-request.js and the tutor review schema/builder
  - phase: 08-revision-loop-ui-and-run-location-disclosure
    plan: 04
    provides: ReviewFeedback, ReviewMessage + reviewSurface, AttemptHistory, ReviseButton
  - phase: 05-beta-data-foundation
    provides: saveQuizAttempt/appendChat revisionOf + revision_links write paths
provides:
  - "QuizPanel: deterministic q1..qN review, optional one-call enrichment, persisted review row, passing-gated revise CTA, inline attempt history"
  - "TutorPanel: 'Review my attempt' chip flow, strict-JSON tutor review with persisted rubric reuse, review-specific bad_json retry, revisionOf threading on check_answer, tutor attempt history"
  - "TUTOR_MODES review entry and a literal revision.tutor.reviewAction chip label"
affects: [08-06, phase-09-capstone]

actuals:
  tokens: 6120
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Deterministic-first review: build criteria locally, render immediately, enrich with one provider call inside a 6 s AbortController"
    - "Review writes never touch setError, because that error path replaces the completion card wholesale"
    - "Consume a one-shot revisionOf intent before the await so a failed write cannot leak it forward"
    - "Attempt-history reads filter parsed mode:'review' rows in JS; chat_messages has no mode index"

key-files:
  created: []
  modified:
    - studio/src/components/practice/QuizPanel.jsx
    - studio/src/components/tutor/TutorPanel.jsx
    - studio/src/components/tutor/QuickActions.jsx
    - studio/src/lib/prompts/tutor.js
    - studio/test/revision-surfaces.test.js

key-decisions:
  - "Quiz review record is written after logActivity/onAttemptSaved: the attempt is durable before any review side effect"
  - "Enrichment failure keeps the deterministic criteria and only console.warn's under import.meta.env?.DEV — no retry button, because the next attempt re-derives the review"
  - "normalizeTutorReview returns a criteria array, so the review record is built with criteria: normalized (the plan prose said normalized.criteria, which would have persisted an empty rubric)"
  - "The review user-row appendChat is try/catch-wrapped so a storage failure surfaces as reviewError instead of an unhandled rejection"
  - "A fresh quiz/reset clears the previous review so a stale rubric can never render under a new attempt"

patterns-established:
  - "Surface wiring is thin: read attempts, build criteria, persist one review row, arm/consume one intent — every assertion stays on the prop-driven plan-04 components"
  - "Review rows are self-describing and paired to their attempt by record.attemptId, which is what makes history and revisionOf exact across reloads"

requirements-completed: [LOOP-01, LOOP-02, LOOP-03]

coverage:
  - id: D1
    description: "A non-passing quiz attempt shows ReviewFeedback, a primary Revise this attempt CTA and inline attempt history; a passing attempt shows neither CTA"
    requirement: "LOOP-01, LOOP-02, LOOP-03"
    verification:
      - kind: unit
        ref: "studio/test/revision-surfaces.test.js#QuizPanel renders the question screen without a revise action"
        status: pass
      - kind: unit
        ref: "studio/test/revision-wiring.test.js -t 'QuizPanel declares the revise action'"
        status: pass
    human_judgment: false
  - id: D2
    description: "The tutor offers Review my attempt as a fifth quick action, renders tutor reviews through ReviewMessage, keeps quiz reviews out and shows tutor attempt history"
    requirement: "LOOP-02, LOOP-03"
    verification:
      - kind: unit
        ref: "studio/test/revision-surfaces.test.js#TutorPanel offers the review action"
        status: pass
      - kind: unit
        ref: "studio/test/revision-surfaces.test.js#TutorPanel in capstone mode offers no review action"
        status: pass
      - kind: unit
        ref: "studio/test/revision-wiring.test.js -t 'TutorPanel declares the revise action'"
        status: pass
    human_judgment: false
  - id: D3
    description: "A tutor review is strict JSON with the persisted rubric reused, exactly one repair retry, a review-specific bad_json retry action, and the next check_answer message carries revisionOf"
    requirement: "LOOP-01, LOOP-02"
    verification:
      - kind: unit
        ref: "studio/test/prompts-tutor-review.test.js + studio/test/revision-wiring.test.js -t Intent"
        status: pass
      - kind: manual_procedural
        ref: "grep requestReviewJson in TutorPanel.jsx (no provider.generateJson review path) + revisionOf only when mode === 'check_answer'"
        status: unknown
        rationale: "The live chip → review → revise round trip needs a provider and a DOM; SSR cannot exercise useStream or the composer focus. The verifier must click it once."
    human_judgment: true
    rationale: "The call-budget and record shape are unit-proven, but the end-to-end click path (chip → strict JSON row → Revise → focused check_answer message) is not reachable without a DOM/provider, so one human UAT pass is required."

duration: 6 min
completed: 2026-10-25
status: complete
---

# Phase 8 Plan 5: Revision Loop Wiring in the Quiz and Tutor Surfaces Summary

**Quiz and tutor surfaces now share one loop: a deterministic (provider-optional) review with rubric criteria, one persisted `mode:'review'` row, a passing-gated "Revise this attempt" primary action that arms a one-shot `revisionOf`, and inline attempt history — with the tutor review running as strict JSON against a persisted rubric at a hard two-call budget.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-25T15:55:00Z (approx, first baseline run)
- **Completed:** 2026-10-25T16:01:31Z
- **Tasks:** 3
- **Files modified:** 5 (4 production, 1 test)

## Accomplishments

- `QuizPanel` derives `q1..qN` from the stored answers, paints the review card before any network call, then optionally enriches only the unmet questions with one provider call inside a 6 s abort timer, and persists the final record as an assistant `mode:'review'` chat row.
- `QuizPanel`'s completion card now renders `ReviewFeedback` above the ✓/✗ list and `AttemptHistory` under the action row; the only remaining action button is the secondary "New quiz", so a passing attempt has no revision affordance at all.
- `TutorPanel` gained `runReview`: one review user row (`mode:'review'`), a strict-JSON reply validated against `tutorRubricFromReviews(transcript)`, `normalizeTutorReview` → `buildReviewRecord({ surface:'tutor', attemptTable:'chat_messages', attemptId:userRow.id })`, and a persisted assistant review row. Drift or invalid JSON costs exactly one repair and then a review-specific `ProviderError('bad_json', …)` with a "Try the review again" button.
- The tutor transcript branches on `reviewSurface(message) === 'tutor'`, so tutor reviews render through `ReviewMessage` while quiz reviews keep falling through to `ChatMessage` (Pitfall 7).
- `reviseRevisionOf` threading is exact: `handleRevise` arms `tutorRevisionIntent(review.id)` and focuses the composer in `check_answer`; `runTurn` consumes it only for `mode === 'check_answer'` before the append, so a stray chip click cannot steal the intent.
- Capstone is untouched: the branch still renders only `tutor.capstoneNotice`, and `handleAction` returns immediately when `capstone` is true.

## Review persistence order (quiz)

`persist(questions, answers)` runs in this exact order:

1. `scoreQuiz(questions, answers)`.
2. `consumeRevision(revisionRef)` — consumed **before** the await.
3. `await saveQuizAttempt(lesson.id, { questions, answers, score, total, revisionOf })` → `attempt` row.
4. `await logActivity('quiz', lesson.id)` then `onAttemptSaved?.()` (unchanged).
5. `buildQuizReview(...)` + `setReview({ rowId: null, record })` — deterministic card, zero provider latency.
6. Isolated `try`: `enrichCriteria(...)` (skipped unless `providerReady(settings)` and there is an unmet criterion) → rebuild record → `appendChat(lesson.id, { role:'assistant', content: JSON.stringify(record), mode:'review' })` → `setReview({ rowId: reviewRow?.id ?? null, record })` → `setHistoryKey(k => k + 1)`.
7. `catch` on step 6 logs `console.warn('[quiz] review write failed', err)` **only under `import.meta.env?.DEV`**; it never calls `setError`, so the completion card and the earned criteria stay mounted.
8. Outer `catch` keeps the pre-existing attempt-write `setError`; outer `finally` clears `saving`.

## Enrichment fallback behaviour

- No provider (or `providerReady` false): the deterministic criteria with the localized `revision.quiz.fallbackQuestion` text are returned unchanged — no call, no throw.
- Provider failure (`bad_json`, `wrong_language`, abort, CORS, network): `enrichCriteria` throws, the step-6 catch swallows it, the deterministic criteria remain rendered, and the review row is not written. The revise CTA falls back to `{ feedbackTable: 'quiz_attempts', feedbackId: attempt.id }` via `quizRevisionIntent`.
- The `generateJson` call passes `system`, `messages`, `signal`, `validate` — deliberately **no `language`** option, so a locale retry cannot double the budget (research Pitfall 4).
- Only unmet keys are sent as `validateReviewQuestions(value, { keys: unmetKeys })`; `mergeReviewQuestions` replaces only non-`met` questions with non-empty text and forces `met` to `question: null`.

## Tutor review call budget and rubric reuse

- The review path calls `requestReviewJson` (max 2 `streamText` calls) and never `provider.generateJson`. `grep -n "requestReviewJson\|provider.generateJson" studio/src/components/tutor/TutorPanel.jsx` → only `requestReviewJson` (plus its import).
- First review of a lesson: no rubric exists, so the schema accepts 3–6 criteria and `normalizeTutorReview` assigns `c1..cN`; that list is persisted inside the review record.
- Every later review: `tutorRubricFromReviews(messagesRef.current)` returns the **earliest** tutor review's `{ key, label }` list and is passed to both `buildTutorReviewMessages` (as the fixed rubric block) and `validateTutorReview` (key-set check). Order drift is normalised back to rubric order; key drift/missing/invented fails validation and costs the single repair turn.
- Failure path: `new ProviderError('bad_json', t('revision.review.failed'), t('revision.review.failedHint'))` sets `reviewError`, which renders an `ErrorNotice` plus the `t('revision.review.retry')` secondary button. The `await start(...)` wrapper is a `try { … } catch { /* surfaced via reviewError */ }` because `useStream.start` sets `error` **and rethrows** (useStream.js:98-102).
- An empty transcript short-circuits to `t('revision.tutor.reviewEmpty')` without writing any row.

## revisionOf threading points

| Surface | Armed in | Consumed in | Stored as |
| --- | --- | --- | --- |
| Quiz | `handleRevise` → `armRevision(revisionRef, quizRevisionIntent({ reviewId, attemptId }))` | `persist` → `consumeRevision(revisionRef)` before `saveQuizAttempt` | `chat_messages/reviewId`, falling back to `quiz_attempts/attemptId` |
| Tutor | `handleRevise(rowId)` → `armRevision(revisionRef, tutorRevisionIntent(rowId))` + `setPendingMode('check_answer')` + focus | `runTurn` → `mode === 'check_answer' ? consumeRevision(revisionRef) : null` before `appendChat` | `chat_messages/reviewId` on the user row |

## Attempt history inputs

- Quiz: `listQuizAttempts` (oldest first) paired with parsed assistant `mode:'review'` rows whose `surface === 'quiz'`, matched by `record.attemptId === row.id`; unmatched attempts fall back to `buildQuizReview(decodeQuizAttempt(row))`. Reloads are keyed by `historyKey` after every review write.
- Tutor: the transcript's tutor reviews in order, `criteria` from `parseReviewRecord(message.content)`; rendered under the quick actions only when `!capstone && tutorAttempts.length > 0`.

## Task Commits

Each task was committed atomically:

1. **Task 1: QuizPanel deterministic review, revise CTA and attempt history** — `98c1905` (feat)
2. **Task 2: QuickActions review chip, TUTOR_MODES review entry and ReviewMessage rendering** — `42fe030` (feat)
3. **Task 3: TutorPanel strict-JSON review flow, retry action and revise threading** — `2bbf49e` (feat)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `studio/src/components/practice/QuizPanel.jsx` — +217 lines: local `providerReady`, `enrichCriteria`, review/attempts/historyKey state, revisionRef, rewritten `persist`, attempt-history effect, `handleRevise`, completion-card `ReviewFeedback` + `AttemptHistory`, secondary-only action row.
- `studio/src/components/tutor/TutorPanel.jsx` — +179 lines: review imports/state, `runReview`, transcript `ReviewMessage` branch, `handleRevise`, revisionOf threading, review error + retry UI, `tutorAttempts` memo + `AttemptHistory`, capstone guard in `handleAction`.
- `studio/src/components/tutor/QuickActions.jsx` — review chip label resolved through the literal `revision.tutor.reviewAction` key; hint suffix, `aria-pressed`, `disabled` and `onClick` untouched.
- `studio/src/lib/prompts/tutor.js` — `TUTOR_MODES` gains `{ id:'review', label:'Review my attempt', userText:'Review my attempt against the lesson criteria.' }`; no `MODE_INSTRUCTIONS` entry (4 keys stay 4).
- `studio/test/revision-surfaces.test.js` — quiz case asserts no "Attempt history" on an attempt-free render; capstone case asserts no "Revise this attempt" and no "Attempt history".

## Decisions Made

- **`criteria: normalized`, not `normalized.criteria`.** 08-02 froze `normalizeTutorReview` to return the criteria array; following the plan's prose would have persisted an empty rubric and rendered "Nothing to review yet.".
- **The review user-row write is guarded.** A failed `appendChat` sets `reviewError` and returns without streaming, so no unhandled rejection escapes the click handler.
- **`setReview(null)` on `generate`/`reset`.** Prevents a previous attempt's rubric from lingering under a new quiz (e.g. if the new attempt save fails, the old review must not reappear).
- **Review CTA only via `ReviewFeedback`.** `QuizPanel` never renders `ReviseButton` directly, so "passing means no CTA" (`reviewPassed`) has exactly one enforcement site.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tutor review record would have persisted an empty criteria list**
- **Found during:** Task 3 (TutorPanel review flow)
- **Issue:** The plan snippet used `criteria: normalized.criteria`, but `normalizeTutorReview` returns the array (frozen by 08-01/08-02), so `normalized.criteria` is `undefined` → `buildReviewRecord` stores `criteria: []` → no rubric, no per-criterion delta, and a passing review renders "Nothing to review yet.".
- **Fix:** `buildReviewRecord({ …, criteria: normalizeTutorReview(raw, { rubric }) })`.
- **Files modified:** `studio/src/components/tutor/TutorPanel.jsx`
- **Verification:** `prompts-tutor-review.test.js` (10 tests) confirms the array contract; the record now carries `c1..cN` / the rubric list.
- **Committed in:** `2bbf49e` (Task 3 commit)

**2. [Rule 3 - Blocking] Unguarded review user-row write could raise an unhandled rejection**
- **Found during:** Task 3
- **Issue:** The plan's `runReview` snippet awaited `appendChat` (the user row) outside any try/catch; a storage/adapter failure would reject the floating `runReview()` call from `handleAction`.
- **Fix:** Wrapped the append in `try/catch`, setting `reviewError` and returning before the stream starts.
- **Files modified:** `studio/src/components/tutor/TutorPanel.jsx`
- **Verification:** `revision-surfaces.test.js` (4/4) plus a manual read of the handler paths; every `await` in `runReview` is now inside a catch boundary.
- **Committed in:** `2bbf49e` (Task 3 commit)

**3. [Rule 1 - Bug] Stale review state could survive a new quiz**
- **Found during:** Task 1 (QuizPanel)
- **Issue:** `review` was only overwritten when the next attempt's save completed; a reset or a failed save would leave the previous attempt's criteria bound to the new completion card.
- **Fix:** `setReview(null)` in `generate` and in the seeded/lesson-change effect.
- **Files modified:** `studio/src/components/practice/QuizPanel.jsx`
- **Verification:** `revision-surfaces.test.js#QuizPanel …` and `practice-prompt.test.js` stay green.
- **Committed in:** `98c1905` (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All three keep the plan's stated contracts intact — no prop change, no catalog change, no extra provider call, no capstone affordance. No scope creep.

## Issues Encountered

- **`revision-wiring.test.js` is intentionally still partly red.** Its `CodeWorkspace declares the revise action…` and `CodeWorkspace checks the local-run acknowledgement gate…` cases belong to plan 06, and `revision-runner-notice.test.js` fails at import because `RunnerNotice.jsx` ships in plan 06. The full studio run below shows exactly those three red items and nothing else.
- **Plan-prose API drift on `normalizeTutorReview`.** Recorded above as deviation 1; every other documented signature matched the code.

## Test Results

Gates run from the worktree root (`--project studio`):

1. `test/revision-surfaces.test.js -t "QuizPanel"` → **1 passed | 3 skipped** — PASS
2. `test/revision-wiring.test.js -t "QuizPanel declares the revise action"` → **1 passed | 8 skipped** — PASS
3. `test/practice-prompt.test.js` → **11 passed** — PASS
4. `test/revision-surfaces.test.js -t "TutorPanel"` → **2 passed | 2 skipped** — PASS
5. `test/revision-wiring.test.js -t "TutorPanel declares the revise action"` → **1 passed | 8 skipped** — PASS
6. `test/tutor-panel.render.test.js` → **2 passed** — PASS (four original chips + capstone notice unchanged)
7. `test/i18n-keys.test.js` → **2 passed** — PASS (every literal `revision.*` key exists in en + vi)
8. `test/i18n-keys.test.js test/i18n-catalogs.test.js` → **7 passed** — PASS
9. `test/revision-surfaces.test.js` → **4 passed (4)** — PASS
10. `test/revision-surfaces.test.js test/revision-wiring.test.js -t "Intent"` → **5 passed | 8 skipped** — PASS
11. `test/tutor-panel.render.test.js test/tutor.test.js test/prompts-tutor-review.test.js` → **3 files, 50 passed** — PASS
12. `test/tutor-panel.render.test.js test/tutor.test.js test/practice-prompt.test.js test/prompts-tutor-review.test.js test/i18n-keys.test.js` → **5 files, 63 passed** — PASS
13. Regression `test/beta-revisions.test.js test/tutor-panel.render.test.js test/practice-prompt.test.js` → **3 files, 38 passed** — PASS

**Full studio project:** `Test Files 2 failed | 62 passed (64)` · `Tests 2 failed | 599 passed (601)` — the only red items are plan 06's:

- `test/revision-runner-notice.test.js` (file-level failure: `RunnerNotice.jsx` does not exist yet)
- `test/revision-wiring.test.js > CodeWorkspace declares the revise action before the history affordance`
- `test/revision-wiring.test.js > CodeWorkspace checks the local-run acknowledgement gate before the run starts`

`TUTOR_MODES` count 5 / `MODE_INSTRUCTIONS` 4 / `modeLabel('review') === 'Review my attempt'` verified via a node import. `git diff --stat HEAD~3..HEAD` → exactly 5 files, 395 insertions, 15 deletions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06 owns the two remaining red source-order cases plus the runner notice; nothing in this plan blocks them.
- The `components/revision/**` surface contract is now exercised end-to-end at the wiring level: plan 06 can follow the same read → build criteria → persist one review row → arm/consume intent shape for `CodeWorkspace`.
- The one human UAT gap: a live provider run of chip → review → Revise → `check_answer` message, because SSR cannot drive `useStream`, the composer focus or a stored review row.

---

*Phase: 08-revision-loop-ui-and-run-location-disclosure*
*Completed: 2026-10-25*

## Self-Check

Verification evidence from actual command output:

1. **Files exist** — `QuizPanel.jsx`, `TutorPanel.jsx`, `QuickActions.jsx`, `prompts/tutor.js`, `revision-surfaces.test.js`, `08-05-SUMMARY.md` → all FOUND.
2. **Commits reachable on `gsd/phase-08-revision-loop`** — `98c1905`, `42fe030`, `2bbf49e` → all FOUND via `git log --oneline --all | grep`.
3. **Diff scope** — `git diff --stat HEAD~3..HEAD` → exactly 5 files (4 production + 1 test), 395 insertions, 15 deletions. No `CodeWorkspace.jsx`, `OutputPanel.jsx`, `repo/index.js`, catalog, `package.json`, lockfile, `settings.js`, `ChatMessage.jsx`, `Lesson.jsx` or capstone file touched.
4. **No planning-doc edits** — `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` untouched (orchestrator owns them); the only planning file written is this SUMMARY.
5. **Full studio run** — `Test Files 2 failed | 62 passed (64)` · `Tests 2 failed | 599 passed (601)`; the three red items are exactly plan 06's (`revision-runner-notice.test.js` import, and the two `CodeWorkspace` source-order cases).
6. **Working tree** — `git status --short` clean after the SUMMARY commit.

## Self-Check: PASSED
