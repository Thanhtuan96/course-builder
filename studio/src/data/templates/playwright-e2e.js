/**
 * Bundled Playwright E2E course template (PW-01, D-01).
 *
 * Pre-written, reviewed local content — the same pattern as `studio/src/data/demo-course.js`, but
 * bilingual: `playwrightTemplateFor(language)` picks the Vietnamese variant through
 * `normalizeLanguage` and falls back to this English one.
 *
 * Seeding this template makes ZERO model calls and works with no provider configured: the course
 * bodies, quizzes and the immutable R1–R7 capstone are all data in this module tree.
 *
 * Teaching rule (D-16): lessons teach concepts and may name flags in prose, but contain no complete
 * runnable spec and no copyable run command. The one exact command the learner copies lives in the
 * evidence form (`EVIDENCE_COMMANDS`, plan 09-04).
 */
import { normalizeLanguage } from '../../lib/i18n/languages.js';
import {
  createCourse,
  createCapstone,
  listCourses,
  getCapstone,
  getCourse,
} from '../../lib/repo/index.js';
import { PLAYWRIGHT_TEMPLATE_VI } from './playwright-e2e.vi.js';

/** Stable template id (`createCourse` does not persist it; the capstone external id identifies it). */
export const PLAYWRIGHT_TEMPLATE_ID = 'playwright-e2e';

/** Identifies a seeded template capstone (D-02: detection is by `external_id` prefix). */
export const PLAYWRIGHT_CAPSTONE_EXTERNAL_ID = 'template:playwright-e2e';

/** The seven rubric criteria, in review order (D-07). Frozen so a caller cannot reorder them. */
export const PLAYWRIGHT_RUBRIC_KEYS = Object.freeze(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);

const ARTIFACT = {
  title: 'One Playwright E2E spec for a real workflow in your own app',
  deliverable:
    'One spec file in your own project covering one real user workflow, plus the output of a passing Chromium run.',
  definitionOfDone: [
    'One spec file committed in your own project.',
    'Green when run alone and green in a full run.',
    'No waitForTimeout, no force: true, no coordinate clicks.',
    'At least one semantic locator and one web-first assertion.',
    'A reporter output from a Chromium run with 0 failures pasted in.',
    'A short write-up of your locator, waiting and isolation choices.',
  ],
};

const BRIEF_MD = `# 🏗️ Capstone: Your first Playwright E2E test

**Ship your artifact.** This is not an exam — you are building one real, working thing you can keep
and use in your own project.

## What you'll ship

**One spec file** in your own project covering exactly **one real workflow** a real user performs,
plus **the reporter output of a passing Chromium run**.

## What you're proving

By shipping this, you demonstrate that you can:
- Pick a workflow a user actually cares about, not a demo page.
- Locate elements the way a user describes them.
- Assert what a user sees, with assertions that retry automatically.
- Keep the test isolated and repeatable.
- Read the test runner's report and explain it.

## Scope

### Core features (or required sections)
- [ ] One spec file inside your own project, for exactly one workflow.
- [ ] Semantic locators: role, label, text or test id (chained or filtered as needed).
- [ ] At least one web-first assertion as the main proof.
- [ ] Setup (login, fixtures) in beforeEach, test.use or storageState.
- [ ] The reporter output of a green Chromium run, pasted in when you submit.

### Stretch goals
- [ ] Run the spec in reverse order to prove it does not depend on ordering.
- [ ] Add a URL assertion once the workflow completes.
- [ ] Record one flaky attempt (if any) and explain the cause you found.

## Rules
- The spec is **written by you**. Documentation, the official docs and codegen to *discover* locators
  are all allowed; **no AI-written spec**.
- Studio **never runs** Playwright for you. You run it in your own terminal and paste the result back.
- Do not paste traces, screenshots or videos — they may contain your app's private data.
- Do not edit the reporter output. If something failed, submit it honestly and say where you are.

## Definition of Done
- [ ] One spec file committed in your own project, covering one real user workflow.
- [ ] Green when run alone, and still green in a full run.
- [ ] No waitForTimeout, no force: true, no coordinate clicks.
- [ ] At least one semantic locator and one web-first assertion.
- [ ] A Chromium run with 0 failures (JSON or list reporter) pasted in.
- [ ] A short write-up: why those locators, why no manual waits, and how the test stays isolated.

## Submit
Paste the spec, its path in your project, the reporter output and your write-up. Submit as many times
as you like — every attempt and its review is kept.`;

