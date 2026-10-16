# Feature Research

**Domain:** Local-first AI learning workspace (Professor Studio), private-beta hardening and validation.
Wedge: AI-assisted builders learning Playwright E2E to ship a reliable test in their own project.
**Researched:** 2026-10-17
**Confidence:** MEDIUM overall. Playwright rubric is HIGH (official docs). Security UX is MEDIUM
(VS Code Workspace Trust is the reference pattern). Practice loop, instrumentation and beta-ops are
MEDIUM/LOW (established practice plus secondary sources, not one authoritative spec).

## Scope Note

This milestone is hardening plus validation, not feature expansion (PROJECT.md). So "table stakes"
here means: **without it the beta cannot run safely, or cannot answer its question (does the loop
produce real output and week-2 return?)**. "Differentiator" means: it strengthens the core value
(practice, feedback, revision, verified output) with low cost. Anything else is an anti-feature for
this milestone, even if it is a good idea later.

### What already exists (from the codebase, checked 2026-10-17)

- `activity` table (`studio/migrations/0001_init.sql`): `id, day (local calendar day), kind, ref_id,
  created_at`. No course scope, no link between events.
- Logged kinds today: `quiz`, `review`, `flashcards` (card generation), `lesson_done`,
  `capstone_complete`. **Not logged:** workspace runs, tutor messages, practice attempts, capstone
  submissions that are not final, revisions.
- `capstone_submissions` are append-only with an `attempt` counter, `review_json` and `verdict`. There
  is no `parent_submission_id` or "this attempt answers feedback X" link.
- `run_results` table exists (workspace runs are stored, but not logged as activity).
- Capstone has `rubric_json` plus automated review and a completion export (`toCompletionMarkdown`).

So most beta features are **extensions of existing tables and flows**, not new subsystems.

---

## Area 1: Practice → Feedback → Revision Loop

How it typically works: the learner makes an attempt, gets specific feedback tied to criteria, revises,
and the system shows the change between attempts. Exercism's mentoring model is the closest reference:
feedback "nudges toward an idea" rather than giving the answer, and their own data showed that only
about 25% of submissions are complete on the first try, while about 55% have problems in common
buckets. That is why criteria-based feedback (a rubric) can be partly automated, and why revision is
the normal path, not the exception. (MEDIUM, from Exercism docs and blog)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Rubric-anchored feedback | Feedback that does not say *which criterion* is met or not feels like generic AI chatter. Learners need to know what to change. | LOW | `rubric_json` already exists on capstones. Return a per-criterion status (`met / partial / not_met`) plus one Socratic question per unmet criterion. Never return corrected code (teaching rule). |
| Revised attempt linked to its feedback | PROJECT.md says revision must be first-class and countable. Without the link you cannot tell a revision from a new attempt. | MEDIUM | Add `parent_id` (previous attempt) and `feedback_ref` to submissions, or a generic `practice_attempts` table. Additive migration `0005_*`. Same pattern for practice exercises and capstone. |
| Attempt history view | Learners must see that they improved. Without it, a revision feels like starting over. | LOW–MEDIUM | List attempts with verdict and per-criterion status. A criteria delta ("2 → 4 of 5 met") is enough. No text diff needed. |
| "Revise" as the main call to action after feedback | If the next step after feedback is "next lesson", learners skip revision and the loop does not happen. | LOW | After a non-passing review, the main button is "Revise this attempt"; "Move on" is secondary. |
| Feedback stays Socratic and does not leak a solution | This is the product's core rule. One leaked answer kills trust in the "learn by doing" promise. | MEDIUM | Prompt rules exist (tutor hint ladder). Add a regression check on the review prompt or output: no code fences longer than N lines in review output for the learner's own task. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Learner self-assessment before the AI review | Learner predicts which criteria they meet, then sees the review. The gap between the two is a strong learning signal (metacognition). Coach agent already does self-assessment in plugin. | LOW | One checkbox per criterion before submission. Store as part of the attempt. Also gives a cheap beta signal: does self-assessment get more accurate over time? |
| "Explain your choice" prompt as part of the attempt | Turns output into understanding. Required by the Playwright template ("learner explains isolation/waiting/locator choice"). | LOW | Short free-text fields, reviewed against the rubric. Hard for a learner to fake with copy-paste from Claude. |
| Criterion-level revision targeting | Revision asks the learner to fix one criterion at a time (the "one concept to study" of `professor:review`). | LOW | Pick the most important unmet criterion and make that the revision focus. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| "Show me the fixed version" / auto-fix button | Fastest path to green | Breaks the core teaching rule; the learner ends up reading Claude's code | Hint ladder plus criterion-targeted Socratic question |
| Numeric score or grade (e.g. 87/100) | Feels objective, easy to compare | LLM scores are noisy between runs; learners chase the number, not the criteria; revisions that "drop 3 points" are discouraging | Per-criterion met/partial/not met plus a verdict |
| Unlimited free-form AI chat as "feedback" | Easy to build | Not countable, not tied to criteria, does not produce a revision | Structured review against the rubric; tutor stays for conceptual questions |
| Line-by-line text diff viewer between attempts | Looks polished | Real cost (CodeMirror merge view) for little learning value in a 3–5 person beta | Criteria delta plus the learner's own "what I changed" note |

