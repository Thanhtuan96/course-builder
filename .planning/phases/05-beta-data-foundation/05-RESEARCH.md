# Phase 5: Beta Data Foundation - Research

**Researched:** 2026-10-22
**Domain:** Local-first storage contract (IndexedDB / memory / SQLite / remote), additive D1-style migrations, repository-layer event instrumentation, pure metrics/report builder with zod 4
**Confidence:** HIGH for integration points (every claim below was read from source this session and re-verified by running the suites); MEDIUM for a few *semantic* choices the frozen decisions leave open (flagged in Open Questions).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Meaningful event dictionary (frozen)
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

#### Emission points and privacy invariant
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

#### Revision links (frozen API)
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

#### Beta profile, activation and metrics
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

#### Report schema v1 (frozen)
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

#### Schema version and upgrade
- **D-12:** One shared constant source: `studio/src/lib/repo/schema.js` exports
  `LATEST_MIGRATION_VERSION = 5` and `SCHEMA_VERSION = LATEST_MIGRATION_VERSION`. IndexedDB
  `DB_VERSION` becomes 5. `web/studio-db.js` derives its reported `schemaVersion` at startup
  from the **highest numeric prefix in the applied `d1_migrations` rows** (falling back to the
  shared constant when the table is empty), and `info()` / `/api/studio/db/health` /
  `exportAll().schemaVersion` all use that derived value. Existing data upgrades with
  `0005` applied additively; backup/restore round-trips `learning_events`, `revision_links`
  and `beta_profile` through `exportAll`/`importAll` on every adapter.
- **D-13:** `test/fixtures/migrations.sha256.json` gains the `0005_beta_loop.sql` hash in the
  same change, as required by Phase 1 decision D-11 and `test/migrations.test.js`. This is the
  only write outside Phase 5's Owns list and is explicitly authorized by the carried decision.

### the agent's Discretion
- Internal naming/structuring inside `events.js`, `metrics.js`, `report.js`; exact zod error
  wording; whether metrics helpers are split across files as long as the exported API in D-06,
  D-10 and D-11 is preserved.
- The exact migration DDL (column order, extra indexes) as long as it is D1-compatible,
  additive, mirrors `0004_capstone.sql` conventions and exposes the columns above.
- Test file split (`beta-events`, `beta-metrics`, `beta-report`, or one file) and fixture
  shapes.

### Deferred Ideas (OUT OF SCOPE)
- Report preview/download UI and day-7/day-14 nudges — Phase 7.
- "Revise this attempt" UI, attempt-history/criteria-delta rendering and rubric feedback — Phase 8.
- Playwright external evidence parsing and capstone rubric checks — Phase 9.
- Cohort aggregation script and decision thresholds — Phase 10.
- Any optional `run_results.code_json`/`code_hash` columns — not needed for INSTR-01..04; leave to
  a later phase if a real need appears.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INSTR-01 | Studio records meaningful learning events locally at the repository layer, identically across browser and SQLite storage: quiz completed, recall completed, answer sent for tutor/coach review, workspace run, exercise/self-check completed, revision after feedback, capstone checkpoint. Marking a lesson done or opening the app does not count | Emission hooks in `repo/index.js` (exact signatures in §3), three additive tables in `schema.js` + `0005` (§1), adapter contract extended so memory/IndexedDB/remote(SQLite) run the same assertions (§7). Critical: `checks` discriminator shape (§3.6). |
| INSTR-02 | Events store only enum kinds, numbers and local calendar days — never course text, prompts, code, answers or keys | Pure `events.js` validators (D-05) + sentinel test; meta whitelist and 512-char cap design in §3.4; privacy test must cover both `learning_events` rows and the built report (§7, §8). |
| INSTR-03 | Studio stores activation as the first meaningful action (day offset 0); week 1 = offsets 1–7; week-2 return = ≥1 meaningful action on offsets 8–14, computed in the learner's local calendar days | `beta/metrics.js` design (§5), the `dayKey('YYYY-MM-DD')` UTC-parsing trap (§5.2), calendar-day-number arithmetic that survives UTC+7/UTC−8/DST (§5.3), pinned-clock test topology (§7). |
| INSTR-04 | A revision is linked to the feedback it responds to: explicitly when the learner presses "Revise", or inferred for the same artifact when feedback exists after the prior attempt and the new attempt is within 72 hours; the two are counted separately | `revisionOf` threading + explicit-first/inference-second algorithm with per-surface predicates (§4), index requirements for adapter-identical reads (§4.2), negative-test shapes (§4.6). |
| DEBT-03 | `/api/studio/db/health` reports the schema version derived from applied migrations | `runMigrations` / `d1_migrations` mechanics and the exact derivation (§2), `db.schemaVersion` consumer chain (§2.3), plus the two out-of-Owns assertions a truthful version forces us to update (§2.4). |
</phase_requirements>

## Summary

Phase 5 is almost entirely an **additive-data + contract-freeze** phase: three new tables, two pure modules, emission hooks inside one already-centralised repository, and one honest number on a health route. There is no new dependency, no new UI, and no new network path. `zod@4.6.7` is already a `studio/` runtime dependency (`studio/package.json`) and is currently imported nowhere in `studio/src` — this phase is its first consumer.

The repository layer is a genuinely convenient seam: every meaningful write already funnels through `studio/src/lib/repo/index.js`, and all four adapters are dumb table stores driven by `TABLES` in `schema.js`, so adding three `TABLES` entries automatically teaches `exportAll`, `importAll`, `clearAll` and the IDB versionchange handler about them. The two places where the convenient story breaks are (a) `saveRunResult` **always** receives a non-null `checks` object from the UI, so D-02's discriminator must test the *array inside* it, and (b) existing IndexedDB databases do not get the new object stores unless `DB_VERSION` is bumped — without a bump, `db.transaction('learning_events')` throws `NotFoundError` inside `exportAll`/`list`, which is exactly the "browser cohort reports zero" pitfall.

The second-highest-risk area is time. `dayKey()` is correct for a `Date`/ISO timestamp but wrong for a stored `YYYY-MM-DD` string in negative-offset zones (`new Date('2026-01-01')` is UTC midnight; in `America/Los_Angeles` it prints `getDate() === 31`). Verified this session. Offsets must therefore never round-trip a stored day key through `new Date(string)`; use calendar-component arithmetic (`Date.UTC(y, m-1, d) / 86400000`) which is DST-immune by construction and still pins to *local* days at write time.

No new packages are installed, so no Package Legitimacy Audit is required. Baseline is green before any change: root `npx vitest run` = 14 files / 294 tests; `cd studio && npx vitest run` = 43 files / 372 tests (both measured this session).

**Primary recommendation:** plan five serial plans inside the phase — (1) migration + schema/adapters + derived schema version, (2) pure `events.js` + repository emission/profile/read API, (3) `revisionOf` + explicit/inferred linking, (4) pure `beta/metrics.js` + `beta/report.js` + zod v1, (5) cross-adapter/backup/privacy/upgrade verification — and treat `checks`-array discrimination, `dayKey('YYYY-MM-DD')`, and the `test/studio-api.test.js` schemaVersion assertion as mandatory plan-level checkpoints.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event schema + DDL (`learning_events`, `revision_links`, `beta_profile`) | Database / Storage | — | SQL is the source of truth; `schema.js` mirrors it for non-SQL adapters only. |
| Event emission | Domain / repository (`studio/src/lib/repo/index.js`) | — | Only place all surfaces (SPA, CLI `review`, CLI `import`) converge; pages/components must never emit (Anti-Pattern 2). |
| Meta validation / privacy invariant | Pure library (`events.js`) | Repository (throws before write) | Pure functions are testable without adapters; repository is the enforcement point. |
| Revision inference | Domain / repository | Pure library (row builders) | Needs indexed `list()` reads, so it cannot be pure; predicates can be pure helpers. |
| Day-key writing | Pure library (`course.js#dayKey`) | Repository | One established local-day convention already used by `activity`. |
| Activation / retention / loops / report assembly | Pure library (`beta/*`) | — | D-10: no I/O, no repo imports; caller injects rows, `now`, app info and capstone summary. |
| Schema version reporting | Server / DB adapter (`web/studio-db.js`) | Shared constant (`schema.js`) | The value must describe the DB actually opened, not the code's idea of it. |
| Backup/restore of new tables | Storage adapter (`TABLES`) | Repository `exportAll`/`importAll` passthrough | Adapters iterate the table registry; no per-table logic. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` (`DatabaseSync`) | Node ≥ 22.5 (`STUDIO_MIN_NODE = { major: 22, minor: 5 }` — `bin/node-version.js:10`) | Applies `0005`, stores rows | Already the Studio server's only DB driver; guarded by `requireStudioNode`. |
| IndexedDB (browser) + `fake-indexeddb/auto` (tests) | `fake-indexeddb ^6.2.5` | Browser store parity | Existing adapter path; contract tests already use it. |
| `zod` | `4.6.7` (declared `^4.6.7` in `studio/package.json`) | Strict report schema | Already installed in `studio/` **dependencies**; schema reused by Phases 7/10. |
| Vitest | root `5.0.5`, studio `5.0.4` (measured from run banners) | Both suites | Separate installs; chained, not `projects`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto.randomUUID` (via `globalThis.crypto`) | Node core | Participant ID + all row IDs | Reuse the existing `uuid()` fallback in `repo/index.js:18-21`. |
| `paper`-free date math (no library) | — | Local day keys + offsets | D-09 forbids UTC slicing; project already avoids date libs (`srs.js`, `activity.js`). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Repository-layer emission | `useEffect`/component emission | Double counting under StrictMode, CLI paths miss events, content leakage unpoliceable — explicitly rejected (ARCHITECTURE Anti-Pattern 2). |
| `revision_links` table | `revises_id` columns on 4 attempt tables | 4 migrations, 4 query paths, no explicit/inferred distinction; frozen decision D-06 chose the link table. |
| Deriving `firstEventKind` from a new `beta_profile` column | Store `first_event_kind` on the profile | D-08's column list is participant/activated_at/activated_day; deriving from the earliest event avoids widening the frozen profile shape (see Open Question O2). |
| `z.object(...).strict()` | `z.strictObject(...)` | Equivalent in 4.6.7, but the installed typings mark `.strict()` as "Consider `z.strictObject(A.shape)` instead" — use `z.strictObject`. |

