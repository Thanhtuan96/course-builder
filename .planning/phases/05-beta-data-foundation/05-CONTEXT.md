# Phase 5: Beta Data Foundation - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** Interactive (discuss inline; orchestrator answers below are user-locked)

<domain>
## Phase Boundary

Studio records trustworthy, content-free learning events and revision links at the repository
layer in every storage adapter (IndexedDB, memory, SQLite/remote, and the CLI paths that use the
same repo), stores activation once, and can compute activation, retention and the beta report
from those rows. The public API consumed by Wave 2 (`events.js` builders, repo read functions,
report JSON schema v1) is frozen by this phase's plan.

In scope:
- New `studio/migrations/0005_beta_loop.sql` (`learning_events`, `revision_links`, `beta_profile`)
- `studio/src/lib/repo/schema.js` (+ IDB `DB_VERSION` 4 → 5), `idb-adapter.js`, `memory-adapter.js`
- New `studio/src/lib/repo/events.js` (pure enum/validation/link builders)
- `studio/src/lib/repo/index.js` emission hooks, `revisionOf` params, read API
- New `studio/src/lib/beta/**` (`metrics.js`, `report.js`, strict zod report schema)
- `web/studio-db.js` schema version derived from applied migrations
- Tests: `studio/test/repo.test.js`, `adapter-contract.test.js`, `idb-upgrade.test.js`, new
  `studio/test/beta-*.test.js`, `test/studio-capstone-migration.test.js`

Out of scope (other phases):
- Any React/JSX component, i18n catalog, report UI, revision UI, runner notice (Phases 7–9)
- Spawning or parsing external evidence (Phase 9); Phase 5 only stores the event/checkpoint
- CLI command files (`bin/commands/*`) — they already call repo writes and get events for free
- Security/CSP/bridge work (Phase 2/6), CI wiring (Phase 4), any migration other than 0005
- Editing `STATE.md` / `ROADMAP.md` / `CLAUDE.md` (orchestrator-only per Execution Rules)

</domain>

<decisions>
## Implementation Decisions

### Meaningful event dictionary (frozen)
- **D-01:** The closed enum of meaningful kinds is exactly:
  `quiz_completed`, `recall_completed`, `answer_sent_for_review`, `workspace_run`,
  `exercise_completed`, `capstone_checkpoint`. Only these count for activation, week-1 and
  week-2. `lesson_completed`, app open, course creation, lesson generation, plain tutor
  messages, imports-as-such and adapter changes are **not** meaningful and are not recorded
  into `learning_events` at all. (ROADMAP success criterion 1 overrides the research table
  that listed `lesson_completed` as meaningful.)
- **D-02:** Exactly one event per meaningful action. `saveRunResult` emits `exercise_completed`
  when its `checks` payload is non-empty (a self-check run), otherwise `workspace_run`;
  never both. `createCapstoneSubmission` is idempotent on `externalId`, so a repeat import
  returns the existing row and emits no second event. A quiz attempt that carries
  `revisionOf` still emits only `quiz_completed` — revision counting comes from
  `revision_links`, not a second event. **Reversibility:** one-way — the enum is a frozen
  Wave-2 contract and historical rows cannot be reclassified after the cohort starts.
- **D-03:** `surface` is an enum (`quiz`, `recall`, `tutor`, `workspace`, `capstone`,
  `import`) used for grouping; refs (`course_id`, `lesson_id`, `ref_id`) are local UUIDs only.
  Events never carry dates beyond the stored local `day` and `created_at`.

### Emission points and privacy invariant
- **D-04:** Emission lives in `repo/index.js` write functions, never in pages/components:
  `saveQuizAttempt` → `quiz_completed`; `gradeCard` → `recall_completed`;
  `appendChat` with `role: 'user'` and `mode` in `check_answer|review` →
  `answer_sent_for_review` (other roles/modes emit nothing); `saveRunResult` per D-02;
  `createCapstoneSubmission` → `capstone_checkpoint` (`meta.source = external` when
  `testResults.source === 'external'`, else `in_app`). `updateLesson` status `done` and
  `importAll` emit nothing. CLI `review`/`import` get the same events because they call the
  same repo functions. **Reversibility:** costly — removing an emission point later loses data
  that cannot be backfilled.
