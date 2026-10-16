# Requirements: Professor Studio

**Defined:** 2026-10-17
**Core Value:** The learner builds real understanding by doing — practice → feedback → revision → a verifiable output they use in a real project — never by reading Claude's code.

## v1 Requirements

Requirements for the security-hardened private beta. Each maps to exactly one roadmap phase.

### Security (release gate — blocks beta)

- [ ] **SEC-01**: Running `course-professor web`, `npm start` or `node web/server.js` serves Studio only; legacy client, `/api/chat` and `/api/courses` return 404 unless legacy mode is explicitly enabled (`--legacy` / `PROFESSOR_LEGACY=1`)
- [ ] **SEC-02**: When legacy mode is enabled, the CLI prints a deprecation warning on stderr at every start and the legacy UI shows a persistent banner pointing to Studio
- [ ] **SEC-03**: Every local server route (Studio and legacy) rejects requests whose `Host` header is not an allowlisted loopback host (DNS-rebinding defense)
- [ ] **SEC-04**: Every route rejects unknown or `null` `Origin` with 403 using an exact allowlist; no wildcard CORS anywhere
- [ ] **SEC-05**: Every route (Studio and legacy, including agent and file routes) requires the pairing token and returns 401 when it is missing or invalid, even when no `Origin` header is sent
- [ ] **SEC-06**: State-changing requests that are not `application/json` (form posts, `text/plain`) are rejected before any side effect
- [ ] **SEC-07**: The pairing token is stored under `~/.professor/` with mode 0600 after every write, is masked in the startup banner, is delivered to browsers only via server-injected HTML or a `#fragment` (never a query string), and can be rotated with `--rotate-token`
- [ ] **SEC-08**: Every filesystem access driven by a request (course slugs, exercise filenames, workspace paths) stays inside its root, including percent-encoded, backslash and symlink variants
- [ ] **SEC-09**: No agent CLI is ever spawned with permission-bypass flags or env (`--dangerously-skip-permissions`, `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, `--yolo`, `bypassPermissions`, …); agents spawn without a shell, in a temp working directory, with a scrubbed environment
- [ ] **SEC-10**: The local runner executes only allowlisted commands (rejecting `npm`, `npx`, `playwright`, `sh`/`bash`), keeps Bash off by default and caps concurrent runs
- [ ] **SEC-11**: Escape-hatch settings (`STUDIO_ORIGINS=*`, `STUDIO_ALLOW_NON_LOOPBACK`) print loud warnings, their combination is refused, and `course-professor doctor` reports the security posture (legacy mount, bind address, token file mode, Bash, relaxed env)
- [ ] **SEC-12**: Studio only talks to a loopback bridge URL and ships a Content-Security-Policy that protects BYOK keys in localStorage
- [ ] **SEC-13**: A security regression suite exercises the composed app through every entry point and asserts that rejected requests caused no side effect (no file written, no process spawned)
- [ ] **SEC-14**: Remaining high/medium findings in `.planning/codebase/CONCERNS.md` are fixed or explicitly accepted with a written note (registry install integrity accepted for beta; `validateItemName('..')` fixed)

### Product Boundary

- [ ] **BOUND-01**: A new user following README, `studio/README.md`, CLI help or `init` is routed to Studio; the CHANGELOG documents the `web` default change and legacy mode
- [ ] **BOUND-02**: Plugin files copied to `shared/` (agents, commands, hooks, `SKILL.md`) are generated from their canonical sources by one sync script, and a drift test fails CI when they diverge (including `plugin.json` command parity)

### Test & Release Baseline

- [x] **QA-01**: Maintainer can work in parallel safely: `web/studio-api.js` and the `bin/cli.js` command switch are split into modules with no behavior change, all milestone dev dependencies land in one lockfile change, and the npm version is pinned
- [ ] **QA-02**: One `npm test` runs both the root and Studio suites without watch mode and reports a combined test count
- [ ] **QA-03**: CI runs on every push to `develop` and every PR into `develop`: unit (root + Studio), security, drift, tarball smoke and the Node 18 CLI floor
- [x] **QA-04**: Migration files are verified unique and contiguous, and released migrations are never edited
- [ ] **QA-05**: Slow or flaky tests are deterministic (the reported 5-second import-test timeout is reproduced and fixed at its root, not by raising timeouts)
- [ ] **QA-06**: A Chromium E2E suite drives the full loop (new course → lesson → quiz → tutor → workspace run → revision → external evidence → capstone → beta report) against a fake agent / stub provider in CI, plus a test that a foreign origin cannot reach the bridge
- [ ] **QA-07**: A manual UAT checklist with a real provider and the local bridge on macOS passes before any beta build is published

### Studio Beta Debt

- [ ] **DEBT-01**: When generated JSON (syllabus, quiz, flashcards, capstone) is still in the wrong language after the repair retry, the learner sees a retryable error instead of silently getting the wrong language
- [ ] **DEBT-02**: The UI language switch never mutates shared state during render
- [ ] **DEBT-03**: `/api/studio/db/health` reports the schema version derived from applied migrations

### Beta Instrumentation

- [ ] **INSTR-01**: Studio records meaningful learning events locally at the repository layer, identically across browser and SQLite storage: quiz completed, recall completed, answer sent for tutor/coach review, workspace run, exercise/self-check completed, revision after feedback, capstone checkpoint. Marking a lesson done or opening the app does not count
- [ ] **INSTR-02**: Events store only enum kinds, numbers and local calendar days — never course text, prompts, code, answers or keys
- [ ] **INSTR-03**: Studio stores activation as the first meaningful action (day offset 0); week 1 = offsets 1–7; week-2 return = ≥1 meaningful action on offsets 8–14, computed in the learner's local calendar days
- [ ] **INSTR-04**: A revision is linked to the feedback it responds to: explicitly when the learner presses "Revise", or inferred for the same artifact when feedback exists after the prior attempt and the new attempt is within 72 hours; the two are counted separately
- [ ] **INSTR-05**: Learner can preview and download a beta report JSON (schemaVersion, random local participant id, report window with active-day offsets, activation, learning loops, retention, capstone, app version, storage kind) that is strictly schema-validated and verified content-free
- [ ] **INSTR-06**: Home shows a non-blocking reminder to export the beta report on day 7 and day 14

### Practice Loop

- [ ] **LOOP-01**: After non-passing feedback in quiz, tutor review, workspace check or capstone review, the learner sees "Revise this attempt" as the primary action
- [ ] **LOOP-02**: Feedback is rubric-anchored per criterion (met / partial / not met plus one Socratic question for each unmet criterion) and never contains corrected code
- [ ] **LOOP-03**: Learner can see their attempt history and which criteria changed between attempts
- [ ] **LOOP-04**: The workspace shows where code runs (Browser vs Local machine badge), states "Code runs on your machine" before the first local run with a one-time acknowledgement, and never calls the local runner a sandbox

### Playwright Beta Template

- [ ] **PW-01**: Learner can start the course "Ship your first reliable Playwright E2E test for a real web workflow" from a fixed, reviewed syllabus with a pre-flight checklist (own web app, Node, Playwright installed)
- [ ] **PW-02**: The capstone is judged against rubric R1–R7: real workflow in the learner's own app, semantic locators, web-first assertions, no fixed waits / `force` / coordinate clicks, isolated test, evidence of a passing Chromium run, learner explains isolation/waiting/locator choices
- [ ] **PW-03**: Learner can "Verify externally": copy the command, run Playwright in their own project, then paste or upload the JSON reporter output or list output; Studio parses it deterministically (auto-detect), shows the extracted facts, warns on mismatches and labels it "self-reported evidence"
- [ ] **PW-04**: The AI review treats pasted evidence as untrusted data, cannot pass a run that contains failures, and reviews the learner's code and explanation against the rubric
- [ ] **PW-05**: Evidence is stored with the capstone submission, and Studio never spawns `npm`, `npx` or `playwright` (enforced by a test)

### Private Beta Operation

- [ ] **BETA-01**: The owner completes a dogfood run on macOS (Playwright template, at least one practice → feedback → revision loop, report export) and fixes blockers before recruiting
- [ ] **BETA-02**: A beta kit exists: onboarding one-pager, participant screener (macOS), consent paragraph, Day 0 / 3–4 / 7 / 14 check-in script with the three behavioral questions, troubleshooting guide
- [ ] **BETA-03**: An aggregation script validates exported reports, dedupes them, and produces raw per-participant counts (missing export = unknown, no percentages)
- [ ] **BETA-04**: Continue / change / stop thresholds are written down before cohort Day 0
- [ ] **BETA-05**: 3–5 AI-assisted builders run the cohort for 4 weeks; ≥3 complete a real practice loop; week-2 return, artifacts in real projects and qualitative evidence are recorded in a decision memo

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Platform

- **PLAT-01**: Windows support for the local bridge and runner (resolve `.cmd` agent shims to `node <script>`, never `shell: true`)
- **PLAT-02**: Hosted SPA → local bridge under Chrome Local Network Access prompts

### Learning Loop

- **LOOP-05**: Loop-completeness metric (loops started / with revision / passed) in the report
- **LOOP-06**: Learner self-assessment before AI review
- **PW-06**: Static lint of pasted spec code for R2/R4 signals
- **PW-07**: R8 repeat-stability criterion and CI-integrated evidence
- **PW-08**: Second course template

### Platform Debt

- **DEBT-04**: First-class `run_results` code snapshot columns (migration `0006`)
- **DEBT-05**: Registry install integrity (SHA pin + diff before overwrite)
- **DEBT-06**: Express 5 after legacy routes are removed
- **BOUND-03**: Remove legacy web mode (after confirming no meaningful users or offering migration)
- **INSTR-07**: CLI `beta-report` command

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud/SaaS hosting, accounts/auth, Stripe | Only after the beta shows retention and willingness-to-pay |
| Managed AI proxy | BYOK and local agents keep cost and privacy with the learner |
| Cross-device sync | Local-first promise; export/backup covers moves |
| Any network telemetry (even opt-in) | Local export keeps the no-telemetry promise |
| Community marketplace / registry expansion | Distribution before validation |
| Audio lessons, new course kinds, social/collaboration | Feature expansion, not validation |
| Studio spawning `npm`/`npx`/`playwright`/shell | Would turn the bridge into a general local command executor |
| Trace zip / HTML report / screenshot uploads | Can contain secrets from the learner's app |
| Numeric scores, auto-fix, "show the fixed version" | Violates the teaching rule and rewards gaming |
| In-app NPS/dashboards, percentages from n=3–5 | Misleading at cohort size |
| Calling the local runner a "sandbox"; UI toggle for Bash or dangerous flags | Dishonest security UX |
| Rebranding (e.g. "SkillForce") | Churn without beta value; revisit after beta |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| SEC-06 | Phase 2 | Pending |
| SEC-07 | Phase 2 | Pending |
| SEC-08 | Phase 2 | Pending |
| SEC-09 | Phase 2 | Pending |
| SEC-10 | Phase 2 | Pending |
| SEC-11 | Phase 2 | Pending |
| SEC-12 | Phase 6 | Pending |
| SEC-13 | Phase 2 | Pending |
| SEC-14 | Phase 2 | Pending |
| BOUND-01 | Phase 11 | Pending |
| BOUND-02 | Phase 3 | Pending |
| QA-01 | Phase 1 | Complete |
| QA-02 | Phase 4 | Pending |
| QA-03 | Phase 4 | Pending |
| QA-04 | Phase 1 | Complete |
| QA-05 | Phase 4 | Pending |
| QA-06 | Phase 12 | Pending |
| QA-07 | Phase 12 | Pending |
| DEBT-01 | Phase 6 | Pending |
| DEBT-02 | Phase 6 | Pending |
| DEBT-03 | Phase 5 | Pending |
| INSTR-01 | Phase 5 | Pending |
| INSTR-02 | Phase 5 | Pending |
| INSTR-03 | Phase 5 | Pending |
| INSTR-04 | Phase 5 | Pending |
| INSTR-05 | Phase 7 | Pending |
| INSTR-06 | Phase 7 | Pending |
| LOOP-01 | Phase 8 | Pending |
| LOOP-02 | Phase 8 | Pending |
| LOOP-03 | Phase 8 | Pending |
| LOOP-04 | Phase 8 | Pending |
| PW-01 | Phase 9 | Pending |
| PW-02 | Phase 9 | Pending |
| PW-03 | Phase 9 | Pending |
| PW-04 | Phase 9 | Pending |
| PW-05 | Phase 9 | Pending |
| BETA-01 | Phase 13 | Pending |
| BETA-02 | Phase 10 | Pending |
| BETA-03 | Phase 10 | Pending |
| BETA-04 | Phase 10 | Pending |
| BETA-05 | Phase 13 | Pending |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-17*
*Last updated: 2026-10-17 after roadmap creation*