const RUBRIC = [
  {
    key: 'R1',
    name: 'Real workflow in your own app',
    solid:
      "The spec drives a workflow a real user performs in your own app (not a demo page, not a copy of a tutorial), and the steps read like user intent.",
  },
  {
    key: 'R2',
    name: 'Semantic locators',
    solid:
      'Locates by role, label, text or test id (chained or filtered as needed); no CSS/XPath chains, no nth-child, no page.$ or page.$$.',
  },
  {
    key: 'R3',
    name: 'Web-first assertions',
    solid:
      'Uses auto-retrying expect(locator) assertions (toBeVisible, toHaveText, toHaveURL, toHaveCount, …); no manual expect(await …isVisible())-style checks as the main proof.',
  },
  {
    key: 'R4',
    name: 'No fixed waits, force or coordinate clicks',
    solid:
      'No waitForTimeout or sleep, no { force: true }, no mouse.click(x, y); waiting is delegated to locators and assertions.',
  },
  {
    key: 'R5',
    name: 'Isolated and repeatable',
    solid:
      'The test passes alone and in a full run; setup lives in beforeEach, test.use or storageState; no describe.serial and no module-level shared state.',
  },
  {
    key: 'R6',
    name: 'Evidence of a passing Chromium run',
    solid:
      'The pasted reporter output shows a real passing test with expectedStatus: passed in a Chromium project (or the default project) and 0 failures.',
  },
  {
    key: 'R7',
    name: 'You can explain your choices',
    solid:
      'The write-up explains why those locators, why no manual waits, and how the test stays isolated — in your own words and consistent with the submitted code.',
  },
];

const L1 = `# What a reliable end-to-end test actually is

## Objectives

- Tell apart a test that checks **behaviour a user can see** from a test that checks implementation
  details.
- Pick exactly **one** real workflow in your own app and say, in plain language, what "it worked"
  means.
- Recognise that Playwright already waits for the page, so most sleeps and retries are noise.

## Explanation

An end-to-end test drives your app the way a person does: open a page, click, type, submit, then look
at what the person would see. So "reliable" does not mean "it passed on my machine today". It means
"anyone who runs it next reaches the same conclusion".

A reliable test has three properties:

- **Behaviour, not plumbing.** It talks about what a user can do, not about class names, internal
  state or component structure.
- **One clear target.** One workflow, one sentence that says "done". A test that covers ten things at
  once goes red for ten different reasons and nobody knows where to start.
- **No self-deception.** No fixed sleeps, no skipped checks, no "run it again until it is green".

## Worked example

Someone writes a test for a shop page. The first version checks that after clicking the button an
element with class "cart-badge" exists and contains "1". Three months later the design team replaces
the badge with a different component: user behaviour is unchanged, the test goes red. The second
version checks that after clicking "Add to cart", the user **sees** the product in the cart with
quantity 1. Same app, but the second version only fails when a real user is actually affected.

## Common misconceptions

- **Misconception:** "More steps means a better test." **Reality:** longer tests make the failure
  location unknowable; go deep on one workflow.
- **Misconception:** "It has to inspect the DOM to be safe." **Reality:** the DOM is an implementation
  detail; what must be right is what the user sees.
- **Misconception:** "A flaky test needs retries." **Reality:** retries hide the cause; find the bad
  wait instead.

## Check your understanding

1. Is the workflow you picked something a real user does, or something you want to inspect?
2. If someone redesigns the page tomorrow without changing behaviour, would your test fail? Why?
3. Can you write your "it worked" sentence so a stranger understands it?

## Exercise

Pick **one** workflow in your app — signing in, adding an item, submitting a form. Write it as user
steps in plain language (open this, type that, click that, see that). Then write exactly **one**
sentence that states what proves the workflow finished.

**Success criteria:** someone who cannot read your code still understands what "done" means from your
steps and sentence, and no step mentions an internal class, id or state name.

## Key takeaways

- End-to-end means the user's point of view, not the DOM's.
- One real workflow, one clear assertion, one readable test.
- Playwright already waits; your job is to describe the right thing to wait for.

## Resources

- Testing philosophy — https://playwright.dev/docs/best-practices
- Playwright Test introduction — https://playwright.dev/docs/intro`;