- **D-05:** `recordEvent` enforces the privacy invariant in code: `kind` must be in the enum;
  `meta` keys are whitelisted per kind and only numbers, booleans or values from a small enum
  list are accepted (no free strings, no arrays of strings); serialized `meta_json` is capped
  at 512 chars. Any other input throws before the row is written. A sentinel-string test
  (course text, prompt, code, answer, API key) proves neither `learning_events` nor the built
  report can contain them.

### Revision links (frozen API)
- **D-06:** One `revision_links` table with `surface`, `course_id`, `lesson_id`,
  `attempt_table`/`attempt_id`, `feedback_table`/`feedback_id`,
  `revised_table`/`revised_id`, and `link_kind` in `explicit|inferred`. Every
  attempt-creating repo write (`saveQuizAttempt`, `appendChat`, `saveRunResult`,
  `createCapstoneSubmission`) accepts optional
  `revisionOf: { feedbackTable, feedbackId }`. Phase 5 stores links now; Phase 8 wires the
  UI and Phase 9 passes capstone checkpoint links. **Reversibility:** one-way — Wave 2 and 3
  build against this parameter shape.
- **D-07:** Explicit wins when `revisionOf` is supplied and the feedback row exists; a missing
  or invalid feedback row is ignored (the attempt still saves) so a UI bug can never block
  learning. Inference runs only when no explicit link was made: the latest prior attempt on
  the same artifact, with feedback created **after** that attempt and the new attempt within
  **72 hours** (absolute timestamps, not calendar days), produces one `inferred` link.
  Per-surface feedback predicates:
  - quiz: a previous `quiz_attempts` row on the same lesson plus an assistant `chat_messages`
    row with `mode: 'review'` on that lesson created after it;
  - tutor: a previous user `chat_messages` row with `mode: check_answer|review` on the lesson
    plus a later assistant row on the same lesson;
  - workspace: a previous `run_results` row on the same lesson + file whose checks contain at
    least one failure;
  - capstone: a previous `capstone_submissions` row on the capstone with a non-null
    `review_json` or `verdict`.
  Different artifact, attempt-before-feedback, or >72 h apart create no link (negative tests).
  Explicit and inferred are counted separately from `link_kind`.

### Beta profile, activation and metrics
- **D-08:** `beta_profile` holds a singleton row (`id = 'local'`) with `participant_id` (random
  UUID generated locally on first use), `activated_at` (ISO timestamp of the first meaningful
  event), and `activated_day` (the local calendar day key of that event). `getBetaProfile()`
  returns the row, creating it with `activated_at = null` when absent; the first meaningful
  event sets activation once and never rewrites it. Opening the app never creates or updates
  a meaningful record.
- **D-09:** Activation is offset **0**. Week-1 active = at least one meaningful event on local
  offsets **1–7**; week-2 return = at least one meaningful event on local offsets **8–14**;
  `week2MeaningfulDays` counts distinct meaningful local days in 8–14. Offsets are computed
  from `activated_day` with DST-safe local calendar arithmetic (reuse the `dayKey` /
  local-noon approach from `studio/src/lib/activity.js`), never UTC slicing. Events before
  activation clamp to 0 rather than producing negatives. Tests pin clocks in UTC+7, UTC−8 and
  a DST-transition week. **Reversibility:** costly — the definitions are pre-registered in the
  beta decision rules (Phase 10) and cannot change mid-cohort.
- **D-10:** Pure modules: `beta/metrics.js` exports `dayOffset()` and `computeMetrics()`;
  `beta/report.js` exports `buildBetaReport()` and `reportSchema`. Metrics input is rows plus
  an injected `now`; no I/O, no repo imports. The capstone summary
  (`started/submissions/externalEvidence/verdict`) is supplied by the caller.

