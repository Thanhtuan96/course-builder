# Phase 8: Revision Loop UI and Run-Location Disclosure - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning
**Mode:** Interactive (orchestrator answered the discuss areas inline; decisions below are locked)

<domain>
## Phase Boundary

After non-passing feedback in a quiz, a tutor review or a workspace check, revising is the obvious
next step: "Revise this attempt" is the primary action and the next attempt is stored as an explicit
revision of that feedback. Feedback is rubric-anchored per criterion (met / partial / not met plus one
Socratic question for each unmet criterion) and never contains corrected code. The learner can open
their attempt history and see which criteria changed between attempts. The workspace discloses where
code runs — a `Browser` or `Local machine` badge, "Code runs on your machine" before the first local
run with a one-time acknowledgement — and the local runner is never called a sandbox.

In scope: LOOP-01, LOOP-02, LOOP-03, LOOP-04 on the **quiz, tutor and workspace** surfaces, the shared
`components/revision/**` components, the review prompt builders, and the two new i18n namespaces.

Out of scope (other phases / forbidden):
- The capstone surface of LOOP-01/LOOP-03 — Phase 9 renders it in its own capstone components using
  the same repo API. Nothing under `components/capstone/**` or `pages/Capstone.jsx` is touched.
- Any schema change: no new migration (`0006` stays reserved and unowned), no `DB_VERSION` bump, no
  new tables. Review records ride on existing `chat_messages` rows.
- Dependency/lockfile/`package.json` changes (zod 4 is already installed in `studio/`).
- Server-side runner behavior (`web/studio-runner.js`, Phase 2/9), security/CSP (Phase 2/6),
  `studio/src/lib/settings.js` and `studio/src/lib/i18n/<lang>/*.json` existing files (Phase 6).
- Editing `.planning/STATE.md`, `.planning/ROADMAP.md`, `CLAUDE.md` (orchestrator-only).

</domain>

<decisions>
## Implementation Decisions

### Rubric model and review format (LOOP-02)
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

### Review persistence and rendering
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

### Revision wiring (LOOP-01)
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

### Attempt history and criteria delta (LOOP-03)
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

### Run-location disclosure (LOOP-04)
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

### Best-effort event emission (approved extra task)
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
  attempt/run/message row, the returned row, and `emit(...)` behavior are unchanged. `createCapstoneSubmission`
  is covered too, even though Phase 9 owns capstone UI, because it shares the same emission code path.

### i18n and tests
- **D-18:** New namespace files only: `studio/src/lib/i18n/en/revision.json`,
  `vi/revision.json`, `en/runnerNotice.json`, `vi/runnerNotice.json`. Phase 6's glob auto-merges them;
  no existing catalog file or `i18n/index.js` is edited. New keys are added to **both** languages in
  the same commit (the catalogs test enforces parity).
- **D-19:** New tests match the owned globs only: `studio/test/revision-*.test.js` (components, pure
  history helpers, review rendering, runner notice/ack, the no-"sandbox" copy check) and
  `studio/test/prompts-practice-review.test.js` / `studio/test/prompts-tutor-review.test.js`
  (schemas, builders, repair-retry, `NO_SOLUTION_RULE` presence, no-code-in-review regression).
  Existing `studio/test/practice-prompt.test.js`, `tutor.test.js` and `tutor-panel.render.test.js`
  are not edited (they are outside the owned globs); their assertions must keep passing unchanged.
- **D-20:** The no-corrected-code regression test asserts that a review built for a programming task
  (learner code attached as `learner_code`) is rejected when the model returns fenced code, and that
  the accepted review record contains no triple-backtick fence and no `code`/`solution` key.

### the agent's Discretion
- Exact zod error wording, internal file split inside `components/revision/**`, how the status chips
  are styled (reuse `Badge` tones), exact English/Vietnamese copy for the new namespace keys, and
  whether quiz/workspace question enrichment calls the provider lazily or on completion — as long as
  D-04's deterministic-first invariant holds.
- Whether the review action for tutor is a chip or a dedicated button, as long as it is reachable
  without typing and is disabled while another turn streams.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement contract
- `.planning/ROADMAP.md` § "Phase 8: Revision Loop UI and Run-Location Disclosure" — goal, Owns,
  Touch points, success criteria.
- `.planning/ROADMAP.md` § "Execution Rules" — exclusive ownership, migrations, lockfiles,
  planning-doc ownership, merge discipline.
- `.planning/REQUIREMENTS.md` — LOOP-01, LOOP-02, LOOP-03, LOOP-04 (lines 59–62) and the traceability
  table (lines 160–163).
- `.planning/PROJECT.md` — core value: practice → feedback → revision → verifiable output.

### Frozen upstream contracts (Phase 5)
- `.planning/phases/05-beta-data-foundation/05-CONTEXT.md` § D-06/D-07 — `revisionOf` shape,
  `revision_links`, explicit-vs-inferred rules, 72 h inference window.
- `studio/src/lib/repo/index.js` § revision helpers + `saveQuizAttempt` / `appendChat` /
  `saveRunResult` / `createCapstoneSubmission` — the exact write paths and `revisionOf` parameters.
- `studio/src/lib/repo/events.js` — `REVISION_FEEDBACK_TABLES`, enum/meta rules (privacy invariant).
- `studio/src/lib/repo/index.js` § `listQuizAttempts`, `listChat`, `listRunResults`,
  `listRevisionLinks` — the read API attempt history consumes.

### i18n contract (Phase 6)
- `.planning/phases/06-studio-beta-debt/06-CONTEXT.md` § D-06..D-09 — per-namespace catalogs,
  `import.meta.glob` auto-merge, unchanged public API, render-safe `useT`.