const L2 = `# Find elements the way a user does

## Objectives

- Know the locator priority: role, label, text, test id, and only then CSS/XPath.
- Understand why semantic locators survive redesigns.
- Use codegen to **discover** locators, never to paste them wholesale.

## Explanation

Users do not find elements by "the third div inside the second div". They find them by what they see:
a button called "Sign in", a field labelled "Email", a line of text that says "Your order". Semantic
locators describe exactly those things, so when the layout changes, the locator still points at the
right element.

The practical priority:

1. **Role** — button, link, textbox, heading. This is also what assistive technology uses, so it is
   both durable and meaningful.
2. **Label** — the visible label of a field, exactly as a user reads it.
3. **Text** — content the user can see.
4. **Test id** — when nothing user-facing can express it; this is a contract you deliberately create
   with the app.
5. **CSS/XPath** — the last resort, because they bind to DOM structure, the thing that changes most.

Playwright locators are **strict**: if a locator matches several elements, the action fails instead of
silently picking the first one. That is a feature — it forces you to be specific, by chaining or by
filtering to a scope.

## Worked example

A login form has two fields and one button. Written against structure: "first input, second input,
third button". Written like a user: "the field labelled Email, the field labelled Password, the button
named Sign in". The next person who adds a "Backup code" field at the top of the form breaks the first
version immediately; the second version still works, because it names things instead of counting them.

## Common misconceptions

- **Misconception:** "Test ids are bad practice." **Reality:** a test id is an explicit, stable
  contract; use it when semantics cannot express the element.
- **Misconception:** "Taking the first match is fine." **Reality:** strict mode will fail; narrow it
  with a scope or a filter.
- **Misconception:** "Whatever codegen prints is ready to commit." **Reality:** codegen records
  *actions*, not *intent*; read it, then rewrite it.

## Check your understanding

1. Which locator in your current test would break if someone renamed a class?
2. Do you have a locator that matches several elements but "happens" to work?
3. If you had to explain your locator to someone who cannot read code, what would you say?

## Exercise

Write **five** locators for the workflow you picked in the previous lesson. For each one, note what it
binds to (role, label, text, test id) and why it would still be correct if the page were redesigned.

**Success criteria:** none of the locators depends on element order, nth-child, multi-level CSS chains
or XPath; and each one still reads like the user's intent.

## Key takeaways

- Name elements the way users name them; do not count their position.
- Strict mode is on your side.
- codegen discovers; you decide intent.

## Resources

- Locators — https://playwright.dev/docs/locators
- Best practices — https://playwright.dev/docs/best-practices
- codegen — https://playwright.dev/docs/codegen`;