### Report schema v1 (frozen)
- **D-11:** Strict zod object (unknown keys rejected), `schemaVersion: 1`. Fields:
  - `schemaVersion`, `participantId`, `generatedAtDayOffset`
  - `app: { version, storage: indexeddb|sqlite|memory|remote, provider: null|<bridge|byok>:<enum> }`
  - `activation: { activated, firstEventKind|null }`
  - `window: { activeDayOffsets: number[] }` (sorted unique local offsets, 0–14)
  - `loops: { byKind: { all six kinds: number }, revisions: { quiz, tutor, workspace,
    capstone, explicit, inferred: number } }`
  - `retention: { week1Active, week2Return, week2MeaningfulDays }`
  - `capstone: { started, submissions, externalEvidence, verdict|null }`
  No course text, prompts, code, answers, keys, provider URLs, model names, or repository IDs.
  Provider is a category string only. The builder is the single producer; Phase 7 previews and
  downloads it, Phase 10 validates imports with the same schema. **Reversibility:** one-way —
  published `schemaVersion: 1` is a cross-phase contract.

### Schema version and upgrade
- **D-12:** One shared constant source: `studio/src/lib/repo/schema.js` exports
  `LATEST_MIGRATION_VERSION = 5` and `SCHEMA_VERSION = LATEST_MIGRATION_VERSION`. IndexedDB
  `DB_VERSION` becomes 5. `web/studio-db.js` derives its reported `schemaVersion` at startup
  from the **highest numeric prefix in the applied `d1_migrations` rows** (falling back to the
  shared constant when the table is empty), and `info()` / `/api/studio/db/health` /
  `exportAll().schemaVersion` all use that derived value. Existing data upgrades with
  `0005` applied additively; backup/restore round-trips `learning_events`, `revision_links`
  and `beta_profile` through `exportAll`/`importAll` on every adapter.
- **D-13:** Authorized out-of-Owns writes (orchestrator-approved on 2026-10-22):
  - `test/fixtures/migrations.sha256.json` gains the `0005_beta_loop.sql` hash in the same
    change, as required by Phase 1 decision D-11 and `test/migrations.test.js`.
  - `test/studio-api.test.js` — change only the `/db/health` `schemaVersion` assertion from `1`
    to the derived value (`5`) because DEBT-03 makes the old assertion false; Phase 2 owns this
    file in Wave 1.
  - `scripts/smoke-pack.mjs` — update only the stale comment that says the health
    `schemaVersion` is "pinned at 1" (it asserts `typeof === 'number'`, not the value).
  No other file outside Phase 5's Owns list is edited.

### the agent's Discretion
- Internal naming/structuring inside `events.js`, `metrics.js`, `report.js`; exact zod error
  wording; whether metrics helpers are split across files as long as the exported API in D-06,
  D-10 and D-11 is preserved.
- The exact migration DDL (column order, extra indexes) as long as it is D1-compatible,
  additive, mirrors `0004_capstone.sql` conventions and exposes the columns above.
- Test file split (`beta-events`, `beta-metrics`, `beta-report`, or one file) and fixture
  shapes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requirements
- `.planning/ROADMAP.md` § "Phase 5: Beta Data Foundation" — goal, Owns, success criteria
- `.planning/ROADMAP.md` § "Execution Rules" — ownership, migrations, lockfiles, merge discipline
- `.planning/REQUIREMENTS.md` — INSTR-01, INSTR-02, INSTR-03, INSTR-04, DEBT-03
- `.planning/PROJECT.md` — beta measurement constraints and key decisions

### Research (authoritative design, except where ROADMAP wins)
- `.planning/research/ARCHITECTURE.md` § "Pattern 2: Instrumentation inside the repository, not in pages" — emission map and privacy rule
- `.planning/research/ARCHITECTURE.md` § "Pattern 3: Revision as a link table" — table shape, `revisionOf`, 72 h inference
- `.planning/research/ARCHITECTURE.md` § "Metrics definitions" and "Report JSON shape"
- `.planning/research/ARCHITECTURE.md` § "Schema Changes (single additive migration)" — 0005 DDL sketch
- `.planning/research/PITFALLS.md` — local-day/DST, activation off-by-one, content leakage, cohort metrics
- `.planning/research/SUMMARY.md` § Phase D — phase scope and deliverable list

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — repo layer, adapters, CLI↔Studio DB path
- `.planning/codebase/TESTING.md` — root vs Studio Vitest split, adapter-contract reuse
- `.planning/codebase/CONVENTIONS.md` — ES modules, JSDoc, 2-space style, kebab-case files

