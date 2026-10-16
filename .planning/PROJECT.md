# Professor Studio

## What This Is

Professor Studio is a local-first learning workspace for AI-assisted builders to turn a real
project skill gap into verified practice and a reusable project artifact. It ships as the
`course-professor` npm package: a Claude Code / multi-agent plugin (Socratic professor agents and
`professor:*` commands), an npx CLI, and the Studio web app (courses, lessons, quiz, spaced
repetition, Socratic tutor, code workspace, capstone) that runs against the learner's own API key
or locally installed agent CLI.

This milestone takes the existing feature-rich v3.0 Studio to a **safe, coherent, testable private
beta** and validates — with 3–5 real learners — that its learning loop produces real output and
week-2 return. It is a hardening and validation milestone, not a feature-expansion milestone.

## Core Value

The learner builds real understanding by doing — practice → feedback → revision → a verifiable
output they use in a real project — never by reading Claude's code.

## Business Context

- **Customer**: AI-assisted builders / independent developers who must learn a technical skill to
  ship a real deliverable in their own project (first wedge: Playwright E2E testing).
- **Revenue model**: None yet — free, BYOK / local agent. Monetization is deliberately deferred
  until the beta shows retention and willingness-to-pay signal.
- **Success metric**: Week-2 return rate — share of beta learners with ≥1 meaningful learning
  action on days 8–14 after activation.
- **Strategy notes**: Prior strategy docs in `.planning-archive/PRODUCT_STRATEGY.md` and
  `.planning-archive/PRODUCT_UX_ANALYSIS.md`.

## Requirements

### Validated

<!-- Shipped in v1.0–v3.0 (archived planning in .planning-archive/). Inferred from the codebase map. -->

