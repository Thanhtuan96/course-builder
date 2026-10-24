# Phase 8: Revision Loop UI and Run-Location Disclosure - Research

**Researched:** 2026-10-24
**Domain:** Studio (React 19 + Vite + Vitest 5) — prompt/schema builders, repo-backed UI wiring, i18n namespaces, SSR-only component tests
**Confidence:** HIGH for every code-level claim (all verified by reading the worktree and by executed experiments); MEDIUM for the two copy/UX judgment calls flagged in Open Questions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Rubric model and review format (LOOP-02)
- **D-01:** Criterion keys are **stable per task, never invented fresh on each attempt**:
  - **Quiz:** one criterion per question of the stored attempt, key `q1…qN` (index+1), label = the
    question text (truncated for display). Status is derived deterministically from the stored
    answers: correct → `met`, incorrect → `not_met`. Partial is never produced for a multiple-choice
    question.
  - **Workspace:** one criterion per exercise self-check of the latest run, key = the check's stable
    identifier (slugged `check.name`, falling back to `check1…checkN`), label = the check name.
    Status: `passed` → `met`, otherwise `not_met`. Deterministic, no provider needed.
  - **Tutor:** the **first** review of a task generates the criteria list once (key `c1…cN` assigned
    in model order, plus the model's label) and persists it inside the stored review record; every
    later review of the same lesson's task re-sends that persisted `{key,label}` list as the fixed
    rubric and must return exactly those keys. Key drift, missing keys or invented keys is invalid
    output (see D-03). — **Reversibility:** costly — the keys are what the criteria delta compares
    across attempts, so changing the scheme later makes existing history incomparable.
- **D-02:** A review is strict JSON, validated with zod, shaped
  `{ criteria: [{ key, label, status: 'met'|'partial'|'not_met', question }] }` where `question` is
  one Socratic question for every unmet **or** partial criterion and `null`/absent for `met`. Reviews
  never contain corrected code, code fences, rewritten learner text, or the final answer — the zod
  schema rejects a `code`/`solution` key, and the prompt repeats the existing `NO_SOLUTION_RULE`
  framing. Schemas and pure builders live in `studio/src/lib/prompts/practice.js` (quiz +
  workspace) and `studio/src/lib/prompts/tutor.js` (tutor) and are exported so tests can validate
  them. Learner code, answers and check output are always wrapped with `wrapUntrusted`.
  — **Reversibility:** one-way — the persisted record shape is what attempt history and any later
  phase (9/12) read.
- **D-03:** One repair retry, then a retryable error: if the model reply is not valid review JSON (or
  the tutor's keys do not match the persisted rubric), the builder re-asks once with the validation
  error; a second failure surfaces `ProviderError('bad_json', …)` with a review-specific message/hint
  built in the component (no `ai/errors.js` edit). The attempt itself is already saved; the review
  panel shows the retry action.
- **D-04:** Quiz and workspace reviews are **deterministic-first**: the criteria and statuses are
  computed locally from the saved attempt, so a review always exists even with no provider. When a
  provider is configured, one call may supply the Socratic `question` text for unmet criteria; when it
  is unavailable or fails, a localized template question is used (one per unmet criterion), so the
  "one Socratic question per unmet criterion" invariant never degrades to silence. Tutor reviews are
  always model-produced (only the model can judge prose) and therefore always go through D-03.

#### Review persistence and rendering
- **D-05:** A quiz or tutor review is persisted as an assistant `chat_messages` row on the lesson with
  `mode: 'review'` and `content` = `JSON.stringify({ surface, attemptTable, attemptId, passing,
  criteria })`. `attemptTable`/`attemptId` pin the review to the attempt it judges (this is what makes
  history pairing exact). This also matches Phase 5's quiz inference predicate, which looks for an
  assistant `chat_messages` row with `mode: 'review'`. No new table, no migration.
- **D-06:** Rendering: `TutorPanel` renders `mode === 'review'` assistant messages through the shared
  `ReviewFeedback` component (rows + status chips + Socratic questions) instead of `ChatMessage`;
  all other messages keep using `ChatMessage`. `ChatMessage` is **not** modified (not owned).
  `QuizPanel` renders the same component above its per-question list. Workspace review rows are
  rendered by `OutputPanel` from the run's checks (deterministic, no review message needed).
  Malformed stored JSON falls back to plain-text rendering, never a crash.

#### Revision wiring (LOOP-01)
- **D-07:** Surface wiring exactly as approved:
  - **Quiz:** after a completed attempt, "Revise this attempt" starts a retake of the **same
    questions** and the resulting `saveQuizAttempt` carries
    `revisionOf: { feedbackTable: 'chat_messages', feedbackId: <review message id> }`, falling back to
    `{ feedbackTable: 'quiz_attempts', feedbackId: <attempt id> }` when no review message could be
    stored. `retake` (without linkage) is no longer a separate primary affordance for a non-passing
    attempt.
  - **Tutor:** after a review with any `not_met`/`partial` criterion, "Revise this attempt" focuses
    the composer in `check_answer` mode; the next user message is appended with
    `revisionOf: { feedbackTable: 'chat_messages', feedbackId: <review message id> }`.
  - **Workspace:** after a Run/Check whose `checks` contain at least one failure, "Revise this
    attempt" arms a pending `revisionOf: { feedbackTable: 'run_results', feedbackId: <that run id> }`
    that the next saved run consumes exactly once, then clears.
- **D-08:** "Primary" means the first, filled button when the feedback is non-passing; "Move on" /
  "New quiz" / next-lesson style affordances become secondary. Passing is:
  quiz `score === total` (and no unmet criterion when a review exists); tutor no unmet/partial
  criterion; workspace all checks passed. When feedback is passing there is **no** "Revise this
  attempt" button at all (LOOP-01 says after non-passing feedback — a passing attempt gets no
  revision CTA).
- **D-09:** The tutor review is a new quick action/mode `review` ("Review my attempt") added to
  `TUTOR_MODES`/`QuickActions`; its reply is the strict JSON review (D-02/D-05). `check_answer`
  keeps today's prose behavior — this phase does not rewrite existing tutor conversation semantics.
  `appendChat` already emits `answer_sent_for_review` for user messages in `review`/`check_answer`
  mode, so no emission change is needed for the new mode.

#### Attempt history and criteria delta (LOOP-03)
- **D-10:** One shared, collapsible `AttemptHistory` component under
  `studio/src/components/revision/`, rendered inline by `QuizPanel`, `TutorPanel` and
  `CodeWorkspace`. It lists attempts oldest→newest with a met-count summary ("2 → 4 of 5 met") and
  the per-criterion transition between consecutive attempts (for example `q3: not_met → met`, or
  "new" for a criterion that did not exist before). No text or code diff.
- **D-11:** Delta inputs per surface: quiz = stored attempts + their review records (paired by
  `attemptId`, falling back to deterministic statuses from the stored answers); tutor = review
  records in transcript order (paired by their `attemptId`); workspace = stored run results decoded
  with `decodeRunResult`, criteria derived from each run's checks. Pure helpers (`criteriaDelta`,
  status summarising, review parse/build) live in `studio/src/components/revision/history.js` and are
  unit-tested without React.

#### Run-location disclosure (LOOP-04)
- **D-12:** Badge text is exactly `Browser` / `Local machine`, from the new `runnerNotice` namespace,
  used by `CodeWorkspace` and `OutputPanel`; the older `workspace.localServer` ("Local server") /
  `workspace.browser` keys stay untouched in the catalogs but are no longer used for these badges.
- **D-13:** Before the first local run, an inline notice next to Run states "Code runs on your
  machine", explains it runs with the learner's own permissions and is not isolated, and offers an
  explicit acknowledge action. The first local Run/Check click is intercepted (nothing runs) until the
  acknowledgement is given; afterwards the notice stays visible as static copy with no acknowledge
  button, and runs proceed normally. Browser runs show the `Browser` badge and no such notice.
- **D-14:** The acknowledgement is persisted in `localStorage` under `professor.runnerNotice.ack` as
  `{ url, acknowledgedAt }`, where `url` is the current `settings.bridge.bridgeUrl` (runner base root,
  read via the existing `runnerBase`/settings defaults, not a new setting). A different runner URL
  re-shows the acknowledgement. Storage helper lives in
  `studio/src/components/revision/runner-notice.jsx` territory (`components/revision/`), is
  try/catch-guarded, and does not edit `studio/src/lib/settings.js` (Phase 6 ownership).
- **D-15:** The word "sandbox" never describes the local runner. A test scans the `runnerNotice`
  catalogs (en + vi) and the local-runner copy rendered by `CodeWorkspace`/`OutputPanel` for
  `/sandbox/i` and fails on a hit. (The HTML preview iframe's `sandbox` attribute and existing source
  comments are not runner copy; the test targets catalog strings and rendered local-runner text.)

#### Best-effort event emission (approved extra task)
- **D-16 (ownership exception, orchestrator-approved 2026-10-24):** `studio/src/lib/repo/index.js` is
  edited in this phase — no Wave 2 phase owns it. After the primary row is written, an event or
  revision-link failure must **not** reject the learner's action: `recordEvent` and
  `maybeLinkRevision` calls in `saveQuizAttempt`, `appendChat`, `saveRunResult` and
  `createCapstoneSubmission` go through a small `try/catch` wrapper that logs in dev and swallows
  otherwise. Validation stays strict: `recordEvent`/`buildRevisionLink` still throw on invalid
  input, so privacy-guard tests that call them directly still fail loudly; only the post-write
  plumbing is tolerant. New tests prove a failing event/revision write leaves the primary row saved
  and the call resolved. — **Reversibility:** reversible — isolated wrappers, no schema or API change.