**Installation:** none. No package is added or upgraded by this phase (D-13 only authorizes the migration-hash fixture write).

## Package Legitimacy Audit

Not applicable — this phase installs **no** external package. `zod` is already present in `studio/package.json` `dependencies` at `^4.6.7`, and `npm view zod version` returned `4.6.7` this session (registry check only; no new install).

## Architecture Patterns

### System Architecture Diagram

```
 meaningful action (SPA / CLI)
        │
        ▼
repo/index.js write fn ──► stampCreate (id, owner_id, created_at…)
        │                         │
        │                         ├─► adapter.put(<entity>)  ──┐
        │                         ├─► events.js validators      │
        │                         │     (pure: kind enum,       │
        │                         │      meta whitelist,        │
        │                         │      ≤512 chars)            │
        │                         ├─► adapter.put('learning_events', row)
        │                         │      └─► ensureBetaProfile(): set activated_at/day once
        │                         └─► linkRevision():
        │                               explicit revisionOf? ─► validate feedback row
        │                               else infer (latest prior attempt + feedback + ≤72h)
        │                                       └─► adapter.put('revision_links', row)
        ▼
adapter (memory | idb | remote | node sqlite)
        │
        ▼
exportAll()/importAll()/clearAll()  ← iterate TABLE_NAMES / introspected schema (free)
        │
        ▼
beta/metrics.js (pure: rows + now)  ──► beta/report.js (pure + zod strict)
        │                                         │
        ▼                                         ▼
activation · window · loops · retention      reportSchema.parse() → v1 JSON
```

### Recommended Project Structure (additions only)
```
studio/migrations/0005_beta_loop.sql     # new: 3 tables + indexes (mirrors 0004 conventions)
studio/src/lib/repo/events.js            # new: PURE enums, meta whitelist, row builders
studio/src/lib/repo/schema.js            # +3 TABLES entries, LATEST_MIGRATION_VERSION/SCHEMA_VERSION
studio/src/lib/repo/idb-adapter.js       # DB_VERSION 4 → 5 (only literal change)
studio/src/lib/repo/index.js             # emit hooks, revisionOf, profile/read API
studio/src/lib/beta/metrics.js           # new: dayOffset(), computeMetrics()
studio/src/lib/beta/report.js            # new: reportSchema, buildBetaReport()
web/studio-db.js                         # derived schemaVersion after runMigrations()
studio/test/beta-events.test.js          # new
studio/test/beta-metrics.test.js         # new (pinned TZ clocks)
studio/test/beta-report.test.js          # new (schema + privacy sentinel)
studio/test/beta-revisions.test.js       # new (explicit/inferred + negatives)
```

### Pattern 1: Table-registry-driven adapter support

**What:** Adapters are registry-driven, not table-aware. `idb-adapter.js` builds one object store per `TABLE_NAMES` entry and backfills missing indexes; `memory-adapter.js` builds one `Map` per table; `exportAll`/`importAll`/`clearAll` iterate the same list. SQLite introspects `sqlite_master`, so it picks up new tables with zero code change.

```js
// studio/src/lib/repo/idb-adapter.js:29-44 (verbatim)
function createStores(db, tx) {
  for (const table of TABLE_NAMES) {
    const spec = tableSpec(table);
    let os;
    if (!db.objectStoreNames.contains(table)) {
      os = db.createObjectStore(table, { keyPath: spec.id });
    } else {
      // Existing store: keep it and its rows, only backfill indexes added since it was created.
      os = tx.objectStore(table);
    }
    for (const field of spec.indexes) {
      if (!os.indexNames.contains(field)) os.createIndex(field, field, { unique: false });
    }
  }
  if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta'); // legacy seed store
}
```

**When to use:** every new table in this phase. Add the `TABLES` entry + the `0005` DDL; do **not** write per-table adapter code.

### Pattern 2: Emission as a post-write step inside the repository

**What:** validate → write entity → write event → (maybe) write link, all inside the same repo function. An event write failure must not leave a half-written attempt *and* must not be silently swallowed (it is a local write; failure means storage failure, and the caller already handles rejected adapter promises).

**When to use:** all six kinds. Never from `useEffect`.

```js
// shape only — values are the frozen enum from D-01/D-04
async function saveQuizAttempt(lessonId, { questions, answers, score, total, revisionOf } = {}) {
  const row = stampCreate({ lesson_id: lessonId, questions_json: JSON.stringify(questions),
                            answers_json: JSON.stringify(answers), score, total });
  await adapter.put('quiz_attempts', row);
  await recordEvent({ kind: 'quiz_completed', surface: 'quiz', lessonId, refId: row.id,
                      meta: { total, score }, now });
  await maybeLinkRevision({ surface: 'quiz', attemptTable: 'quiz_attempts', attempt: row,
                            lessonId, revisionOf, now });
  emit('quiz_attempts', row.id, 'create');
  return row;
}
```

### Pattern 3: Explicit-first, infer-second revision linking

**What:** `revisionOf` (frozen API) wins when the feedback row can be loaded; otherwise infer per D-07. Never both; one link per revised attempt.

**When to use:** `saveQuizAttempt`, `appendChat`, `saveRunResult`, `createCapstoneSubmission`.

### Anti-Patterns to Avoid
- **Emitting after an idempotency early-return.** `createCapstoneSubmission` returns the existing row at `repo/index.js:653-656`; the event must be emitted only on the path that creates a row.
- **Using `checks != null` as the `exercise_completed` test.** See §3.6 — it classifies every run as a self-check.
- **`new Date(storedDayString)` for offset math.** Verified day-shift bug (§5.2).
- **Filtering on a non-indexed field in repo reads.** memory/IDB throw `Field "x" is not indexed on table "y"` (`schema.js:109-115`); SQLite silently succeeds — a divergence that only shows up on a real learner's machine.
- **Serializing event rows into the report.** The report is built from an allowlist schema (D-11), never spread from rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| New-table storage in 3 adapters | Per-table branching in adapters | `TABLES` registry entries | `createStores`/`stores`/`exportAll` already loop it. |
| IDB schema migration | Ad-hoc `objectStoreNames` probing at runtime | `DB_VERSION` bump + `createStores` | Versionchange is the only place IDB allows creating stores. |
| Local calendar-day math | `(b - a) / 86400000`, `toISOString().slice(0,10)` | `dayKey()` at write time + UTC-calendar-component difference | D-09; PITFALLS #9. |
| Strict JSON schema | Hand-written key allowlist | `z.strictObject` | §6: installed, strict at every level, `unrecognized_keys` issue code. |
| Migration bookkeeping | New numbering/registry | `d1_migrations` + `runMigrations` | D1-compatible; `test/migrations.test.js` already enforces contiguity. |
| UUID generation | Custom ID format | `uuid()` in `repo/index.js` (crypto.randomUUID + fallback) | Consistent with every other row. |

## Migration Mechanics (answers research question 1 & 2)

### 1.1 Exact adapter/schema/version interaction

| Element | Current value | Evidence |
|---|---|---|
| `TABLES` | 13 tables, each `{ id, fields, indexes }` | `[VERIFIED: studio/src/lib/repo/schema.js:17-88]` — e.g. `activity: { id: 'id', fields: ['id','owner_id','day','kind','ref_id','created_at','updated_at','deleted_at'], indexes: ['day','kind'] }` |
| `TABLE_NAMES` | `Object.keys(TABLES)` | `[VERIFIED: studio/src/lib/repo/schema.js:90]` `export const TABLE_NAMES = Object.keys(TABLES);` |
| `SCHEMA_VERSION` (shared) | `1` | `[VERIFIED: studio/src/lib/repo/schema.js:92]` `export const SCHEMA_VERSION = 1;` |
| IDB version | `4` | `[VERIFIED: studio/src/lib/repo/idb-adapter.js:22]` `export const DB_VERSION = 4;` with the rationale at `:18-21`: "Bumping the version is what makes `onupgradeneeded` run for browsers that already have an older database — otherwise the new stores/indexes would never be created." |
| SQLite version constant | `1` (separate literal) | `[VERIFIED: web/studio-db.js:26]` `export const SCHEMA_VERSION = 1;` |
| Health route | echoes `db.schemaVersion` | `[VERIFIED: web/studio-api/db.js:17]` `res.json({ ok: true, kind: 'sqlite', path: db.path, schemaVersion: db.schemaVersion });` |