- ✓ Claude Code plugin: professor/researcher/coach/spotter/navigator agents and 25 `professor:*`
  commands, Socratic rules (never writes the learner's code) — v1.x
- ✓ Multi-platform install (Claude Code, Gemini CLI, OpenCode, Cursor, Codex) via `shared/` +
  token substitution — v1.x/v2.0
- ✓ Course kinds (programming/quantitative/conceptual/skill), git-worktree programming courses,
  lecture archive + LEARNING-LOG, grounded lectures with fetched sources only — v3.0 (Phases 27, 28, 34a)
- ✓ Dev CLI fast-path `status/next/check/doctor`, `studio`, terminal `review`, `import` — v3.0 (Phases 30, 31)
- ✓ Studio shell, onboarding, provider layer (Anthropic BYOK, OpenAI-compatible, OpenRouter,
  Ollama, local agent bridge with per-agent models) — v3.0 (Phases 22, 26, 26b, 26c)
- ✓ Courses from a prompt, editable syllabus, kind-aware versioned lessons — v3.0 (Phase 23)
- ✓ Quiz, SM-2 flashcards, Review page, streak — v3.0 (Phase 24)
- ✓ Lesson-scoped Socratic tutor with hint ladder — v3.0 (Phase 25)
- ✓ Code workspace: CodeMirror, in-browser runners (JS/TS, Pyodide, sql.js, HTML), local runner,
  self-checks, snapshots — v3.0 (Phase 29)
- ✓ Kind-shaped capstone with rubric + automated review and completion — v3.0 (Phase 33)
- ✓ Explicit storage choice (browser IndexedDB vs local SQLite), safe move, backup/restore — v3.0 (Phases 26, 36)
- ✓ One learning language, vi/en UI, enforced output language — v3.0 (Phase 35)
- ✓ npm 1.6.0-beta.1 packaging, Node 22.5 guards, tarball smoke CI — v3.0 (Phase 37)

### Active

**Security release gate (blocks beta)**
- [ ] `course-professor web` serves Studio only by default; the legacy web client, `/api/chat` and
  `/api/courses` mount only with an explicit `--legacy` flag that prints a deprecation warning
- [ ] Legacy mode, when enabled, meets the full baseline: loopback bind, explicit CORS allowlist
  (no `cors()` wildcard), pairing token required on every mutable/agent route, no
  `--dangerously-skip-permissions` / `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS`, path traversal fixed
  for read and write on slug and filename
- [ ] Studio bridge and runner keep their boundary: loopback by default, token required (401 on
  missing/invalid), unknown origins rejected, runner runs only allowlisted commands, Bash off by default
- [ ] Regression tests cover traversal read/write rejection, unknown-origin rejection, missing/invalid
  token 401, loopback bind, runner allowlist, Bash default-off, and agent command flags
- [ ] Studio UI states plainly that local runs execute on the learner's machine ("Code runs on your
  machine"); the local runner is never called a sandbox
- [ ] Remaining high/medium findings in `.planning/codebase/CONCERNS.md` are fixed or explicitly
  accepted (e.g. bridge CLI cwd next to `.studio-token`, registry install integrity)

**Product boundary**
- [ ] Studio is the primary UI and onboarding path; README, CLI help and `init` route new users to Studio
- [ ] Legacy web is compatibility-only: security and breakage fixes only, no new features
- [ ] `shared/SKILL.md` is synced with canonical `professor-skill/SKILL.md`, with a drift test
  (same for other canonical → `shared/` copies)

**Test & release baseline**
- [ ] CI runs root tests, Studio tests, security regression tests and the tarball smoke on `develop`
  pushes and on pull requests into `develop`
- [ ] Root `npm test` (or a documented single command) also runs the Studio suite
- [ ] Flaky/slow tests are deterministic (verify and fix the reported 5-second import test timeout)
- [ ] Browser E2E/UAT of the full loop passes against a real provider and the local bridge:
  new course → lesson → quiz → tutor → workspace → run code → review → completed/exported capstone
- [ ] Known Studio debt from `studio/docs/FOLLOW-UPS.md` relevant to beta is fixed (health
  `schemaVersion`, wrong-language JSON surfaced to the learner, i18n render-time mutation)

**Beta learning loop & instrumentation**
- [ ] Studio records aggregate learning events in the local DB (no content, prompts, code, course
  text or keys)
- [ ] "Export beta report" produces a small JSON file (schemaVersion, random local participant id,
  report window with active-day offsets, activation, learning loops, retention, capstone, app
  version/storage kind) shown at week 1 and week 2
- [ ] Week-2 return = ≥1 meaningful learning action on days 8–14 after activation (practice attempt
  completed, answer sent for tutor/coach review, revision after feedback, quiz/recall completed,
  workspace exercise run, capstone checkpoint updated) — opening the app does not count
- [ ] Revision after feedback is a first-class, countable action (feedback → revised attempt linked)
- [ ] Beta course template "Ship your first reliable Playwright E2E test for a real web workflow":
  semantic locators, observable assertions, evidence of a passing Chromium run in the learner's own
  project, learner explains isolation/waiting/locator choice
- [ ] "Verify externally" flow: the learner runs Playwright in their own project and pastes/uploads
  the command, pass/fail and test summary; Studio reviews it against the rubric and stores it as
  evidence — Studio does not spawn `npm`/`npx`/`playwright`

**Private beta operation**
- [ ] Beta kit: onboarding guide, Day 0 / Day 3–4 / Day 7 / Day 14 check-in script with the three
  qualitative questions, report collection and an aggregation sheet/script
- [ ] 3–5 AI-assisted builders run the cohort for 4 weeks; ≥3 complete a real practice loop; week-2
  return and qualitative evidence ("what better output did Studio help you produce vs Claude + notes
  + editor?") are recorded

### Out of Scope

- Cloud/SaaS hosting, accounts/auth, Stripe — only after the beta shows retention and
  willingness-to-pay
- Managed AI proxy — BYOK and local agents keep cost and privacy with the learner
- Cross-device sync — local-first promise; export/backup already covers moves
- Telemetry sent to a server (even opt-in) — local export keeps the no-telemetry promise
- Community marketplace / registry expansion — distribution before validation
- Audio lessons, new course kinds, social/collaboration features — feature expansion, not validation
- Expanding the Studio runner to arbitrary `npm`/`npx`/`playwright`/shell — would turn the bridge
  into a general local command executor; Playwright runs in the learner's own toolchain
- Rebranding (e.g. "SkillForce") — creates churn without beta value; revisit after beta
- Removing legacy web mode — deferred to v2.0 after confirming no meaningful users or offering migration

## Context

- Brownfield: v3.0 "Professor Studio" (Phases 22–37) shipped to `develop` as squash `c419b2a`
  (PR #14). Previous planning (v1.0–v3.0) archived in `.planning-archive/`.
- Codebase map in `.planning/codebase/` (2026-10-17). `CONCERNS.md` verified a critical issue in
  legacy `web/server.js` (wildcard CORS + `/api/chat` spawning `claude` with
  `--dangerously-skip-permissions`) and write path traversal on legacy course routes.
- Studio (~37k lines, Vite/React) lives in `studio/`; its local server pieces are
  `web/studio-api.js` (bridge, SQLite repo API, pairing token, origin allowlist) and
  `web/studio-runner.js`. Legacy React client is `web/client/`.
- Two Vitest suites (root `test/`, `studio/test/`); CI currently runs only the tarball smoke and a
  Node 18 CLI floor, triggered on `main` and `feat/studio-local-first`.
- npm `course-professor@1.6.0-beta.1` is packaged but not yet published.
- Beta measurement design: aggregate local events → manual export at day 7 and 14 + check-ins;
  interviews explain the numbers, they do not replace them.

## Constraints

- **Privacy**: No telemetry by default and no server — beta data leaves the machine only as a
  learner-exported report with no content.
- **Security**: Secure by default — no agent-execution or file-writing route reachable from an
  arbitrary browser origin; never ship `--dangerously-skip-permissions` in a product flow.
- **Teaching rule**: Never write working code for the learner or complete exercises (plugin and Studio).
- **Runtime**: Node ≥ 22.5 for Studio/review/import (`node:sqlite`); CLI floor Node 18.
- **Compatibility**: Existing CLI courses (`learning/`, `courses/`) and Studio data must keep working;
  storage migrations are additive (D1-compatible SQL migrations).
- **Execution model**: Each roadmap phase is executed by an OpenCode worker running the full GSD
  cycle (discuss → plan → execute → verify) in its own git worktree off `develop`; phases whose
  owned files do not overlap may run in parallel. Phases must therefore declare file ownership.
- **Scope discipline**: Hardening + validation only; new features only where the beta loop needs them
  (instrumentation, revision tracking, Playwright template, external verification).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Studio is the primary product; legacy web behind `--legacy` | Legacy server exposes browser-reachable agent execution; secure-by-default beats compatibility | — Pending |
| Beta metrics via local export, not telemetry | Keeps local-first/no-account promise; enough for a 3–5 person cohort | — Pending |
| Week-2 return counts meaningful learning actions only | App opens are a vanity metric | — Pending |
| First beta template: Playwright E2E | Clear, verifiable output reusable in a real project | — Pending |
| Playwright runs in the learner's toolchain; Studio reviews pasted evidence | Avoid widening the runner into an arbitrary command executor | — Pending |
| Keep the "Professor Studio" / `course-professor` names | Rename adds churn without beta value | — Pending |
| Restart GSD planning on `develop` after v3.0; archive old `.planning` | Old planning drifted from reality (custom worker flow, stale STATE) | ✓ Good |
| Stop ignoring `.planning/` in git | GSD `commit_docs` needs tracked planning docs | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-17 after initialization*