---

## Area 2: Beta Instrumentation (local-first, exported reports)

How it typically works: define **activation** as the earliest signal that a user will stay (usually a
combination of early actions, not a single event); define **meaningful actions** that represent real
value (not app opens); measure retention in a window counted from each user's activation, not from the
calendar. Product analytics vendors (PostHog and others) agree that you must check correlation against
retained vs churned users, and that with very small cohorts the numbers only describe the cohort
(they say nothing statistically). Interviews explain the numbers. (MEDIUM: several secondary sources
agree; the n=3–5 limitation is plain statistics.)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Written event dictionary | Without fixed definitions, the week-2 number cannot be trusted or compared between learners | LOW | A single `BETA_EVENTS` constant: event name → counts as meaningful (yes/no) → what produces it. Shared by logger, report and tests. |
| Log every meaningful action listed in PROJECT.md | Today workspace runs, tutor submissions, revisions and capstone checkpoints are not logged, so week-2 return would be undercounted | MEDIUM | Add calls to `logActivity()` at the call sites: `practice_attempt`, `tutor_review_request`, `revision`, `quiz_complete`, `recall_complete`, `workspace_run`, `capstone_checkpoint`. Keep `lesson_done` and `flashcards` (generation) as **non-meaningful** (reading or AI generation is not practice). |
| Explicit activation event and timestamp | Week-2 window is "days 8–14 after activation", so activation must be a stored fact, not inferred later | LOW | Recommend: activation = first course created **and** first meaningful action completed. Store `activated_at` (local day) once. Opening the app or finishing onboarding does not count. |
| Content-free event schema | Privacy promise and PROJECT.md constraint: no content, prompts, code, course text or keys | LOW | Events hold kind, local day, coarse refs only. The export must **not** include raw `ref_id` values (UUIDs of lessons/cards); aggregate to counts. |
| "Export beta report" producing a small JSON | The only data channel in a no-telemetry design | MEDIUM | Fields from PROJECT.md: `schemaVersion`, random local participant id, report window as active-day offsets from activation (not real dates), activation, loop counts, retention flags (week-1, week-2), capstone status, app version, storage kind. |
| Show the learner the report before it is saved, readable | Trust: the learner must see that nothing private leaves the machine | LOW | Show pretty JSON or a small table in a dialog with "This is everything in the file". Same pattern as many open-source "copy diagnostics" flows. |
| Week 1 / week 2 export prompt | The cohort needs reports at day 7 and day 14; without a prompt they forget | LOW | A non-blocking banner on day 7 and day 14 after activation. Not a modal, not a notification. |
| Works the same for IndexedDB and SQLite storage | Beta learners can choose either storage | LOW | Report reads through `repo/index.js`, so it is adapter-neutral. Include `storageKind` in the report. |
| Aggregation script for the operator | 3–5 JSON files must become one table | LOW | `scripts/beta/aggregate.js` (or a sheet template): validates `schemaVersion`, outputs one row per participant plus cohort totals. Not shipped in the npm package. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Loop completeness metric | Counts full loops (attempt → feedback → revision) per learner, not just events. This tests the core value directly. | LOW (after revision link exists) | Derived from linked attempts. Report `loops_started`, `loops_with_revision`, `loops_passed`. |
| Active-day offsets instead of dates | Lets the operator see patterns (day 3 drop-off) without exposing real dates or the timezone | LOW | `activeDays: [0,1,3,9,12]` relative to activation. |
| Report also exportable from CLI (`course-professor beta-report`) | Learners using SQLite plus the plugin can export without opening Studio | LOW | Reuses `bin/studio-store.js`. Optional; P2. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Any network telemetry (even opt-in PostHog or a ping) | Less manual work | Breaks the no-telemetry promise that is part of the product; explicitly out of scope | Manual JSON export plus check-ins |
| Counting app opens, page views or session time as engagement | Easy numbers | Vanity metrics; PROJECT.md excludes them on purpose | Meaningful-action dictionary |
| Dashboards or charts inside Studio for beta metrics | Looks nice | For n=3–5 the operator only needs a table; dashboards cost UI work and invite over-reading | Aggregation script output |
| Statistical claims (e.g. "60% retention") from n=3–5 | Feels like validation | One learner equals 20–33%; meaningless as a rate | Report raw counts per person plus interview evidence ("2 of 4 returned in days 8–14 and here is why") |
| Logging prompts, code or AI output "for debugging" | Helps debug quality | Violates the privacy constraint; one leak ends trust | Learner can choose to share a specific attempt in an interview |