**Steps to add the three tables (order matters):**
1. `studio/migrations/0005_beta_loop.sql`: `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` only (mirror `0004_capstone.sql:15-51`). No `PRAGMA`, no `ALTER`, TEXT UUID PKs, `owner_id TEXT NOT NULL DEFAULT 'local'`, ISO TEXT `created_at`/`updated_at` (`NOT NULL`), nullable `deleted_at`, JSON as TEXT.
2. `schema.js` `TABLES` entries whose `fields` are **exactly** the DDL columns (SQLite `put()` drops keys not present in the introspected schema; IDB/memory store whatever the repo sends — divergence here silently corrupts backups).
3. `schema.js`: `export const LATEST_MIGRATION_VERSION = 5; export const SCHEMA_VERSION = LATEST_MIGRATION_VERSION;`
4. `idb-adapter.js`: `DB_VERSION = 5` (+ extend the v1..v4 comment).
5. `web/studio-db.js`: derive `schemaVersion` from `d1_migrations` instead of the literal.
6. `test/fixtures/migrations.sha256.json`: add `0005_beta_loop.sql` hash (D-13).

**Why bumping `DB_VERSION` is not optional (verified by execution):** opening a DB at the old version and calling `transaction('learning_events')` throws:

```
THROWS: NotFoundError No objectStore named learning_events in this database
```

and with a versionchange handler creating the store it succeeds. `[VERIFIED: local fake-indexeddb probe, 2026-10-22]` Because `idb-adapter.js:184-192` and `:202-207` iterate `TABLE_NAMES` inside `exportAll`/`importAll`/`clearAll`, an un-bumped version makes **backup, restore and clear throw** for every existing browser user — not merely "miss the new table".

### 1.2 What breaks in `exportAll` / `importAll` / `clearAll`

| Function | memory (`memory-adapter.js`) | IDB (`idb-adapter.js`) | SQLite (`studio-db.js`) |
|---|---|---|---|
| `exportAll` | Iterates `TABLE_NAMES` (`:79-89`) → includes new tables automatically | Iterates `TABLE_NAMES` (`:168-178`) → **throws NotFoundError if version not bumped** | Iterates `Object.keys(schema)` from `introspectSchema` (`:284-296`) → includes new tables automatically |
| `importAll` | Iterates `TABLE_NAMES`, `dump.tables[t] \|\| []` (`:90-100`) → old dumps (no new tables) import fine | Iterates `TABLE_NAMES`, skips empty (`:179-194`) → same, **but throws without the bump** | Iterates `Object.keys(schema)`, `dump.tables[table] \|\| []` (`:298-318`) → same |
| `clearAll` | `stores[t].clear()` (`:104-107`) | `objectStore(table).clear()` (`:199-208`) | `DELETE FROM` per introspected table (`:329-339`) |

`validateDump` only checks `dump.app !== APP_ID` and that `tables` is an object (`[VERIFIED: memory-adapter.js:111-115]`), so a pre-0005 backup (`schemaVersion: 1`, no new tables) restores cleanly and leaves the new tables empty. `d1_migrations` is **not** in the introspected schema (excluded at `web/studio-db.js:138-140`), so it is never exported, imported or cleared.

### 2.1 `runMigrations` + `d1_migrations`

`[VERIFIED: web/studio-db.js:87-127]`
- `ensureMigrationsTable` creates `d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)`.
- `runMigrations` reads `SELECT name FROM d1_migrations` into a `Set`, lists `*.sql`, `.sort()`s (lexicographic — correct for zero-padded `000N_`), skips applied names, runs each inside `BEGIN`/`COMMIT`, inserts the **filename** (e.g. `0005_beta_loop.sql`) and rolls back with `StudioDbError('Migration <file> failed: …', 'migration_failed')`.
- `createStudioDb` calls it before `introspectSchema` (`:172-174`).

**Safe derivation of the highest applied prefix:**
```js
function appliedMigrationVersion(db) {
  const rows = db.prepare(`SELECT name FROM "${MIGRATIONS_TABLE}"`).all();
  return rows.reduce((max, r) => {
    const m = /^(\d+)_/.exec(String(r.name));
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
}
```
Guard rails the plan must state: ignore malformed names (`Number.isInteger`), never parse a suffix, never `COUNT(*)` (a hole would lie), and fall back to the shared constant when the table is empty (D-12). Note `readdirSync` is not validated for contiguity at runtime — `test/migrations.test.js:45-55` is the only guard, so `0005` must really be next (it is; `0001`–`0004` exist).

### 2.3 Consumer chain to keep in sync
`createStudioDb` returns `schemaVersion` (`web/studio-db.js:344`) used by:
- `db.info()` (`:355-358`) → `remote-adapter.info()` (`studio/src/lib/repo/remote-adapter.js:140-147`, which caches `cachedHealth.schemaVersion`) and `bin/studio-store.js#info()` (`bin/studio-store.js:73-75`).
- `/api/studio/db/health` (`web/studio-api/db.js:17`).
- `exportAll().schemaVersion` — **two** producers: `web/studio-db.js:292` (SQLite) and `SCHEMA_VERSION` in `idb-adapter.js:174` / `memory-adapter.js:85`. D-12 requires all to be `5` after the shared constant changes, except SQLite which reports the *derived* value.

### 2.4 Out-of-Owns assertions that DEBT-03 forces (plan-level checkpoint)
- `[VERIFIED: test/studio-api.test.js:127]` `expect(body).toMatchObject({ ok: true, kind: 'sqlite', schemaVersion: 1 });` — must become `5` (or a derived-value assertion). This file is **not** in the phase's Owns list.
- `[VERIFIED: scripts/smoke-pack.mjs:246]` comment: "`schemaVersion` is the adapter schema revision (pinned at 1 by the API tests)". The script only asserts `typeof === 'number'` (`:243`), but the comment must not be left lying.
- `studio/test/storage-choice.test.js:57,71,84` uses fake servers that return `1`; they do not assert against the real DB, so no change is strictly required (leave alone unless the plan wants consistency).