- **D-17:** Wrapper scope: only the emission/link calls are wrapped. The primary `adapter.put` of the
  attempt/run/message row, the returned row, and `emit(...)` behavior are unchanged.
  `createCapstoneSubmission` is covered too, even though Phase 9 owns capstone UI, because it shares
  the same emission code path.

#### i18n and tests
- **D-18:** New namespace files only: `studio/src/lib/i18n/en/revision.json`,
  `vi/revision.json`, `en/runnerNotice.json`, `vi/runnerNotice.json`. Phase 6's glob auto-merges them;
  no existing catalog file or `i18n/index.js` is edited. New keys are added to **both** languages in
  the same commit (the catalogs test enforces parity).
- **D-19:** New tests match the owned globs only: `studio/test/revision-*.test.js` (components, pure
  history helpers, review rendering, runner notice/ack, the no-"sandbox" copy check) and
  `studio/test/prompts-practice-review.test.js` / `studio/test/prompts-tutor-review.test.js`
  (schemas, builders, repair-retry, `NO_SOLUTION_RULE` presence, no-code-in-review regression).
  Existing `studio/test/practice-prompt.test.js`, `tutor.test.js` and
  `tutor-panel.render.test.js` are not edited (they are outside the owned globs); their assertions
  must keep passing unchanged.
- **D-20:** The no-corrected-code regression test asserts that a review built for a programming task
  (learner code attached as `learner_code`) is rejected when the model returns fenced code, and that
  the accepted review record contains no triple-backtick fence and no `code`/`solution` key.

### Claude's Discretion
- Exact zod error wording, internal file split inside `components/revision/**`, how the status chips
  are styled (reuse `Badge` tones), exact English/Vietnamese copy for the new namespace keys, and
  whether quiz/workspace question enrichment calls the provider lazily or on completion — as long as
  D-04's deterministic-first invariant holds.
- Whether the review action for tutor is a chip or a dedicated button, as long as it is reachable
  without typing and is disabled while another turn streams.

### Deferred Ideas (OUT OF SCOPE)
- Capstone "Revise this attempt", attempt history and rubric rendering — Phase 9 (same repo API,
  its own components).
- Human-readable export/sharing of attempt history and review records — not required by LOOP-03.
- Model-generated criteria for quiz questions/workspace checks beyond the deterministic keys —
  would require a criteria store and belongs to a later phase if the cohort shows the need.
- Any code/text diff between attempts — explicitly out of scope for LOOP-03.
- Moving the runner acknowledgement into persisted settings/schema — Phase 6 owns `settings.js`; this
  phase scopes it to `localStorage` keyed by runner URL.
- Removing the legacy `workspace.localServer` / `workspace.browser` copy keys — they stay in the
  catalogs until a later cleanup phase.
</user_constraints>

## Summary

Phase 8 is almost entirely a **composition** phase: the data contract (`revisionOf`, `revision_links`, `learning_events`), the i18n per-namespace loader and the strict-JSON provider path already exist and are frozen by Phases 5/6. What is missing is (a) review records that ride on `chat_messages` rows with `mode: 'review'`, (b) deterministic-first rubric builders plus one strict-JSON tutor review, (c) prop-driven `components/revision/**` UI, and (d) an honest runner notice with a localStorage acknowledgement. No schema, dependency or settings change is needed, and none is allowed.

Two facts dominate the plan's shape:

1. **The components cannot be tested through their own state.** Studio has no DOM test library; component tests are `react-dom/server` `renderToString` only. `QuizPanel` renders its question screen in SSR (its reducer is initialised from `quiz_seed`; the completion stage is unreachable), `CodeWorkspace` renders only its loading card (`loaded` starts `false`, effects never run), and `TutorPanel` never loads messages. Therefore **every UI assertion LOOP-01/02/03 needs must live on prop-driven components under `studio/src/components/revision/**`**, with the five owned surfaces reduced to thin wiring that is verified at the repo level.
2. **`provider.generateJson` already performs exactly one repair retry** and ends in `ProviderError('bad_json', <validation verdict>)` (verified: two `streamText` calls, message = the validator string). So the review flow must choose deliberately: reuse `generateJson` (one repair, generic repair wording) or implement the same two-call shape over `provider.streamText` (one repair *carrying the validation error*, verbatim D-03). Either way it must never nest a second retry.

Also confirmed by experiment: `studio`'s Vitest project includes only `test/**/*.test.js` — a `*.test.jsx` file is **silently not collected** (55 files run without it, 56 with the `.jsx` variant absent).

**Primary recommendation:** build the phase as (1) pure builders/schemas + pure history/notice helpers, (2) prop-driven review/history/notice components, (3) thin wiring in the five owned surfaces plus the best-effort repo wrapper, (4) catalogs and the test suite — in that order, with Wave 0 adding every test file before implementation.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOOP-01 | After non-passing feedback in quiz, tutor review, workspace check or capstone review, "Revise this attempt" is the primary action | `revisionOf` write paths verified in `repo/index.js:492-523, 633-656, 755-806`; explicit links already tested in `beta-revisions.test.js:94-137, 334-396`; the CTA itself must be a prop-driven `ReviseButton` because the surfaces' completion states are unreachable in SSR (see Pitfalls 1-2) |
| LOOP-02 | Feedback is rubric-anchored per criterion (met/partial/not met + one Socratic question per unmet) and never contains corrected code | Deterministic builders in `prompts/practice.js`, model review in `prompts/tutor.js`; zod 4.6.7 `strictObject` + `superRefine` verified to reject `code`/`solution`, to reject a fence in `label`/`question`, and to enforce "question iff not met"; `wrapUntrusted` already available at `prompts/base.js:99-103` |
| LOOP-03 | Learner can see attempt history and which criteria changed between attempts | Read API verified: `listQuizAttempts` (526-531), `listChat` (659-664), `listRunResults` (809-814), `decodeRunResult` (`runner/history.js:24-48`); delta is pure (no React) and testable; `AttemptHistory` is prop-driven |
| LOOP-04 | Workspace shows Browser vs Local machine badge, states "Code runs on your machine" before the first local run with a one-time acknowledgement, never calls the local runner a sandbox | `describeRunner` returns `{kind, ready, command, label}` (`runner/index.js:50-59`); `runnerBase` gives the loopback-scoped runner root (`runner/local.js:25-29`); `OutputPanel` already receives `runnerInfo` (`OutputPanel.jsx:96`); no existing test asserts "Local server" text (grep: only `describeRunner.label` is `Local server`, unasserted) |
</phase_requirements>

## Standard Stack / Patterns

Everything below is already installed and frozen — this phase adds **no** dependency, no migration, no `DB_VERSION` change.

### Core (reuse, do not add)

| Library | Version | Purpose | Why it is the standard here |
|---|---|---|---|
| react / react-dom | ^19.3.1 | UI | Only renderer in Studio; tests use `renderToString` |
| zod | 4.6.7 (installed) | Strict review schemas | Already the repo's schema idiom: `z.strictObject`, `z.uuid()` in `lib/beta/report.js:18-21` |
| vitest | ^5.0.4 (studio) / ^5.0.5 (root) | Tests | One root config with two projects (`vitest.config.js:88-105`) |
| Badge / Button / Card / Spinner / ErrorNotice / EmptyState | in-repo | Review, chips, CTA, notices | `Badge` tones `neutral/accent/success/warning` (`ui/Badge.jsx:1-6`); `Button` variants `primary/secondary/ghost/danger` (`ui/Button.jsx:2-8`) |

### The five owned components — exact current behavior (verified)

| File | Public props | State that matters | Where an attempt completes / a run is triggered | Where feedback renders |
|---|---|---|---|---|
| `components/practice/QuizPanel.jsx` | `{ lesson, course, onAttemptSaved }` (`:44`) | `useReducer(quizReducer)` seeded from `lesson.quiz_seed` (`:47-50`); `error`, `saving`, `useStream` (`:51-53`) | `next()` on the last revealed question → `persist()` (`:112-116`) → `saveQuizAttempt` (`:93`) then `logActivity` (`:94`) then `onAttemptSaved?.()` (`:95`) | completion card `:156-186`: score line `:160`, per-question ✓/✗ list `:165-177`, actions `:178-183` (`retake` primary at `:179`, `newQuiz` secondary at `:180`) |
| `components/tutor/TutorPanel.jsx` | `{ lesson, course, capstone = false, capstoneBrief = null }` (`:45`) | `messages`/`messagesRef`, `input`, `pendingMode`, `useStream` (`:55-74`) | user turn saved at `:138` (`appendChat(..., {role:'user', content, mode})`); assistant reply persisted by `persistDraft()` (`:119-127`), called after a turn (`:190`), on Stop (`:225-228`) and on unmount (`:129`) | transcript map `:299-301` through `ChatMessage`; streaming draft `:254-257, 302`; quick actions `:318-323`; capstone replaces actions with a notice `:313-317` |
| `components/tutor/QuickActions.jsx` | `{ onAction, disabled, hintLevel, pendingMode }` (`:12`) | none | chip click → `onAction(mode.id)` (`:26`) | label is **dynamic**: `t(\`tutor.mode.${mode.id}\`)` (`:28`) |
| `components/workspace/CodeWorkspace.jsx` | `{ lesson, course }` (`:76`) | `files`, `activePath`, `loaded`, `running`, `output`, `history`, `toolchains` (`:83-91`) | `start(kind)` (`:253-312`): sets `running`, runs `runCode`, then `saveRunResult(...)` (`:286-296`) — **the returned row is discarded today**, then `refreshHistory()` (`:297`) | badge `:438-440` (`workspace.localServer` / `workspace.browser`), needs-command hint `:441-447`, `OutputPanel` `:492`, `HistoryDrawer` `:494-498` |
| `components/workspace/OutputPanel.jsx` | `{ output, runnerInfo = null }` (`:96`) | none | n/a | empty state `:99-110`; runner badge `:115-117` (`workspace.localServer` / `workspace.browser`); `CheckList` `:9-36`; `HtmlPreview` iframe carries `sandbox="allow-scripts"` (`:51-60`) |