const L3 = `# Let Playwright wait for you

## Objectives

- Understand that web-first assertions retry until they pass or their timeout expires.
- Separate a retrying assertion from a manual check that runs once.
- Recognise waitForTimeout, force and coordinate clicks as traps.

## Explanation

When you assert something about a locator, Playwright does not check once and decide. It **retries**
until the assertion passes, or until the assertion timeout runs out (five seconds by default). That is
why you almost never need to wait yourself.

The manual style is the opposite: read a state, compare it, and finish. If the page has not updated
yet, the check fails immediately — and people "fix" it by adding a fixed delay. That delay fixes
nothing: on a fast machine it wastes time, on a slow machine it still fails.

Three traps to know:

- **Fixed waits**: stop for a number of seconds. Debugging only; never leave one in a test.
- **Forcing actions**: tell Playwright to click even though the element is not ready. The test goes
  green while a real user still cannot click.
- **Coordinate clicks**: click at (x, y). It depends on window size and layout, so it breaks the
  moment the screen changes.

## Worked example

A "Save" button shows a confirmation once the server responds. The manual version reads whether the
confirmation is visible yet, waits half a second if not, and reads again — it fails on slow CI. The
web-first version asserts that the confirmation **will show** the text "Saved". Playwright waits,
retries, and only fails if the confirmation genuinely never appears. Same behaviour, but the second
version fails only when the app is wrong.

## Common misconceptions

- **Misconception:** "Add a wait to be safe." **Reality:** fixed waits make the test slower and still
  flaky.
- **Misconception:** "Auto-waiting means timing never matters." **Reality:** there is still a budget;
  if an action really takes long, state that budget instead of guessing.
- **Misconception:** "force is just a convenient option." **Reality:** it bypasses the exact checks
  users depend on.

## Check your understanding

1. Where in your test are you reading an instant state instead of asserting an outcome?
2. If you deleted every fixed wait, which spot would fail first — and why?
3. Why does a coordinate click fail when the window is resized?

## Exercise

Find **one** place in your test where you were tempted to add a wait. Replace it with a web-first
assertion that matches what the user needs to see.

**Success criteria:** the test has no fixed waits left; the new assertion fails when you deliberately
break the behaviour (for example by changing the confirmation text) and passes when the behaviour is
correct.

## Key takeaways

- Assert what will be true, do not sample what is true.
- Assertions retry; fixed delays do not.
- force and coordinates hide real failures.

## Resources

- Web-first assertions — https://playwright.dev/docs/best-practices
- Timeouts — https://playwright.dev/docs/test-timeouts
- Actionability — https://playwright.dev/docs/actionability`;

const L4 = `# Make it runnable twice, alone

## Objectives

- Understand that each test gets a fresh browser context.
- Put setup in beforeEach, test.use or a saved authentication state.
- See why serial runs and module-level state hide bugs.

## Explanation

Playwright gives **every test** its own browser context: cookies, local storage and session are new.
That is the framework's biggest gift — it means a test should never depend on what the previous test
did.

Three tools keep a test isolated:

- **beforeEach**: run setup before each test — sign in, create data, open the right page.
- **test.use**: declare configuration for a group of tests (viewport, permissions, state).
- **Saved authentication state**: sign in once, save the state, and reuse it across tests instead of
  driving the login UI every time.

By contrast, serial runs and module-level variables create **hidden dependencies**: the test only
passes in the right order, or alone, or on the author's machine. Those tests often stay green for
weeks and then fail on the day it matters.

## Worked example

A group of three tests shares a counter initialised once at the top of the file. The full run is
green; running the third test on its own is red, because the counter was never initialised. The author
"fixes" it by making the group serial — and now the tests no longer say anything about the app, only
about ordering. Moving the initialisation into beforeEach lets all three run independently, and the
third test now fails immediately if the app is actually broken.

## Common misconceptions

- **Misconception:** "Serial is faster to write." **Reality:** faster to write, much slower to debug.
- **Misconception:** "Logging in for every test is wasteful." **Reality:** that is what makes tests
  independent; if it is too slow, save the authentication state.
- **Misconception:** "A green test is finished." **Reality:** run it alone, twice in a row, and in
  reverse order.

## Check your understanding

1. Does your test pass when run on its own?
2. Is there a module-level variable that two tests both read or write?
3. If the second run fails, what data do you think survived from the first?

## Exercise

Run your test three ways: alone, twice in a row, and with the whole suite in reverse order. Do not
edit the code between runs.

**Success criteria:** all three runs are green, and you can point at the setup (beforeEach, test.use or
saved authentication state) that keeps the test isolated.

## Key takeaways

- Each test owns a clean context; never rely on the previous one.
- Setup belongs in beforeEach, not in "the previous run".
- Serial mode hides isolation problems rather than solving them.

## Resources

- Browser contexts and isolation — https://playwright.dev/docs/browser-contexts
- beforeEach and fixtures — https://playwright.dev/docs/test-fixtures
- Authentication state — https://playwright.dev/docs/auth`;