The plan must explicitly authorize these two edits (extend D-13's spirit) or DEBT-03 cannot be satisfied truthfully. Flag as a checkpoint, not a silent touch.

## Repository Emission Points (research question 3)

### 3.1 Exact signatures and returns (verbatim from `repo/index.js`)

| Function | Signature (summary) | Returns | Line |
|---|---|---|---|
| `saveQuizAttempt` | `(lessonId, { questions = [], answers = [], score = null, total = null } = {})` | the `quiz_attempts` row (`{ id, owner_id, lesson_id, questions_json, answers_json, score, total, created_at, updated_at, deleted_at }`) | `[VERIFIED: studio/src/lib/repo/index.js:295-306]` |
| `gradeCard` | `(cardId, grade)` — grade `0 again \| 1 hard \| 2 good \| 3 easy` (JSDoc at `:373`) | `{ card: next, review }` where `review` = `reviews` row `{ card_id, grade, reviewed_at }` | `[VERIFIED: studio/src/lib/repo/index.js:375-400]` |
| `appendChat` | `(lessonId, msg)` where `msg = { role, content, mode? }`; stored as `mode: msg.mode \|\| null` | the `chat_messages` row | `[VERIFIED: studio/src/lib/repo/index.js:408-413]` |
| `saveRunResult` | `({ lessonId, fileId = null, runner = 'browser', language = null, stdout = '', stderr = '', exitCode = null, checks = null, durationMs = null })` | the `run_results` row | `[VERIFIED: studio/src/lib/repo/index.js:512-537]` |
| `createCapstoneSubmission` | `({ capstoneId, content_md = '', repo_url = null, files = null, testResults = null, review = null, verdict = null, externalId = null })` | decoded submission (JSON columns parsed) | `[VERIFIED: studio/src/lib/repo/index.js:641-672]` |
| `updateLesson` | `(id, patch = {})`, allowed keys `['title','summary','status','completed_at','position','current_version_id']` | updated row (sets `completed_at` when status becomes `done`) | `[VERIFIED: studio/src/lib/repo/index.js:220-239]` |
| `importAll` | `(dump)` → `adapter.importAll(dump)` then `emit('*', null, 'import')` | `{ imported }` | `[VERIFIED: studio/src/lib/repo/index.js:736-740]` |

All rows are stamped by `stampCreate` → `{ id (uuid), owner_id: 'local', created_at, updated_at, deleted_at: null }` `[VERIFIED: studio/src/lib/repo/index.js:59-68]`.

### 3.2 Callers that matter (and what could double-emit)

| Repo fn | SPA caller | CLI caller | Double-emit analysis |
|---|---|---|---|
| `saveQuizAttempt` | `studio/src/components/practice/QuizPanel.jsx:93` | `bin/commands/import.js:436` | Import checks a signature (`score\|total\|created_at`) against existing rows first (`import.js:432-435`), so re-import does not re-emit. **But** it calls `store.put('quiz_attempts', {...row, created_at, updated_at: created_at})` right after (`:437`), backdating the attempt while the event keeps *today's* day. See Pitfall P6. |
| `gradeCard` | `studio/src/pages/Review.jsx:77` | `bin/commands/review.js:181` | One event per graded card (a 20-card session = 20 events). Both paths call the same function. |
| `appendChat` | `TutorPanel.jsx:138` (user), `:125` (assistant draft) | none | Assistant rows carry the same `mode` as the pending turn but must **not** emit (`role !== 'user'`). |
| `saveRunResult` | `CodeWorkspace.jsx:286` | none | Always called after a run; `checks` is always an object (see 3.6). |
| `createCapstoneSubmission` | `studio/src/pages/Capstone.jsx:190` | `bin/commands/import.js:406` | externalId early-return (`repo/index.js:653-656`) is the idempotency guarantee D-02 relies on: emit after the guard, on the create path only. |
| `updateLesson` | `Lesson.jsx:44` (`done`), `:109` (`active`) | `import.js:300` | Must emit **nothing** (D-04). |
| `importAll` | `DataPanel.jsx:97,119` | — | Must emit **nothing**; it is the restore path. `select-adapter.js:262` also calls `targetAdapter.importAll` directly (storage move) — bypasses repo, so no events, correct. |

### 3.3 `appendChat` mode sources
`[VERIFIED: studio/src/lib/prompts/tutor.js:115-120]` `TUTOR_MODES` ids are exactly `explain_simpler`, `hint`, `check_answer`, `quiz`. `mode: 'review'` has **no producer anywhere in `studio/src` today** (grep found only route names `/review` and activity kinds). Consequences:
- `answer_sent_for_review` fires only for `check_answer` in today's app (and for `review` once Phase 8 adds it).
- D-07's quiz-inference predicate (assistant row with `mode: 'review'`) cannot be produced by the current UI — the test must seed that row explicitly, and Phase 8 is the phase that starts producing it. Do not "fix" this by treating `quiz` mode as review (would contradict D-07).

### 3.4 Meta whitelist (D-05) — recommend this shape
`meta` is keyed per kind; values limited to `number | boolean | <enum string from a declared const>`, no arrays, no free strings. Suggested (all values already exist in the codebase):

| kind | allowed meta keys | enum members |
|---|---|---|
| `quiz_completed` | `total` (num), `score` (num/null), `answered` (num) | — |
| `recall_completed` | `grade` (0–3 num) | — |
| `answer_sent_for_review` | `mode` | `check_answer`, `review` |
| `workspace_run` | `runner`, `exit_code` (num/null), `checks_total` (num) | runner: `browser`, `local` |
| `exercise_completed` | `checks_total`, `checks_passed` (nums), `runner` | runner: `browser`, `local` |
| `capstone_checkpoint` | `source`, `attempt` (num) | source: `in_app`, `external` |

Rules to implement in `events.js` (pure): unknown key → throw; `typeof value === 'string'` only when it is in that kind's enum list; `Array.isArray(value)` → throw; after `JSON.stringify(meta)`, `length > 512` → throw. Note `null` should be rejected unless explicitly listed (e.g. `score: null` on an unanswered import row) — otherwise `meta` becomes an unbounded channel.

### 3.5 `beta_profile` write path
`ensureBetaProfile` (repo-internal): `adapter.get('beta_profile', 'local')`; if absent `put({ id: 'local', participant_id: uuid(), activated_at: null, activated_day: null })`; if present and `activated_at == null` **and** this call is from a meaningful event → set `activated_at = event.created_at`, `activated_day = event.day`. `getBetaProfile()` (public) does the same get-or-create without activating. The ID is the literal `'local'` per D-08, not a UUID.

### 3.6 The `checks` discriminator trap (highest-value finding)

`[VERIFIED: studio/src/lib/runner/history.js:15-18]`
```js
export function encodeRunPayload({ checks = [], files = {}, entry = null, language = null } = {}) {
  const snapshot = { files, entry, language, hash: hashFiles(files) };
  return { checks: Array.isArray(checks) ? checks : [], snapshot };
}
```
`[VERIFIED: studio/src/components/workspace/CodeWorkspace.jsx:280-295]` always calls `saveRunResult({ …, checks: payload })` where `payload` is that object. Therefore `checks` is **never null from the UI** — a naive `checks != null` test makes *every* workspace run `exercise_completed` and `workspace_run` unreachable, violating D-02 and INSTR-01.

Correct discriminator (use the existing pure helper `summarize`):
```js
const list = Array.isArray(checks) ? checks : Array.isArray(checks?.checks) ? checks.checks : [];
const total = list.length;                    // or summarize(list).total
const kind = total > 0 ? 'exercise_completed' : 'workspace_run';
```
Note `repo.test.js:173` seeds `checks: [{ ok: true }]` (bare array, `ok` not `passed`) — legacy/imported rows exist in both shapes, so failure detection for inference must accept `passed === false || ok === false` (§4.3).

## Revision Inference Feasibility (research question 4)

### 4.1 Data available with indexed reads only
| Surface | Attempt rows | Indexed filter | Feedback rows | Indexed filter |
|---|---|---|---|---|
| quiz | `quiz_attempts` | `lesson_id` (`schema.js:36`) | `chat_messages` (assistant, `mode:'review'`) | `lesson_id` (`:51`) |
| tutor | `chat_messages` (user, mode `check_answer`/`review`) | `lesson_id` | `chat_messages` (assistant, later) | `lesson_id` |
| workspace | `run_results` | `lesson_id` (`:76`) | same row's `checks_json` | — (`file_id`, `checks_json` filtered in repo) |
| capstone | `capstone_submissions` | `capstone_id` (`:86`) | same row's `review_json`/`verdict` | — |

`course_id` is **not** on any of these rows except `workspace_files`/`notes`/`cards`; derive it with one `adapter.get('lessons', lessonId)` → `course_id` (lessons have `course_id` indexed) or `adapter.get('capstones', capstoneId)` → `course_id`. Cache per call.

### 4.2 Index requirements for `revision_links` reads (adapter parity)
Any `list('revision_links', { where: {...} })` field must be indexed or memory/IDB throw (`assertIndexedField`). Recommended indexes: `lesson_id`, `course_id`, `surface`, `revised_id`, `attempt_id`. `deleted_at` filtering is applied by adapters automatically, never in `where`.

### 4.3 Inference algorithm (deterministic, one link max)
```
newAttempt = the just-created row (created_at = ISO now)
1. if revisionOf given:
      table = allowlist(feedbackTable) in {chat_messages, run_results, capstone_submissions, quiz_attempts}
      row = adapter.get(table, feedbackId)
      if row && !row.deleted_at -> write link {link_kind:'explicit', feedback_table: table, feedback_id}
      else -> ignore (attempt already saved; D-07)
      STOP (never infer when an explicit link was made, even if invalid? -> see O3)
2. else infer per surface:
      prior = latestByCreatedAt(attempts on same artifact, excluding newAttempt.id)
      quiz:      feedback = latest assistant chat_messages on lesson with mode==='review'
                          and created_at > prior.created_at and <= newAttempt.created_at
      tutor:     feedback = latest assistant chat_messages on lesson created_at > prior.created_at
                          and <= newAttempt.created_at  (prior itself must be user + mode in {check_answer, review})
      workspace: prior checks_json has a failing check (passed===false || ok===false)
                          (feedback is the prior row itself; require newAttempt.created_at >= prior.created_at)
      capstone:  prior.review_json != null || prior.verdict != null
                          (feedback is the prior row itself)
3. gate: 0 <= (newAttempt.created_at - prior.created_at) <= 72*3600*1000
         (skip when either Date.parse is NaN — CLI import writes `T00:00:00.000Z`)
4. write one row {surface, course_id, lesson_id, attempt_table, attempt_id: prior.id,
                  feedback_table, feedback_id, revised_table, revised_id: newAttempt.id,
                  link_kind: 'inferred'}
```
"Latest prior attempt" ordering: sort by `created_at` string (ISO-8601 sorts lexicographically) with a tiebreak on `attempt` (capstone) or `id`; never rely on `list` default order.

### 4.4 Feasibility verdict
Feasible with no new columns and no schema change beyond D-06 — every predicate is expressible as one indexed `list()` + in-repo filtering, exactly as `repo/index.js` already does (`listDueCards` at `:361-368`, `saveWorkspaceFile` at `:483-492`, `createCapstoneSubmission` at `:652-657`). The one weak surface is quiz, because no `mode:'review'` message is produced today (§3.3).

### 4.5 Explicit-link validation must not be a table-name injection
`feedbackTable` arrives from the caller (Phase 8 UI). Allowlist it against `{chat_messages, run_results, capstone_submissions, quiz_attempts}` before `adapter.get(table, id)`; SQLite's `specFor` would throw for unknown tables, but memory/IDB `store()` also throws — still, never pass caller input into a table name unchecked (V5 input validation, §Security).

### 4.6 Negative-test shapes required by D-07 / success criterion 4
1. Different lesson (quiz/tutor/workspace) or different `capstoneId` → no link.
2. Different `file_id` on the same lesson (workspace) → no link.
3. Prior attempt with **no** feedback (quiz: no `mode:'review'` assistant row; workspace: all checks passing; capstone: `review_json` and `verdict` both null) → no link.
4. Feedback created **before** the prior attempt → no link.
5. New attempt 72h + 1s after the prior → no link; 72h exactly → link (decide `<=`, test the boundary).
6. Explicit `revisionOf` pointing at a missing row → attempt saved, **no** link.
7. Explicit + inferable → exactly one link, `link_kind: 'explicit'`.
8. Second revision of the same prior attempt → the older revised attempt keeps its link; only one link per `revised_id`.

## Local-Day Math (research question 5)

### 5.1 Existing helpers
`[VERIFIED: studio/src/lib/course.js:184-187]`
```js
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```
`[VERIFIED: studio/src/lib/activity.js:31-35]`
```js
/** Local noon anchor — noon keeps `setDate` on the same calendar day through DST changes. */
function localNoon(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}
```
`localNoon` is **module-private** (not exported) and `activity.js` itself imports `repo/index.js` (`:11`). Importing `activity.js` from `beta/metrics.js` would pull the repository into the pure module and risk a cycle; D-10 forbids it. Reimplement the 3-line noon anchor locally in `metrics.js` (and do not edit `activity.js` — it is outside the Owns list).

### 5.2 `dayKey` behaviour by input type (verified)
| Input | Result | Correct? |
|---|---|---|
| `new Date()` | local Y-M-D | ✅ |
| ISO timestamp `'2026-10-15T12:00:00'` (no zone) | parsed as **local** → local Y-M-D | ✅ (`course.test.js:84` asserts this) |
| ISO timestamp with `Z` | local Y-M-D of that instant | ✅ (that is the point) |
| `'2026-01-01'` (bare date) | parsed as **UTC midnight** | ❌ in negative offsets |

Measured in `TZ=America/Los_Angeles`: `dayKey('2026-01-01')` → `2025-12-31`; in `TZ=Asia/Bangkok` → `2026-01-01`. `[VERIFIED: node probe, 2026-10-22]` Therefore: **never** feed a stored `day` value back through `dayKey`. Use `dayKey(new Date())` only at write time.

### 5.3 Recommended offset computation (DST-safe, zone-independent)
Treat both day keys as pure calendar values and subtract in UTC — no DST exists in UTC, so no hour can shift the day:
```js
function dayNumber(day) {                       // 'YYYY-MM-DD' → integer calendar day
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y || !m || !d) return null;              // malformed → caller skips
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}
export function dayOffset(day, activatedDay) {
  const a = dayNumber(day), b = dayNumber(activatedDay);
  if (a == null || b == null) return null;
  return Math.max(0, a - b);                    // D-09: clamp, never negative
}
```
Verified: same day → 0; US spring-forward week (`2026-03-08` → `2026-03-10`) → 2, (`→ 2026-03-15`) → 7; a 7-day span in UTC+7 → 7. `[VERIFIED: node probe, 2026-10-22]` This satisfies D-09's "never UTC slicing" because the *keys* are local (written by `dayKey` at event time); only the difference is computed on a DST-free axis.

### 5.4 Pinned-clock test recipe
Set `process.env.TZ` inside the test and restore in `finally`; verified to take effect at runtime in Node 26 (`new Date(2026,0,1,12).getHours()` stays 12 across `UTC`, `Asia/Bangkok`, `America/Los_Angeles`; `Intl.DateTimeFormat().resolvedOptions().timeZone` follows). Recommended zones/weeks:
- UTC+7: `Asia/Bangkok`, event at 06:00 local (would be previous UTC day).
- UTC−8: `America/Los_Angeles`, event at 23:30 local.
- DST: `America/Los_Angeles` around `2026-03-08` (spring forward) and `2026-11-01` (fall back).
Build rows with `dayKey(new Date(y, m, d, h))` — never string literals passed through `dayKey`.

## zod v4 API (research question 6)

`[VERIFIED: studio/node_modules/zod/package.json → 4.6.7; runtime probe 2026-10-22]`
- `z.strictObject(shape)` **exists** and is the recommended form; the installed typings annotate `.strict()` with `/** Consider \`z.strictObject(A.shape)\` instead */` (`node_modules/zod/v4/classic/schemas.d.ts:498`).
- Unknown keys: `safeParse` → `success: false`, `issues[0].code === 'unrecognized_keys'` (with `keys`).
- Wrong type: `code === 'invalid_type'`. Bad enum member: `code === 'invalid_value'` (**not** `invalid_enum_value`, which was zod 3).
- Non-strict `z.object` **strips** unknown keys silently (probe: `{a:1, extra:2}` → `{a:1}`) — unacceptable for D-11.
- `z.uuid()`, `z.enum([...])`, `z.number().int()`, `z.array(...)`, `z.null()`, `.nullable()` are the zod-4 spellings to use.

Studio conventions to keep: named exports only, JSDoc on exports, 2-space, kebab-case files, relative imports with `.js` (`CONVENTIONS.md`). There is **no** existing zod usage in `studio/src` to copy, so establish it in `report.js`: export `reportSchema` and have `buildBetaReport()` return `reportSchema.parse(candidate)` so the builder and the validator can never drift.

Recommended schema skeleton (all nested objects strict):
```js
const KINDS = ['quiz_completed','recall_completed','answer_sent_for_review','workspace_run','exercise_completed','capstone_checkpoint'];
const byKind = z.strictObject(Object.fromEntries(KINDS.map((k) => [k, z.number().int().nonnegative()])));
export const reportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  participantId: z.uuid(),
  generatedAtDayOffset: z.number().int().nonnegative(),
  app: z.strictObject({
    version: z.string().max(32),
    storage: z.enum(['indexeddb','sqlite','memory','remote']),
    provider: z.union([z.null(), z.string().regex(/^(bridge|byok):(anthropic|openai|openrouter|groq|lmstudio|ollama|custom|claude|opencode|cursor|gemini|antigravity)$/)]),
  }),
  activation: z.strictObject({ activated: z.boolean(), firstEventKind: z.union([z.null(), z.enum(KINDS)]) }),
  window: z.strictObject({ activeDayOffsets: z.array(z.number().int().min(0).max(14)) }),
  loops: z.strictObject({ byKind, revisions: z.strictObject({
    quiz: z.number().int().nonnegative(), tutor: z.number().int().nonnegative(),
    workspace: z.number().int().nonnegative(), capstone: z.number().int().nonnegative(),
    explicit: z.number().int().nonnegative(), inferred: z.number().int().nonnegative() }) }),
  retention: z.strictObject({ week1Active: z.boolean(), week2Return: z.boolean(), week2MeaningfulDays: z.number().int().nonnegative() }),
  capstone: z.strictObject({ started: z.boolean(), submissions: z.number().int().nonnegative(),
    externalEvidence: z.number().int().nonnegative(), verdict: z.union([z.null(), z.enum(['course_complete','needs_work'])]) }),
});
```
Provider values are justified by the catalogs: `PROVIDER_IDS` = `anthropic`, `openai`, `ollama`, `bridge` (`studio/src/lib/ai/index.js:61-97`), `OPENAI_PRESETS` ids `openai|openrouter|groq|lmstudio|custom` (`catalog.js:24-31`), `BRIDGE_AGENT_IDS` = `claude|opencode|cursor|gemini|antigravity|ollama` (`catalog.js:54`, exported at `:124`). Verdict enum `course_complete|needs_work` (`studio/src/lib/prompts/capstone.js:344-345`). If the plan prefers a plain `z.string().max(64)` + prefix regex, that still satisfies "category string only", but the enum is stricter and cheaper to defend in Phase 10.

## Test Topology (research question 7)

### 7.1 Framework and commands (verified this session)
| Property | Value |
|---|---|
| Framework | Vitest root `5.0.5`, studio `5.0.4` (separate installs) |
| Root config | `vitest.config.js` — `include: ['test/**/*.test.js']`, `environment: 'node'` |
| Studio config | `test` block inside `studio/vite.config.js` — `environment: 'node'`, `include: ['test/**/*.test.js']` |
| Quick run (root) | `npx vitest run` → 14 files / 294 tests, ~2.7 s |
| Quick run (studio) | `cd studio && npx vitest run` → 43 files / 372 tests, ~2.2 s |
| Single file | `npx vitest run <path>` (root) · `cd studio && npx vitest run test/<file>` |
| Note | root `npm test` is still `vitest` (watch); Phase 4 owns changing it — use `vitest run` here |

### 7.2 Extend `runAdapterContract` (published cross-suite seam)
`[VERIFIED: studio/test/adapter-contract.test.js:13-102]` exports `runAdapterContract(makeAdapter)`; it is invoked twice locally (`:116-117`, memory + IDB) **and once from the root suite** against the real SQLite server (`test/studio-api.test.js:19,56-59`). Adding new-table assertions here gives adapter-identical coverage for free, in both suites.

Additions (inside the existing `describe`):
- new tables exist and `get` returns null (`learning_events`, `revision_links`, `beta_profile`);
- put/list/where on each documented index (`learning_events` by `day`/`kind`; `revision_links` by `lesson_id`/`revised_id`; `beta_profile` by id `'local'`);
- a non-indexed field still rejects (`list('learning_events', { where: { meta_json } })` throws `/not indexed/`);
- `importAll` accepts a dump **lacking** the new tables (old backup) and a dump **containing** them; per-table counts match after re-`exportAll`;
- `clearAll` empties the new tables.

Fixture rows must include `created_at`/`updated_at` (SQLite columns are `NOT NULL`) — e.g. reuse the `stamp` object pattern from `test/studio-capstone-migration.test.js:18`.

### 7.3 `idb-upgrade.test.js` v4 → v5 pattern
Current file: `[VERIFIED: studio/test/idb-upgrade.test.js:74-77]` asserts `DB_VERSION === 4`; `openOldV2` (`:23-41`) builds an "old" DB from the **current** `TABLE_NAMES`, minus `external_id` indexes. That helper becomes wrong the moment new tables exist in `schema.js`: it would create the new stores in the "old" DB. Required changes:
1. `expect(DB_VERSION).toBe(5)`.
2. Add a `BETA_TABLES = ['learning_events','revision_links','beta_profile']` exclusion so the "old v4" fixture omits them (mirroring how `NEW_INDEXES` excludes `external_id`).
3. Seed a `courses` row, reopen through the adapter, assert **rows preserved**, new stores usable (`put`/`list` by `day`), `exportAll().tables.learning_events` present, and the old index backfill still works.
4. Keep a fresh-database test proving the stores exist without any upgrade.

### 7.4 `test/studio-capstone-migration.test.js` partial-upgrade pattern
`[VERIFIED: test/studio-capstone-migration.test.js:35-62]` copies migrations matching `/^000[123]_/` into a temp dir, opens with `createStudioDb({ migrationsDir: partial })`, asserts `capstones` throws `/Unknown table/`, then reopens with the full dir and asserts rows survive and the new tables are usable. For 0005:
- copy `000[1-4]_` for the "before" DB, assert `db.list('learning_events')` throws `/Unknown table/`;
- reopen with the full dir; assert the pre-existing course row survives, `db.tables` contains the three names, `db.schemaVersion === 5`, and `db.migrationsRun` contains `0005_beta_loop.sql`;
- add the twin assertion for a **fresh** DB: three tables empty, `schemaVersion === 5`;
- assert `d1_migrations` rows are exactly the five filenames (proves derivation input).

### 7.5 Migration-hash fixture
`[VERIFIED: test/fixtures/migrations.sha256.json]` pins `0001`–`0004`; `test/migrations.test.js:57-75` requires the manifest to be a contiguous prefix and every released file to match. Add:
```bash
shasum -a 256 studio/migrations/0005_beta_loop.sql   # macOS; or:
node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('studio/migrations/0005_beta_loop.sql')).digest('hex'))"
```
Order: write the SQL first, then the hash (the file must not change afterwards — `migrations.test.js` makes that permanent).

### 7.6 New test files and their jobs
| File | Covers | Notes |
|---|---|---|
| `studio/test/beta-events.test.js` | INSTR-01/02 emission: one event per action, kind/surface mapping, `updateLesson('done')` and `importAll` emit nothing, `createCapstoneSubmission` externalId re-call emits nothing, `saveRunResult` both branches (empty vs non-empty checks array) | Run against memory + IDB by swapping `useAdapter`; add a SQLite case via `createStudioStore` (see 7.7). |
| `studio/test/beta-metrics.test.js` | INSTR-03 `dayOffset`, activation clamping, week-1/week-2 boundaries, `activeDayOffsets` dedupe/sort/0–14 clamp, DST + UTC± zones | `process.env.TZ` per test with restore. |
| `studio/test/beta-report.test.js` | D-11 schema strictness (unknown top-level **and** nested key rejected), all six `byKind` keys required, verdict/provider enums, builder output parses | `reportSchema.safeParse` + `expect(success).toBe(false)` + issue codes. |
| `studio/test/beta-privacy.test.js` | INSTR-02 sentinel: seed course title/description, lesson `content_md`, chat content, run stdout/`checks_json`, quiz answers, a string shaped `sk-live-…`; assert none appear in `JSON.stringify(events)` or `JSON.stringify(buildBetaReport(...))`; assert `recordEvent` rejects free strings, arrays, and >512-char meta | Mandatory per CONTEXT "Specific Ideas". |
| `studio/test/beta-revisions.test.js` | INSTR-04 explicit/inferred + the 8 negative shapes in §4.6 | Use memory adapter; seed rows with controlled `created_at` (write via `stampCreate`-shaped objects) so 72h math is exact. |
| `test/studio-capstone-migration.test.js` (extend) | DEBT-03 upgrade + derived version | §7.4 |
| `test/studio-api.test.js` (edit 1 line) | DEBT-03 health value | §2.4 — needs explicit authorization |

### 7.7 CLI-path coverage without touching files outside Owns
`bin/studio-store.js` is an adapter, not a command; a Studio-suite test can import it and prove CLI parity:
```js
import { createStudioStore } from '../../bin/studio-store.js';
const store = createStudioStore({ dbPath: join(tmp, 'p.db'), log: () => {} });
repo.useAdapter(store);                 // then gradeCard/saveQuizAttempt/...
expect((await store.list('learning_events')).map(e => e.kind)).toEqual([...]);
```
This exercises the same repo functions `bin/commands/review.js:181` and `bin/commands/import.js:436` call, without editing root CLI tests (not owned). If the plan wants a true end-to-end CLI assertion, adding it to `test/cli-review.test.js` / `test/cli-import.test.js` requires orchestrator sign-off — list it as a checkpoint.

### 7.8 Sampling rate
- Per task commit: `npx vitest run <the file just written>` (route/UI-free, all fast).
- Per plan: `cd studio && npx vitest run`.
- Wave/phase gate: `npx vitest run && cd studio && npx vitest run` (both green, plus `npm run smoke:pack` only if a tarball-affecting file changed — `0005` is inside `studio/migrations`, which `package.json files` ships per `ARCHITECTURE.md`, so a smoke run is cheap insurance at phase end).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5 (root 5.0.5, studio 5.0.4) |
| Config file | `vitest.config.js`; `studio/vite.config.js` (`test` block) |
| Quick run command | `npx vitest run` (root) · `cd studio && npx vitest run` |
| Full suite command | `npx vitest run && (cd studio && npx vitest run)` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| INSTR-01 | one event per meaningful action in memory + IDB | unit/integration | `cd studio && npx vitest run test/beta-events.test.js` | ❌ Wave 0 |
| INSTR-01 | same event set on SQLite through the adapter contract | integration | `npx vitest run test/studio-api.test.js` (extended `runAdapterContract`) | ✅ extend |
| INSTR-01 | `updateLesson('done')`, `importAll`, re-`createCapstoneSubmission` emit nothing | unit | same file as above | ❌ Wave 0 |
| INSTR-01 | `saveRunResult` empty checks → `workspace_run`, non-empty → `exercise_completed`, never both | unit | same file | ❌ Wave 0 |
| INSTR-02 | sentinel strings absent from rows and report; meta whitelist/512-cap rejects | unit | `cd studio && npx vitest run test/beta-privacy.test.js` | ❌ Wave 0 |
| INSTR-03 | offsets 0/1–7/8–14 in UTC+7, UTC−8, DST weeks; clamp at 0 | unit | `cd studio && npx vitest run test/beta-metrics.test.js` | ❌ Wave 0 |
| INSTR-04 | explicit link wins; inferred link + 8 negative shapes | unit | `cd studio && npx vitest run test/beta-revisions.test.js` | ❌ Wave 0 |
| INSTR-04 | links round-trip through export/import | integration | `cd studio && npx vitest run test/adapter-contract.test.js` | ✅ extend |
| DEBT-03 | health reports highest applied prefix (5) | integration | `npx vitest run test/studio-api.test.js` | ✅ edit assertion |
| DEBT-03 | v1–v4 DB upgrades to 5, rows survive, `migrationsRun` includes 0005 | integration | `npx vitest run test/studio-capstone-migration.test.js` | ✅ extend |
| INSTR-01/02 | report schema strict, nested unknown keys rejected | unit | `cd studio && npx vitest run test/beta-report.test.js` | ❌ Wave 0 |
| (all) | migration contiguity + released hash | unit | `npx vitest run test/migrations.test.js` | ✅ auto (fixture update) |
| (all) | IDB v4 → v5 store creation preserves rows | integration | `cd studio && npx vitest run test/idb-upgrade.test.js` | ✅ extend |

### Sampling Rate
- **Per task commit:** the one new/extended file (`npx vitest run <file>`).
- **Per wave merge:** both suites (`npx vitest run` and `cd studio && npx vitest run`).
- **Phase gate:** both suites green + `test/migrations.test.js` green with the new hash.

### Wave 0 Gaps
- [ ] `studio/test/beta-events.test.js` — INSTR-01/02 emission matrix.
- [ ] `studio/test/beta-metrics.test.js` — INSTR-03 pinned clocks.
- [ ] `studio/test/beta-report.test.js` — D-11 strict schema.
- [ ] `studio/test/beta-privacy.test.js` — INSTR-02 sentinel (mandatory).
- [ ] `studio/test/beta-revisions.test.js` — INSTR-04 + negatives.
- [ ] Extend `studio/test/adapter-contract.test.js`, `studio/test/idb-upgrade.test.js`, `test/studio-capstone-migration.test.js`.
- [ ] Framework install: none — existing infrastructure covers everything.

## Common Pitfalls (phase-specific)

### Pitfall P1: `saveRunResult` classifies every run as a self-check
**What goes wrong:** `checks != null` is true for ordinary runs because `CodeWorkspace` always sends `{checks, snapshot}`. `workspace_run` never fires; INSTR-01's "workspace run" is unrecorded.
**Why:** `encodeRunPayload` (`history.js:15-18`) returns an object, not an array, and always includes `snapshot`.
**Avoid:** discriminate on the inner array length (`§3.6`); test both branches; keep `null`/bare-array legacy shapes working.
**Warning sign:** a `beta-events` test where a run with `checks: []` produces `exercise_completed`.

### Pitfall P2: `dayKey('YYYY-MM-DD')` shifts a day
**What goes wrong:** offsets computed from stored `day` strings are off by one in any negative-offset zone; week-2 boundaries move.
**Why:** `new Date('YYYY-MM-DD')` is UTC midnight (`course.js:185`), then `getDate()` is local.
**Avoid:** `dayNumber()` on components (§5.3); only `dayKey(new Date())` at write time.
**Warning sign:** a UTC−8 test where a day-8 event lands on offset 7.

### Pitfall P3: `DB_VERSION` not bumped
**What goes wrong:** `exportAll`/`importAll`/`clearAll`/`list` throw `NotFoundError` for existing browser users; backups fail.
**Why:** stores are only created in `onupgradeneeded`.
**Avoid:** `DB_VERSION = 5` in the same change as `schema.js`; test v4→v5 with rows.
**Warning sign:** `idb-upgrade.test.js` still asserting 4.

### Pitfall P4: Non-indexed `where` diverges by adapter
**What goes wrong:** memory/IDB throw `/not indexed/`; SQLite works. Tests that only use memory pass, a real SQLite user's report read throws (or vice versa).
**Avoid:** every filtered read field must be in `TABLES[table].indexes`; the extended `runAdapterContract` (which runs against SQLite from the root suite) is the guard.
**Warning sign:** a new `list('learning_events', { where: { date: ... } })` whose field is not in `indexes`.

### Pitfall P5: schema/migration column drift
**What goes wrong:** IDB/memory store extra keys; SQLite `put()` silently drops keys not in the introspected schema (`web/studio-db.js:201-208`). A backup made in the browser then loses columns when restored into SQLite (or the reverse), and metrics read `undefined`.
**Avoid:** `TABLES[].fields` must match the DDL exactly (order irrelevant, names exact); extend the contract test to `put`/`get` every documented column.
**Warning sign:** a field referenced in `events.js` that is not in both places.

### Pitfall P6: CLI `import` emits events dated at import time
**What goes wrong:** `bin/commands/import.js:436` calls `saveQuizAttempt`, which emits with `day = today`, then `:437` backdates the row via `store.put`. A learner importing an old course on offset 9 records a "week-2 return".
**Why:** D-04 explicitly says CLI import gets events; the row's `created_at` is patched after it.
**Avoid:** this is a decision consequence, not a bug to silently "fix". Test and document it (e.g. `import` of an old log emits exactly one `quiz_completed` with today's day); surface it in the report caveat if Phase 10 wants. Do **not** suppress emission in `bin/commands/import.js` (contradicts D-04) and do not backdate events (would need a `now` override not in the frozen API).
**Warning sign:** a plan task that removes the import emission "for accuracy".

### Pitfall P7: Double emission around idempotent paths
**What goes wrong:** emitting before the `externalId` early-return (`repo/index.js:653-656`) or after a failed `put` produces phantom checkpoints; re-import duplicates.
**Avoid:** emit strictly after a successful create; assert re-import increments neither submissions nor events. Same for `importAll` (must stay emission-free).
**Warning sign:** a test that calls `createCapstoneSubmission` twice with the same `externalId` and finds 2 events.

### Pitfall P8: `meta` becomes a content channel
**What goes wrong:** someone adds `{ note, title, code }` or an array of strings; the report leaks content; the 512-char cap is checked after an unbounded string is already built.
**Avoid:** whitelist keys first, type-check before serializing, then length-check; reject arrays and unlisted strings; sentinel test on rows **and** report.
**Warning sign:** `meta: { ...anything }` spread in a repo hook.

### Pitfall P9: Report counts the wrong population
**What goes wrong:** `activeDayOffsets` includes offsets > 14 or duplicates; `byKind` counts non-meaningful rows (e.g. a future `lesson_completed` row) or soft-deleted rows; week-2 counts offsets 7–13.
**Avoid:** filter `kind ∈ KINDS`, `!deleted_at`, dedupe/sort/clamp offsets to 0–14, and assert boundaries in the metrics tests (offset 7 → week-1, 8 → week-2, 14 in, 15 out).
**Warning sign:** a report with `activeDayOffsets: [1,1,2]` or a negative offset.

### Pitfall P10: zod v3 habits in a v4 codebase
**What goes wrong:** `.strict()` is accepted today but flagged; testing for `invalid_enum_value` never matches (v4 uses `invalid_value`); non-strict objects silently strip unknown keys, so a "strict" test passes while extra keys are dropped rather than rejected.
**Avoid:** `z.strictObject` at every level; assert `issues.some(i => i.code === 'unrecognized_keys')`.
**Warning sign:** `buildBetaReport` returning data that lost a field instead of throwing.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Browser IndexedDB `professor-studio` at version 4 (existing learners) — missing the 3 new stores; SQLite `${PROFESSOR_HOME:-~/.professor}/professor.db` with `0001–0004` applied; exported backup JSONs with `schemaVersion: 1` and no new tables | IDB: bump `DB_VERSION` (migration runs on next open, rows preserved). SQLite: `0005` applies additively via `runMigrations`. Backups: import must tolerate absent tables (`dump.tables[t] \|\| []`) — already true. |
| Live service config | None — no external service holds this schema (`studio-db.js` is the only SQLite owner; D1 deployment is out of scope for the beta) | None |
| OS-registered state | None — no launchd/task/cron entries touch the Studio DB | None (verified by search scope: only `bin/`, `web/`, `studio/` open the DB) |
| Secrets/env vars | None — event tables must never store keys; `STUDIO_DB` / `PROFESSOR_HOME` only change the path, not the schema | None; add the sentinel test to keep it true |
| Build artifacts | `studio/dist/` bundles the old `idb-adapter.js` (`DB_VERSION` 4) — must be rebuilt for browser users; npm tarball ships `studio/migrations/` (per `package.json files`, ARCHITECTURE.md) so `0005` reaches installed users | Rebuild `studio/dist` before the beta build (Phase 12/13), and re-run the tarball smoke at phase end |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js (`node:sqlite`) | SQLite adapter, migration tests | ✓ | `v26.8.1` local; min `22.5` (`bin/node-version.js:10`) | none — `requireStudioNode` blocks older Node for Studio/CLI review/import |
| npm | installing (no new deps), suites | ✓ | (npm bundled) | — |
| `fake-indexeddb` | IDB tests | ✓ | `^6.2.5` (studio devDeps) | memory adapter (would lose IDB coverage) |
| `zod` | report schema | ✓ | `4.6.7` (studio deps) | hand-written validator — rejected (D-11 wants strict schema) |
| `shasum` / `crypto` | migration hash fixture | ✓ | macOS `/usr/bin/shasum` | `node:crypto` one-liner |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (`.planning/config.json`).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new routes; existing pairing-token guard untouched. |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | **yes** | `events.js` meta whitelist + 512-char cap; zod `z.strictObject` for the report; `revisionOf.feedbackTable` allowlist before `adapter.get`; existing SQL identifier whitelist in `web/studio-db.js` (`specFor`/`assertColumn`). |
| V6 Cryptography | no | Only `crypto.randomUUID()` for participant/row ids — identifier generation, not a cryptographic protocol; never derive the participant id from machine data (PITFALLS #10). |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Free-text smuggled into `meta_json` → content leak in the exported report | Information Disclosure | Per-kind key whitelist + enum-only strings + 512-char cap, enforced before write; sentinel test on rows and report. |
| Caller-supplied `feedbackTable` used as a table name (prototype/table-name injection into `adapter.get`) | Tampering | Fixed allowlist `{chat_messages, run_results, capstone_submissions, quiz_attempts}`; reject anything else. |
| Report forged/extra keys accepted by Phase 10 | Tampering | `schemaVersion: 1` + strict schema reused on import (D-11); unknown keys rejected, not stripped. |
| Participant ID derived from hostname/username (re-identification) | Information Disclosure | Random UUID generated locally, stored in `beta_profile`; no machine inputs. |
| Backdated `created_at` used for 72h inference (`NaN`/negative spans) | Tampering | `Date.parse` guard, `0 <= span <= 72h`; never infer on malformed timestamps. |
| Report includes provider URL/key/model name | Information Disclosure | Provider is a `<bridge|byok>:<enum>` category only; regex/enum validation. |

## Code Examples

### Event row via the existing stamping helper
```js
// mirror of studio/src/lib/repo/index.js:59-68 / :717-722 conventions
const row = stampCreate({
  day: dayKey(new Date()),          // local day at write time — never a re-parsed day string
  kind: 'quiz_completed',           // must be in EVENT_KINDS
  surface: 'quiz',
  course_id: lesson.course_id,
  lesson_id: lessonId,
  ref_id: attempt.id,
  meta_json: JSON.stringify(meta),  // whitelisted, ≤ 512 chars
});
await adapter.put('learning_events', row);
```

### DDL shape to mirror `0004_capstone.sql`
```sql
-- 0005_beta_loop.sql (sketch; column order/extra indexes are discretion)
CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL DEFAULT 'local',
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  surface TEXT,
  course_id TEXT,
  lesson_id TEXT,
  ref_id TEXT,
  meta_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_learning_events_day ON learning_events(day);
CREATE INDEX IF NOT EXISTS idx_learning_events_kind ON learning_events(kind);
CREATE INDEX IF NOT EXISTS idx_learning_events_surface ON learning_events(surface);
-- revision_links: id/owner_id/surface/course_id/lesson_id/attempt_table/attempt_id/
--                 feedback_table/feedback_id/revised_table/revised_id/link_kind + timestamps
-- beta_profile: id ('local')/owner_id/participant_id/activated_at/activated_day + timestamps
```

### Derived schema version (server side)
```js
// after runMigrations(db, dir) in createStudioDb
const schemaVersion = appliedMigrationVersion(db) || LATEST_MIGRATION_VERSION;
// then use it in info(), exportAll() and the returned object
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `SCHEMA_VERSION = 1` literal in `web/studio-db.js` | Derive from `d1_migrations` rows, fall back to a shared constant | This phase (D-12) | Health stops lying after 0005; future migrations need no literal edit. |
| Per-feature tables + literal IDB versions | Registry-driven `TABLES` + `DB_VERSION` bump | Existing pattern (`idb-adapter.js:18-22`) | One literal + one DDL file per migration. |
| zod 3 `.strict()` / `invalid_enum_value` | zod 4 `z.strictObject` / `invalid_value` | zod 4 (installed 4.6.7) | Use the new API; don't write tests against v3 codes. |
| `activity` rows as a proxy for engagement | Separate `learning_events` table with a closed meaningful enum | This phase (D-01) | `activity` stays untouched for streaks (ARCHITECTURE Pattern 2). |

**Deprecated/outdated:** `.strict()` (soft-deprecated in zod 4 typings); `(b-a)/86400000` day math (PITFALLS #9); treating `unit`/`lesson_done` as meaningful (overridden by ROADMAP criterion 1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `loops.byKind` counts **all-time** meaningful events, not just the 0–14 window | Metrics/report | Phase 10 aggregation could misread totals as "in window". Low risk; document in the plan and in `report.js` JSDoc. |
| A2 | `generatedAtDayOffset = 0` when not activated | Report | A consumer might read 0 as "day 0 active". Mitigate with `activation.activated === false` check; the field is informational. |
| A3 | Inference window is `<=` exactly 72h (not `<`) | Revision §4.3 | Boundary test would flip. Pick one, write it in the plan, test it. |
| A4 | An invalid `revisionOf` still blocks inference (explicit was "attempted") | Revision §4.3 | Could suppress a legitimate inferred link for a buggy UI. D-07 says explicit wins when the row exists and a missing row is ignored; the safer reading (invalid → try inference) is a plan decision. |
| A5 | `firstEventKind` is derived from the earliest meaningful event, not stored on `beta_profile` | Activation | If events are pruned/restored independently from the profile, the derived kind could disagree with `activated_at`. No pruning exists in this phase. |
| A6 | CLI `import` producing today-dated events is accepted behaviour, not a defect | Pitfall P6 | If the orchestrator wants import-time events excluded, D-04 must be amended (locked) — do not decide in the plan. |

## Open Questions (RESOLVED)

1. **Is the `test/studio-api.test.js:127` edit authorized?**
   - What we know: DEBT-03 requires `schemaVersion` 5; that root-suite assertion pins `1`; D-13 authorizes only the hash fixture outside Owns.
   - What's unclear: whether the orchestrator treats the assertion update as part of DEBT-03 (obvious but unstated) or a violation of file ownership.
   - Recommendation: list it as an explicit "authorized touch point" in the plan (same class as the fixture); it is a single literal and cannot be avoided.
   - **RESOLVED:** D-13 authorizes the out-of-Owns edits — the migration-hash fixture, the single `/db/health` schemaVersion assertion, and the one stale smoke comment — and 05-01 Task 2 enumerates them explicitly. No other out-of-Owns file is edited.

2. **Does `activation.firstEventKind` need a column?**
   - What we know: D-08 lists only `participant_id`, `activated_at`, `activated_day`; D-11 requires `firstEventKind`.
   - What's unclear: whether deriving from the earliest event is acceptable to Phase 7/10.
   - Recommendation: derive (no extra column). Document the rule in `report.js` JSDoc; add a test where the profile exists but a later event is newer.
   - **RESOLVED:** derive `activation.firstEventKind` from the earliest non-deleted meaningful event by `created_at` (id tiebreak); do not widen the `beta_profile` shape. Implemented and tested in 05-04 Task 2.

3. **Invalid explicit `revisionOf`: skip inference or fall through?**
   - What we know: D-07 "Explicit wins when `revisionOf` is supplied and the feedback row exists; a missing or invalid feedback row is ignored (the attempt still saves)".
   - What's unclear: "ignored" could mean "no link at all" or "slot is empty, so infer".
   - Recommendation: treat an invalid explicit as "no explicit link" **and** still run inference (maximises link recall, never blocks learning). If the planner prefers strict, add an explicit test and note the choice; either way the attempt must save.
   - **RESOLVED:** an invalid explicit `revisionOf` falls through to inference and never blocks the attempt. Implemented and tested in 05-03 Task 3.

4. **Quiz inference is dead code until Phase 8**
   - What we know: no `mode:'review'` chat producer exists today (§3.3).
   - Recommendation: implement the predicate per D-07, seed the row in tests, and note in the plan that Phase 8 (Revision UI) is the first real producer. Do not substitute `mode:'quiz'`.
   - **RESOLVED:** implement the quiz predicate exactly as D-07 is written (latest prior attempt + a later assistant `mode: 'review'` row within 72 h), seed that row in tests, and never substitute `mode: 'quiz'`. Implemented in 05-03 Task 2.

5. **`byKind` window semantics** — see A1. Recommendation: all-time totals; the report window is represented only by `window.activeDayOffsets` (D-11 wording).
   - **RESOLVED:** `loops.byKind` is an all-time total for all six kinds; only `window.activeDayOffsets` and the retention week flags are windowed to offsets 0-14. Implemented in 05-04 Tasks 1-2.

## Sources

### Primary (HIGH confidence)
- Source read this session (all `[VERIFIED]` tags): `studio/src/lib/repo/schema.js`, `idb-adapter.js`, `memory-adapter.js`, `remote-adapter.js`, `index.js`, `blocked-adapter.js`, `select-adapter.js`; `studio/src/lib/course.js`, `activity.js`, `capstone.js`, `prompts/capstone.js`, `prompts/tutor.js`, `runner/history.js`, `runner/checks.js`, `ai/catalog.js`, `ai/index.js`; `web/studio-db.js`, `web/studio-api/db.js`, `bin/studio-store.js`, `bin/commands/review.js`, `bin/commands/import.js`, `bin/node-version.js`; tests `studio/test/{adapter-contract,idb-upgrade,repo,activity,storage-choice}.test.js`, `test/{migrations,studio-api,studio-capstone-migration}.test.js`, `scripts/smoke-pack.mjs`, `test/fixtures/migrations.sha256.json`.
- Runtime probes (node 26.8.1): `dayKey('2026-01-01')` day shift under `America/Los_Angeles`; `process.env.TZ` runtime switching; fake-indexeddb `NotFoundError` without a version bump; `zod@4.6.7` `z.strictObject` + issue codes; `Date.UTC` day-number offsets across a DST week.
- Suite baselines: root `npx vitest run` 14/294, studio `npx vitest run` 43/372 (2026-10-22).

### Secondary (MEDIUM confidence)
- `.planning/research/{ARCHITECTURE,PITFALLS,SUMMARY}.md` (design intent, phase-D scope).
- `.planning/codebase/{ARCHITECTURE,TESTING,CONVENTIONS}.md` (test topology and style conventions).

### Tertiary (LOW confidence)
- None. No web/CVE/documentation claims beyond the installed-package check are used in this phase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; versions read from the installed tree and the two suite banners.
- Architecture: HIGH — every adapter/schema/repo function read in full and cross-checked against its callers; the two accidental traps (`checks` object, `dayKey(string)`) reproduced by execution.
- Pitfalls: HIGH — P1/P2/P3/P10 reproduced; P4/P6/P7 derived directly from read code and decision text.
- Metrics/report semantics: MEDIUM — D-09/D-11 define the numbers, but window-vs-all-time counting and `firstEventKind` derivation are interpretations (A1/A5, O2/O5).

**Research date:** 2026-10-22
**Valid until:** 2026-11-21 (stable internal codebase; re-check only if Phase 1's `repo/index.js`/adapter contract changes before this phase merges)