Mount points (must not change): `pages/Lesson.jsx:189-195` (`LessonPractice`, `TutorPanel`, lazy `CodeWorkspace`), `components/practice/LessonPractice.jsx:51` (`QuizPanel` with `onAttemptSaved={refresh}`), `pages/Capstone.jsx:304` (`TutorPanel … capstone`).

### Repo write/read API (frozen)

Signatures (all `async`):

```js
// studio/src/lib/repo/index.js
saveQuizAttempt(lessonId, { questions=[], answers=[], score=null, total=null, revisionOf=null }) // :492
listQuizAttempts(lessonId)                                   // :526  → rows ordered created_at asc
appendChat(lessonId, { role, content, mode?, revisionOf? })  // :633  → row
listChat(lessonId)                                           // :659  → rows ordered created_at asc
saveRunResult({ lessonId, fileId=null, runner='browser', language=null,
                stdout='', stderr='', exitCode=null, checks=null, durationMs=null,
                revisionOf=null })                           // :755
listRunResults(lessonId)                                     // :809
listRevisionLinks({ surface, courseId, lessonId, attemptId, revisedId, linkKind }) // :1108
listEvents({ kind, day, surface, courseId, lessonId })       // :1087
recordEvent({ kind, surface, courseId, lessonId, refId, meta, now }) // :1059 (strict)
onChange(handler)                                            // :51   → unsubscribe
```

- `revisionOf` is `{ feedbackTable, feedbackId }`; the table must be in `REVISION_FEEDBACK_TABLES = ['chat_messages','run_results','capstone_submissions','quiz_attempts']` (`events.js:34-39`). Unknown tables are silently ignored (not thrown) by `loadExplicitFeedback` (`index.js:179-187`), which is why `beta-revisions.test.js:535-552` can pass a SQL-ish string safely.
- `appendChat` emits `answer_sent_for_review` and links revisions **only for `role === 'user'` with `mode` in `check_answer`/`review`** (`index.js:636`); `META_WHITELIST.answer_sent_for_review` already allows `mode: 'review'` (`events.js:145`). An assistant `mode:'review'` row emits nothing — exactly what a persisted review needs.
- `maybeLinkRevision` (`index.js:220-283`) writes at most one link per revised row (existing check `:229-230`), explicit first (`:234-253`), else inferred within `REVISION_WINDOW_MS = 72h` (`:100, 258-262`).
- Decoded JSON columns: `quiz_attempts.questions_json/answers_json`, `run_results.checks_json`, `chat_messages.content` (plain TEXT, no length/format constraint — `migrations/0001_init.sql:95-105`). There is **no** `decodeQuizAttempt`; parse `questions_json` yourself with a local try/catch (mirror `parseJsonColumn`, `index.js:819-827`).
- Adapters only allow equality filters on **indexed** fields (`schema.js:127-133`): `chat_messages` indexes only `lesson_id` (`:48-52`), `quiz_attempts` only `lesson_id` (`:33-37`), `run_results` only `lesson_id` (`:73-77`). **Filtering by `mode` in a repo call throws** (verified: `Field "mode" is not indexed on table "chat_messages"`). Always `list*()` then `.filter()` in JS.
- Phase 5 inference predicates (must compose, not fight): quiz feedback = assistant row with `mode === 'review'` created between the prior attempt and the new attempt (`index.js:206-213`, predicate at `:209`); tutor attempts = user rows with `mode` in `['check_answer','review']` (`:101, 160`); workspace = prior `run_results` on the same `file_id` **that has a failing check** (`:163-169, 137-139`).

### AI strict-JSON path (frozen; `ai/**` is Phase 6/out of scope)

- `getProvider(settings)` is async and dynamic-imports the adapter (`ai/index.js:124-173`). Every call site must `await` it — enforced by `test/no-sync-getprovider.test.js:37-57`.
- `provider.generateJson({ system, messages, signal, validate, language })` is built by `createGenerateJson` (`ai/provider-utils.js:36-87`):
  1. `streamText(...)` once (`:39`), `coerce` = `extractJson` + `validate` (`:93-107`).
  2. On failure, **one** repair call with a **generic** instruction (`REPAIR_INSTRUCTION`, `:17-19`, used at `:44-49`).
  3. Second failure → `providerError('bad_json', <the validator's string>)` (`:54`).
  4. If `language` is set, a second *independent* retry may run for wrong language (`:64-83`) → ends in `wrong_language`.
- **Verified experimentally** with a fake `streamText`:
  - always-invalid JSON → exactly **2** calls, thrown `ProviderError{code:'bad_json', message:'<validator verdict>'}`;
  - the repair user message is the generic `REPAIR_INSTRUCTION`, **not** the validation error;
  - with `language: 'vi'` and English replies → 2 calls then `wrong_language`.
- `useStream.start(run)` accepts any promise and gives `{ onText, signal }` (`ai/useStream.js:59-106`); `text` stays `''` when `run` returns a non-string (so a JSON review produces **no** streaming draft bubble), `status` goes `streaming → done|error|stopped`, aborts become `status:'stopped'` (`:91-103`).
- `ErrorNotice` shows a caller-supplied `message`/`hint` **untouched** and localises only default `ERROR_HINTS` (`ui/ErrorNotice.jsx:13-19`) — so D-03's "review-specific message/hint built in the component" works by constructing `new ProviderError('bad_json', t('revision.review.failed'), t('revision.review.failedHint'))`.

### i18n mechanics (frozen; only new namespace files are allowed)

- `import.meta.glob('./{en,vi}/*.json', { eager: true })` (`i18n/index.js:36`) → `mergeCatalogModules` (`:22-34`) → `CATALOGS` (`:38`). A new `en/revision.json` + `vi/revision.json` pair merges with **no** code edit; `*_LANGUAGE` list derives automatically (`:41`).
- `translate(language, key, params)` (`:100-109`): splits the key on `.`, falls back to English, then **returns the key itself**. Verified: `translate('en','tutor.mode.review') === 'tutor.mode.review'` — a missing key is a visible bug, not a crash.
- `useT()` binds `settings.language` and re-renders on settings change (`:140-144`); `catalogKeys(language)` flattens a catalog for parity tests (`:121-133`).
- `test/i18n-catalogs.test.js`: namespace **file** parity across en/vi (`:58-63`), per-namespace key parity via `flattenKeys` (`:65-76`), global key-set parity (`:78-83`). Adding `revision`/`runnerNotice` to one language only fails immediately.
- `test/i18n-keys.test.js` walks `src/**` for `.js|.jsx` **skipping the `i18n` directory** (`:19`), and regex-scans **literal** `t('…')` / `t("…")` only (`:30`). Consequences:
  - every literal key in new `components/revision/**` must exist in both catalogs;
  - **template-literal keys are invisible to the scanner** — `t(\`tutor.mode.${mode.id}\`)` (`QuickActions.jsx:28`) is why `tutor.mode.review` can go missing without a test failure (see Pitfall 3);
  - avoid a leading-dot or backtick-only style; keep keys flat/nested consistently with existing files (e.g. `practice.json` nests `quiz.*`).
- Existing legacy keys `workspace.localServer` = "Local server" / `workspace.browser` = "Browser" (`en/workspace.json:2-3`) stay untouched and simply stop being used for the badges.

### Runner disclosure facts

- `describeRunner(language, { toolchains })` → `{ id, label, kind, ready, command? }`; browser languages return `{kind:'browser', ready:true, label:'Browser'}`, others `{kind:'local', label:'Local server', ready:Boolean(toolchains?.[command]), command}` (`runner/index.js:50-59`). `runner-selection.test.js:26-30` asserts only `kind/ready/command` — **`label` is unasserted**, so leaving it alone is safe and cheapest.
- `runnerBase(settings)` = `${settings.bridge.bridgeUrl || settings.bridgeUrl || DEFAULT_BRIDGE_URL}/api/studio/run`, trailing slash stripped, and it **throws** (`assertLoopbackBridgeUrl`) for a non-loopback URL (`runner/local.js:25-29`, `settings.js:47-50`).
- `settings.bridge.bridgeUrl` default is `'http://localhost:3000'` (`settings.js:86`) → ack scope string `http://localhost:3000/api/studio/run`.
- `CodeWorkspace` computes `runnerInfo` from the **active file's** language (`:423`) and passes it to `OutputPanel` (`:492`); `OutputPanel` also shows a needs-server hint in its empty state (`:103-107`).
- Current rendered strings (verified by `renderToString`): `OutputPanel` with `runnerInfo.kind === 'local'` renders exactly `Local server`; with `runner: 'browser'` it renders `Browser`. No test asserts these strings (grep over `studio/test/`).

