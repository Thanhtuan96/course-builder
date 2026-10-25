# full-loop-e2e Specification

## Purpose

Define the deterministic Chromium E2E suite that drives the built Studio against a fake local agent
through the real bridge: one generated-course journey through revision, one Playwright-template
journey through external evidence and the beta report, isolated ports and temp home, no retries, and
the CI job that runs it.

## Requirements
### Requirement: The suite drives the built Studio bundle in the two-origin topology

`npm run test:e2e` SHALL serve the built `studio/dist` bundle from a static origin and the local
bridge from a separate origin, and SHALL pair the browser with the bridge through the
`#/settings?bridge=…&token=…` pairing URL, exactly as `course-professor studio` does. The suite
MUST NOT start `vite dev` and MUST NOT serve Studio from the bridge's own port.

#### Scenario: Studio and bridge use separate origins

- **WHEN** the E2E web servers start
- **THEN** the Studio origin serves the files from `studio/dist` and the bridge origin answers
  `/api/studio/health` on a different port from the Studio origin

#### Scenario: Pairing URL configures the local agent

- **WHEN** the browser opens `<studio-origin>/#/settings?bridge=<bridge-url>&token=<token>`
- **THEN** Settings shows "My local agent" as selected with the test bridge URL and token, and a
  "Test connection" call through the bridge succeeds

#### Scenario: Bridge readiness uses an unauthenticated health probe

- **WHEN** Playwright waits for the bridge `webServer`
- **THEN** it polls `http://127.0.0.1:<bridge-port>/api/studio/health` and treats an unauthenticated
  401 response as ready, so no token is added to the readiness probe

### Requirement: A fake local agent CLI is driven through the real bridge

The suite SHALL place a Node script named `claude` first on the bridge process `PATH` and SHALL let
the real bridge spawn it, so the pairing token, Origin guard and stream-json parsing are exercised.
The fake CLI SHALL select deterministic replies from markers in the system prompt and prompt, and
SHALL emit stream-json lines in the same shape as `studio/test/fixtures/agents/claude.jsonl`. The
suite MUST NOT intercept requests with `page.route()`, MUST NOT use an OpenAI-compatible stub, and
MUST NOT call a real provider.

#### Scenario: Bridge spawns the PATH shim

- **WHEN** the tutor or a generator sends a prompt through the bridge
- **THEN** the bridge resolves `claude` from the suite's fixture directory, and the streamed reply
  in the UI is the text the fixture selected for that prompt marker

#### Scenario: Prompt classes get distinct replies

- **WHEN** the fake agent receives a syllabus, lesson, quiz, flashcard, tutor, quiz-review,
  workspace-review or external-capstone-review prompt
- **THEN** it returns the matching committed reply fixture and the UI accepts it (valid JSON where
  JSON is required)

#### Scenario: Reply selection is checked without a browser

- **WHEN** `npm run test:e2e` runs the `node` project
- **THEN** a Playwright test imports the fake-agent helper, asserts the marker precedence and the
  stream-json frame shape, and launches no browser

### Requirement: Each run is isolated and deterministic

The suite SHALL bind test servers only on ports inside 3010–3099 (overridable by env), SHALL use
`reuseExistingServer: false`, SHALL create a fresh `PROFESSOR_HOME` under the OS temp directory per
run, SHALL use one fixed in-process `STUDIO_BRIDGE_TOKEN`, SHALL set `STUDIO_ORIGINS` to exactly
the Studio test origin, and SHALL run with `workers: 1`. It MUST NOT touch ports 3000, 5173 or 5180.

#### Scenario: Ports stay in the test range

- **WHEN** the configured base port is taken
- **THEN** the run fails to start rather than reusing the server or falling back to a default port,
  and no server is started on 3000, 5173 or 5180

#### Scenario: State does not leak between runs

- **WHEN** the suite runs twice in a row
- **THEN** each run starts with an empty temporary `PROFESSOR_HOME` and neither run reads courses,
  settings or a token written by the other

#### Scenario: Both journeys share one profile and one home

- **WHEN** journey A and journey B run
- **THEN** both use the same saved browser storage state (provider, token, storage) and the same
  temporary `PROFESSOR_HOME`, and journey A completes before journey B starts

### Requirement: Failures are never masked

The suite SHALL use `retries: 0` in CI and locally and SHALL NOT call `waitForTimeout` or rely on
fixed sleeps; every assertion SHALL be web-first (role, label or visible text). It MUST NOT raise
timeouts or add retries to make a flaky step pass.

#### Scenario: Zero retries are configured

- **WHEN** the Playwright configuration is loaded
- **THEN** `retries` is `0` and no spec contains `waitForTimeout`

#### Scenario: Locators avoid implementation details

- **WHEN** a spec locates an element
- **THEN** it uses a role, accessible name or visible text; no `data-testid`, CSS selector chain or
  coordinate click is added to product code or to the specs

### Requirement: Journey A covers the generated programming course through revision

The suite SHALL drive a generated programming course, in order: new course → lesson → quiz → tutor →
workspace run → revision. It SHALL assert an observable outcome for each stage, and the revision
stage SHALL exercise "Revise this attempt" plus attempt history.

#### Scenario: New course and lesson from the fake agent

- **WHEN** the learner enters a topic on New course and starts the proposed syllabus
- **THEN** the course page shows the generated syllabus and lesson 1 renders generated content

#### Scenario: Quiz and tutor

- **WHEN** the learner completes the five-question self-check and sends a tutor message
- **THEN** the quiz score is shown and saved in Past attempts, and the tutor shows a streamed
  Socratic reply with no code fence

#### Scenario: Workspace run requires the local-machine acknowledgement

