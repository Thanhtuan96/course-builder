# Roadmap: Professor Studio — Security-Hardened Private Beta

## Overview

This milestone takes the feature-complete v3.0 Studio to a safe, coherent, testable private beta
and then validates the learning loop with 3–5 real learners. Phase 1 splits the monolith files and
lands all toolchain changes so parallel workers cannot collide. Wave 1 closes the security release
gate, guards plugin drift, wires CI on `develop`, builds the local beta data foundation and pays the
Studio debt learners would hit. Wave 2 builds the learner-facing loop on top of that foundation
(beta report, revision UI and run-location disclosure, Playwright template with "Verify externally")
and the beta kit. Wave 3 routes users to Studio in docs and proves the full loop end-to-end in
Chromium plus a manual real-provider UAT. Phase 13 is the human-run four-week cohort that answers
the business question: does the loop produce real output and week-2 return?

## Execution Rules (apply to every phase)

Each phase is executed by an OpenCode worker running the full GSD cycle (discuss → plan → execute →
verify) in its own git worktree branched from `develop`. Phases in the same wave run in parallel.

- **Exclusive ownership.** Every file belongs to exactly one phase per wave (see each phase's
  **Owns**). Edits in files owned by another phase are allowed only if listed under **Touch points**;
  anything unlisted needs orchestrator sign-off. Two phases owning the same file in one wave is a
  roadmap bug.
- **Migrations.** `studio/migrations/0005_beta_loop.sql` belongs to Phase 5 only. `0006` is reserved
  and unowned; it may be used only in a wave after `0005` merges. No other phase adds SQL or bumps
  the IndexedDB `DB_VERSION`. Released migrations are never edited (enforced by the QA-04 test).
- **Lockfiles / package.json.** One owner per wave: Phase 1 owns all four lockfiles (root, `web/`,
  `web/client/`, `studio/`) and every dependency change for the milestone; Phase 4 owns root
  `package.json` scripts in Wave 1; Phase 12 owns root `package.json` in Wave 3. Other phases request
  script additions from the owner. CI always uses `npm ci`; npm is pinned via `packageManager`.