### Test harness facts

| Property | Value |
|---|---|
| Framework | Vitest `5.0.5` (root) / `5.0.4` declared in `studio/package.json` |
| Config | single root `vitest.config.js` with projects `root` and `studio` (`:88-105`); **no** `studio/vitest.config.*` exists |
| Include | `test/**/*.test.js` for both projects (`:93, :103`) — **`.test.jsx` is not collected** (verified: adding one kept `Test Files 55`) |
| Root command | `npm test` → `vitest run` (root project + studio project) |
| Studio-only command | `npx vitest run --project studio` |
| Component rendering | `react-dom/server` `renderToString(createElement(X, props))` — no DOM, no `@testing-library` |
| Repo setup pattern | `repo.useAdapter(createMemoryAdapter())` in `beforeEach` (`tutor-panel.render.test.js:11-13`) |
| Adapter limits | memory adapter enforces indexed-field filters (`memory-adapter.js:65-70`) |
| Baseline | `npx vitest run --project studio` → **55 files / 527 tests passing** |

Existing tests at risk when the five components change (all verified by reading them):

| Test | Assertion | Risk |
|---|---|---|
| `tutor-panel.render.test.js:17-25` | HTML contains `Tutor`, `Explain simpler`, `Give me a hint`, `Check my answer`, `Quiz me`; not `reveal solution` / `show answer` | Low — adding a fifth chip is additive; **do not** remove the four existing labels |
| `tutor-panel.render.test.js:27-33` | capstone mode contains `Capstone mode`, lacks `give me a hint` / `check my answer` | Low — `QuickActions` is not rendered in capstone (`TutorPanel.jsx:313-324`) |
| `practice-prompt.test.js` | exports `QUIZ_COUNT`, `buildQuizMessages`, `validateQuiz`, `quizReducer`, `scoreQuiz`, … | Medium — only if existing names/semantics change. They must not; add new exports |
| `tutor.test.js:55-59, 280-343` | `NO_SOLUTION_RULE` present in system prompts; capstone rules unchanged; red-team requests stay in messages | Medium — `buildTutorMessages` must keep its current signature/behavior. New review builder is a **separate** export |
| `beta-revisions.test.js` (whole) | explicit/inferred link shapes, 72h window, adapter parity guard | Low — D-16 wrappers only change failure paths |
| `beta-privacy.test.js:85-129` | `repo.recordEvent(...)` with bad meta **rejects** and writes nothing | Medium — the D-16 wrapper must wrap the *call sites*, never `recordEvent` itself |
| `test/studio-capstone-migration.test.js:222-266` | real SQLite explicit link, `attempt_id: null` when no prior attempt | Low |
| `runner-selection.test.js:26-30` | `describeRunner` shape | Low — leave `label` alone |
| `i18n-keys` / `i18n-catalogs` | literal keys + namespace parity | High — every new key must land in both languages in one commit |
| `no-sync-getprovider.test.js:37-57` | every `getProvider(` must be awaited | Medium — new tutor review path must `await getProvider(...)` |
| `settings-csp.test.js` | `index.html` CSP unchanged | None — no CSP edit needed (localStorage is not CSP-relevant; loopback origins already allowed) |

## Architecture Patterns

### Recommended file layout (all newly owned)

```
studio/src/components/revision/
├── ReviewFeedback.jsx      # prop-driven: criteria rows, status chips, one question per unmet, Revise CTA
├── AttemptHistory.jsx      # prop-driven, collapsible: met-count summary + per-criterion transitions
├── ReviseButton.jsx        # single source of the "primary when non-passing, absent when passing" rule
├── ReviewMessage.jsx       # parses one chat_messages row → ReviewFeedback or plain-text fallback
├── RunnerNotice.jsx        # badge + "Code runs on your machine" + acknowledge action
├── runner-notice.jsx       # ack storage helpers (read/write/needs) + RUNNER_ACK_KEY  (D-14 location)
├── history.js              # PURE: parseReviewRecord, buildQuizReview, workspaceCriteria, criteriaDelta, summary
└── review-request.js       # OPTIONAL (only if D-03 must be literal): one-repair streamText wrapper
```

Naming follows `AGENTS.md` (kebab-case files, `.jsx` for components, `.js` for pure modules). Splitting is Claude's discretion per CONTEXT; the split above exists so that **every UI assertion can be made against a prop-driven component**.

### Pattern A — review record as an assistant `chat_messages` row (no schema change)

```
content = JSON.stringify({
  surface: 'quiz' | 'tutor' | 'workspace',
  attemptTable: 'quiz_attempts' | 'chat_messages' | 'run_results',
  attemptId: string | null,
  passing: boolean,
  criteria: [{ key, label, status:'met'|'partial'|'not_met', question: string|null }]
})
role='assistant', mode='review'
```

Why it composes: assistant rows never emit events (`repo/index.js:636`), quiz inference already looks for assistant `mode:'review'` (`:209`), and `content` is unconstrained TEXT in both IDB and SQLite (`0001_init.sql:95-105`). Parsing is defensive: `parseReviewRecord(content)` returns `null` on any malformed JSON/shape, and the renderer then falls back to plain text (D-06).

**Watch item:** `findInferenceFeedback` does **not** check the review's `surface`. A *tutor* review row created between a quiz attempt and the next quiz attempt can become the inferred quiz feedback. That is acceptable for the metric (it is still feedback) but means the **UI must filter by the parsed `surface`**, not by `mode` alone, when pairing reviews to attempts.

### Pattern B — deterministic-first review (quiz, workspace)

```
attempt saved → criteria = buildQuizReview({ questions, answers, questionText })
             → optional provider enrichment of `question` for non-met criteria
             → appendChat({ role:'assistant', mode:'review', content: JSON.stringify(record) })
```