---

## Area 3: Playwright E2E Course Template and External Verification

### What a good rubric looks like (HIGH confidence, from playwright.dev best-practices and locators docs)

Official guidance the rubric should reflect:
- **Test user-visible behavior**, not implementation details (function names, CSS classes).
- **Locators, preferring user-facing attributes**: order in the docs is `getByRole`, `getByText`,
  `getByLabel`, `getByPlaceholder`, `getByAltText`, `getByTitle`, `getByTestId`. "CSS and XPath are not
  recommended as the DOM can often change leading to non resilient tests."
- **Web-first assertions**: `await expect(locator).toBeVisible()` waits until the condition is met.
  `expect(await locator.isVisible()).toBe(true)` does not wait and is a manual assertion to avoid.
- **Isolation**: each test has its own storage, cookies and data; shared setup goes in hooks/fixtures.
- **Control data and third parties**: do not test third-party services; mock them with the Network API.
- **Lint**: `@typescript-eslint/no-floating-promises` catches missing `await`. The community
  `eslint-plugin-playwright` has `no-wait-for-timeout`, `prefer-web-first-assertions` and
  `no-force-option` (MEDIUM: npm/GitHub listings).
- **Debugging**: trace viewer rather than videos/screenshots; trace on first retry in CI.

Suggested rubric (criteria the AI review checks against pasted test code, evidence and explanation):

| # | Criterion | "Met" looks like | Typical "not met" signal |
|---|-----------|------------------|--------------------------|
| R1 | Real workflow in the learner's own app | Covers one user journey with a business outcome (sign in, create item, checkout) | Tests a demo site, or only checks the page title |
| R2 | Semantic locators | `getByRole` / `getByLabel` / `getByText`; `getByTestId` only when the learner explains why | CSS class chains, XPath, `nth()` without reason, pixel coordinates (`mouse.click(x,y)`) |
| R3 | Observable, web-first assertions | `await expect(locator).toHaveText/ToBeVisible/toHaveURL` on the outcome the user sees | No assertion after the last action, `isVisible()` inside `expect`, asserting on internal state |
| R4 | No fixed sleeps | Relies on auto-waiting and assertions | `waitForTimeout`, `setTimeout`, retry loops, `{ force: true }` to get past actionability checks |
| R5 | Isolation | Test creates or resets its own data, no dependence on test order or a previous run; auth via `storageState`/setup project if needed | Depends on data left by another test or a manual step |
| R6 | Passing Chromium run in the learner's project | Evidence shows the command, Playwright version, 1+ passed, 0 failed, for the named test | No evidence, failing run, or evidence that does not match the submitted test name |
| R7 | Learner explains choices | Short answers: why this locator, why no sleep is needed, how the test is isolated | Missing, or text that does not match the code |
| R8 (stretch) | Stable on repeat | Passes with `--repeat-each=3` (or `--retries=0` twice) | Only one run shown |