- **WHEN** the learner opens the Workspace tab and presses Run for the first time
- **THEN** the "Local machine" badge and "Code runs on your machine" notice are shown, the first run
  is blocked until "I understand — run my code" is pressed, and the run then executes

#### Scenario: Workspace run records a failing and a passing attempt

- **WHEN** the learner enters the lesson exercise in the workspace, runs it with `exit 1`, edits it
  to `exit 0` and runs again
- **THEN** the output panel shows `exit 1` then `exit 0`, stdout shows the completion message, and
  attempt history lists both runs

#### Scenario: Tutor review exposes Revise this attempt

- **WHEN** the learner asks the tutor to review the attempt and one criterion is not met
- **THEN** the review shows the unmet status and its Socratic question, and "Revise this attempt" is
  offered

#### Scenario: Revision produces a linked attempt history

- **WHEN** the learner revises the answer, sends it, and asks for a second review
- **THEN** the second review is all met and attempt history shows two linked attempts with the
  criteria transition

### Requirement: Journey B covers the Playwright template capstone and external evidence

The suite SHALL start the bundled Playwright template through its five pre-flight items, mark its
five lessons done, then cover capstone → external evidence → R1–R7 review → beta report. It MUST NOT
try to cover external evidence from a generated course.

#### Scenario: Pre-flight gate blocks the template CTA

- **WHEN** the New course page shows the Playwright template card
- **THEN** the start button is disabled until all five pre-flight checkboxes are ticked, and pressing
  it after ticking them seeds and opens the template course

#### Scenario: Template capstone is external

- **WHEN** all five template lessons are marked done and the capstone page opens
- **THEN** the "Verify externally" form is present because the capstone `external_id` is
  `template:playwright-e2e`, and no generated R1–R7 rubric was created

#### Scenario: Evidence paste shows self-reported facts

- **WHEN** the learner pastes the committed Chromium evidence fixture and ticks the confirmation box
- **THEN** the facts show Chromium, passed > 0 and failed = 0, labelled "self-reported evidence"

#### Scenario: R1–R7 review completes the course

- **WHEN** the learner submits the spec path, the matching spec source and a write-up
- **THEN** the review shows exactly one status for each of R1–R7 and the code-owned verdict is
  "Course Complete"

### Requirement: External evidence is produced by a real committed Playwright run

The repository SHALL contain an evidence fixture generated by a real local Chromium run of a tiny
committed spec, not hand-written. A README next to it SHALL record the exact command used. The
output SHALL pass Studio's own parser (`parseEvidence` / `summarizeEvidenceFacts`): JSON reporter
format, `failed = 0`, `passed > 0`, Chromium confirmed and no blocking warning. Studio MUST NOT run
Playwright as part of the suite.

#### Scenario: README documents the authoring command

- **WHEN** the evidence fixture directory is inspected
- **THEN** its README records `PLAYWRIGHT_JSON_OUTPUT_NAME=… npx playwright test --reporter=json
  --project=chromium` plus the Playwright version and capture date

#### Scenario: Fixture passes Studio's parser

- **WHEN** the committed fixture is parsed by `studio/src/lib/capstone-evidence.js`
- **THEN** format is `json`, `stats.failed` is 0, `stats.passed` is greater than 0,
  `stats.chromium` is `confirmed`, and no blocking warning code is present

### Requirement: The beta report counts events from both journeys

Journey B SHALL preview and download the beta report and SHALL assert that the downloaded JSON
contains loop counts produced by both journeys.

#### Scenario: Report includes both journeys

- **WHEN** the beta report is previewed and downloaded after both journeys
- **THEN** `loops.byKind.quiz_completed` and `loops.byKind.workspace_run` are at least 1 (journey A),
  `loops.byKind.capstone_checkpoint` and `capstone.externalEvidence` are at least 1 (journey B), and
  `capstone.verdict` is `course_complete`

#### Scenario: Revisions are counted

- **WHEN** the report is read after the tutor revision
- **THEN** `loops.revisions.tutor` is at least 1

### Requirement: E2E stays out of the unit test scope

The root `package.json` SHALL expose `test:e2e`; `npm test` SHALL remain unit-only and SHALL NOT
start a browser. Vitest SHALL NOT collect files under `e2e/**`.

#### Scenario: npm test starts no browser

- **WHEN** `npm test` runs
- **THEN** Vitest collects only the root and Studio unit suites and no Playwright browser process
  starts

#### Scenario: e2e is a separate command

- **WHEN** a developer runs `npm run test:e2e`
- **THEN** Playwright runs the Chromium suite and the node-only fake-agent test with the shared
  config used locally and in CI

### Requirement: CI runs the suite in a dedicated job

`.github/workflows/ci.yml` SHALL gain one `e2e` job that runs on pushes and pull requests to
`develop` and `main`, uses Node 22, installs root and Studio dependencies with `npm ci`, builds
Studio, installs Chromium with `npx playwright install --with-deps chromium`, runs
`npm run test:e2e`, and on non-cancelled runs uploads `playwright-report/` and `test-results/`. The
job SHALL set `timeout-minutes`. The existing `unit`, `security` and `drift` jobs SHALL stay
unchanged.

#### Scenario: Green run publishes the suite result

- **WHEN** the `e2e` job runs on a pull request to `develop`
- **THEN** it builds Studio, runs the Chromium suite and the job is green with `retries: 0`

#### Scenario: Failure artifacts are uploaded

- **WHEN** the suite fails or is cancelled mid-run
- **THEN** the job uploads `playwright-report/` and `test-results/` whenever the run was not
  cancelled, and the job is red

#### Scenario: Existing jobs are untouched

- **WHEN** the workflow file is compared with its previous version
- **THEN** only a new `e2e` job is added; `unit`, `security` and `drift` keep their steps, matrix and
  commands unchanged