const L5 = `# Prove it: projects, reporters, evidence

## Objectives

- Understand what a project is and why evidence should come from one named browser.
- Read a reporter summary and know which numbers are real.
- Prepare evidence from your own run to hand in.

## Explanation

Playwright runs tests by **project**. A project is a configuration: which browser, which viewport,
whether to retry on failure. If you configure nothing, Playwright uses a single default project with
Chromium. When the evidence needs to be unambiguous, select the Chromium project on the command line
(the flag is named \`--project=chromium\`) so the report states the browser explicitly.

A reporter is what prints the result. Two are useful as evidence:

- **JSON reporter**: machine-readable output — configuration, the spec files, every test, every retry
  attempt and a stats block. Enabled with \`--reporter=json\`.
- **List reporter**: readable terminal lines plus a summary block at the end. Enabled with
  \`--reporter=list\`.

Two fields in the JSON output are easy to misread. The stats block counts *outcomes*, not whether a
test really passed — a test marked as an expected failure still lands in that bucket while no attempt
ever passed. So evidence of a green run must be: the test's outcome is normal, its expected status is
passed, and at least one attempt actually passed.

In the text summary, read the lines literally: "1 flaky" means the test failed on the first attempt
and passed on a retry; "1 skipped" means the test was skipped, not that it passed.

## Worked example

Two people submit evidence. The first pastes a screenshot containing the word "passed". The second
pastes the JSON output of a Chromium run: three tests, two passed, one skipped, no failures. The
second proves far more — the data shows exactly what ran and what did not.

## Common misconceptions

- **Misconception:** "Run every browser to be thorough." **Reality:** one clean Chromium run satisfies
  this criterion; extra browsers only add unrelated failures.
- **Misconception:** "Zero failures means everything passed." **Reality:** skipped tests are not
  passes.
- **Misconception:** "Traces and screenshots look more convincing." **Reality:** they may contain
  private data; the reporter text is the evidence.

## Check your understanding

1. Does your report say which project ran?
2. Is any skipped test being counted as a pass in your head?
3. If one test is flaky, can you explain why?

## Exercise

Run your test three times against the Chromium project. Keep the reporter output (JSON or list) of the
cleanest run, and write one sentence about anything surprising.

**Success criteria:** you hold an evidence file showing at least one test that genuinely passed in the
Chromium project with 0 failures, and you can read every number in it without guessing.

## Key takeaways

- A project is configuration; pick the right one for evidence.
- The JSON reporter is data; the list reporter is a summary.
- "Expected" is not "passed" — read the real status.

## Resources

- Reporters — https://playwright.dev/docs/test-reporters
- Command line — https://playwright.dev/docs/test-cli
- Test projects — https://playwright.dev/docs/test-projects`;