R1–R7 are the beta "Course Complete" bar; R8 is a differentiator. Cross-browser (Firefox/WebKit), CI
setup, sharding and visual regression are **out of the capstone** (they are in the Playwright best
practices but are not needed for "first reliable test").

### "Verify externally" evidence submission UX

How it typically works in tools that cannot run the learner's code (CI badges, Exercism CLI submit,
code-review tools): the learner runs a **specific, copyable command** in their own environment, then
submits the output. Good flows make the expected command explicit, accept the raw output, parse what
they can, and clearly separate "parsed facts" from "learner claims".

| Feature | Category | Complexity | Notes |
|---------|----------|------------|-------|
| Copyable command shown in the UI, e.g. `npx playwright test path/to/spec.ts --project=chromium --reporter=list` | Table stakes | LOW | Studio shows the text only; it never runs it (PROJECT.md decision, avoids widening the runner). Label: "Run this in your project's terminal". |
| Paste area for terminal output plus the test file content | Table stakes | LOW | Two fields: "Test code" and "Run output". Size limit (for example 200 KB, matching runner cap). |
| Deterministic parser for the list/line summary | Table stakes | MEDIUM | Extract passed/failed/skipped/flaky counts, test titles, duration, browser project. Parsing happens in code, not by the LLM, so the pass/fail fact cannot be made up by the model. Show "Parsed: 1 passed, 0 failed, chromium". |
| Optional JSON reporter upload | Differentiator | LOW–MEDIUM | `PLAYWRIGHT_JSON_OUTPUT_NAME=results.json npx playwright test --reporter=json` (official). More reliable than parsing text. Accept as file upload; validate shape loosely. |
| Mismatch warnings | Table stakes | LOW | Warn if the submitted test title is not in the run output, if 0 tests ran, if `failed > 0`, or if the project is not chromium. Warnings, not hard blocks: this is an honor system. |
| Static lint of the pasted test code | Differentiator | MEDIUM | Simple regex/AST checks for R2/R4 signals (`waitForTimeout`, `force: true`, `xpath=`, `locator('.` chains, `mouse.click(`), shown as findings next to the AI review. Deterministic, cheap, teaches the same lessons as `eslint-plugin-playwright`. Do not run ESLint itself. |
| Evidence stored as part of the attempt | Table stakes | LOW | Stored in the submission (`test_results_json` already exists) with `source: 'external'` and the parsed summary. Counts as `capstone_checkpoint` or `practice_attempt` event. |
| Honest label: "Self-reported evidence" | Table stakes | LOW | The UI and the completion export say the run was done by the learner outside Studio. No "verified" badge that suggests Studio checked it. |
| Screenshot or trace upload | Anti-feature (for beta) | — | Images and traces contain app data; large; cannot be parsed reliably; privacy risk. Text output plus JSON is enough. |
| Studio spawning `npx playwright` or connecting to the learner's repo | Anti-feature | — | Explicitly out of scope; turns the bridge into a general command executor. |
| Cryptographic proof of the run (signed results, hash chains) | Anti-feature | HIGH | Overkill for a learning tool where the learner gains nothing by cheating. Honor system plus explanation (R7) is enough. |

### Template-level table stakes