- Criteria keys/statuses are 100% local (D-01, D-04): `q1..qN` for quiz, slugged check name for workspace, statuses from `answers[i] === q[i].answerIndex` / `check.passed`.
- Enrichment is a *bonus*: wrap it in `try/catch` and fall back to `questionText(criterion)` (localized template) on any `ProviderError` — notably `bad_json`, `wrong_language`, `auth`, `cors` (D-04's invariant).
- `questionText` must be a **callback** supplied by the component (`(c) => t('revision.quiz.fallbackQuestion', { label: c.label })`) so the pure builder stays i18n-free and unit-testable.
- Cheap, deterministic and provider-free: this is the branch that makes `LOOP-02` verifiable in CI.

### Pattern C — `revisionOf` threading without touching public props

Every surface already has `lesson.id` and its own repo reads, so no new props are needed:

| Surface | Where the intent is armed | Where it is consumed | Intent object |
|---|---|---|---|
| Quiz | `ReviseButton` on the completion card, using the review row id if one was stored, else the attempt id | `persist()` → `saveQuizAttempt(lesson.id, { …, revisionOf: pendingRef.current })`, then clear the ref | `{ feedbackTable: 'chat_messages' or 'quiz_attempts', feedbackId }` |
| Tutor | `ReviseButton` inside the review card → `setPendingMode('check_answer')`, focus textarea, set `revisionRef` | `runTurn()` → `appendChat(lesson.id, { role:'user', mode:'check_answer', revisionOf: revisionRef.current })`, then clear | `{ feedbackTable:'chat_messages', feedbackId: reviewRow.id }` |
| Workspace | `ReviseButton` next to the failing checks (OutputPanel) → `revisionRef.current = { feedbackTable:'run_results', feedbackId: runRowId }` | `start()` → `saveRunResult({ …, revisionOf })`, then clear | `{ feedbackTable:'run_results', feedbackId }` |

Use **refs** for the pending intent (consumed exactly once, no re-render needed) — and clear *before* the await so a failed write cannot double-apply. `CodeWorkspace.start()` currently discards the `saveRunResult` return value (`:286-296`); it must capture it to learn the run id for the revise CTA.

### Pattern D — runner acknowledgement scoped to the runner URL

```
RUNNER_ACK_KEY = 'professor.runnerNotice.ack'
record = { url: runnerBase(settings), acknowledgedAt: ISO }
```

- `runnerBase()` may throw for a non-loopback URL → wrap in try/catch. With **no usable scope** there is nothing to acknowledge: return `false` from `needsRunnerAck` (no prompt) and write **no** record, because `runCode` will surface `loopback_required` before any code executes (`runner/local.js:27`, `settings.js:47-50`). Never persist a `url: undefined` record.
- Helpers take an injectable `storage` param (default `globalThis.localStorage`) exactly like `settings.js` env injection, so tests never touch globals.
- Component side: `useState(() => needsRunnerAck(...))` (lazy initializer is SSR-safe; `typeof localStorage === 'undefined'` → unacknowledged) plus an `ackRef` read inside `start()` so the interception is not a stale closure.
- Interception: in `start(kind)`, **before** `setRunning`/`new AbortController`, if `runnerInfo.kind === 'local' && needsAck` → set a local "blocked" hint (same `Object.assign(new Error(...), { hint })` idiom as `addFile`, `CodeWorkspace.jsx:323-325`) and `return`. Nothing runs, nothing is saved.
- After ack: notice stays visible with **no** acknowledge button (static copy), runs proceed. Browser languages never show it.

### Pattern E — best-effort emission (D-16/D-17)

```js
async function bestEffort(label, run) {
  try {
    return await run();
  } catch (err) {
    if (import.meta.env?.DEV) console.warn(`[repo] ${label} failed`, err);
    return null;
  }
}
```

Wrap **only** the eight call sites: `recordEvent` + `maybeLinkRevision` inside `saveQuizAttempt` (`:506, 514`), `appendChat` (`:638, 646`), `saveRunResult` (`:789, 797`), `createCapstoneSubmission` (`:941, 951`). Keep `recordEvent`/`buildRevisionLink` strict, keep the primary `adapter.put`, the returned row and `emit(...)` untouched.

### Anti-patterns to avoid

- **Throwing from the review UI when the provider is unset.** Quiz/workspace reviews must exist anyway (D-04); only the tutor review may surface a provider error.
- **`t(\`...${id}\`)` for new keys.** The i18n key scanner cannot see template keys; missing keys render as raw dotted strings (verified).
- **Adding `tutor.mode.review` to `tutor.json`.** That file is an existing i18n namespace (Phase 6 ownership) — forbidden. Put the label in `revision.json` (see Pitfall 3).
- **Calling `generateJson` inside another retry loop.** Up to 4 model calls, and two different final error messages.
- **Reading `localStorage` directly in a render body.** `renderToString` has no `localStorage`; always guard or lazily initialise.
- **Filtering reviews with `list({where:{mode}})`.** Not indexed → throws.
- **Rendering model text through `<Markdown>`.** Review text is model output; plain text avoids GFM/Mermaid/image side paths and keeps CSP (`img-src 'self' data:`) irrelevant.
- **Scanning raw `OutputPanel` HTML for `/sandbox/i`.** The preview iframe legitimately carries `sandbox="allow-scripts"` (`OutputPanel.jsx:55`). Scan catalog strings and *text*, or render OutputPanel with `preview = null`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| JSON extraction/repair | A new parser/retry | `extractJson` (`lib/json.js:5-26`) + `generateJson` (`ai/provider-utils.js:36-87`) or a 20-line mirror over `provider.streamText` | Handles fences, prose, abort, and the exact `bad_json` taxonomy the UI already localises |
| Ids/timestamps/tombstones | Manual row assembly | `saveQuizAttempt` / `appendChat` / `saveRunResult` (`repo/index.js`) | Rows are stamped, events emitted, links inferred in one place |
| Localisation | Hand-written EN/VI strings in components | `revision.json` + `runnerNotice.json` through `useT()` | Parity test + literal-key scanner enforce completeness |
| Review persistence | A new table/columns | Assistant `chat_messages` row `mode:'review'` | D-05; no migration, no `DB_VERSION` bump, identical on IDB/SQLite/memory |
| Status chips / CTA / notice layout | New primitives | `Badge` tones (`success/warning/neutral`), `Button` variants (`primary` first, `secondary` for "Move on"), `Card` | Existing visual language; `tutor-panel.render.test.js` text assertions stay stable |
| Run history decoding | Manual `checks_json` parsing | `decodeRunResult` (`runner/history.js:24-48`) | Handles bare-array legacy payloads and snapshot shape |
| Runner selection/labels | New browser/local detection | `describeRunner` (`runner/index.js:50-59`) | Same source of truth the Run button uses |
| Local runner URL | Re-deriving from settings | `runnerBase(settings)` (`runner/local.js:25-29`) | Trailing-slash normalisation + loopback assertion already there |
| Error display | Custom error boxes | `ErrorNotice` with a caller-supplied `message`/`hint` | Localises defaults, shows custom review copy untouched (`ErrorNotice.jsx:13-19`) |

## Common Pitfalls

### Pitfall 1 — `.test.jsx` never runs
**What goes wrong:** the roadmap/CONTEXT glob says `studio/test/revision-*.test.js(x)`, but `vitest.config.js` includes only `test/**/*.test.js` (`:103`). A `.test.jsx` file is silently skipped, so Nyquist coverage looks present but does not exist.
**Evidence:** adding `studio/test/revision-temp.test.jsx` left the studio run at **55 files**; removing it changed nothing.
**How to avoid:** every new test file ends in `.test.js`; JSX inside it via `createElement` (already the house style, `tutor-panel.render.test.js:2`).

### Pitfall 2 — only prop-driven components are renderable
**What goes wrong:** trying to assert LOOP-01/02/03 by rendering `QuizPanel`, `TutorPanel` or `CodeWorkspace`.
**Evidence (verified with `renderToString`):** seeded `QuizPanel` renders the **question** screen (stage `active`), never the completion card; `TutorPanel` renders the empty/loading shell (no effects → no messages); `CodeWorkspace` renders only its loading `Card` (`loaded === false`).
**How to avoid:** put all rendering logic in `components/revision/**` with explicit props; test those. Verify wiring at the repo level (explicit link created for the same intent object) and with pure "intent" builders the surfaces call.

### Pitfall 3 — the review chip's label key does not exist and is not scannable
**What goes wrong:** adding `{ id:'review', label:'Review my attempt' }` to `TUTOR_MODES` makes `QuickActions` render `t('tutor.mode.review')` (`QuickActions.jsx:28`), which **returns the raw key** (verified). `tutor.json` is an existing namespace and may not be edited (D-18), and the key scanner ignores template literals (`i18n-keys.test.js:30`), so no test catches it.
**How to avoid:** give the mode entry an explicit i18n key and resolve it in `QuickActions`, e.g. `t(mode.i18nKey || \`tutor.mode.${mode.id}\`)` with `i18nKey: 'revision.tutor.reviewAction'`, or special-case `mode.id === 'review'`. Keep `TUTOR_MODES[].label` for non-UI uses (`modeLabel`, `tutor.js:145`). Do **not** add `MODE_INSTRUCTIONS.review` for prose turns — the review builder owns its own rules.

### Pitfall 4 — double retry / quadruple model calls
**What goes wrong:** layering a review retry on top of `generateJson`.
**Evidence:** `generateJson` = 2 calls on invalid JSON; **plus** up to 2 more when `language` is passed and the language check fails (verified: 2 calls then `wrong_language`).
**How to avoid:** pick one of the two designs deliberately — (a) `generateJson({validate})` and accept the generic repair wording, or (b) a small `requestReviewJson` over `provider.streamText` that injects the validation error and makes exactly 2 calls. For quiz/workspace enrichment, consider **omitting** `language` (labels are already deterministic/learner-language from stored data; template questions are localised) so a language mismatch cannot destroy a valid review.

### Pitfall 5 — a passing attempt must not show a revision CTA
**What goes wrong:** wiring "Revise" unconditionally and contradicting D-08/LOOP-01.
**How to avoid:** one pure predicate per surface, exported and tested: quiz `score === total && criteria.every(met)`; tutor `criteria.every(met)` (partial counts as non-passing); workspace `checks.every(passed)` and `checks.length > 0`. Render `ReviseButton` only when `!passing`; render "Move on"/"New quiz" as `variant="secondary"`.

### Pitfall 6 — malformed stored review crashes the transcript
**What goes wrong:** `JSON.parse` on a legacy/hand-edited assistant row (or a truncated row) throws during render and blanks the tutor panel.
**How to avoid:** `parseReviewRecord` never throws (mirror `parseJsonColumn`, `repo/index.js:819-827`); on `null` render the message as plain text `ChatMessage`-style, not as a review card. Test with `'not json'`, `'{}'`, `'{"criteria":"x"}'`, and a missing `surface`.

### Pitfall 7 — quiz reviews leak into the tutor transcript / history
**What goes wrong:** both quiz and tutor reviews are assistant `chat_messages` rows with `mode:'review'`, so `TutorPanel`'s `listChat` returns quiz reviews too, and tutor attempt history would pair them wrongly.
**How to avoid:** parse the record and **filter on `surface`** in `TutorPanel` (render only `surface === 'tutor'` review cards) and in the tutor history builder. Never filter by `mode` at the repo level.

### Pitfall 8 — criteria-key drift on the second tutor review
**What goes wrong:** the model renames or reorders criteria, so `criteriaDelta` compares apples to oranges (D-01 says this is one-way/costly).
**How to avoid:** read the persisted rubric from the **earliest** parsed tutor review for the lesson, send it verbatim in the prompt, and validate the returned `keys` are exactly that set (order-insensitive at validation, order-preserving for display). A mismatch is invalid output → one repair → `bad_json`.

### Pitfall 9 — stored code in a workspace review
**What goes wrong:** checks and stdout are learner content; putting them in the review record or the learner-visible question text would persist code into `chat_messages`.
**How to avoid:** workspace criteria contain only `{key,label,status,question}` where `label` is the check *name* and `question` a template/enriched Socratic question — never stdout/stderr/snapshot. Prompts wrap checks with `wrapUntrusted(..., 'check_output')` (D-02).

### Pitfall 10 — `localStorage` in an SSR render path
**What goes wrong:** `renderToString` in Node has no `localStorage`; a direct read throws and the notice test dies.
**How to avoid:** `typeof localStorage === 'undefined'` guard + try/catch (the `chat-store.js:17-36` pattern), lazy `useState` initialiser, injectable storage for tests. Note Node 22+ emits a `localStorage is not available` warning in this repo's runs — never rely on its presence.

### Pitfall 11 — acknowledgement scoped to the wrong string
**What goes wrong:** keying the ack on `window.location.origin` or `settings.bridge.bridgeUrl` with a trailing slash makes the ack re-prompt after a settings edit even though the runner did not change; or `runnerBase()` throws and the ack record is written with `undefined`.
**How to avoid:** normalise through `runnerBase(settings)` (it strips the trailing slash), try/catch it, and when there is no usable scope return "no acknowledgement required" without prompting and without writing a record (the run then fails with `loopback_required` before executing anything). A changed URL must re-prompt (D-14).

### Pitfall 12 — the `/sandbox/i` test failing on the preview iframe
**What goes wrong:** a naive scan of rendered `OutputPanel` HTML hits `sandbox="allow-scripts"` (`OutputPanel.jsx:55`) and fails the honesty test for the wrong reason.
**How to avoid:** scan (a) every string value in `en/runnerNotice.json` + `vi/runnerNotice.json`, and (b) the rendered **text** of `RunnerNotice`, or `OutputPanel` output with `preview: null`. Document the exclusion in the test name/comment (D-15 allows it).

### Pitfall 13 — prompt injection through learner answers/code/check output
**What goes wrong:** quiz answers are indices (safe), but tutor review attaches learner code and the tutor transcript; a crafted `<learner_code>` body could try to flip the rubric.
**How to avoid:** `wrapUntrusted(...)` for code/check output (`base.js:99-103`), rubric/JSON-shape rules in `system` only, `stripInvisible` on learner text (`tutor.js:132-141`), and zod strictness so injected extra keys (`code`, `solution`, `passing`) are rejected outright.

### Pitfall 14 — workspace revision CTA armed without a run id
**What goes wrong:** `CodeWorkspace` currently ignores the `saveRunResult` return value, so there is no `run_results.id` to reference.
**How to avoid:** `const saved = await saveRunResult({...})`, then arm `revisionRef` only when `saved?.id` and `checks.some(c => c.passed !== true && c.ok !== true)` (same failure test as `repo/index.js:137-139`).

### Pitfall 15 — touching another phase's surface
**What goes wrong:** the natural fixes live in files this phase must not edit: `ChatMessage.jsx` (mode label), `tutor.json` (label key), `ai/errors.js` (review error copy), `settings.js` (ack persistence), `LessonPractice.jsx` (duplicate attempt list), `0006` migration.
**How to avoid:** route every need through the owned files — `QuickActions.jsx` for the chip label, `ErrorNotice` custom message/hint for review errors, `components/revision/` for helpers, new namespace files for copy. Accept that `LessonPractice` still shows its own compact "past attempts" list; `AttemptHistory` in `QuizPanel` is additive.

## Code Examples

### 1. Review schema (verified against zod 4.6.7)

```js
// studio/src/lib/prompts/practice.js (or tutor.js for the tutor variant)
import { z } from 'zod';

export const REVIEW_STATUSES = ['met', 'partial', 'not_met'];

/** Matches a literal triple-backtick fence without writing one in source. */
const CODE_FENCE = new RegExp('`{3}');

export const reviewCriterionSchema = z
  .strictObject({
    key: z.string().min(1).max(24),
    label: z.string().min(1).max(200),
    status: z.enum(['met', 'partial', 'not_met']),
    question: z.string().min(1).max(400).nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.status === 'met' && c.question !== null) {
      ctx.addIssue({ code: 'custom', path: ['question'], message: 'met criteria must not carry a question' });
    }
    if (c.status !== 'met' && !c.question) {
      ctx.addIssue({ code: 'custom', path: ['question'], message: 'every unmet criterion needs one Socratic question' });
    }
    if (CODE_FENCE.test(`${c.label}\n${c.question ?? ''}`)) {
      ctx.addIssue({ code: 'custom', path: ['question'], message: 'reviews must not contain code fences' });
    }
  });