export const PLAYWRIGHT_TEMPLATE = {
  title: 'Ship your first reliable Playwright E2E test for a real web workflow',
  description:
    'A five-lesson course where you write one spec file in your own project for a real user workflow and run it on Chromium until it is green.',
  level: 'Intermediate',
  kind: 'programming',
  goal:
    'Write and run one reliable Playwright E2E test for a real workflow in your own app, then prove the run.',
  topics: ['playwright', 'e2e testing', 'test automation'],
  language: 'en',
  artifact: ARTIFACT,
  preflight: [
    {
      id: 'own_app',
      label:
        'I have a web app I can run locally (or a deployed URL) with at least one real workflow.',
    },
    { id: 'node', label: 'Node is installed — running `node -v` prints a version.' },
    {
      id: 'playwright',
      label: 'Playwright is installed and runs — `npx playwright --version` prints a version.',
    },
    { id: 'chromium', label: 'A Chromium browser is installed — `npx playwright install chromium`.' },
    {
      id: 'no_execution',
      label:
        'I understand Studio never runs Playwright: I run it in my own terminal and paste the output back.',
    },
  ],
  capstone: {
    kind: 'programming',
    brief_md: BRIEF_MD,
    rubric: RUBRIC,
    artifact: ARTIFACT,
    tests: null,
    hiddenAnswers: null,
    externalId: PLAYWRIGHT_CAPSTONE_EXTERNAL_ID,
  },
  lessons: [
    {
      title: 'What a reliable end-to-end test actually is',
      summary: 'User-visible behaviour, one real workflow, one clear assertion.',
      content_md: L1,
      quiz_seed: [
        {
          question: 'What does a reliable end-to-end test check?',
          options: [
            'The class names inside the DOM',
            'Behaviour a user can see',
            'The line count of a component',
            'The build configuration',
          ],
          answerIndex: 1,
          explanation: 'End-to-end runs from the user point of view, so visible behaviour is the target.',
        },
        {
          question: 'How does "it passed on my machine" differ from "reliable"?',
          options: [
            'They are the same',
            'Reliable means anyone re-running it reaches the same conclusion',
            'Reliable only means it is faster',
            'Reliable means it needs no assertions',
          ],
          answerIndex: 1,
          explanation: 'Repeatability on another machine is what makes a test trustworthy.',
        },
        {
          question: 'How many workflows should one test cover?',
          options: ['As many as possible', 'Exactly one real workflow, in depth', 'Three arbitrary ones', 'The whole app'],
          answerIndex: 1,
          explanation: 'One workflow keeps the failure cause obvious when the test goes red.',
        },
        {
          question: 'Why does adding a fixed sleep not make a test more reliable?',
          options: [
            'Because the sleep is too short',
            'Because it masks the waiting Playwright already does and only makes the test slow and flaky',
            'Because sleeps only run on Windows',
            'Because sleeps need an extra package',
          ],
          answerIndex: 1,
          explanation: 'Guessing at time does not fix the cause; it moves the failure around.',
        },
        {
          question: 'When should "it worked" be written down?',
          options: [
            'Never — it is implicit',
            'As one sentence describing what the user sees, before writing the code',
            'In the commit message',
            'In the config file',
          ],
          answerIndex: 1,
          explanation: 'Writing the assertion first keeps the test bound to intent, not to code.',
        },
      ],
    },
    {
      title: 'Find elements the way a user does',
      summary: 'role, label, text, test id — and why CSS/XPath is the last resort.',
      content_md: L2,
      quiz_seed: [
        {
          question: 'What is the documented locator priority?',
          options: [
            'CSS, then XPath, then role',
            'role, then label, then text or test id, then CSS/XPath',
            'XPath, then CSS, then test id',
            'id, then class, then tag',
          ],
          answerIndex: 1,
          explanation: 'Semantics first; DOM structure last.',
        },
        {
          question: 'Why prefer locating by role?',
          options: [
            'Because it is the fastest',
            'Because it binds to what users (and assistive tech) also perceive',
            'Because it is the shortest',
            'Because CSS does not run on Chromium',
          ],
          answerIndex: 1,
          explanation: 'A role is the element meaning, not how it happens to be styled.',
        },
        {
          question: 'What does strict mode mean for a locator?',
          options: [
            'It accepts exactly one match and fails on several',
            'It always takes the first match',
            'It never waits',
            'It only runs in headed mode',
          ],
          answerIndex: 0,
          explanation: 'Strictness forces you to be specific instead of silently picking the wrong node.',
        },
        {
          question: 'How should codegen be used?',
          options: [
            'Paste its output straight into the repo',
            'Discover locators with it, then rewrite them to match user intent',
            'As a replacement for reading the docs',
            'Only to take screenshots',
          ],
          answerIndex: 1,
          explanation: 'codegen records actions; intent and naming are yours.',
        },
        {
          question: 'Which locator survives a class rename?',
          options: [
            'A deep CSS chain',
            'nth-child by position',
            'A locator based on the label a user reads',
            'Nested tag selectors',
          ],
          answerIndex: 2,
          explanation: 'A visible label does not change when a class does.',
        },
      ],
    },
    {
      title: 'Let Playwright wait for you',
      summary: 'Web-first assertions retry; fixed waits, force and coordinates are traps.',
      content_md: L3,
      quiz_seed: [
        {
          question: 'How does a web-first assertion differ from a manual check?',
          options: [
            'It does not',
            'It retries until it passes or its timeout expires',
            'It is always faster',
            'It needs no locator',
          ],
          answerIndex: 1,
          explanation: 'Retrying is what makes it stable on a slow machine.',
        },
        {
          question: 'Which form is a web-first assertion?',
          options: [
            'Reading the visible state and comparing it to true',
            'Asserting that the locator will be visible and letting Playwright wait',
            'Calling a one-shot visibility check',
            'Stopping for half a second and then checking',
          ],
          answerIndex: 1,
          explanation: 'Assertions on a locator are retried by Playwright automatically.',
        },
        {
          question: 'When is waitForTimeout appropriate?',
          options: ['In every test', 'Only for temporary debugging', 'When CI is slow', 'When a test is flaky'],
          answerIndex: 1,
          explanation: 'The docs place it in the debug-only category.',
        },
        {
          question: 'What does force: true do?',
          options: [
            'Waits for the element to appear',
            'Skips the actionability checks on the element',
            'Increases the timeout',
            'Re-runs the test',
          ],
          answerIndex: 1,
          explanation: 'Skipping the checks means clicking when a real user still could not.',
        },
        {
          question: 'What is the default assertion timeout, roughly?',
          options: ['500 ms', '5 seconds', '30 seconds', '5 minutes'],
          answerIndex: 1,
          explanation: 'About five seconds, while the whole test timeout defaults to thirty.',
        },
      ],
    },
    {
      title: 'Make it runnable twice, alone',
      summary: 'A clean context per test; setup belongs in beforeEach.',
      content_md: L4,
      quiz_seed: [
        {
          question: 'What does each Playwright test get?',
          options: [
            'A fresh, clean browser context',
            'The same page shared with the previous test',
            'One browser shared forever',
            'Nothing',
          ],
          answerIndex: 0,
          explanation: 'A per-test context is the foundation of isolation.',
        },
        {
          question: 'What is beforeEach for?',
          options: [
            'Taking screenshots',
            'Preparing shared state (for example signing in) before each test',
            'Closing the browser',
            'Counting tests',
          ],
          answerIndex: 1,
          explanation: 'Setup belongs in beforeEach, not in the previous test.',
        },
        {
          question: 'What does a saved authentication state give you?',
          options: [
            'Saved screenshots',
            'A reusable login session across tests',
            'Source compression',
            'A different project',
          ],
          answerIndex: 1,
          explanation: 'Sign in once, reuse the state, and keep tests independent.',
        },
        {
          question: 'Why is serial mode discouraged?',
          options: [
            'Because it is slow',
            'Because it makes tests depend on ordering and hides isolation bugs',
            'Because it does not support TypeScript',
            'Because it needs an extra package',
          ],
          answerIndex: 1,
          explanation: 'Order dependence makes results describe the order, not the app.',
        },
        {
          question: 'What is the clearest sign a test is not isolated?',
          options: [
            'It passes alone and fails in a full run',
            'It runs too fast',
            'It has several assertions',
            'It locates by role',
          ],
          answerIndex: 0,
          explanation: 'Depending on another test is the signature of shared state.',
        },
      ],
    },
    {
      title: 'Prove it: projects, reporters, evidence',
      summary: 'Pick the Chromium project, read the reporter, prepare your own evidence.',
      content_md: L5,
      quiz_seed: [
        {
          question: 'What does the project flag do?',
          options: [
            'Changes the working directory',
            'Selects which project (browser) should run',
            'Turns the reporter off',
            'Enables headed mode',
          ],
          answerIndex: 1,
          explanation: 'A project is a browser configuration; picking one makes evidence explicit.',
        },
        {
          question: 'What kind of data does the JSON reporter produce?',
          options: [
            'Decorative terminal text',
            'Machine-readable data: configuration, files, every test and the stats',
            'Compressed images',
            'Parallelism settings',
          ],
          answerIndex: 1,
          explanation: 'JSON is the machine-readable form, which makes it verifiable evidence.',
        },
        {
          question: 'In the JSON output, what proves a test genuinely passed?',
          options: [
            'The numbers in the stats block',
            'A normal outcome, expectedStatus passed, and at least one attempt that passed',
            'The spec ok field',
            'The version in the config section',
          ],
          answerIndex: 1,
          explanation: 'The stats block counts outcomes and cannot distinguish an expected failure.',
        },
        {
          question: 'What does "1 flaky" in the summary mean?',
          options: [
            'The test always fails',
            'The test failed on the first attempt and passed on a retry',
            'The test was skipped',
            'The test never ran',
          ],
          answerIndex: 1,
          explanation: 'Flaky means failed then passed on retry — worth noting, not a failure.',
        },
        {
          question: 'What should you submit as evidence?',
          options: [
            'A screenshot of the app',
            'Reporter output from one Chromium run with 0 failures',
            'A trace file',
            'A video of the run',
          ],
          answerIndex: 1,
          explanation: 'Reporter text carries no private data and can be checked.',
        },
      ],
    },
  ],
};