| Feature | Complexity | Notes |
|---------|------------|-------|
| Fixed, hand-reviewed syllabus (not generated per learner) | MEDIUM | The beta compares learners on the same path. Suggested sections: (1) pick the workflow in your app and set up Playwright, (2) locators by role and label, (3) web-first assertions and auto-waiting, (4) isolation and test data (fixtures, storageState), (5) debugging flakiness with trace viewer, (6) capstone. Lessons can still be generated, but grounded in fetched official docs (existing rule). |
| Pre-flight check list ("You need: a web app you can run locally, Node, Playwright installed in that project") | LOW | Stops the most common failure: learner has no app to test. Offer a fallback "use any public app you own"; avoid demo sites (fails R1). |
| Practice exercises per section that are small and safe to run in the learner's project | MEDIUM | Each exercise ends with an external run and paste, same UX as capstone, so the learner practices the evidence flow before the capstone. |
| Capstone brief plus rubric R1–R7, immutable | LOW | Existing immutable capstone design fits. |

---

## Area 4: Security UX for Local Tools That Run Code or Agents

How it typically works: VS Code Workspace Trust is the clearest reference. It is enabled by default,
untrusted folders open in Restricted Mode with a persistent banner and status-bar badge, prompts appear
**at the moment** a risky capability is used (terminal, tasks, debug, agents), and the docs are honest
that the feature "can't prevent a malicious extension from executing code" (HIGH for VS Code facts;
applying it to Studio is our interpretation). Lessons: secure default, plain disclosure at the point of
use, persistent indicator of an unsafe mode, no false promises.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| "Code runs on your machine" notice at the point of use | Learners must understand that the local runner and agent bridge are not a sandbox | LOW | Shown next to the Run button when the target is the local runner, and in the bridge setup. Plain words: "This runs with your user's permissions on this computer. It is not a sandbox." Never use "sandbox" or "safe" for local runs. Browser runners (Web Workers/Pyodide) can be labeled "Runs in your browser". |
| Runner target always visible | The learner must know if code runs in the browser or locally | LOW | Badge on the run panel: `Browser` vs `Local machine`. |
| One-time acknowledgement for local execution | Disclosure that is shown once and remembered is the normal pattern; nagging trains people to click through | LOW | First local run shows a short dialog with "I understand"; stored in settings; badge stays visible afterwards. |
| `--legacy` deprecation warning in the terminal | Users who used the old UI must know why it is off and what the risk is | LOW | On start: "Legacy web mode is deprecated and will be removed. It exposes [X]. Use Studio: `course-professor studio`." Print every time, not once. |
| Persistent legacy-mode indicator in the legacy UI | Like Restricted Mode banner: unsafe or deprecated state must be visible at all times | LOW | A top banner in `web/client` when served under `--legacy`. Legacy UI gets no new features; a banner is a compatibility/security fix, so it fits the rule. |
| Clear failure messages for security rejections | 401 or origin rejections must not look like random bugs, or learners disable security | LOW | "Studio is not paired with this server. Restart with `course-professor studio`" instead of a raw 401. Existing `bridge.js` hint pattern. |
| Settings page shows what the bridge can do | Learner sees: bound to loopback, which agents are allowed, Bash off | LOW | Read-only "Local server" panel from `/api/studio/health`. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `course-professor doctor` security section | Learner (and beta operator) can confirm safe setup in one command | LOW | Checks: no legacy mount, loopback bind, token file mode 0600, Bash off. Reuse existing `doctor`. |
| Short SECURITY.md / "What runs where" page | Builders (the target user) trust tools that explain their threat model | LOW | One page: what runs in the browser, what runs locally, what goes to the AI provider, what never leaves the machine. Link from onboarding. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Calling the local runner a "sandbox" or "safe mode" | Reassuring | False; it runs allowlisted commands with user permissions | Honest wording plus allowlist |
| A settings toggle to enable Bash or `--dangerously-skip-permissions` from the UI | Power users ask for it | Makes a browser-reachable path to arbitrary execution; violates the security constraint | Keep Bash off; if ever needed, a CLI flag at server start, never a UI toggle |
| Real OS/container sandboxing (Docker, firejail, VM) | Real isolation | HIGH cost, platform-specific, not needed when the runner is allowlisted and Playwright runs in the learner's toolchain | Allowlist plus disclosure |
| Modal warning on every run | Feels careful | Warning fatigue; users click through | One-time acknowledgement plus persistent badge |