- `studio/src/lib/i18n/index.js` — `t`, `useT`, `catalogKeys`, `translate` (read-only).

### Research and known issues
- `.planning/research/ARCHITECTURE.md` § "Pattern 3: Revision as a link table, inferred in the repo
  with explicit override" and § phase F row (revision UI file list).
- `.planning/research/FEATURES.md` § "Attempt history view", § "'Revise' as the main call to action
  after feedback", § "'Code runs on your machine' notice at the point of use", § anti-feature
  "calling the local runner a sandbox".
- `.planning/research/PITFALLS.md` line 365 — "Calling the local runner a 'sandbox'" pitfall.
- `.planning/research/SUMMARY.md` line 162 — Phase 8 deliverable list.
- `.planning/codebase/CONCERNS.md` line 112 — the worker/iframe isolation note that makes "sandbox"
  wording dishonest for local runs.

### Source of truth to read before changing
- `studio/src/components/practice/QuizPanel.jsx`, `studio/src/components/tutor/TutorPanel.jsx`,
  `studio/src/components/tutor/QuickActions.jsx`,
  `studio/src/components/workspace/CodeWorkspace.jsx`,
  `studio/src/components/workspace/OutputPanel.jsx`.
- `studio/src/lib/prompts/practice.js`, `studio/src/lib/prompts/tutor.js`,
  `studio/src/lib/prompts/base.js` (`buildSystemPrompt`, `courseContext`, `wrapUntrusted`,
  `appendLanguageInstruction`).
- `studio/src/lib/runner/index.js` (`describeRunner`, `runnerBase` re-export) and
  `studio/src/lib/runner/local.js` (read-only).
- `studio/test/tutor-panel.render.test.js`, `studio/test/i18n-catalogs.test.js`,
  `studio/test/i18n-keys.test.js`, `studio/test/repo.test.js`, `studio/test/beta-revisions.test.js` —
  established test patterns to mirror.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Card`, `Button`, `Badge`, `Spinner`, `ErrorNotice`, `EmptyState` (`components/ui/**`) — the whole
  review/history surface can be composed from these; `Badge` already has `success`/`warning`/`accent`
  tones for met/partial/not-met and the runner badge.
- `useStream` (`lib/ai/useStream.js`) — returns `{ status, error, start, stop }` and accepts any
  promise in `start(...)`, so both `generateJson` and `streamText` review flows reuse it unchanged.
- `getProvider(settings).generateJson({ system, messages, signal, validate, language })` — the
  existing strict-JSON path with one repair retry; the review flow mirrors it.
- `appendChat` / `listChat` / `listQuizAttempts` / `listRunResults` / `listRevisionLinks` — all reads
  and the review write; `onChange` keeps surfaces in sync.
- `decodeRunResult` / `encodeRunPayload` (`lib/runner/history.js`) — workspace history decoding.
- `describeRunner(language, { toolchains })` + the `Badge` in `CodeWorkspace` — the existing
  Browser/local distinction to re-label.
- `runnerBase(settings)` re-exported by `lib/runner/index.js` — the exact URL string to scope the
  acknowledgement to.

### Established Patterns
- Studio tests are Vitest 5 with `test.include = test/**/*.test.js`; component smoke tests use
  `react-dom/server` `renderToString` with a memory adapter installed in `beforeEach`
  (`repo.useAdapter(createMemoryAdapter())`), no DOM.
- Prompts are pure modules with exported constants (`NO_SOLUTION_RULE`, `TUTOR_RULES`,
  `MODE_INSTRUCTIONS`) asserted by prompt tests; learner content is always `wrapUntrusted`.
- i18n: flat JSON per namespace, `t('namespace.key', {vars})` only, and `i18n-keys.test.js` scans
  literal `t('…')` calls — every new literal must exist in both catalogs.
- Repo rows are stamped; adapters only filter on indexed fields; `emit(table, id, type)` drives UI
  refresh — components never write storage directly.
- Errors surface through `ErrorNotice`, which localizes known `ProviderError` codes.

### Integration Points
- `QuizPanel` ← `Lesson.jsx` props `{ lesson, course, onAttemptSaved }`; the completion stage is where
  the review + revise CTA land.
- `TutorPanel` ← `Lesson.jsx` / capstone page; `capstone` prop must keep the concept-only behavior
  (no review action in capstone mode — Phase 9 owns that surface).
- `CodeWorkspace` ← `Lesson.jsx`; its `start(kind)` path is where `revisionOf` and the
  acknowledgement interception hook in.
- `OutputPanel` ← `CodeWorkspace` (`output`, `runnerInfo`); this is where the runner badge and
  "Code runs on your machine" notice render.
- `repo/index.js` → every surface; the best-effort wrappers are additive around existing calls.

</code_context>

<specifics>
## Specific Ideas

- "Revise this attempt" is the *primary* (filled) button only after non-passing feedback; passing
  attempts show no revision CTA.
- Criteria delta is deliberately counts + per-criterion transitions only — no code diff (FEATURES
  recommends this and it keeps the panel cheap).
- Copy: "Code runs on your machine" is the exact phrase; the notice must not use "sandbox", "safe" or
  "isolated". It should say it runs with the learner's own permissions.
- Review records are self-describing (`surface`, `attemptTable`, `attemptId`, `criteria`) so the
  history pairing survives reloads and works identically on IndexedDB, SQLite and memory adapters.
- The best-effort emission change exists so a metrics bug can never block learning: the attempt is
  saved first, the event is opportunistic.

</specifics>

<deferred>
## Deferred Ideas

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

</deferred>

---

*Phase: 8-Revision Loop UI and Run-Location Disclosure*
*Context gathered: 2026-10-24*