- **Hotspots.** `studio/src/lib/repo/index.js` is owned by Phase 5 in Wave 1; Wave 2 consumes its
  frozen API (`events.js` signatures and the report schema are frozen in Phase 5's plan). `bin/cli.js`
  is owned by Phase 1 (Wave 0), Phase 2 (`web` case only, Wave 1) and Phase 11 (help/init only,
  Wave 3) — never concurrently. `web/studio-api.js` and its split modules belong to Phase 2 after
  Phase 1.
- **i18n.** Phase 6 splits the `en.json`/`vi.json` catalogs into per-namespace files that
  `i18n/index.js` auto-merges. Wave 2 phases then add only their own new namespace files
  (`betaReport`, `revision`, `runnerNotice`, `externalEvidence`, `playwrightTemplate`) and never edit
  existing keys.
- **Planning docs.** `.planning/STATE.md`, `.planning/ROADMAP.md` and `CLAUDE.md` are edited only by
  the orchestrator at merge time, never inside a worker. Phases that need a `CLAUDE.md` change hand
  the orchestrator a patch.
- **Merge discipline.** Before verify, rebase on the latest `develop` and run the full suite (root +
  Studio + security + drift + tarball smoke) on the merged result.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Seams and Toolchain Prep** - Split hotspot monoliths with no behavior change and land every milestone dependency in one lockfile change (Wave 0) (completed 2026-10-17)
- [x] **Phase 2: Security Release Gate and Legacy Gating** - Studio-only by default, one hardened guard layer for every route, safe spawning and a side-effect-asserting regression suite (Wave 1) (completed 2026-10-22)
- [x] **Phase 3: Plugin Drift Guard** - Generate `shared/` from canonical sources with one script and fail CI on drift (Wave 1) (completed 2026-10-22)
- [x] **Phase 4: Test Entry and CI Baseline** - One `npm test` for both suites, CI on `develop`, deterministic tests (Wave 1) (completed 2026-10-22)
- [x] **Phase 5: Beta Data Foundation** - Content-free learning events, revision links, activation and report builder in every storage adapter (Wave 1) (completed 2026-10-22)
- [x] **Phase 6: Studio Beta Debt** - Wrong-language errors surfaced, render-safe language switch, loopback-only bridge and CSP (Wave 1) (completed 2026-10-22)
- [x] **Phase 7: Beta Report UI and Nudges** - Learner previews and downloads the beta report; day-7/day-14 reminders (Wave 2) (completed 2026-10-25)
- [ ] **Phase 8: Revision Loop UI and Run-Location Disclosure** - "Revise this attempt", rubric-anchored feedback, attempt history and honest local-run copy (Wave 2)
- [ ] **Phase 9: Playwright Template and Verify Externally** - Fixed Playwright course with rubric R1–R7 and self-reported external evidence review (Wave 2)
- [x] **Phase 10: Beta Kit and Aggregation** - Onboarding, screener, check-in script, thresholds and report aggregation script (Wave 2) (completed 2026-10-25)
- [ ] **Phase 11: Product Boundary Docs** - README, CLI help, `init` and CHANGELOG route new users to Studio (Wave 3)
- [ ] **Phase 12: Full-Loop E2E, CI Completion and UAT** - Chromium E2E of the whole loop in CI plus a manual real-provider UAT gate (Wave 3)
- [ ] **Phase 13: Private Beta Cohort** - Owner dogfood, then 3–5 builders run four weeks and a decision memo is written (Wave 4, human-run)

## Phase Details

### Phase 1: Seams and Toolchain Prep

**Goal**: Maintainer can run parallel workers safely because hotspot files are split into modules and all milestone dependencies are already installed — with zero behavior change
**Wave**: 0 (serial; must merge before any Wave 1 phase starts)
**Depends on**: Nothing (first phase)
**Requirements**: QA-01, QA-04
**Owns**: `web/studio-api.js` and new route modules it is split into (e.g. `web/studio-api/{guards,bridge,db,runner,health}.js`); `bin/cli.js` (moving large `case` bodies, incl. `web`, into `bin/commands/*`); new `bin/commands/*.js` files created by the split; root `package.json` + `package-lock.json`; `web/package.json` + `web/package-lock.json`; `web/client/package.json` + `web/client/package-lock.json`; `studio/package.json` + `studio/package-lock.json`; new migration uniqueness/contiguity test (e.g. `test/migrations.test.js`); tests that only need import-path updates because of the split
**Touch points**: none
**Success Criteria** (what must be TRUE):
  1. `createStudioRouter()` and every CLI command behave exactly as before: the existing root and Studio suites pass unchanged except for import paths, and `course-professor web`, `studio`, `status`, `next`, `check`, `doctor` produce the same output
  2. `web/studio-api.js` is a thin composition of route modules and the `web` command body lives in `bin/commands/web.js`, so Security, Data and Evidence work can be done in disjoint files
  3. `supertest`, `@playwright/test`, root `vitest@^5`, `express@^4.22.3` and Studio `zod` are installed in a single lockfile change; `packageManager` pins the npm version; `npm ci` succeeds in all four package roots
  4. A test fails if migration filenames are duplicated or non-contiguous, or if a released migration (0001–0004) changes content

**Plans**: TBD

### Phase 2: Security Release Gate and Legacy Gating

**Goal**: No agent-execution or file-writing route is reachable from an arbitrary browser origin, through any entry point, and the legacy web is opt-in only
**Wave**: 1
**Depends on**: Phase 1
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09, SEC-10, SEC-11, SEC-13, SEC-14
**Owns**: `web/server.js` (becomes side-effect-free `createApp({ legacy })` factory); `web/security.js` (new); `web/legacy-server.js` (new); `web/studio-api.js` and its Phase-1 route modules; `web/studio-runner.js`; `web/client/**` (security fixes only: token header, deprecation banner); `bin/commands/web.js`; `bin/commands/studio.js` (pairing URL `#fragment`, masked banner, `--rotate-token`); `bin/commands/doctor.js` (security posture section); `bin/cli.js` (`web` case delegation and flag parsing only); `bin/registry-helpers.js` (`validateItemName('..')` fix); `test/security/**` (new); `test/studio-api*.test.js`; `test/studio-runner.test.js`; `test/cli-studio.test.js`; `test/cli.test.js` (registry validation cases only); `docs/security/ACCEPTED-RISKS.md` (new, accepted findings note)
**Touch points**: none in other phases' files. Studio-side reading of the token from `#token=` lives in `studio/src/lib/settings.js`, owned by Phase 6 — the fragment format (`#token=<value>`) is the contract between the two phases.
**Success Criteria** (what must be TRUE):
  1. Started via `course-professor web`, `npm start` or `node web/server.js`, the server serves Studio only and `/api/chat`, `/api/courses` and the legacy client return 404; with `--legacy` / `PROFESSOR_LEGACY=1` they mount, stderr prints a deprecation warning on every start, and the legacy UI shows a persistent banner pointing to Studio
  2. A request with a spoofed `Host`, an unknown or `null` `Origin`, a missing/invalid token (even with no `Origin`), or a non-JSON state-changing body is rejected (403/401/415) on both Studio and legacy routes, and the regression suite proves no file was written and no process was spawned
  3. Traversal attempts on course slugs, exercise filenames and workspace paths (`..`, `%2e%2e`, `..\\`, symlinks) are rejected for both read and write; no agent is spawned with a permission-bypass flag or env, and every agent runs shell-less in a temp cwd with a scrubbed environment
  4. The runner rejects `npm`, `npx`, `playwright`, `sh`/`bash`, keeps Bash off by default and caps concurrent runs; the token lives in `~/.professor/` at mode 0600, is masked in the banner, reaches browsers only via injected HTML or `#fragment`, and `--rotate-token` issues a new one
  5. `STUDIO_ORIGINS=*` and `STUDIO_ALLOW_NON_LOOPBACK` print loud warnings and their combination is refused; `course-professor doctor` reports legacy mount, bind address, token file mode, Bash and relaxed env; every high/medium CONCERNS.md finding is fixed or recorded as accepted (registry integrity accepted, `validateItemName('..')` fixed)

**Plans**: TBD
**UI hint**: yes
**Research flag**: current non-interactive, non-bypass flags per agent CLI (Claude, Gemini, Cursor, OpenCode, Codex); Windows `.cmd` shim handling (document as unsupported via `doctor` if not resolved)

### Phase 3: Plugin Drift Guard

**Goal**: The plugin files in `shared/` can never silently diverge from their canonical sources again
**Wave**: 1
**Depends on**: Phase 1
**Requirements**: BOUND-02
**Owns**: `scripts/sync-shared.mjs` (new); `bin/sync-shared.sh` (becomes a one-line wrapper); `shared/**`; `professor-skill/SKILL.md` (only if reconciling content); `agents/**`, `commands/**`, `hooks/**` (only if reconciliation requires a canonical fix); `plugin.json`; `templates/claude/plugin.json`; `.claude-plugin/marketplace.json` (version alignment); `test/shared-drift.test.js` (new)
**Touch points**: none (a `sync:shared` npm script, if wanted, is requested from Phase 4)
**Success Criteria** (what must be TRUE):
  1. Running the sync script regenerates every `shared/` copy (agents, commands, hooks, `SKILL.md`) from canonical sources, and `shared/SKILL.md` matches `professor-skill/SKILL.md` after sync
  2. `sync-shared.mjs --check` and `test/shared-drift.test.js` fail when any canonical file and its `shared/` copy differ
  3. The drift test fails when a command file exists without a `plugin.json` / `templates/claude/plugin.json` entry or vice versa

**Plans**: TBD

### Phase 4: Test Entry and CI Baseline

**Goal**: Every push and PR to `develop` is checked by one command that runs everything, deterministically
**Wave**: 1
**Depends on**: Phase 1
**Requirements**: QA-02, QA-03, QA-05
**Owns**: root `package.json` (`scripts` only); `vitest.config.js`; `studio/vitest.config.*` (if created); `.github/workflows/**` (new `ci.yml`, triggers on existing `release-smoke.yml`); `scripts/smoke-pack.mjs` (assert `web/security.js` and `web/legacy-server.js` are packed and `.studio-token` is not); `test/cli-import*.test.js`
**Touch points**: none (security and drift jobs run the `test/security/**` and `test/shared-drift.test.js` globs; they go green once Phases 2 and 3 merge)
**Success Criteria** (what must be TRUE):
  1. `npm test` runs the root and Studio suites without entering watch mode and reports a combined test count (Vitest projects, or the documented chained fallback); `test:watch` and `test:security` exist as separate scripts
  2. A push to `develop` or a PR into `develop` triggers CI jobs for unit (root + Studio), security, drift, tarball smoke and the Node 18 CLI floor, each with `timeout-minutes`
  3. The reported 5-second import-test timeout is reproduced and fixed at its root (injected clock/fs, no real `npm`/network); `testTimeout` is not raised and the suite passes repeatedly

**Plans**: TBD

### Phase 5: Beta Data Foundation

**Goal**: Studio records trustworthy, content-free learning events and revision links in every storage adapter, and can compute activation, retention and the beta report from them
**Wave**: 1
**Depends on**: Phase 1
**Requirements**: INSTR-01, INSTR-02, INSTR-03, INSTR-04, DEBT-03
**Owns**: `studio/migrations/0005_beta_loop.sql` (new; `learning_events`, `revision_links`, `beta_profile`); `studio/src/lib/repo/schema.js`; `studio/src/lib/repo/idb-adapter.js` (`DB_VERSION` 4 → 5); `studio/src/lib/repo/memory-adapter.js`; `studio/src/lib/repo/events.js` (new); `studio/src/lib/repo/index.js` (emission hooks, `revisionOf` params, read API for events/revisions/attempts); `studio/src/lib/beta/**` (new: `metrics.js`, `report.js`, zod report schema); `web/studio-db.js` (`SCHEMA_VERSION` from applied migrations); `studio/test/repo.test.js`; `studio/test/adapter-contract.test.js`; `studio/test/idb-upgrade.test.js`; `studio/test/beta-*.test.js` (new); `test/studio-capstone-migration.test.js`
**Touch points**: none. The public API (`events.js` signatures, repo read functions for attempt history, report JSON schema v1) is frozen in this phase's plan so Wave 2 can build against it.
**Success Criteria** (what must be TRUE):
  1. Completing a quiz, recall, answer-for-review, workspace run, exercise/self-check or capstone checkpoint records exactly one event — identically in browser (IndexedDB) and local SQLite storage, including through CLI `review`/`import` — while marking a lesson done or opening the app records nothing meaningful
  2. A sentinel-string test proves events and the built report never contain course text, prompts, code, answers or keys — only enum kinds, numbers and local calendar days
  3. Activation is the first meaningful action (offset 0); pinned-clock tests in UTC+7, UTC-8 and a DST week show week-1 = offsets 1–7 and week-2 return = ≥1 meaningful action on offsets 8–14 in local calendar days
  4. A retry after feedback is linked to that feedback explicitly (via `revisionOf`) or inferred within 72 hours on the same artifact, with explicit and inferred counted separately; negative tests (different artifact, attempt before feedback) create no link
  5. `/api/studio/db/health` reports the schema version derived from applied migrations, and existing data upgrades to the new schema with backup/restore round-tripping the new tables

**Plans**: TBD

### Phase 6: Studio Beta Debt

**Goal**: Learners never silently get wrong-language content, the language switch is render-safe, and BYOK keys are protected by a loopback-only bridge and a CSP
**Wave**: 1
**Depends on**: Phase 1
**Requirements**: DEBT-01, DEBT-02, SEC-12
**Owns**: `studio/src/lib/ai/provider-utils.js`; `studio/src/lib/ai/bridge.js`; `studio/src/lib/runner/local.js`; `studio/src/lib/settings.js` (pairing token read from `#token=`, URL scrubbed after read); `studio/src/lib/i18n/**` (incl. per-namespace catalog split and auto-merge in `index.js`); `studio/index.html` (CSP); `studio/test/ai*.test.js`; `studio/test/i18n-*.test.js`; `studio/test/runner-local.test.js`; `studio/test/settings*.test.js`
**Touch points**: none
**Success Criteria** (what must be TRUE):
  1. When generated syllabus, quiz, flashcard or capstone JSON is still in the wrong language after the repair retry, the learner sees a retryable error instead of wrong-language content
  2. Switching the UI language never mutates shared state during render (covered by a test), and the catalogs are split per namespace so new namespaces can be added without editing shared files
  3. Studio refuses to talk to a non-loopback bridge or runner URL, accepts the pairing token from a `#token=` fragment, and ships a Content-Security-Policy in `index.html`

**Plans**: TBD
**UI hint**: yes

### Phase 7: Beta Report UI and Nudges

**Goal**: A beta learner can see exactly what their beta report contains and download it, and is reminded to do so at day 7 and day 14
**Wave**: 2
**Depends on**: Phase 5 (report builder, schema, events API); Phase 6 (i18n namespace split)
**Requirements**: INSTR-05, INSTR-06
**Owns**: `studio/src/components/data/BetaReportPanel.jsx` (new); `studio/src/components/data/DataPanel.jsx` (mount point); `studio/src/pages/Settings.jsx` (link); `studio/src/pages/Home.jsx` (day-7/day-14 banner); `studio/src/lib/i18n/**/betaReport.json` (new namespace files); `studio/test/beta-report-panel*.test.js(x)` (new)
**Touch points**: none (consumes Phase 5's `listEvents` / `getBetaProfile` / metrics / report API without changing it)
**Success Criteria** (what must be TRUE):
  1. Learner opens "Export beta report", previews the full file contents ("this is everything in the file") and downloads `professor-beta-report-<pid>-d<N>.json`
  2. The downloaded JSON contains schemaVersion, random participant id, report window with active-day offsets, activation, learning loops, retention, capstone, app version and storage kind; it passes strict schema validation and the content-free check
  3. On day 7 and day 14 after activation Home shows a dismissible, non-blocking reminder to export the report; on other days it does not appear

**Plans**: TBD
**UI hint**: yes

### Phase 8: Revision Loop UI and Run-Location Disclosure

**Goal**: After feedback, revising is the obvious next step, the learner can see how each attempt improved, and local code execution is disclosed honestly
**Wave**: 2
**Depends on**: Phase 5 (`revisionOf`, attempt/revision read API); Phase 6 (i18n namespace split); Phase 2 assumed merged for runner behavior
**Requirements**: LOOP-01, LOOP-02, LOOP-03, LOOP-04
**Owns**: `studio/src/components/practice/QuizPanel.jsx`; `studio/src/components/tutor/TutorPanel.jsx`; `studio/src/components/tutor/QuickActions.jsx`; `studio/src/components/workspace/CodeWorkspace.jsx`; `studio/src/components/workspace/OutputPanel.jsx`; `studio/src/components/revision/**` (new shared "Revise"/attempt-history/criteria-delta components); `studio/src/lib/prompts/practice.js`; `studio/src/lib/prompts/tutor.js`; `studio/src/lib/i18n/**/revision.json` and `**/runnerNotice.json` (new); `studio/test/revision-*.test.js(x)`, `studio/test/prompts-{practice,tutor}*.test.js`
**Touch points**: none. The capstone surface of LOOP-01/LOOP-03 is rendered by Phase 9 in its own capstone components using the same repo API (no shared file).
**Success Criteria** (what must be TRUE):
  1. After non-passing feedback in a quiz, tutor review or workspace check, "Revise this attempt" is the primary action and the next attempt is recorded as an explicit revision of that feedback
  2. Feedback lists each rubric criterion as met / partial / not met with one Socratic question per unmet criterion, and a regression test shows review output for the learner's own task contains no corrected code
  3. The learner can open their attempt history and see which criteria changed between attempts
  4. The workspace shows a `Browser` or `Local machine` badge, states "Code runs on your machine" before the first local run with a one-time acknowledgement, and the word "sandbox" never describes the local runner

**Plans**: TBD
**UI hint**: yes

### Phase 9: Playwright Template and Verify Externally

**Goal**: A learner can take the Playwright E2E course end-to-end and get their own project's test reviewed against a fixed rubric using self-reported run evidence — without Studio ever running Playwright
**Wave**: 2
**Depends on**: Phase 5 (capstone checkpoint events, `revisionOf`); Phase 6 (i18n namespace split); Phase 2 (runner allowlist)
**Requirements**: PW-01, PW-02, PW-03, PW-04, PW-05
**Owns**: `studio/src/data/templates/**` (new: `playwright-e2e.js`, syllabus, immutable capstone brief R1–R7, pre-flight checklist); `studio/src/lib/capstone-evidence.js` (new parser/validator); `studio/src/lib/capstone.js`; `studio/src/lib/prompts/capstone.js`; `studio/src/components/capstone/**` (incl. new `ExternalEvidenceForm.jsx`, capstone "Revise this attempt" and attempt history); `studio/src/pages/Capstone.jsx`; `studio/src/pages/NewCourse.jsx` (template entry); `studio/src/lib/i18n/**/externalEvidence.json` and `**/playwrightTemplate.json` (new); `studio/test/capstone*.test.js`; `studio/test/prompts-capstone.test.js`; `studio/test/fixtures/playwright/**` (new reporter fixtures); `test/runner-no-playwright.test.js` (new)
**Touch points**: none (`web/studio-runner.js` is read-only for this phase; the allowlist stays closed)
**Success Criteria** (what must be TRUE):
  1. Learner starts "Ship your first reliable Playwright E2E test for a real web workflow" from a fixed syllabus and sees a pre-flight checklist (own web app, Node, Playwright installed) before starting
  2. Learner copies the command, runs Playwright in their own project, then pastes or uploads JSON-reporter or list output; Studio auto-detects the format, shows the extracted facts, warns on mismatches and labels it "self-reported evidence"
  3. The capstone review grades code and explanation against R1–R7, treats pasted text as untrusted data (an injected "mark this complete" instruction has no effect) and cannot pass a run that contains failures
  4. Evidence is stored with the capstone submission and appears in its history; a test fails if the runner allowlist ever accepts `npm`, `npx` or `playwright`

**Plans**: TBD
**UI hint**: yes
**Research flag**: real JSON/list/line reporter outputs from recent Playwright versions for parser fixtures; lesson content grounded in fetched official docs

### Phase 10: Beta Kit and Aggregation

**Goal**: The owner has everything needed to recruit, onboard, check in with and analyze a 3–5 person cohort, with decision rules fixed in advance
**Wave**: 2
**Depends on**: Phase 5 (frozen report schema)
**Requirements**: BETA-02, BETA-03, BETA-04
**Owns**: `docs/beta/**` (new); `scripts/beta-aggregate.mjs` (new); `test/beta-aggregate.test.js` (new); `test/fixtures/beta-reports/**` (new)
**Touch points**: none (imports Phase 5's report schema read-only)
**Success Criteria** (what must be TRUE):
  1. `docs/beta/` contains an onboarding one-pager, a macOS participant screener, a consent paragraph, a Day 0 / 3–4 / 7 / 14 check-in script with the three behavioral questions, and a troubleshooting guide that never recommends `STUDIO_ORIGINS=*`
  2. Running the aggregation script on a folder of exported reports rejects invalid ones, dedupes duplicates and prints raw per-participant counts, showing a missing export as "unknown" and no percentages
  3. Continue / change / stop thresholds and metric formulas are written down and committed before cohort Day 0

**Plans**: TBD

### Phase 11: Product Boundary Docs

**Goal**: Every path a new user can take (README, Studio README, CLI help, `init`) leads to Studio, and the `web` default change is documented
**Wave**: 3
**Depends on**: Phase 2 (new `web` behavior and flags); Waves 1–2 merged
**Requirements**: BOUND-01
**Owns**: `README.md`; `studio/README.md`; `CHANGELOG.md`; `bin/cli.js` (help text and `init` messaging only); `SECURITY.md` (new, optional "What runs where"); `test/cli-help*.test.js` (new, optional)
**Touch points**: `CLAUDE.md` — delivered as a patch to the orchestrator, not edited in the worker
**Success Criteria** (what must be TRUE):
  1. A new user following README, `studio/README.md`, `course-professor --help` or `init` is told to use Studio and how to start it
  2. The CHANGELOG explains that `web` now serves Studio only and how to opt into deprecated legacy mode
  3. No user-facing doc or help text recommends legacy web, `--dangerously-skip-permissions` or `STUDIO_ORIGINS=*`

**Plans**: TBD

### Phase 12: Full-Loop E2E, CI Completion and UAT

**Goal**: The whole learning loop is proven in a real browser on every CI run, and with a real provider by hand before any beta build ships
**Wave**: 3
**Depends on**: Phases 2, 4, 7, 8, 9 merged
**Requirements**: QA-06, QA-07
**Owns**: `e2e/**` (new: `playwright.config.js`, specs, fake agent / stub SSE provider fixtures); root `package.json` (`test:e2e` script; any further dependency change); root `package-lock.json`; `.github/workflows/**` (e2e job); `docs/release/UAT-CHECKLIST.md` (new)
**Touch points**: none — bugs found in product code are filed back to the owning phase's area as fix-up work after merge
**Success Criteria** (what must be TRUE):
  1. In CI, Chromium drives new course → lesson → quiz → tutor → workspace run → revision → external evidence → capstone → beta report export against a fake agent / stub provider, with a temp DB and fixed token, without `retries` masking failures
  2. A second-origin spec proves a foreign page cannot reach the bridge
  3. A written manual UAT checklist for macOS with a real provider and the local bridge exists, is run, and passes before any `1.6.0-beta.x` is published

**Plans**: TBD

### Phase 13: Private Beta Cohort

**Goal**: Real AI-assisted builders use Studio for four weeks and the owner can make an evidence-based continue / change / stop decision
**Wave**: 4 (human-run; starts only after Phase 12 UAT passes and the beta build is published)
**Depends on**: Phase 10 (kit, thresholds), Phase 12 (UAT passed, beta published)
**Requirements**: BETA-01, BETA-05
**Owns**: `docs/beta/cohort/**` (new: dogfood notes, per-participant aggregated table, decision memo); blocker fixes only, each as an orchestrator-approved decimal phase (e.g. 13.1)
**Touch points**: none
**Success Criteria** (what must be TRUE):
  1. The owner completes a macOS dogfood run (Playwright template, at least one practice → feedback → revision loop, report export) and every blocker found is fixed before any participant is recruited
  2. 3–5 screened AI-assisted builders run the cohort for four weeks with Day 0 / 3–4 / 7 / 14 check-ins and Day 7 / Day 14 report exports collected
  3. At least 3 participants complete a real practice loop; week-2 return, artifacts used in real projects and qualitative answers are recorded per participant
  4. A decision memo compares the results with the pre-registered thresholds and states continue, change or stop

**Plans**: TBD (human-run checklists; BETA-01 dogfood plan gates recruiting)

## Progress

**Execution Order:**
Wave 0 (Phase 1) → Wave 1 (Phases 2, 3, 4, 5, 6 in parallel) → Wave 2 (Phases 7, 8, 9, 10 in parallel) → Wave 3 (Phases 11, 12 in parallel) → Wave 4 (Phase 13)

| Phase | Wave | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 1. Seams and Toolchain Prep | 0 | 5/4 | Complete    | 2026-10-17 |
| 2. Security Release Gate and Legacy Gating | 1 | 5/5 | Complete | 2026-10-22 |
| 3. Plugin Drift Guard | 1 | 1/1 | Complete | 2026-10-22 |
| 4. Test Entry and CI Baseline | 1 | 3/3 | Complete | 2026-10-22 |
| 5. Beta Data Foundation | 1 | 6/6 | Complete | 2026-10-22 |
| 6. Studio Beta Debt | 1 | 4/4 | Complete | 2026-10-22 |
| 7. Beta Report UI and Nudges | 2 | 2/2 | Complete | 2026-10-25 |
| 8. Revision Loop UI and Run-Location Disclosure | 2 | 0/TBD | Not started | - |
| 9. Playwright Template and Verify Externally | 2 | 0/TBD | Not started | - |
| 10. Beta Kit and Aggregation | 2 | 2/2 | Complete | 2026-10-25 |
| 11. Product Boundary Docs | 3 | 0/TBD | Not started | - |
| 12. Full-Loop E2E, CI Completion and UAT | 3 | 0/TBD | Not started | - |
| 13. Private Beta Cohort | 4 | 0/TBD | Not started | - |
