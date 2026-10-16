# Architecture Research

**Domain:** Local-first learning workspace (Professor Studio) — private-beta hardening of an existing
multi-surface system (Studio SPA + local Express bridge/SQLite + CLI + Markdown plugin)
**Researched:** 2026-10-17
**Confidence:** HIGH for integration points (read from source at `develop` HEAD); MEDIUM for test
tooling claims (Playwright/Vitest docs fetched); design recommendations are opinions grounded in the code.

> Scope: how the six milestone changes fit the existing architecture, what talks to what, build
> order, and which work streams can run in parallel git worktrees without touching the same files.
> Existing architecture is described in `.planning/codebase/ARCHITECTURE.md`; this file only adds
> the target state and the deltas.

## Standard Architecture

### System Overview (target state after this milestone)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Studio SPA (studio/src)   served on :5180 by bin/static-server.js          │
│  pages/ + components/                                                      │
│   ├ practice/QuizPanel  tutor/TutorPanel  workspace/CodeWorkspace          │
│   ├ capstone/* (+ ExternalEvidenceForm NEW)                                │
│   └ data/DataPanel (+ BetaReportPanel NEW)                                 │
│  lib/repo/index.js  ── the ONLY data API ── emits learning events          │
│  lib/repo/events.js NEW (recordEvent, linkRevision, beta profile)          │
│  lib/beta/ NEW (pure: metrics.js, report.js)                               │
│  lib/capstone-evidence.js NEW (pure Playwright summary parser/validator)    │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ HTTP + SSE, X-Studio-Token, Origin allowlisted
┌───────────────▼────────────────────────────────────────────────────────────┐
│ web/server.js  (Studio-only app factory: createApp({legacy}) + listen)     │
│   web/security.js NEW  ← single hardened layer                             │
│     loopbackOnly · originAllowlist · requireToken · safeSlug/safeJoin      │
│   ├ /api/studio  → web/studio-api.js (uses security.js) → studio-db.js     │
│   │                 └ /run → web/studio-runner.js (allowlist, shell:false) │
│   └ [--legacy only] web/legacy-server.js NEW (moved routes from server.js) │
│        /api/courses, /api/agents, /api/chat  (same security.js guards,     │
│        no --dangerously-skip-permissions, routed through runJsonCli)       │
└───────────────┬────────────────────────────────────────────────────────────┘
                │ node:sqlite
┌───────────────▼────────────────────────────────────────────────────────────┐
│ ~/.professor/professor.db  — migrations 0001–0004 + 0005_beta_loop.sql NEW │
│   learning_events · revision_links · beta_profile                          │
└────────────────────────────────────────────────────────────────────────────┘
        ▲ same repo code via bin/studio-store.js (CLI review/import emit events too)
┌───────┴──────────────┐   ┌──────────────────────────────────────────────┐
│ bin/cli.js           │   │ Plugin Markdown: agents/ commands/ hooks/    │
│  web → bin/commands/ │   │  professor-skill/SKILL.md (canonical)        │
│        web.js NEW    │   │  scripts/sync-shared.mjs NEW (--check)       │
│  studio (unchanged)  │   │  → shared/ (generated, drift-tested)         │
└──────────────────────┘   └──────────────────────────────────────────────┘

Test/CI: npm test = root vitest + studio vitest · test/security/* · test/shared-drift.test.js
         e2e/ (Playwright, Chromium, fake agent on PATH) · .github/workflows/ci.yml (develop + PRs)
```

### Component Responsibilities

| Component | Responsibility (owns) | Implementation |
|-----------|----------------------|----------------|
| `web/security.js` (NEW) | Loopback check, origin allowlist + preflight, pairing-token check (`timingSafeEqual`), `safeSlug`, `safeJoin(root, ...parts)` (resolve + prefix assert), token-file write with `chmod` | Plain Express middleware factories extracted verbatim from `createStudioRouter()` (`web/studio-api.js` ~L1005–1041) and `web/studio-runner.js` path helpers |
| `web/server.js` | App factory `createApp({ legacy, ... })` with no side effects at import; `listen` only when run as main | Removes global `cors()`, the 50 MB parser and the top-level Vite spawn |
| `web/legacy-server.js` (NEW) | Legacy `/api/courses/*`, `/api/agents/*`, `/api/chat`, `/api/notify` as `createLegacyRouter({ token, origins })` | Moved code from `web/server.js`; guarded by the same `security.js`; spawns via the bridge's `runJsonCli` path, no `--dangerously-skip-permissions`, no `--trust` |
| `bin/commands/web.js` (NEW) | `course-professor web` handler: Studio by default (delegates to `bin/commands/studio.js`), `--legacy` prints deprecation and sets `PROFESSOR_LEGACY=1` | Moves the ~150-line `case 'web'` body out of `bin/cli.js` |
| `studio/src/lib/repo/events.js` (NEW) | `recordEvent()`, `linkRevision()`, `getBetaProfile()/ensureBetaProfile()` | Uses the same adapter as `repo/index.js`; repo write functions call it |
| `studio/src/lib/beta/metrics.js` + `report.js` (NEW) | Pure functions: activation, day offsets, loops, week-2 return; build the export JSON | No I/O; unit-tested with pinned clocks like `activity.js` |
| `studio/src/lib/capstone-evidence.js` (NEW) | Parse/validate pasted Playwright output (command, pass/fail counts, project names, duration) | Pure; deterministic facts fed to the existing capstone review prompt |
| `scripts/sync-shared.mjs` (NEW) | Copy canonical → `shared/` (agents, commands, hooks, **SKILL.md**); `--check` exits non-zero on drift | Replaces body of `bin/sync-shared.sh` (keep the .sh as a 1-line wrapper) |
| `e2e/` (NEW) | Playwright tests of the full Studio loop | `webServer` array: `web/server.js` + static Studio; fake agent binary on `PATH` |

## Recommended Project Structure (additions only)

```
web/
├── security.js            # NEW shared hardened layer (both modes)
├── server.js              # Studio-only app factory + main
├── legacy-server.js       # NEW legacy routes, mounted only with --legacy
├── studio-api.js          # imports guards from security.js; claude bridge uses temp cwd
└── studio-runner.js       # imports safeJoin/safeSlug from security.js
bin/commands/web.js        # NEW `web` subcommand handler
studio/migrations/0005_beta_loop.sql          # NEW (one migration for all beta tables)
studio/src/lib/repo/events.js                 # NEW
studio/src/lib/beta/{metrics,report}.js       # NEW (pure)
studio/src/lib/capstone-evidence.js           # NEW (pure)
studio/src/data/templates/playwright-e2e.js   # NEW beta course template (+ .vi.js if needed)
studio/src/components/data/BetaReportPanel.jsx        # NEW
studio/src/components/capstone/ExternalEvidenceForm.jsx  # NEW
scripts/sync-shared.mjs    # NEW
test/security/*.test.js    # NEW regression suite
test/shared-drift.test.js  # NEW
e2e/playwright.config.js, e2e/*.spec.js, e2e/fixtures/fake-agent/  # NEW
.github/workflows/ci.yml   # NEW
docs/beta/                 # NEW beta kit; scripts/beta-aggregate.mjs NEW
```

### Structure Rationale

- **New files over edits to hotspots.** `studio/src/lib/repo/index.js` (740 lines), `web/studio-api.js`
  (1294), `web/server.js` (1222) and `bin/cli.js` (966) are merge-conflict magnets. Every stream adds
  its logic in new modules and touches hotspots only at narrow, pre-assigned call sites.
- **Pure logic separated from I/O** (`lib/beta/*`, `capstone-evidence.js`) so metrics and parsing are
  testable without adapters, and the CLI (`bin/commands/*`) can reuse them via the existing
  `studio/src/lib/` relative import pattern (shipped in the npm `files` list).

## Architectural Patterns

### Pattern 1: One security layer, two mount profiles

**What:** Extract the Studio guards into `web/security.js`; both `/api/studio` and the legacy router are
built from the same middleware. `web/server.js` exports `createApp({ legacy = false, token, origins,
db })` and only calls `listen` when run directly. Legacy mode = Studio app + `app.use('/api',
createLegacyRouter(...))` behind loopback → origin → token, in that order (same order as today's
Studio router, origin check before token so the 403 vs 401 contract stays testable).

**Decisions:**
- Default (`course-professor web`, `npm start`, `course-professor studio`): `/api/studio` only. No
  `cors()` anywhere. The legacy static client (`web/client/dist`) is not served.
- `--legacy` (or `PROFESSOR_LEGACY=1` env, which is what `bin/commands/web.js` sets for the child
  process): mounts legacy router + legacy static client, prints a deprecation banner. The legacy
  React client (`web/client/src/api/client.js`) must send `X-Studio-Token`; the server injects the
  token into the served `index.html` (or the client reads it from `?token=` like Studio pairing). This
  is the one legacy-client edit allowed (security fix, not feature).
- Path safety: `safeJoin(COURSES_DIR, slug, file)` = validate `slug` against `/^[a-z0-9][a-z0-9-]*$/`,
  filename against an allowlist/regex, then `resolve()` and assert prefix — reuse
  `web/studio-runner.js` L226–230 logic, moved into `security.js`.
- Fix CONCERNS #7 in the same stream: `spawnClaude` uses `makeTempCwd` instead of `cwd: __dirname`.
- Remove the dev-mode `spawn('npm', ['run','dev'], {shell:true})` from the server; dev of the legacy
  client is `cd web/client && npm run dev`.

**Trade-off:** One extra module and a rewrite of `web/server.js`' bootstrap, but the security
regression suite can then build both apps in-process on an ephemeral port with no agent spawned.

```js
// web/server.js (shape)
export function createApp({ legacy = isLegacyEnv(), ...opts } = {}) {
  const app = express();
  const guards = createGuards(opts);            // from web/security.js
  app.use('/api/studio', createStudioRouter({ ...opts, guards }));
  if (legacy) app.use('/api', createLegacyRouter({ ...opts, guards }));
  return app;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) start(createApp());
```

### Pattern 2: Instrumentation inside the repository, not in pages

**What:** Learning events are emitted by the repo write functions that already represent a
meaningful action, so the browser (IndexedDB or SQLite) and the CLI (`bin/commands/review.js`,
`import.js` via `bin/studio-store.js`) record identically. Pages never call `recordEvent` directly
except for actions that have no repo write (none expected).

**Event emission map** (repo function → event kind):

| Repo function (`studio/src/lib/repo/index.js`) | Event kind | Meaningful for week-2? |
|---|---|---|
| `saveQuizAttempt` | `quiz_completed` | yes |
| `gradeCard` (browser Review page + CLI `review`) | `recall_completed` (one per session-day is enough for metrics; store per grade) | yes |
| `appendChat` with `role:'user'` and `mode` in {`check_answer`,`review`} | `answer_sent_for_review` | yes |
| `appendChat` other user turns | `tutor_message` | no (counted as engagement only) |
| `saveRunResult` | `workspace_run` (+ `checks_passed`/`checks_total` counts only) | yes |
| `createCapstoneSubmission` | `capstone_checkpoint` (`source: in_app|external`) | yes |
| `linkRevision` (see Pattern 3) | `revision_after_feedback` | yes |
| `updateLesson` → status done | `lesson_completed` | yes (practice attempt completed) |
| `createCourse` | `course_created` | no (activation input) |
| `addLessonVersion` | `lesson_generated` | no |
| `importAll`, `clearAll`, app open | — | never |

**Privacy rule enforced in `recordEvent`:** accepts only `kind` (enum), refs (`course_id`,
`lesson_id`, `ref_id` — local UUIDs, never exported), `surface` (enum), and a `meta` object whose keys
are whitelisted per kind and values must be numbers/booleans/enums. Strings over N chars are rejected.
This makes "no content, prompts, code, course text or keys" a code invariant, tested.

**Keep `activity` as is.** It drives streaks (`studio/src/lib/activity.js`) and its semantics (every
row counts as a studied day) differ from the beta definition. Don't overload it; `learning_events` is a
separate table. `logActivity` stays where it is.

### Pattern 3: Revision as a link table, inferred in the repo with explicit override

**What:** A single `revision_links` table instead of `revises_id` columns on four attempt tables:

```
revision_links(id, owner_id, surface, course_id, lesson_id,
               attempt_table, attempt_id,      -- the original attempt
               feedback_table, feedback_id,    -- what the learner reacted to
               revised_table, revised_id,      -- the new attempt
               created_at, updated_at, deleted_at)
```

| Surface | Attempt | Feedback | Revised attempt |
|---|---|---|---|
| quiz | `quiz_attempts` row | the attempt's Socratic review (same row / review message) | next `quiz_attempts` row on same lesson after viewing review |
| tutor | user `chat_messages` with `mode:check_answer` | following assistant `chat_messages` row | next `check_answer` user message on same lesson |
| workspace | `run_results` with failing checks, or a tutor review | that run result / assistant message | next `run_results` on same lesson+file |
| capstone | `capstone_submissions` attempt N | its `review_json` / verdict | `capstone_submissions` attempt N+1 |

**Rule:** the repo write functions accept an optional `revisionOf: { feedbackTable, feedbackId }`.
If the UI passes it (a "Revise" button after feedback), link explicitly. If not, `linkRevision` is
inferred when a new attempt lands on the same target and the latest prior attempt has feedback
recorded after it (bounded window, e.g. 72 h). One link → one `revision_after_feedback` event.
Capstone already has `attempt` numbering, so inference there is trivial and reliable.

**Trade-off:** Inference can over-count (a learner retrying without reading feedback). Acceptable for a
3–5 person cohort; the report counts explicit vs inferred separately (`meta.linked: explicit|inferred`).

### Pattern 4: External evidence = a capstone submission with structured evidence

**What:** "Verify externally" creates a normal `capstone_submissions` row (so attempt numbering,
history UI, revision linking and review all work unchanged) with `test_results_json =
{ source: 'external', tool: 'playwright', command, exitCode|passed, counts: {passed, failed,
flaky, skipped}, projects: ['chromium'], durationMs, rawSummary }`. No migration needed; schema
documented and validated in `studio/src/lib/capstone-evidence.js`.

**Flow:** learner runs `npx playwright test --project=chromium` in their own repo → pastes command +
terminal summary (+ optional spec file contents and an explanation of isolation/waiting/locator
choice in `content_md`) → `parsePlaywrightSummary()` extracts facts deterministically → rubric
pre-checks (Chromium project present, ≥1 passed, 0 failed, command is a Playwright invocation) →
existing capstone review prompt (`lib/prompts/capstone.js`) gets the parsed facts + learner text and
grades against the template rubric (semantic locators, observable assertions, explanation) →
`review_json`/`verdict` stored. Studio never spawns `npm`/`npx`/`playwright`; `web/studio-runner.js`
allowlist is untouched (add a test that asserts it).

**Trade-off:** Pasted evidence is forgeable; that is acceptable for self-directed learning and is
stated in the UI ("evidence you report"). The rubric requires the explanation, which is the real
learning signal.

## Data Flow

### Request Flow (default Studio mode)

```
Browser (Studio :5180)
   ↓ fetch + X-Studio-Token
web/server.js createApp()
   ↓ security.js: loopbackOnly → originAllowlist(403) → requireToken(401)
/api/studio router → /db (repo table ops) | /complete (agent SSE, temp cwd) | /run (allowlist)
   ↓
studio-db.js (node:sqlite) ← migrations 0001..0005
```
Any other origin: 403 before token. `/api/courses`, `/api/chat` without `--legacy`: 404.

### Learning-event and report flow

```
User action (quiz submit / check answer / run / capstone submit / revise)
   ↓
page/component → repo write fn (saveQuizAttempt, appendChat, saveRunResult, createCapstoneSubmission)
   ↓                                  ↓
adapter.put(<entity>)          events.recordEvent(kind, refs, meta)  [+ linkRevision if applicable]
                                      ↓
                          learning_events / revision_links rows (local only)
                                      ↓  (on "Export beta report", day 7 and day 14)
BetaReportPanel → repo.listEvents() + getBetaProfile() → beta/metrics.js → beta/report.js
                                      ↓
                    download professor-beta-report-<pid>-d<N>.json (no content, no ids)
```

### Metrics definitions (implemented in `studio/src/lib/beta/metrics.js`)

- **Beta profile** (`beta_profile`, single row): `participant_id` (random UUID, generated locally on first
  event), `activated_at`, `app_version`. Stored in the DB so storage move/backup carries it
  (`exportAll` iterates all tables automatically: SQLite introspects, memory/IDB iterate `TABLE_NAMES`).
- **Activation** = first meaningful event (table above). `activated_at` is set once.
- **Day offset** = local-calendar-day difference from activation day, activation day = day 1 (reuse the
  DST-safe `localNoon`/`dayKey` approach from `studio/src/lib/activity.js`). Report stores offsets only,
  never dates beyond the export date.
- **Week-1 active** = meaningful event on days 2–7; **week-2 return** = ≥1 meaningful event on days 8–14.
- **Learning loop** = attempt → feedback → revised attempt (a `revision_links` row); report counts by surface.

### Report JSON shape (`studio/src/lib/beta/report.js`)

```json
{
  "schemaVersion": 1,
  "participantId": "b5c0…",
  "generatedAtDayOffset": 14,
  "app": { "version": "1.6.0-beta.2", "storage": "sqlite", "provider": "bridge:claude" },
  "activation": { "activated": true, "firstEventKind": "quiz_completed" },
  "window": { "activeDayOffsets": [1,2,4,9,12] },
  "loops": { "byKind": { "quiz_completed": 6, "answer_sent_for_review": 4, "workspace_run": 11,
             "recall_completed": 3, "capstone_checkpoint": 2, "revision_after_feedback": 5 },
             "revisions": { "quiz": 1, "tutor": 2, "workspace": 1, "capstone": 1,
                            "explicit": 3, "inferred": 2 } },
  "retention": { "week1Active": true, "week2Return": true, "week2MeaningfulDays": 2 },
  "capstone": { "started": true, "submissions": 2, "externalEvidence": 1, "verdict": "pass" }
}
```
Provider is a category (`bridge:<agent>` / `byok:<provider>`), never a key or model URL. Validate the
output with a deny-list test (no field may contain strings longer than 64 chars except enums).

### Key Data Flows

1. **Default web start:** `course-professor web` → `bin/commands/web.js` → same path as `studio`
   (build-if-stale, spawn `web/server.js` with `PROFESSOR_LEGACY` unset, static Studio, pairing URL).
2. **Legacy start:** `course-professor web --legacy` → deprecation warning → spawn `web/server.js` with
   `PROFESSOR_LEGACY=1` → legacy router + legacy client mounted behind the same guards.
3. **Revision:** feedback rendered → learner clicks "Revise" (or retries) → next attempt write carries
   `revisionOf` → `linkRevision` row + `revision_after_feedback` event.
4. **External verification:** paste → parse → pre-check → LLM review against rubric →
   `capstone_submissions` row + `capstone_checkpoint{source:external}` event.
5. **Plugin drift:** edit canonical file → `npm run sync:shared` → CI `sync-shared.mjs --check` and
   `test/shared-drift.test.js` fail on any difference.

## Schema Changes (single additive migration)

`studio/migrations/0005_beta_loop.sql` — D1-compatible conventions from `0004_capstone.sql`
(TEXT UUID PK, `owner_id`, ISO TEXT timestamps, `deleted_at`, JSON as TEXT, no PRAGMA):

```sql
CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT 'local',
  day TEXT NOT NULL, kind TEXT NOT NULL, surface TEXT,
  course_id TEXT, lesson_id TEXT, ref_id TEXT, meta_json TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
CREATE INDEX IF NOT EXISTS idx_learning_events_day ON learning_events(day);
CREATE INDEX IF NOT EXISTS idx_learning_events_kind ON learning_events(kind);

CREATE TABLE IF NOT EXISTS revision_links ( ... as in Pattern 3 ... );
CREATE INDEX IF NOT EXISTS idx_revision_links_lesson_id ON revision_links(lesson_id);
CREATE INDEX IF NOT EXISTS idx_revision_links_revised_id ON revision_links(revised_id);

CREATE TABLE IF NOT EXISTS beta_profile (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT 'local',
  participant_id TEXT NOT NULL, activated_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
```

Must land together, in one stream: the SQL file, `studio/src/lib/repo/schema.js` `TABLES` entries,
`studio/src/lib/repo/idb-adapter.js` `DB_VERSION` 4 → 5, and the schema-version fix
(`web/studio-db.js` `SCHEMA_VERSION` derived from applied `d1_migrations` rows; `schema.js`
`SCHEMA_VERSION` likewise) — otherwise IndexedDB users never get the new stores and the health route
keeps lying. Optional columns from FOLLOW-UPS item 1 (`run_results.code_json/code_hash`) can go in
the same migration if the debt stream wants them; decide in that phase, not in parallel.

## Test / CI Topology

| Layer | Location | Runs | Notes |
|---|---|---|---|
| Root unit | `test/**/*.test.js` (root vitest ^4) | `npm test` | Add `test/security/` and `test/shared-drift.test.js` here |
| Studio unit | `studio/test/**` (studio vitest ^5) | `npm --prefix studio test` | Different Vitest majors → do **not** use Vitest `projects` until versions align; chain scripts |
| Unified entry | root `package.json` | `"test": "vitest run && npm --prefix studio test"`, `"test:security"`, `"test:e2e"` | `vitest` (watch) becomes `test:watch` so CI never hangs |
| Security regression | `test/security/*.test.js` | in `npm test` + named CI job | Builds `createApp({legacy:true/false})` on port 0: traversal read/write (`..%2F`), unknown origin 403, missing/invalid token 401, loopback bind default, runner allowlist rejects `npm/npx/playwright/sh`, Bash default off, agent argv never contains `--dangerously-skip-permissions`/`--trust` and env lacks `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` (assert via injected `spawnImpl`) |
| Drift | `test/shared-drift.test.js` | in `npm test` | byte-compare canonical vs `shared/`; also `plugin.json` commands[] ↔ files, `templates/claude/plugin.json` command list |
| E2E | `e2e/*.spec.js` (Playwright, Chromium only) | `npm run test:e2e`, CI job after build | `webServer: [ {command:'node web/server.js', url:'…/api/studio/health'…}, {command:'node bin/static-server.js …', url:'http://127.0.0.1:5180'} ]` (array form confirmed in Playwright docs); temp `PROFESSOR_HOME`/`STUDIO_DB`, fixed `STUDIO_BRIDGE_TOKEN`; fake `claude` script on `PATH` replaying `studio/test/fixtures/agents/*.jsonl`. Real-provider UAT is a manual checklist, not CI |
| Tarball smoke | `scripts/smoke-pack.mjs` | existing workflow | Add `develop` to triggers; assert `web/legacy-server.js` and `web/security.js` are in `files` |
| CI | `.github/workflows/ci.yml` NEW | push `develop`, PR → `develop` | Jobs: root+security (Node 22), studio (Node 22), drift, e2e (needs build), node18 CLI floor (existing). `/health` route returns 401 without token — use the token header in `webServer` readiness or a URL returning 401 (Playwright treats 401 as ready) |

The reported 5 s import-test timeout: fix at the source (inject clock/fs, avoid real `npm`/build in
`test/cli-import*.test.js` / `cli-studio.test.js`) rather than raising `testTimeout`.

## Build Order

```
Wave 1 (parallel, no shared files)
  A  Security split           B  Plugin drift          C1 Test entry + CI skeleton
  D  Data foundation (0005)   H  Studio debt (provider-utils, i18n, bridgeUrl loopback)
Wave 2 (parallel, depend on D's repo API)
  E  Beta report UI           F  Revision UI (quiz/tutor/workspace)
  G  Playwright template + verify externally + capstone revision
  K  Beta kit docs + aggregation script (needs D's report schema only)
Wave 3
  J  Product boundary docs (README, CLI help, init → Studio)  [after A]
  I  E2E/UAT suite (needs A, E, F, G merged)
  C2 Add e2e + security jobs to CI (needs I, A)
```

Dependency reasons:
- **D before E/F/G**: they call `recordEvent`/`linkRevision` and need the tables in all adapters.
  Freeze D's public API (`events.js` signatures + report JSON schema) in its plan so Wave 2 can start
  from stubs if D slips.
- **A before J and I**: help text and E2E server boot depend on the new `createApp`/`web` command.
- **C1 early**: once `npm test` runs both suites, every later stream's verify step catches Studio
  regressions; CI on `develop` protects parallel merges.
- **B and H are independent** of everything else and are good first-day parallel work.

## Parallel Work Streams — File-Ownership Map

Rule: a file appears under exactly one stream per wave. "Touch points" are narrow edits a stream may
make in a file owned by nobody else in that wave. Anything unlisted requires coordinator sign-off.

| Stream | Wave | Owns (exclusive) | Must NOT touch |
|---|---|---|---|
| **A — Security split / web modes** | 1 | `web/server.js`, `web/security.js` (new), `web/legacy-server.js` (new), `web/studio-api.js` (guard extraction + `spawnClaude` temp cwd + banner/token-file hardening), `web/studio-runner.js` (helper import only), `web/client/src/api/client.js` (token header), `bin/commands/web.js` (new), `bin/cli.js` (`case 'web'` → delegate; nothing else), `test/security/**` (new), `test/studio-api*.test.js`, `test/studio-runner.test.js` | `web/studio-db.js` (D), `package.json` (C), `studio/**` |
| **B — Plugin drift** | 1 | `scripts/sync-shared.mjs` (new), `bin/sync-shared.sh`, `shared/**`, `professor-skill/SKILL.md` (only if reconciling content), `test/shared-drift.test.js` (new), `plugin.json`, `templates/claude/plugin.json`, `.claude-plugin/marketplace.json` (version alignment) | `package.json` (ask C to add `sync:shared` script, or add it in a Wave-2 follow-up) |
| **C1 — Test entry + CI** | 1 | `package.json` (scripts only), `vitest.config.js`, `studio/vitest.config.*` (if created), `.github/workflows/**`, `test/cli-import*.test.js`, `test/cli-studio.test.js` (timeout determinism) | test files owned by A/B/D |
| **D — Data foundation** | 1 | `studio/migrations/0005_beta_loop.sql` (new), `studio/src/lib/repo/schema.js`, `studio/src/lib/repo/idb-adapter.js`, `studio/src/lib/repo/memory-adapter.js`, `studio/src/lib/repo/events.js` (new), `studio/src/lib/repo/index.js` (emission hooks + `revisionOf` params), `studio/src/lib/beta/**` (new), `web/studio-db.js` (`SCHEMA_VERSION`), `studio/test/repo.test.js`, `studio/test/adapter-contract.test.js`, `studio/test/idb-upgrade.test.js`, `studio/test/beta-*.test.js` (new), `test/studio-capstone-migration.test.js` | any `.jsx`, i18n JSON |
| **H — Studio debt** | 1 | `studio/src/lib/ai/provider-utils.js`, `studio/src/lib/i18n/index.js`, `studio/src/lib/ai/bridge.js`, `studio/src/lib/runner/local.js` (bridgeUrl loopback check), `studio/index.html` (CSP), `studio/test/ai*.test.js`, `studio/test/i18n-*.test.js`, `studio/test/runner-local.test.js` | i18n JSON catalogs (see rule below), components |
| **E — Beta report UI** | 2 | `studio/src/components/data/BetaReportPanel.jsx` (new), `studio/src/components/data/DataPanel.jsx` (mount point), `studio/src/pages/Settings.jsx` (link), `studio/src/pages/Home.jsx` (day-7/day-14 nudge) | repo/beta modules (consume only) |
| **F — Revision UI** | 2 | `studio/src/components/practice/QuizPanel.jsx`, `studio/src/components/tutor/TutorPanel.jsx`, `studio/src/components/tutor/QuickActions.jsx`, `studio/src/components/workspace/CodeWorkspace.jsx`, `studio/src/components/workspace/OutputPanel.jsx` (incl. "Code runs on your machine" copy) | capstone files (G) |
| **G — Playwright template + external evidence** | 2 | `studio/src/data/templates/**` (new), `studio/src/lib/capstone-evidence.js` (new), `studio/src/lib/capstone.js`, `studio/src/lib/prompts/capstone.js`, `studio/src/components/capstone/**`, `studio/src/pages/Capstone.jsx`, `studio/src/pages/NewCourse.jsx` (template entry), `studio/test/capstone*.test.js`, `studio/test/prompts-capstone.test.js` | `web/studio-runner.js` (allowlist stays closed) |
| **K — Beta kit** | 2 | `docs/beta/**` (new), `scripts/beta-aggregate.mjs` (new), `test/beta-aggregate.test.js` (new) | product code |
| **J — Product boundary docs** | 3 | `README.md`, `CLAUDE.md`, `studio/README.md`, `bin/cli.js` (help text + `init` messaging), `CHANGELOG.md` | — |
| **I — E2E** | 3 | `e2e/**` (new), `playwright.config.js` or `e2e/playwright.config.js`, root `package.json` (`test:e2e` script, `@playwright/test` devDep) | product code (file bugs back to owners) |
| **C2 — CI completion** | 3 | `.github/workflows/**` | — |

**Shared hotspots and the rule for each:**

- **`studio/src/lib/i18n/en.json` + `vi.json`** (touched by E, F, G, H): every Wave-2 stream adds keys
  only under its own new top-level namespace (`betaReport.*`, `revision.*`, `externalEvidence.*`,
  `runner.localNotice.*`) appended at the end of the object; never edit existing keys. Conflicts are
  then trivial rebase merges. If the coordinator wants zero conflicts, H can first split catalogs into
  per-namespace files merged by `i18n/index.js` (it already owns that file) — optional.
- **`studio/src/lib/repo/index.js`**: only D in Wave 1. Wave-2 streams consume its API; if they need a
  new repo function they request it from D (or a small follow-up after D merges).
- **`package.json`**: C1 in Wave 1, I in Wave 3. B and G/K request script additions via the owner.
- **`bin/cli.js`**: A (web case) in Wave 1, J (help/init) in Wave 3 — never concurrently.
- **`web/studio-api.js`**: A only. D's schema-version fix stays inside `web/studio-db.js` (the health
  route already reads from the DB object).

## Anti-Patterns

### Anti-Pattern 1: Hardening legacy routes with their own copy of the guards
**What people do:** Add a token check and a CORS origin list inline in `web/server.js`.
**Why it's wrong:** Two implementations drift; the critical finding came from exactly this split
(`/api/studio` guarded, everything after `app.use(cors())` open).
**Do this instead:** `web/security.js`, used by both routers, tested once against both apps.

### Anti-Pattern 2: Emitting beta events from React components
**What people do:** `recordEvent('quiz_completed')` next to `logActivity('quiz')` in `QuizPanel.jsx`.
**Why it's wrong:** CLI `review`/`import` and future surfaces miss events; double counting on re-render;
content leakage is harder to police.
**Do this instead:** Emit in repo write functions with a whitelisted `meta` shape.

### Anti-Pattern 3: Counting `activity` rows or app opens as retention
**Why it's wrong:** `activity` includes `import`, `flashcards` generation, `lesson_done` — not all are
meaningful; opening the app is explicitly excluded by the success metric.
**Do this instead:** A fixed meaningful-kind set in `beta/metrics.js`, unit-tested.

### Anti-Pattern 4: Running Playwright from the Studio runner
**Why it's wrong:** Turns the bridge into a general command executor (out of scope, security baseline).
**Do this instead:** Pasted evidence + deterministic parser + rubric review; a test asserts the runner
allowlist rejects `npm`, `npx`, `playwright`.

### Anti-Pattern 5: Migration per stream
**Why it's wrong:** Parallel `0005_*.sql` files collide on number and IDB `DB_VERSION`.
**Do this instead:** One migration owned by D; others add JSON-in-existing-columns (G) or wait.

### Anti-Pattern 6: Vitest `projects` across two Vitest majors
**Why it's wrong:** Root is vitest ^4, Studio ^5; a single runner would load one version for both.
(Vitest docs describe `projects` configuration but do not state cross-version support — unverified.)
**Do this instead:** Chain the two runs in the root `test` script; align versions later.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Beta (3–5 learners, one machine each) | Everything above; `learning_events` grows by tens of rows/day — no pagination needed |
| Hundreds of local users | Still fine; add event retention/compaction only if `exportAll` backups grow noticeably |
| Hosted/SaaS (out of scope) | `owner_id` + D1-compatible SQL already in place; events would need server auth and consent — do not design for it now |

### Scaling Priorities
1. **First bottleneck:** `exportAll` size from `run_results` snapshots in `checks_json`, not events.
2. **Second:** synchronous `detectAgents()` on `/health` (cache with TTL if E2E polling makes it slow).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Agent CLIs (claude, opencode, …) | `runJsonCli` spawn in temp cwd | Legacy `/api/chat` must reuse it; E2E uses a fake binary on `PATH` |
| Learner's Playwright toolchain | None — learner pastes output | Parser must tolerate list/line/dot reporter summaries |
| GitHub Actions | `ci.yml` on `develop` + PRs | Playwright needs `npx playwright install --with-deps chromium` in CI |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Studio ↔ server | HTTP/SSE via `security.js` guards | Unchanged contract; legacy 404 by default |
| Pages ↔ repo | direct import of `repo/index.js` | Events and revision links happen behind it |
| repo ↔ beta metrics | `listEvents()` → pure functions | Metrics never read entity tables' content |
| CLI ↔ repo | `bin/studio-store.js` | CLI `review` emits `recall_completed` for free |
| canonical ↔ `shared/` | `scripts/sync-shared.mjs` + drift test | `SKILL.md` included; `.gemini/`, `.codex/` local copies out of scope (gitignored) |

## Sources

- Source code at `develop` HEAD: `web/server.js` (L25–28 middleware order, L396/L414/L754 agent flags,
  L1170–1183 Vite spawn), `web/studio-api.js` (L984–1047 guard chain, L1255–1294 factory/default
  export), `web/studio-db.js` (L26 `SCHEMA_VERSION`, L130–158 schema introspection), `bin/cli.js`
  (L128+ `case 'web'`), `bin/commands/studio.js` (L286–325), `studio/src/lib/repo/index.js`
  (exports list, `logActivity` L717), `studio/src/lib/repo/schema.js`, `studio/src/lib/repo/idb-adapter.js`
  (`DB_VERSION = 4`), `studio/migrations/0004_capstone.sql`, `bin/sync-shared.sh`, `vitest.config.js`,
  `.github/workflows/release-smoke.yml` — HIGH
- `.planning/PROJECT.md`, `.planning/codebase/{ARCHITECTURE,STRUCTURE,CONCERNS}.md` — HIGH
- Playwright `webServer` array support and fields: https://playwright.dev/docs/test-webserver — HIGH
- Vitest projects configuration: https://vitest.dev/guide/projects — MEDIUM (cross-version behavior not documented)

---
*Architecture research for: Professor Studio private-beta hardening*
*Researched: 2026-10-17*