export const reviewOutputSchema = z.strictObject({
  criteria: z.array(reviewCriterionSchema).min(1).max(20),
});

/** `generateJson`/`requestReviewJson` validator: true | message. */
export function validateReview(value, { rubric = null } = {}) {
  const parsed = reviewOutputSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues[0]?.message || 'Invalid review JSON';
  if (rubric) {
    const expected = rubric.map((c) => c.key).join(',');
    const got = parsed.data.criteria.map((c) => c.key).join(',');
    if (expected !== got) return `criteria keys must be exactly: ${expected}`;
  }
  return true;
}
```

Verified outcomes: `Unrecognized key: "code"` for a top-level `code`; `met criteria must not carry a question`; `every unmet criterion needs one Socratic question`; `reviews must not contain code fences`.

### 2. Persisted record + tolerant parse

```js
// components/revision/history.js
export function buildReviewRecord({ surface, attemptTable, attemptId = null, criteria }) {
  const passing = criteria.length > 0 && criteria.every((c) => c.status === 'met');
  return { surface, attemptTable, attemptId, passing, criteria };
}

/** @returns {{surface:string, attemptTable:string, attemptId:string|null, passing:boolean, criteria:object[]}|null} */
export function parseReviewRecord(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  let raw;
  try { raw = JSON.parse(content); } catch { return null; }
  if (!raw || !Array.isArray(raw.criteria) || raw.criteria.length === 0) return null;
  const criteria = raw.criteria.filter(
    (c) => c && typeof c.key === 'string' && typeof c.label === 'string' && REVIEW_STATUSES.includes(c.status)
  );
  if (!criteria.length) return null;
  return {
    surface: typeof raw.surface === 'string' ? raw.surface : 'tutor',
    attemptTable: typeof raw.attemptTable === 'string' ? raw.attemptTable : 'chat_messages',
    attemptId: raw.attemptId ?? null,
    passing: Boolean(raw.passing),
    criteria,
  };
}
```

### 3. Deterministic quiz review, provider-free (D-04)

```js
export function buildQuizReview({ questions = [], answers = [], questionText = () => '' }) {
  return questions.map((q, i) => {
    const met = answers[i] === q.answerIndex;
    const label = String(q.question || `Q${i + 1}`).slice(0, 120);
    const criterion = { key: `q${i + 1}`, label, status: met ? 'met' : 'not_met', question: null };
    return met ? criterion : { ...criterion, question: questionText(criterion, i) };
  });
}

export function workspaceCriteria(checks = [], questionText = () => '') {
  const seen = new Set();
  return checks.map((check, i) => {
    const base = slugifyCheckKey(check?.name) || `check${i + 1}`;
    let key = base;
    for (let n = 2; seen.has(key); n++) key = `${base}-${n}`; // collision-safe, stable per run
    seen.add(key);
    const met = check?.passed === true || check?.ok === true;
    const label = String(check?.name || `Check ${i + 1}`).slice(0, 120);
    const criterion = { key, label, status: met ? 'met' : 'not_met', question: null };
    return met ? criterion : { ...criterion, question: questionText(criterion, i) };
  });
}
```

### 4. One-repair review request (only if D-03 must be literal)

```js
// components/revision/review-request.js
import { extractJson } from '../../lib/json.js';
import { providerError, isAbortError } from '../../lib/ai/errors.js';
import { MAX_TOKENS } from '../../lib/ai/provider-utils.js';

export async function requestReviewJson({ provider, system, messages, signal, validate }) {
  const ask = (msgs) =>
    provider.streamText({ system, messages: msgs, signal, effort: 'low', maxTokens: MAX_TOKENS.json });

  const coerce = (text) => {
    const parsed = extractJson(text);          // throws -> caught below
    const verdict = validate(parsed);
    if (verdict !== true) throw new Error(typeof verdict === 'string' ? verdict : 'Invalid review JSON');
    return parsed;
  };

  const first = await ask(messages);
  try {
    return coerce(first);
  } catch (err) {
    if (isAbortError(err)) throw err;
    const repair = [
      ...messages,
      { role: 'assistant', content: String(first).slice(0, 4000) },
      { role: 'user', content: `That review was not valid: ${err.message}. Reply with ONLY the corrected review JSON, same shape, no prose, no Markdown fences.` },
    ];
    const second = await ask(repair);
    try {
      return coerce(second);
    } catch (err2) {
      if (isAbortError(err2)) throw err2;
      throw providerError('bad_json', err2.message || 'Model did not return a valid review');
    }
  }
}
```
Total model calls: exactly 2. If the plan prefers `generateJson`, drop this file and pass `validate: validateReview` — same call budget, generic repair wording, final error message still carries the validator text.

### 5. Runner acknowledgement (SSR-safe, injectable)

```js
// components/revision/runner-notice.jsx
import { runnerBase } from '../../lib/runner/index.js';

export const RUNNER_ACK_KEY = 'professor.runnerNotice.ack';