---

## Area 5: Running a 3–5 Person Private Beta

How it typically works: small private betas use a **written onboarding kit**, a fixed check-in
schedule, and interviews that ask about **past behavior** rather than opinions (The Mom Test principles:
"talk about their life, not your idea", "ask about specifics in the past", "talk less"; ask for real
commitments, not compliments). With n=3–5, qualitative evidence is the main result and numbers are
context. (MEDIUM for principles; LOW that any specific cadence is "standard", the PROJECT.md cadence is
reasonable.)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Onboarding guide (one page) | Without it, setup problems eat the first week and activation fails for reasons unrelated to learning | LOW | Prerequisites (Node 22.5+, provider key or agent CLI, a web app of their own), install command, `course-professor doctor`, start Studio, import or create the Playwright course, how to export a report, how to reach the operator. |
| Selection criteria for participants | The wedge is specific; wrong participants give wrong signals | LOW | Must have: a real web project, a reason to add E2E tests in the next month, uses an AI coding assistant. Avoid: people who already write Playwright tests daily. |
| Check-in script: Day 0 / Day 3–4 / Day 7 / Day 14 | Fixed cadence makes learners comparable and catches drop-off early | LOW | Day 0: setup call (watch them install; note friction). Day 3–4: 10-min async check ("what did you do last time you opened it?"). Day 7: report export plus 20-min interview. Day 14: report export plus 30-min interview. Weeks 3–4: async only, final report. |
| The three qualitative questions, asked every interview | Comparable answers across learners | LOW | Based on PROJECT.md plus Mom Test: (1) "Walk me through the last time you used Studio. What were you trying to get done?" (2) "What did you produce with it, and where is it now — in your project?" (3) "Compared with Claude plus notes plus your editor, what was better or worse about that output?" Follow-ups: "What did you do instead on days you did not open it?", "What would you lose if Studio disappeared tomorrow?" |
| Consent and data statement | Learners send a file and talk about their work | LOW | One paragraph: what the report contains, that it has no content, how it is stored, that they can withdraw. |
| Report collection and aggregation | Turns files into a decision | LOW | Learners send JSON by email/DM; operator runs the aggregation script; one sheet with numbers plus quote column per learner. |
| Decision criteria written before the beta | Prevents post-hoc rationalizing | LOW | From PROJECT.md: ≥3 complete a real practice loop; week-2 return per learner; qualitative "better output" evidence. Write "what result means continue / change / stop" up front. |
| Bug/friction intake channel | Blockers must reach the operator same day | LOW | One shared channel or GitHub issue template. Not an in-app widget. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Watch-them-use-it Day 0 session | Finds onboarding friction faster than any metric | LOW | Screen share, learner drives, operator stays quiet. |
| Artifact review at Day 14 | The core value is a real output; seeing the test in their repo is the strongest evidence | LOW | Ask to see the merged/committed test (or its PR). Record "artifact in real project: yes/no". |
| Commitment signal question at the end | Separates politeness from value; seed for willingness-to-pay later | LOW | "Would you use it for your next skill gap? Would you introduce it to a colleague now?" Record actions, not answers. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| In-app NPS or survey widgets | Standard SaaS habit | Adds UI and data paths; n=3–5 NPS is noise | Interviews |
| Asking "Would you use / pay for this?" | Feels like validation | Hypothetical answers are unreliable (Mom Test) | Ask about past behavior and real commitments |
| Shipping feature requests during the beta | Makes learners happy | Moves the target mid-cohort; this milestone is validation | Log requests; fix only blockers and bugs |
| Public waitlist, landing page, Discord community | Growth prep | Distribution before validation (out of scope) | Personally invite 3–5 people |