/**
 * Pick the template variant for a learning language (T-09-16). Vietnamese gets its own translated
 * course; every other language uses the bundled English one.
 * @param {string} [language] a BCP-47 code or a legacy display name
 * @returns {object} a shallow copy, so a caller cannot mutate the module constant
 */
export function playwrightTemplateFor(language) {
  const variant = normalizeLanguage(language) === 'vi' ? PLAYWRIGHT_TEMPLATE_VI : PLAYWRIGHT_TEMPLATE;
  return { ...variant };
}

/**
 * Find the already-seeded template course, if any. A template course is identified by its capstone's
 * `external_id` (D-02) — no new course column, no migration.
 * @returns {Promise<{ course: object, capstone: object } | null>}
 */
export async function findPlaywrightTemplateCourse() {
  const courses = await listCourses();
  for (const course of courses) {
    if (course.deleted_at) continue;
    const capstone = await getCapstone(course.id);
    if (capstone?.external_id !== PLAYWRIGHT_CAPSTONE_EXTERNAL_ID) continue;
    const withLessons = await getCourse(course.id);
    return { course: withLessons || course, capstone };
  }
  return null;
}

let seeding = null;
let seedingLanguage = null;

/**
 * Seed the Playwright template course once, through the repo API only.
 *
 * Zero model calls: this function never resolves a provider, never generates JSON and never touches
 * the network, so it works for a learner with no API key configured (T-09-15). Idempotent: the second
 * call returns the existing course and the identical capstone row (`createCapstone` early-returns),
 * and the in-flight promise is memoised per language so React StrictMode's double invoke or a
 * double click cannot seed twice (T-09-07). The capstone is immutable — there is deliberately no
 * update path here.
 *
 * @param {{ language?: string }} [options] the course language; Vietnamese gets its own variant
 * @returns {Promise<{ course: object, capstone: object, created: boolean }>}
 */