export function runnerAckScope(settings) {
  try {
    return runnerBase(settings); // http://localhost:3000/api/studio/run
  } catch {
    return null;
  }
}

export function readRunnerAck(storage = globalThis.localStorage) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RUNNER_ACK_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.url === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function needsRunnerAck(settings, storage = globalThis.localStorage) {
  const scope = runnerAckScope(settings);
  if (!scope) return false;                 // will fail for a better reason than the ack
  const ack = readRunnerAck(storage);
  return !ack || ack.url !== scope;         // a different runner URL re-prompts (D-14)
}

export function acknowledgeRunner(settings, storage = globalThis.localStorage, now = new Date()) {
  const scope = runnerAckScope(settings);
  if (!scope || !storage) return null;
  const record = { url: scope, acknowledgedAt: now.toISOString() };
  try { storage.setItem(RUNNER_ACK_KEY, JSON.stringify(record)); } catch { /* storage full/blocked */ }
  return record;
}
```

### 6. Explicit-link integration the wiring must produce (already proven)

```js
const review = await appendChat(lesson.id, { role: 'assistant', content: JSON.stringify(record), mode: 'review' });
vi.setSystemTime(new Date('2026-10-20T10:00:00.000Z'));
await saveQuizAttempt(lesson.id, { questions, answers, score, total, revisionOf: { feedbackTable: 'chat_messages', feedbackId: review.id } });
const [link] = await listRevisionLinks({ lessonId: lesson.id });
// → { surface:'quiz', feedback_table:'chat_messages', feedback_id: review.id, link_kind:'explicit', attempt_id: <prior attempt id | null> }
```
(Shape already asserted in `studio/test/beta-revisions.test.js:94-137` and `test/studio-capstone-migration.test.js:222-266`.)

## State of the Art

| Old approach | Current approach | Why it matters here |
|---|---|---|
| Free-text AI feedback | Strict JSON review + zod, now with `strictObject`/`superRefine` (zod 4.6.7) | Model can no longer sneak `code`, `solution`, fences or a question on a met criterion |
| `retake` button | "Revise this attempt" as primary with an explicit `revisionOf` link | Same reducer action, but the attempt now counts as a revision (INSTR-04) |
| Per-file i18n catalogs (`en.json`) | Per-namespace files auto-merged by an eager glob (`i18n/index.js:36`) | Wave 2 phases add files only — no shared-file conflicts |
| Reporting the local runner as "Local server" | `Local machine` badge + "Code runs on your machine" disclosure | PITFALLS line 365 / FEATURES line 196: "sandbox" is dishonest for a same-permission runner |
| Metrics writes inside the learner action's transaction | Best-effort post-write emission | A metrics bug can no longer block or fail a learning action |

**Deprecated / do not use:** `workspace.localServer` / `workspace.browser` for the runner badges (keep the keys, stop using them); `retake` as a standalone primary affordance; any "sandbox" wording for local runs.

## Open Questions

1. **Copy tension in the notice text.**
   - What we know: D-13 wants the notice to "explain it runs with the learner's own permissions and is not isolated"; CONTEXT `<specifics>` says the copy "must not use 'sandbox', 'safe' or 'isolated'"; D-15 only tests `/sandbox/i`.
   - Unclear: whether the word "isolated" is banned outright or only the *claim* of isolation.
   - Recommendation: convey the meaning without the word — e.g. EN "Code runs on your machine, with your own user permissions and access to your files." / VI "Mã chạy trên máy của bạn, với quyền người dùng và quyền truy cập tệp của bạn." Keep the test at `/sandbox/i` per D-15 and add a second test asserting the exact phrase "Code runs on your machine" is present.

2. **Does the tutor review card show quiz reviews (and vice versa)?**
   - What we know: one `chat_messages` table holds both, and `findInferenceFeedback` ignores `surface`.
   - Unclear: whether a quiz review should be visible in the tutor tab.
   - Recommendation: filter by parsed `surface` in `TutorPanel` (`surface === 'tutor'`) and in each history builder; this is a UI decision, not a repo change.

3. **Quiz/workspace question enrichment: lazy or on completion?**
   - Recommendation: on completion with a short timeout and `try/catch`, falling back to the localized template. Enrichment must never delay the review card by more than one model call and must not block the primary "Revise" CTA — render the deterministic review immediately and patch questions when enrichment resolves (or skip enrichment when `!providerReady(settings)`).

4. **`generateJson` vs a local one-repair request (Pitfall 4).**
   - Recommendation: local `requestReviewJson` (example 4) for tutor reviews (literal D-03), `generateJson` only if the plan accepts the generic repair wording. Whichever is chosen, assert the **exact call count** in a test with a fake provider.

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`), so every requirement below needs an automated, deterministic check runnable in < 30 s with no network and no DOM.

### Test Framework

| Property | Value |
|---|---|
| Framework | Vitest 5.0.5 (root config, projects `root` + `studio`) |
| Config file | `vitest.config.js` (no `studio/vitest.config.*`) |
| Quick run command | `npx vitest run --project studio test/revision- test/prompts-practice-review.test.js test/prompts-tutor-review.test.js` (positional args are substring filters, so `test/revision-` selects every `test/revision-*.test.js`; a literal glob matches nothing and silently collects 0 files) |
| Full suite command | `npm test` (root project + studio project) |
| Baseline | `npx vitest run --project studio` → 55 files / 527 tests green before this phase |
| Constraints | `test/**/*.test.js` only — **no `.test.jsx`**; no DOM; memory adapter in `beforeEach`; no network |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command / file | File exists? |
|---|---|---|---|---|
| LOOP-01 (quiz) | "Revise" primary only when non-passing; pressing it arms `{feedbackTable:'chat_messages', feedbackId:<review id>}` (fallback `quiz_attempts`); the next saved attempt creates an explicit link | unit + repo integration | `studio/test/revision-wiring.test.js` (`intent` builders) + `studio/test/revision-best-effort.test.js`/`beta-revisions.test.js` link shape | ❌ Wave 0 |
| LOOP-01 (tutor) | Review card offers Revise only with unmet/partial; next user message carries `revisionOf`; `appendChat` links explicitly | unit + repo integration | `studio/test/revision-wiring.test.js`; `studio/test/revision-review.test.js` (passing ⇒ no CTA) | ❌ Wave 0 |
| LOOP-01 (workspace) | Revise armed only when a check failed; consumed exactly once by the next `saveRunResult`; second run without re-arming sends no `revisionOf` | unit | `studio/test/revision-wiring.test.js` (`arm/consume` pure helper) | ❌ Wave 0 |
| LOOP-01 (passing) | No revision CTA at all when passing | unit | `studio/test/revision-review.test.js` | ❌ Wave 0 |
| LOOP-02 (deterministic) | Quiz review from answers yields `q1..qN`, `met`/`not_met` only, question iff unmet, no provider | unit | `studio/test/revision-history.test.js` | ❌ Wave 0 |
| LOOP-02 (workspace) | Criteria from checks use slugged keys with `checkN` fallback and collision suffixes; `passed → met` | unit | `studio/test/revision-history.test.js` | ❌ Wave 0 |
| LOOP-02 (schema) | Schema rejects `code`/`solution` keys, a fence in label/question, a question on `met`, a missing question on `not_met` | unit | `studio/test/prompts-practice-review.test.js`, `studio/test/prompts-tutor-review.test.js` | ❌ Wave 0 |
| LOOP-02 (no code) | Prompt for a programming task wraps learner code as `<learner_code>` and carries `NO_SOLUTION_RULE`; an accepted record's `JSON.stringify` contains no triple-backtick fence and no `code`/`solution` key | unit (regression) | `studio/test/prompts-tutor-review.test.js` (D-20) | ❌ Wave 0 |
| LOOP-02 (one repair) | Fake provider: invalid JSON → exactly 2 calls → `ProviderError{code:'bad_json'}`; validator text is in the final message | unit | `studio/test/prompts-tutor-review.test.js` | ❌ Wave 0 |
| LOOP-02 (tutor rubric) | First review without rubric assigns `c1..cN`; later review re-sends persisted rubric; drifted/missing/invented keys rejected → repair → `bad_json` | unit | `studio/test/prompts-tutor-review.test.js` | ❌ Wave 0 |
| LOOP-02 (rendering) | `ReviewFeedback` renders a row per criterion, `met/partial/not_met` chips, exactly one question per unmet criterion, none for met | component (SSR) | `studio/test/revision-review.test.js` | ❌ Wave 0 |
| LOOP-02 (malformed) | Malformed stored JSON renders as plain text, no throw | component (SSR) + unit | `studio/test/revision-review.test.js` | ❌ Wave 0 |
| LOOP-03 | `criteriaDelta` returns `not_met → met` transitions, "new" for unseen keys, removed keys reported, met-count summary "2 → 4 of 5"; history lists oldest→newest | unit | `studio/test/revision-history.test.js`; `studio/test/revision-attempt-history.test.js` (SSR) | ❌ Wave 0 |
| LOOP-04 (badge) | `OutputPanel` renders `Local machine` for `runner: 'local'` and `Browser` for `'browser'` (no `Local server` anywhere) | component (SSR) | `studio/test/revision-runner-notice.test.js` | ❌ Wave 0 |
| LOOP-04 (notice + ack) | Before ack: notice present with an acknowledge action and `needsRunnerAck() === true`; ack writes `{url, acknowledgedAt}` under `professor.runnerNotice.ack`; after ack: notice stays, no acknowledge button, `needsRunnerAck() === false`; different URL re-prompts; missing/throwing storage never throws | unit + component (SSR) | `studio/test/revision-runner-notice.test.js` | ❌ Wave 0 |
| LOOP-04 (no sandbox) | `/sandbox/i` absent from `en/runnerNotice.json`, `vi/runnerNotice.json` and rendered runner notice text (preview iframe excluded) | unit | `studio/test/revision-runner-notice.test.js` | ❌ Wave 0 |
| D-16 | A failing `adapter.put('learning_events'|'revision_links')` leaves the attempt/run/message row saved and the call resolved; `recordEvent` still throws on invalid meta | repo integration | `studio/test/revision-best-effort.test.js` | ❌ Wave 0 |
| D-18 | New namespaces exist in both languages with identical keys; every literal `t('…')` in new components exists in both | unit | existing `i18n-keys.test.js` + `i18n-catalogs.test.js` (no edits needed) | ✅ |