### Source of truth (read before changing)
- `studio/src/lib/repo/index.js` — all write/read functions and where hooks land
- `studio/src/lib/repo/schema.js` — `TABLES`, `SCHEMA_VERSION`, index contract
- `studio/src/lib/repo/idb-adapter.js` / `memory-adapter.js` / `remote-adapter.js` — StorageAdapter contract
- `studio/migrations/0001_init.sql` … `0004_capstone.sql` — D1-compatible conventions to mirror
- `web/studio-db.js` — `runMigrations`, `introspectSchema`, `info()`, `exportAll`/`importAll`
- `studio/src/lib/activity.js` and `studio/src/lib/course.js` (`dayKey`) — local calendar-day helpers
- `studio/src/lib/repo/select-adapter.js` / `bin/studio-store.js` — adapter selection and CLI wiring
- `test/studio-capstone-migration.test.js`, `studio/test/adapter-contract.test.js`, `studio/test/idb-upgrade.test.js` — patterns to extend
- `test/migrations.test.js` + `test/fixtures/migrations.sha256.json` — released-migration pinning

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `repo/index.js` already centralises every meaningful write (`saveQuizAttempt`, `gradeCard`,
  `appendChat`, `saveRunResult`, `createCapstoneSubmission`), so emission is additive there.
- `mem`/IDB adapters are dumb table stores driven by `TABLES` in `schema.js`; adding three tables
  automatically exposes them in `exportAll`/`importAll`/`clearAll` with no adapter-specific logic.
- `dayKey()` and `activity.js`'s local-noon arithmetic are the established DST-safe local-day
  helpers; reuse them rather than adding a second date convention.
- `test/studio-capstone-migration.test.js` already demonstrates the partial-migrations upgrade
  pattern (copy 0001–0003 into a temp dir, open, upgrade, assert rows survive) to copy for 0005.
- `adapter-contract.test.js` is exported as `runAdapterContract` and reused by the root suite.

### Established Patterns
- Adapters filter only on indexed fields (`assertIndexedField`); richer queries/filtering live in
  `repo/index.js`. New read APIs must follow that rule.
- Repo rows are stamped (`id`, `owner_id`, `created_at`, `updated_at`, `deleted_at`) by
  `stampCreate`/`stampUpdate`; adapters stamp nothing.
- Migrations are D1-compatible: TEXT UUID PKs, `owner_id`, ISO TEXT timestamps, `deleted_at`,
  JSON-as-TEXT, no PRAGMA, `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`.
- Studio and root suites are separate Vitest installs; root tests can import Studio files.

### Integration Points
- `bin/studio-store.js` installs the SQLite adapter for CLI `review`/`import`, which then goes
  through the same repo functions — events and revision inference work there unchanged.
- `web/studio-db.js#info()` feeds `remote-adapter.info()` and `/api/studio/db/health`; changing
  its `schemaVersion` is enough for DEBT-03.
- `studio/src/lib/repo/select-adapter.js` swaps adapters at runtime; event/profile rows must move
  with `exportAll`/`importAll` so storage choice does not change metrics.

</code_context>

<specifics>
## Specific Ideas

- The orchestrator's rules for this phase: ROADMAP success criteria win over research where they
  differ (notably `lesson_completed` is **not** meaningful); freeze the enum, `revisionOf`, and
  report schema v1 in the plan; store revision links now with no UI callers; health reports the
  highest applied migration prefix; one shared constant source; IDB 4 → 5; backup/restore
  round-trips the new tables.
- Sentinel-string test is mandatory and should exercise both the event rows and a fully built
  report, including a fake API key shaped like `sk-live-…`.

</specifics>

<deferred>
## Deferred Ideas

- Report preview/download UI and day-7/day-14 nudges — Phase 7.
- "Revise this attempt" UI, attempt-history/criteria-delta rendering and rubric feedback — Phase 8.
- Playwright external evidence parsing and capstone rubric checks — Phase 9.
- Cohort aggregation script and decision thresholds — Phase 10.
- Any optional `run_results.code_json`/`code_hash` columns — not needed for INSTR-01..04; leave to
  a later phase if a real need appears.

</deferred>

---

*Phase: 05-Beta Data Foundation*
*Context gathered: 2026-10-22*