export function seedPlaywrightTemplate({ language } = {}) {
  const code = normalizeLanguage(language);
  if (seeding) {
    if (seedingLanguage === code) return seeding;
    // A seed for another language is in flight. Wait for it, then re-check: a course is created once.
    return seeding.then(() => seedPlaywrightTemplate({ language: code }));
  }
  seedingLanguage = code;
  seeding = doSeedPlaywrightTemplate(code).finally(() => {
    seeding = null;
    seedingLanguage = null;
  });
  return seeding;
}

/** @param {string} code a normalized language code */
async function doSeedPlaywrightTemplate(code) {
  const existing = await findPlaywrightTemplateCourse();
  if (existing) return { ...existing, created: false };

  const variant = playwrightTemplateFor(code);
  const course = await createCourse({
    title: variant.title,
    description: variant.description,
    level: variant.level,
    kind: variant.kind,
    goal: variant.goal,
    topics: variant.topics,
    language: variant.language,
    source: 'manual',
    lessons: variant.lessons.map(({ title, summary, content_md, quiz_seed }) => ({
      title,
      summary,
      content_md,
      quiz_seed,
    })),
  });

  // The rubric already carries `{ key, name, solid }` — pass it through unchanged. Never route it
  // through the 4–6-criteria validator, and never through the AI capstone generator, which
  // overwrites `external_id` with `ai:<courseId>`.
  const capstone = await createCapstone({
    courseId: course.id,
    kind: variant.capstone.kind,
    brief_md: variant.capstone.brief_md,
    rubric: variant.capstone.rubric,
    tests: null,
    hiddenAnswers: null,
    artifact: variant.capstone.artifact,
    externalId: PLAYWRIGHT_CAPSTONE_EXTERNAL_ID,
  });

  return { course, capstone, created: true };
}