Manual-only (documented, not automated): the real-provider Vietnamese review and the real local runner on macOS — deferred to the phase's UAT/verify step and Phase 12's manual checklist.

### Sampling Rate

- **Per task commit:** the quick run command above (7 files, no network, ~1-2 s).
- **Per wave merge:** `npm test` (root + studio; baseline 527 studio tests must stay green).
- **Phase gate:** full suite green plus the two manual checks (real provider tutor review; real local run after acknowledgement) recorded in VERIFICATION.md before `/gsd-verify-work`.

### Wave 0 Gaps (create before implementation)

- [ ] `studio/test/revision-history.test.js` — `parseReviewRecord`, `buildQuizReview`, `workspaceCriteria`, `criteriaDelta`, `passing` predicates, `arm/consume` intent helper
- [ ] `studio/test/revision-review.test.js` — `ReviewFeedback` + `ReviseButton` SSR (chips, questions, CTA presence/absence, primary/secondary order, malformed fallback)
- [ ] `studio/test/revision-attempt-history.test.js` — `AttemptHistory` SSR (summary, transitions, collapsible, empty state)
- [ ] `studio/test/revision-runner-notice.test.js` — ack helpers (fake storage, throwing storage, URL change), notice/badge SSR, no-`sandbox` scan
- [ ] `studio/test/revision-wiring.test.js` — intent builders + explicit-link integration through the repo
- [ ] `studio/test/revision-best-effort.test.js` — failing-appender adapter (see below), primary row preserved
- [ ] `studio/test/prompts-practice-review.test.js` — schemas/builders for quiz + workspace, `wrapUntrusted`, no-code regression
- [ ] `studio/test/prompts-tutor-review.test.js` — tutor schema, rubric persistence/drift, one-repair call count, `NO_SOLUTION_RULE`
- [ ] `studio/src/lib/i18n/{en,vi}/{revision,runnerNotice}.json` — created as part of the first UI wave (parity tests fail until both exist)
- [ ] No framework install needed (Vitest 5 and zod 4 already present); no config change needed

### Determinism notes (how to fake things without a DOM/network)

- **Failing adapter for D-16:** wrap the memory adapter and throw only for the table under test:
  ```js
  const base = createMemoryAdapter();
  const failing = {
    ...base,
    async put(table, row) {
      if (table === 'learning_events') throw new Error('metrics down');
      return base.put(table, row);
    },
  };
  repo.useAdapter(failing);
  const row = await repo.saveQuizAttempt(lesson.id, { questions: [], answers: [0], score: 1, total: 1 });
  expect(row.id).toBeTruthy();
  expect(await repo.listQuizAttempts(lesson.id)).toHaveLength(1); // primary row survived
  ```
  Repeat with `revision_links` to prove the link write is opportunistic. Keep a second assertion that `repo.recordEvent({kind:'quiz_completed', surface:'quiz', meta:{score:'x'}})` still rejects (privacy tests must stay loud).
- **Fake provider for the review flow:** `{ streamText: vi.fn(async () => reply) }` + `createGenerateJson(provider.streamText)` or `requestReviewJson`; assert `streamText.mock.calls.length` to pin the retry budget.
- **No-corrected-code determinism:** assert on (a) the built prompt string (`<learner_code>` present, `NO_SOLUTION_RULE` present, rubric keys present), (b) the zod rejection of `{criteria:[…], code:'…'}`, and (c) `JSON.stringify(validatedRecord)` contains neither a triple-backtick fence nor a `code`/`solution` key. All three are pure and stable.
- **SSR component tests** must not depend on effects: pass all data as props; for components that fetch, assert only the pre-effect shell (`Spinner`/loading) and keep the logic in the prop-driven children.
- **`vi.useFakeTimers()` + `vi.setSystemTime`** is the established pattern for repo timestamps (`beta-revisions.test.js:10-18`); use it for the 72h-window interaction tests, not for the UI.

## Sources

### Primary (HIGH confidence — read in this worktree)
- `studio/src/lib/repo/index.js:42-55, 98-283, 492-531, 633-664, 755-814, 910-960, 1059-1131` — write/read API, inference predicates, 72h window, strict `recordEvent`
- `studio/src/lib/repo/events.js:11-239` — event enum/meta whitelist (`answer_sent_for_review.mode` already includes `review`), `REVISION_FEEDBACK_TABLES`, `buildRevisionLink`
- `studio/src/lib/repo/schema.js:33-97, 108, 127-133` and `studio/migrations/0001_init.sql:95-105` — columns/indexes; `chat_messages.content` unconstrained TEXT; `LATEST_MIGRATION_VERSION = 5`
- `studio/src/lib/ai/provider-utils.js:11-107`, `ai/errors.js:6-92`, `ai/useStream.js:59-106`, `ai/index.js:124-173`, `lib/json.js:5-26` — JSON repair, `bad_json`, streaming contract, async provider
- `studio/src/lib/prompts/base.js:99-103`, `practice.js:48-280`, `tutor.js:19-281` — `wrapUntrusted`, quiz builders/reducer, `NO_SOLUTION_RULE`, `TUTOR_MODES`, `MODE_INSTRUCTIONS`, `normalizeMessages`
- `studio/src/components/{practice/QuizPanel,tutor/TutorPanel,tutor/QuickActions,workspace/CodeWorkspace,workspace/OutputPanel}.jsx` — read line-by-line for props/state/insertion points
- `studio/src/lib/i18n/index.js:22-144`, `studio/test/i18n-keys.test.js:19-57`, `studio/test/i18n-catalogs.test.js:18-102` — auto-merge, literal-key scan, namespace parity
- `studio/src/lib/runner/index.js:36-59`, `studio/src/lib/runner/local.js:25-62`, `studio/src/lib/runner/history.js:15-48`, `studio/src/lib/settings.js:75-96, 174-182, 360-375` — `describeRunner`, `runnerBase`, `decodeRunResult`, settings defaults
- `studio/vite.config.js`/`studio/index.html` CSP, root `vitest.config.js:88-105`, `studio/package.json` — harness and CSP facts
- `studio/test/{tutor-panel.render,tutor,practice-prompt,beta-revisions,beta-privacy,runner-selection,no-sync-getprovider}.test.js`, root `test/studio-capstone-migration.test.js:222-266` — existing assertions and patterns

### Secondary (HIGH confidence — executed experiments in this worktree)
- Fake `streamText` runs proving `generateJson` call counts (2 on invalid JSON; 2 then `wrong_language`), the exact final `ProviderError` code/message, and the generic repair wording
- `renderToString` runs proving `QuizPanel` renders the seeded question screen, `OutputPanel` renders `Local server`, `CodeWorkspace` renders only its loading card
- `translate('en','tutor.mode.review')` → returns the raw key; memory adapter `where:{mode}` → `Field "mode" is not indexed`
- zod 4.6.7 schema probe proving strict-object/`superRefine` behavior for `code`, fences and question rules
- Vitest collection probe proving `.test.jsx` is not collected (55 files with the file present)

### Tertiary (MEDIUM confidence — copy/UX judgment)
- `.planning/research/FEATURES.md:49-50, 196, 215`; `.planning/research/PITFALLS.md:365`; `.planning/codebase/CONCERNS.md:105-112` — the "not a sandbox" honesty rationale and the same-origin worker finding that makes isolation claims false

## Metadata

**Confidence breakdown:**
- Standard stack / existing API: **HIGH** — every signature, index and guard read directly in the worktree and cross-checked with passing tests
- Architecture (component split, threading, ack design): **HIGH** for the mechanics (verified by experiment); **MEDIUM** for the internal file split, which CONTEXT leaves to Claude's discretion
- Pitfalls: **HIGH** for 1-4, 7, 10-12, 14 (all demonstrated); **MEDIUM** for 5, 6, 8-9, 13, 15 (derived from the contracts and existing tests, not from a running failure)
- Copy/open questions: **MEDIUM** — CONTEXT contains a genuine tension between D-13 and `<specifics>` about the word "isolated"

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (30 days — the underlying contracts are frozen by merged Phases 5/6; revisit only if `repo/index.js`, `ai/provider-utils.js` or `vitest.config.js` change)

## RESEARCH COMPLETE