---

## Feature Dependencies

```
Security release gate (legacy behind --legacy, bridge/runner boundary, regression tests)
    └──required before──> Any learner installs the beta
                              └──requires──> Onboarding kit + doctor checks

Event dictionary (BETA_EVENTS)
    ├──requires──> logActivity call sites for all meaningful actions
    ├──requires──> activation event (activated_at)
    └──feeds──> Export beta report ──feeds──> Aggregation script ──feeds──> Day 7 / Day 14 check-ins

Revision link (parent attempt + feedback ref, migration 0005)
    ├──requires──> Rubric-anchored per-criterion feedback
    ├──enables──> "revision" meaningful event
    └──enables──> Loop completeness metric in report

Playwright template (fixed syllabus + rubric R1–R7)
    └──requires──> Verify-externally evidence flow
                       ├──requires──> Deterministic output parser
                       ├──requires──> Revision link (resubmit after feedback)
                       └──emits──> practice_attempt / capstone_checkpoint events

Static lint of pasted test ──enhances──> Rubric-anchored feedback (R2, R4)
Self-assessment ──enhances──> Revision loop
"Code runs on your machine" notice ──conflicts──> any "sandbox" wording
Studio spawning Playwright ──conflicts──> runner allowlist / security gate
```

### Dependency Notes

- **Security gate before beta install**: no learner should install a build that can mount legacy routes
  by default. This is the hard blocker for everything else.
- **Event dictionary before the report**: the report is only a view on events; if events are missing
  (workspace runs, revisions), week-2 return is undercounted and cannot be fixed after the fact
  because past events were never stored. Instrumentation must ship **before** Day 0 of the cohort.
- **Revision link before Playwright template is usable**: the template's core loop is "run externally →
  paste → feedback → revise → paste again". Without the link, revisions look like unrelated attempts.
- **Parser before AI review**: the pass/fail fact must come from code, so the LLM review consumes the
  parsed summary, not raw text.
- **Instrumentation and the template share files** (`repo/index.js`, practice components, capstone page).
  Phases that touch both should declare ownership carefully, or be sequenced (parallel-worker constraint).

## MVP Definition

### Launch With (beta Day 0)

- [ ] Security gate complete, including "Code runs on your machine" wording and `--legacy` warning — blocks beta
- [ ] Event dictionary + logging of all meaningful actions + activation timestamp — cannot be added after data starts
- [ ] Export beta report (content-free JSON, preview before save, day 7/14 banner) — only data channel
- [ ] Revision link + rubric-anchored per-criterion feedback + "Revise" main action — core value
- [ ] Playwright template with fixed syllabus and rubric R1–R7 — the wedge
- [ ] Verify-externally flow: copyable command, paste fields, deterministic parser, mismatch warnings, "self-reported" label — capstone evidence
- [ ] Beta kit: onboarding guide, participant criteria, check-in script with three questions, consent text, aggregation script, decision criteria

### Add After Validation (during or after the cohort, if signals justify)

- [ ] JSON reporter upload — if text parsing fails for real learners' output
- [ ] Static lint findings on pasted tests — if reviews miss sleeps/CSS selectors
- [ ] Self-assessment before review — if learners skip revision or misjudge their work
- [ ] R8 stability criterion (`--repeat-each`) — if flaky passes show up in evidence
- [ ] CLI `beta-report` — if SQLite/plugin-only learners struggle to export
- [ ] `doctor` security section — if setup issues appear in Day 0 sessions

### Future Consideration (after beta shows retention)

- [ ] Second course template (other testing tools or skills) — validate the first wedge first
- [ ] Opt-in remote telemetry — only with a separate privacy decision; out of scope now
- [ ] CI-integrated evidence (GitHub Actions artifact link) — needs accounts/integration
- [ ] Cross-browser and CI capstone extensions — beyond "first reliable test"

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Security gate + run-location disclosure | HIGH | MEDIUM | P1 |
| Event dictionary + full meaningful-action logging | HIGH (for the beta question) | MEDIUM | P1 |
| Activation event | HIGH | LOW | P1 |
| Export beta report with preview | HIGH | MEDIUM | P1 |
| Revision link + per-criterion feedback | HIGH | MEDIUM | P1 |
| Playwright template + rubric R1–R7 | HIGH | MEDIUM | P1 |
| Verify-externally paste flow + parser | HIGH | MEDIUM | P1 |
| Beta kit (docs, script, aggregation) | HIGH | LOW | P1 |
| Attempt history with criteria delta | MEDIUM | LOW | P1 |
| Loop completeness metric | MEDIUM | LOW | P2 |
| JSON reporter upload | MEDIUM | LOW | P2 |
| Static lint of pasted test | MEDIUM | MEDIUM | P2 |
| Self-assessment before review | MEDIUM | LOW | P2 |
| `doctor` security section | MEDIUM | LOW | P2 |
| CLI beta-report | LOW | LOW | P3 |
| R8 repeat-stability criterion | LOW | LOW | P3 |

## Competitor / Reference Feature Analysis

| Feature | Reference A | Reference B | Our Approach |
|---------|-------------|-------------|--------------|
| Feedback on attempts | Exercism: human mentors nudge toward ideas; automated feedback for common problem buckets | Generic AI chat (Claude + editor): answers directly, often with code | Rubric-anchored Socratic review, never code; revision linked and counted |
| Verifying work done outside the tool | Exercism CLI: learner runs tests locally, submits solution | CI badges: trust the external system | Learner runs Playwright in own project, pastes output; code parses facts, AI reviews against rubric; labeled self-reported |
| Local execution trust | VS Code Workspace Trust: secure default, banner, prompt at point of use, honest limits | Jupyter: runs code with user permissions, little disclosure | Loopback + token + allowlist, "Code runs on your machine", persistent mode badge, no "sandbox" wording |
| Retention measurement | SaaS analytics (PostHog etc.): network telemetry, activation/retention cohorts | Interview-only betas | Local event log, content-free exported JSON, active-day offsets, plus Mom Test interviews |

## Sources

- Playwright best practices — https://playwright.dev/docs/best-practices (HIGH)
- Playwright locators — https://playwright.dev/docs/locators (HIGH)
- Playwright reporters (JSON reporter, `PLAYWRIGHT_JSON_OUTPUT_NAME`) — https://playwright.dev/docs/test-reporters (HIGH)
- eslint-plugin-playwright rule list — https://npmjs.com/eslint-plugin-playwright (MEDIUM)
- Biome `noPlaywrightWaitForTimeout` — https://biomejs.dev/linter/rules/no-playwright-wait-for-timeout (MEDIUM)
- VS Code Workspace Trust — https://code.visualstudio.com/docs/editing/workspaces/workspace-trust (HIGH for VS Code behavior)
- Exercism mentoring docs — https://exercism.org/docs/mentoring and https://exercism.org/docs/mentoring/how-to-give-great-feedback (MEDIUM)
- Exercism Automated Mentoring Support Project — https://exercism.org/blog/automated-mentoring-support-project (MEDIUM; older post)
- PostHog activation metrics — https://posthog.com/pocket-guides/context-warehouse/activation-metrics (MEDIUM)
- Activation moment guidance — https://echai.ventures/startingup/growth-metrics/how-do-i-measure-activation-and-where-should-the-activation-moment-actually-sit-in-my-onboarding (LOW)
- The Mom Test summary — https://tianpan.co/notes/2025-04-29-the-mom-test (LOW; secondary summary of Rob Fitzpatrick's book)
- Codebase: `studio/migrations/0001_init.sql`, `0004_capstone.sql`, `studio/src/lib/activity.js`,
  `logActivity` call sites in `studio/src/pages` and `studio/src/components/practice` (HIGH)

---
*Feature research for: local-first AI learning workspace private beta (Professor Studio)*
*Researched: 2026-10-17*
