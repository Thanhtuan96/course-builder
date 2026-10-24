/**
 * @vitest-environment node
 *
 * PW-02 / PW-04 — the capstone attempt loop on a template course (plan 09-06).
 *
 * Part 1 (Task 1) proves the tracer slice: the evidence payload stored by the page round-trips
 * through the repo with its facts and a code-computed verdict, the revision link points at the
 * previous submission row, the page never routes a template capstone through the in-app runner, and
 * `course_complete` is reachable only when the learner supplies the spec code.
 *
 * Part 2 (Task 2) covers the review panel / submission form. Part 3 (Task 3) covers attempt history.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryAdapter } from '../src/lib/repo/memory-adapter.js';
import * as repo from '../src/lib/repo/index.js';
import { parseEvidence } from '../src/lib/capstone-evidence.js';
import {
  computeCapstoneFacts,
  computeCapstoneVerdict,
  finalizeExternalReview,
} from '../src/lib/capstone.js';
import { PLAYWRIGHT_TEMPLATE } from '../src/data/templates/playwright-e2e.js';
import { ReviewPanel } from '../src/components/capstone/ReviewPanel.jsx';
import { SubmissionForm, specFilesFrom } from '../src/components/capstone/SubmissionForm.jsx';
import { SubmissionHistory } from '../src/components/capstone/SubmissionHistory.jsx';
import { AttemptDiff, criterionTransitions } from '../src/components/capstone/AttemptDiff.jsx';
import { translate } from '../src/lib/i18n/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(HERE, 'fixtures', 'playwright', name), 'utf8');

const PAGE_SOURCE = readFileSync(join(HERE, '..', 'src', 'pages', 'Capstone.jsx'), 'utf8');
const REVIEW_PANEL_SOURCE = readFileSync(
  join(HERE, '..', 'src', 'components', 'capstone', 'ReviewPanel.jsx'),
  'utf8'
);
const SUBMISSION_FORM_SOURCE = readFileSync(
  join(HERE, '..', 'src', 'components', 'capstone', 'SubmissionForm.jsx'),
  'utf8'
);

const RUBRIC_KEYS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];

/** A clean spec: semantic locators, a web-first assertion and per-test setup (R1–R5 positives). */
const GOOD_SPEC = `import { test, expect } from '@playwright/test';

test.describe('guest checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
  });

  test('adds an item to the cart', async ({ page }) => {
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByTestId('cart-total')).toHaveText('$42.00');
  });
});
`;

const WRITEUP =
  'I used getByRole and getByTestId so the locator reads like the user describes it. No manual ' +
  'waits: the assertion retries. The test is isolated through beforeEach, so it passes alone.';

/** The capstone row shape `capstoneEvidenceMode` recognises (a seeded template capstone). */
const TEMPLATE_CAPSTONE = {
  external_id: PLAYWRIGHT_TEMPLATE.capstone.externalId,
  brief_md: PLAYWRIGHT_TEMPLATE.capstone.brief_md,
  rubric: PLAYWRIGHT_TEMPLATE.capstone.rubric,
  language: 'English',
};

/** A model reply where every criterion is `met` — the strongest thing a review can say. */
const allMetModelOutput = () => ({
  criteria: RUBRIC_KEYS.map((key) => ({ key, label: key, status: 'met', question: '' })),
  strengths: [],
  nextAction: '',
});

/** Normalized evidence exactly as `ExternalEvidenceForm` emits it, plus the page's facts merge. */
function evidenceFrom(name, files = null) {
  const parsed = parseEvidence(fixture(name));
  const facts = computeCapstoneFacts({ files, contentMd: WRITEUP });
  return { ...parsed, facts };
}

let adapter;

beforeEach(() => {
  adapter = createMemoryAdapter();
  repo.useAdapter(adapter);
});

async function seedTemplateCapstone(overrides = {}) {
  const course = await repo.createCourse({
    title: 'Ship your first reliable Playwright E2E test',
    kind: 'programming',
    language: 'English',
    lessons: [{ title: 'Lesson 1' }],
  });
  const capstone = await repo.createCapstone({
    courseId: course.id,
    kind: 'programming',
    brief_md: TEMPLATE_CAPSTONE.brief_md,
    rubric: TEMPLATE_CAPSTONE.rubric,
    tests: null,
    externalId: TEMPLATE_CAPSTONE.externalId,
    ...overrides,
  });
  return { course, capstone };
}

/* ------------------------------------------------------------------ Task 1: tracer slice */

describe('external submission round-trip (Task 1)', () => {
  it('stores the normalized evidence, its facts and the code-computed needs_work verdict', async () => {
    const { course, capstone } = await seedTemplateCapstone();
    const files = { 'tests/checkout.spec.js': GOOD_SPEC };
    const evidence = evidenceFrom('list-fail.txt', files);
    const review = finalizeExternalReview(allMetModelOutput(), {
      capstone,
      evidence,
      facts: evidence.facts,
      language: 'English',
    });
    const verdict = computeCapstoneVerdict({ review, evidence, facts: evidence.facts });

    // A failing run can never pass, even with a fully obedient model (T-09-27).
    expect(verdict.verdict).toBe('needs_work');

    const created = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: WRITEUP,
      repo_url: null,
      files,
      testResults: evidence,
      review: { ...review, verdict: verdict.verdict },
      verdict: verdict.verdict,
      revisionOf: null,
    });

    expect(created.attempt).toBe(1);

    const submissions = await repo.listCapstoneSubmissions(capstone.id);
    expect(submissions).toHaveLength(1);
    const [row] = submissions;
    expect(row.testResults.source).toBe('external');
    expect(row.testResults.selfReported).toBe(true);
    expect(row.testResults.stats.failed).toBeGreaterThan(0);
    expect(row.testResults.facts.specFiles).toEqual([
      { path: 'tests/checkout.spec.js', bytes: GOOD_SPEC.length },
    ]);
    expect(row.testResults.checks).toBeUndefined();
    expect(row.verdict).toBe('needs_work');
    expect(row.files).toEqual(files);

    // `listEvents` returns raw rows: the source lives in `meta_json`, not `meta` (B4).
    const events = await repo.listEvents({
      kind: 'capstone_checkpoint',
      surface: 'capstone',
      courseId: course.id,
    });
    expect(events).toHaveLength(1);
    expect(events[0].meta).toBeUndefined();
    expect(JSON.parse(events[0].meta_json)).toEqual({ source: 'external', attempt: 1 });
  });

  it('blocks a submission whose evidence was never confirmed', async () => {
    const { capstone } = await seedTemplateCapstone();
    const evidence = evidenceFrom('list-fail.txt', null);

    // The page's gate is `evidenceResult.confirmed && evidenceResult.evidence`.
    const unconfirmed = { text: 'anything', evidence, confirmed: false };
    expect(Boolean(unconfirmed.confirmed && unconfirmed.evidence)).toBe(false);
  });
});

describe('revision linking (Task 1)', () => {
  it('links a revise submission to the previous submission row read back by revisedId', async () => {
    const { capstone } = await seedTemplateCapstone();
    const files = { 'tests/checkout.spec.js': GOOD_SPEC };
    const evidence = evidenceFrom('list-fail.txt', files);
    const review = finalizeExternalReview(allMetModelOutput(), {
      capstone,
      evidence,
      facts: evidence.facts,
      language: 'English',
    });
    const verdict = { ...review, verdict: 'needs_work' };

    const attempt1 = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: 'first attempt',
      files,
      testResults: evidence,
      review: verdict,
      verdict: 'needs_work',
    });

    const attempt2 = await repo.createCapstoneSubmission({
      capstoneId: capstone.id,
      content_md: 'second attempt',
      files,
      testResults: evidence,
      review: verdict,
      verdict: 'needs_work',
      revisionOf: { feedbackTable: 'capstone_submissions', feedbackId: attempt1.id },
    });

    const links = await repo.listRevisionLinks({ surface: 'capstone', revisedId: attempt2.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      surface: 'capstone',
      attempt_table: 'capstone_submissions',
      attempt_id: attempt1.id,
      feedback_table: 'capstone_submissions',
      feedback_id: attempt1.id,
      revised_table: 'capstone_submissions',
      revised_id: attempt2.id,
      link_kind: 'explicit',
    });
  });
});

describe('the page routes a template capstone away from the in-app runner (Task 1)', () => {
  it('checks the evidence mode before the has-tests branch', () => {
    const modeAt = PAGE_SOURCE.indexOf('capstoneEvidenceMode(capstone)');
    const hasTestsAt = PAGE_SOURCE.indexOf('capstoneHasTests(capstone)');
    expect(modeAt).toBeGreaterThan(-1);
    expect(hasTestsAt).toBeGreaterThan(-1);
    expect(modeAt).toBeLessThan(hasTestsAt);
  });

  it('never calls the runner, npm or npx inside the external branch', () => {
    const start = PAGE_SOURCE.indexOf('if (external) {');
    const elseAt = PAGE_SOURCE.indexOf('} else {', start);
    expect(start).toBeGreaterThan(-1);
    expect(elseAt).toBeGreaterThan(start);
    const externalBranch = PAGE_SOURCE.slice(start, elseAt);
    expect(externalBranch).not.toContain('runCapstoneTests');
    expect(externalBranch).not.toMatch(/\bnpm\b|\bnpx\b|playwright test/);
  });

  it('keeps the in-app branch intact', () => {
    expect(PAGE_SOURCE).toContain('runCapstoneTests({');
    expect(PAGE_SOURCE).toContain('clampReviewVerdict(');
  });

  it('feeds the same submittedFiles object to the evidence form and the facts (B5, A3)', () => {
    expect(PAGE_SOURCE).toContain('const submittedFiles =');
    expect(PAGE_SOURCE).toContain('submittedFiles={submittedFiles}');
    expect(PAGE_SOURCE).toContain('const files = input.files ?? submittedFiles;');
    expect(PAGE_SOURCE).toContain('computeCapstoneFacts({ files');
  });
});

describe('the pass path needs the spec code (Task 1, PW-02)', () => {
  const files = { 'tests/checkout.spec.js': GOOD_SPEC };

  it('reaches course_complete for a clean passing run with every criterion met', () => {
    const facts = computeCapstoneFacts({ files, contentMd: WRITEUP });
    expect(facts.specFiles).toHaveLength(1);

    const evidence = { ...parseEvidence(fixture('json-pass.json')), facts };
    expect(evidence.stats.failed).toBe(0);
    expect(evidence.stats.chromium).toBe('confirmed');

    const review = finalizeExternalReview(allMetModelOutput(), {
      capstone: TEMPLATE_CAPSTONE,
      evidence,
      facts,
      language: 'English',
    });
    expect(review.criteria.map((criterion) => criterion.status)).toEqual(RUBRIC_KEYS.map(() => 'met'));
    expect(computeCapstoneVerdict({ review, evidence, facts }).verdict).toBe('course_complete');
  });

  it('cannot reach course_complete without the spec code, even with a green run', () => {
    const facts = computeCapstoneFacts({ files: null, contentMd: WRITEUP });
    expect(facts.specFiles).toEqual([]);

    const evidence = { ...parseEvidence(fixture('json-pass.json')), facts };
    const review = finalizeExternalReview(allMetModelOutput(), {
      capstone: TEMPLATE_CAPSTONE,
      evidence,
      facts,
      language: 'English',
    });
    const computed = computeCapstoneVerdict({ review, evidence, facts });
    expect(computed.verdict).toBe('needs_work');
    expect(computed.reasons).toContain('no_spec_files');
    expect(review.criteria.find((criterion) => criterion.key === 'R1').status).toBe('not_met');
  });
});

/* ------------------------------------------------------------------ Task 2: review + form */

/** The modern review shape the external prompt produces: one entry per rubric key, in order. */
const modernReview = (overrides = {}) => ({
  criteria: RUBRIC_KEYS.map((key) => ({
    key,
    label: `Criterion ${key}`,
    status: 'met',
    question: '',
    ...(overrides[key] || {}),
  })),
  strengths: [],
  nextAction: '',
});

describe('ReviewPanel for external reviews (Task 2)', () => {
  it('renders every criterion with its localized rubric label and status', () => {
    const review = modernReview({ R2: { status: 'partial', question: 'Which role names this button?' } });
    const html = renderToString(createElement(ReviewPanel, { review, verdict: 'needs_work' }));

    for (let i = 1; i <= 7; i += 1) {
      const label = translate('en', `playwrightTemplate.rubric.r${i}`);
      expect(label).not.toBe(`playwrightTemplate.rubric.r${i}`);
      expect(html).toContain(label);
    }
    // The D-07 keys are live: R1's label is the catalog string, not the seeded `label` text.
    expect(html).toContain(translate('en', 'playwrightTemplate.rubric.r1'));
    expect(html).toContain(translate('en', 'externalEvidence.status.met'));
    expect(html).toContain(translate('en', 'externalEvidence.status.partial'));
    expect(html).toContain('Which role names this button?');
    expect(html).toContain(translate('en', 'capstone.verdictNeedsWork'));
  });

  it('shows the code-owned verdict, not the review text', () => {
    const review = modernReview();
    const html = renderToString(createElement(ReviewPanel, { review, verdict: 'needs_work' }));
    expect(html).toContain(translate('en', 'capstone.verdictNeedsWork'));
    expect(html).not.toContain(translate('en', 'capstone.verdictComplete'));
  });

  it('falls back to label, then name, when a criterion has no rubric key', () => {
    const labeled = renderToString(
      createElement(ReviewPanel, {
        review: { criteria: [{ label: 'A custom label', status: 'met' }] },
        verdict: 'needs_work',
      })
    );
    expect(labeled).toContain('A custom label');

    const named = renderToString(
      createElement(ReviewPanel, {
        review: { criteria: [{ name: 'A named criterion', status: 'met' }] },
        verdict: 'needs_work',
      })
    );
    expect(named).toContain('A named criterion');
  });

  it('renders a legacy rating review with mapped statuses and its stored verdict', () => {
    const legacy = {
      verdict: 'needs_work',
      criteria: [
        { name: 'Semantic locators', rating: 'solid', feedback: 'Reads like a user.' },
        { name: 'Fixed waits', rating: 'missing', feedback: 'There is a sleep.' },
      ],
      strengths: ['One workflow'],
      nextAction: 'Remove the sleep.',
    };
    const html = renderToString(createElement(ReviewPanel, { review: legacy }));

    expect(html).toContain('Semantic locators');
    expect(html).toContain('Fixed waits');
    expect(html).toContain(translate('en', 'externalEvidence.status.met'));
    expect(html).toContain(translate('en', 'externalEvidence.status.not_met'));
    expect(html).toContain(translate('en', 'capstone.verdictNeedsWork'));
    expect(html).toContain('Reads like a user.');
    expect(html).toContain('Remove the sleep.');
  });

  it('renders the evidence summary for external rows and no checks list', () => {
    const evidence = {
      ...parseEvidence(fixture('list-fail.txt')),
      facts: computeCapstoneFacts({ files: null, contentMd: WRITEUP }),
    };
    const html = renderToString(
      createElement(ReviewPanel, { review: modernReview(), testResults: evidence, verdict: 'needs_work' })
    );
    expect(html).toContain('self-reported evidence');
    expect(html).not.toContain(translate('en', 'capstone.automatedChecks'));

    const inApp = renderToString(
      createElement(ReviewPanel, {
        review: modernReview(),
        testResults: { checks: [{ name: 'adds an item', passed: true }], failed: false },
        verdict: 'needs_work',
      })
    );
    expect(inApp).toContain(translate('en', 'capstone.automatedChecks'));
    expect(inApp).not.toContain('self-reported evidence');
  });

  it('renders no revise action — the page owns the only revise surface (A2)', () => {
    const html = renderToString(
      createElement(ReviewPanel, { review: modernReview(), verdict: 'needs_work' })
    );
    expect(html).not.toContain(translate('en', 'externalEvidence.revise'));
    expect(REVIEW_PANEL_SOURCE).not.toContain('onRevise');
  });
});

describe('SubmissionForm in external mode (Task 2)', () => {
  const renderForm = (props = {}) => renderToString(createElement(SubmissionForm, props));

  it('collects the spec path and source instead of a Workspace snapshot', () => {
    const html = renderForm({
      external: true,
      programming: true,
      workspaceFiles: [{ path: 'main.js', content: 'x' }],
      spec: { path: 'tests/checkout.spec.js', code: 'test("x", () => {})' },
      evidenceReady: false,
    });

    expect(html).toContain(translate('en', 'externalEvidence.specCodeTitle'));
    expect(html).toContain(translate('en', 'externalEvidence.specPathLabel'));
    expect(html).toContain(translate('en', 'externalEvidence.specCodeLabel'));
    expect(html).toContain('name="capstone-spec-path"');
    expect(html).toContain('name="capstone-spec-code"');
    expect(html).not.toContain(translate('en', 'capstone.useFiles'));
    expect(html).not.toContain('Use my Workspace files');
  });

  it('disables submit until the evidence is confirmed and names the parsed facts', () => {
    const blocked = renderForm({
      external: true,
      spec: { path: 'tests/checkout.spec.js', code: 'x' },
      evidenceReady: false,
    });
    expect(blocked).toContain(translate('en', 'externalEvidence.submitRequiresEvidence'));
    expect(blocked).toMatch(/<button[^>]*disabled/);

    const ready = renderForm({
      external: true,
      spec: { path: 'tests/checkout.spec.js', code: 'x' },
      evidenceReady: true,
      evidenceLabel: 'list · 2/2',
    });
    expect(ready).toContain('list · 2/2');
    expect(ready).not.toContain(translate('en', 'externalEvidence.submitRequiresEvidence'));
  });

  it('keeps the in-app Workspace affordance when external is false', () => {
    const html = renderForm({
      programming: true,
      workspaceFiles: [{ path: 'main.js', content: 'x' }],
    });
    expect(html).toContain(translate('en', 'capstone.useFiles'));
    expect(html).not.toContain(translate('en', 'externalEvidence.specCodeTitle'));
    expect(html).not.toContain(translate('en', 'externalEvidence.submitRequiresEvidence'));
  });
});

describe('specFilesFrom (Task 2)', () => {
  it('returns one file keyed by the trimmed path', () => {
    expect(specFilesFrom({ path: 'tests/checkout.spec.js', code: 'x' })).toEqual({
      'tests/checkout.spec.js': 'x',
    });
    expect(specFilesFrom({ path: '  tests/a.spec.js  ', code: 'line' })).toEqual({
      'tests/a.spec.js': 'line',
    });
  });

  it('returns null when either half is blank', () => {
    expect(specFilesFrom({ path: '  ', code: 'x' })).toBeNull();
    expect(specFilesFrom({ path: 'a.js', code: '  ' })).toBeNull();
    expect(specFilesFrom({})).toBeNull();
    expect(specFilesFrom()).toBeNull();
  });
});

describe('the Capstone page wires the controlled spec state (Task 2)', () => {
  it('passes external, spec, onSpecChange, onDraftChange, evidenceReady and evidenceLabel', () => {
    const start = PAGE_SOURCE.indexOf('<SubmissionForm');
    expect(start).toBeGreaterThan(-1);
    const callSite = PAGE_SOURCE.slice(start, PAGE_SOURCE.indexOf('/>', start));
    for (const prop of [
      'external={',
      'spec={spec}',
      'onSpecChange={setSpec}',
      'onDraftChange={setDraft}',
      'evidenceReady={',
      'evidenceLabel={',
    ]) {
      expect(callSite, `missing prop ${prop} on <SubmissionForm>`).toContain(prop);
    }
  });

  it('exposes no unused props on the form (every external prop is read)', () => {
    for (const prop of [
      'external = false',
      'spec = { path: \'\', code: \'\' }',
      'onSpecChange = null',
      'onDraftChange = null',
      'evidenceReady = false',
      'evidenceLabel = \'\'',
    ]) {
      expect(SUBMISSION_FORM_SOURCE).toContain(prop);
    }
  });
});

/* ------------------------------------------------------------------ Task 3: attempt history */

/** How many times `needle` occurs in `haystack`. */
const countOf = (haystack, needle) => haystack.split(needle).length - 1;

/** A full R1–R7 review with per-key status overrides (default `met`). */
const reviewWith = (statuses = {}) => ({
  criteria: RUBRIC_KEYS.map((key) => ({
    key,
    label: `Criterion ${key}`,
    status: statuses[key] || 'met',
    question: '',
  })),
  strengths: [],
  nextAction: '',
});

describe('criterionTransitions (Task 3)', () => {
  it('returns an empty array for null inputs', () => {
    expect(criterionTransitions(null, null)).toEqual([]);
    expect(criterionTransitions()).toEqual([]);
  });

  it('marks every criterion of a first attempt as from:null and unchanged', () => {
    const transitions = criterionTransitions(null, reviewWith());
    expect(transitions).toHaveLength(7);
    expect(transitions.map((entry) => entry.key)).toEqual(RUBRIC_KEYS);
    for (const entry of transitions) {
      expect(entry.from).toBeNull();
      expect(entry.changed).toBe(false);
    }
  });

  it('flags a partial to met move as changed', () => {
    const transitions = criterionTransitions(reviewWith({ R2: 'partial' }), reviewWith());
    const r2 = transitions.find((entry) => entry.key === 'R2');
    expect(r2).toMatchObject({ from: 'partial', to: 'met', changed: true });
    expect(transitions.filter((entry) => entry.changed)).toHaveLength(1);
  });

  it('leaves an unchanged pair unflagged', () => {
    const transitions = criterionTransitions(reviewWith({ R4: 'partial' }), reviewWith({ R4: 'partial' }));
    expect(transitions.every((entry) => entry.changed === false)).toBe(true);
  });

  it('reads a key the previous attempt lacked as from:null', () => {
    const previous = {
      criteria: [
        { key: 'R1', status: 'met' },
        { key: 'R2', status: 'met' },
      ],
    };
    const current = {
      criteria: [
        { key: 'R1', status: 'met' },
        { key: 'R2', status: 'met' },
        { key: 'R3', status: 'met' },
      ],
    };
    const r3 = criterionTransitions(previous, current).find((entry) => entry.key === 'R3');
    expect(r3).toMatchObject({ from: null, to: 'met' });
  });

  it('maps legacy ratings and never mutates its inputs', () => {
    const previous = { criteria: [{ name: 'Semantic locators', rating: 'solid' }] };
    const current = { criteria: [{ name: 'Semantic locators', rating: 'missing' }] };
    const snapshot = JSON.stringify([previous, current]);

    expect(criterionTransitions(previous, current)).toEqual([
      {
        key: 'Semantic locators',
        label: 'Semantic locators',
        from: 'met',
        to: 'not_met',
        changed: true,
      },
    ]);
    expect(JSON.stringify([previous, current])).toBe(snapshot);
  });
});

describe('SubmissionHistory with external attempts (Task 3)', () => {
  const externalEvidenceFrom = (name) => ({
    ...parseEvidence(fixture(name)),
    facts: computeCapstoneFacts({ files: null, contentMd: WRITEUP }),
  });

  const submissions = () => [
    {
      id: 'sub-1',
      attempt: 1,
      created_at: '2026-10-20T09:00:00.000Z',
      verdict: 'needs_work',
      testResults: externalEvidenceFrom('list-fail.txt'),
      review: reviewWith({ R2: 'partial', R4: 'partial' }),
    },
    {
      id: 'sub-2',
      attempt: 2,
      created_at: '2026-10-21T09:00:00.000Z',
      verdict: 'needs_work',
      testResults: externalEvidenceFrom('json-pass.json'),
      review: reviewWith({ R2: 'met', R4: 'partial' }),
    },
  ];

  it('renders one evidence summary per external attempt', () => {
    const html = renderToString(createElement(SubmissionHistory, { submissions: submissions() }));
    expect(countOf(html, 'self-reported evidence')).toBe(2);
    expect(countOf(html, translate('en', 'externalEvidence.historyEvidence'))).toBe(2);
    expect(html).toContain(translate('en', 'externalEvidence.historyTitle'));
    expect(html).toContain(translate('en', 'externalEvidence.historyTransitions'));
  });

  it('lists only the criterion that changed', () => {
    const html = renderToString(createElement(SubmissionHistory, { submissions: submissions() }));
    expect(countOf(html, 'Criterion R2')).toBe(1);
    expect(html).not.toContain('Criterion R4');
  });

  it('renders nothing for an empty history', () => {
    expect(renderToString(createElement(SubmissionHistory, { submissions: [] }))).toBe('');
  });

  it('renders AttemptDiff alone for null criteria', () => {
    expect(renderToString(createElement(AttemptDiff, { previous: null, current: null }))).toBe('');
  });
});

describe('stored attempt text is escaped, never HTML (T-09-26, Task 3)', () => {
  const HOSTILE = '<script>alert(1)</script>';

  it('escapes a hostile criterion label in the transitions', () => {
    const hostile = (status) => ({
      criteria: [{ key: 'R1', label: HOSTILE, status, question: `${HOSTILE} question` }],
      strengths: [],
      nextAction: '',
    });
    const html = renderToString(
      createElement(SubmissionHistory, {
        submissions: [
          { id: 'a', attempt: 1, created_at: '2026-10-20T09:00:00.000Z', verdict: 'needs_work', review: hostile('partial') },
          { id: 'b', attempt: 2, created_at: '2026-10-21T09:00:00.000Z', verdict: 'needs_work', review: hostile('met') },
        ],
      })
    );

    expect(html).toContain('&lt;script');
    expect(html).not.toContain('<script');
    expect(html).not.toContain(HOSTILE);
  });

  it('escapes a hostile test title in the review panel evidence', () => {
    const evidence = {
      source: 'external',
      selfReported: true,
      format: 'json',
      stats: { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0, durationMs: 120, projects: ['chromium'], chromium: 'confirmed' },
      specs: [{ file: 'tests/a.spec.js', tests: [{ title: HOSTILE, status: 'expected' }] }],
      warnings: [],
    };
    const html = renderToString(
      createElement(ReviewPanel, { review: reviewWith(), testResults: evidence, verdict: 'needs_work' })
    );

    expect(html).toContain('&lt;script');
    expect(html).not.toContain('<script');
    expect(html).not.toContain(HOSTILE);
  });

  it.each([
    { name: 'AttemptDiff.jsx', source: readFileSync(join(HERE, '..', 'src', 'components', 'capstone', 'AttemptDiff.jsx'), 'utf8') },
    { name: 'SubmissionHistory.jsx', source: readFileSync(join(HERE, '..', 'src', 'components', 'capstone', 'SubmissionHistory.jsx'), 'utf8') },
    { name: 'ReviewPanel.jsx', source: REVIEW_PANEL_SOURCE },
    { name: 'SubmissionForm.jsx', source: SUBMISSION_FORM_SOURCE },
    { name: 'Capstone.jsx', source: PAGE_SOURCE },
  ])('$name contains no HTML sink', ({ source }) => {
    const found = ['dangerouslySetInnerHTML', 'innerHTML'].filter((token) => source.includes(token));
    expect(found).toEqual([]);
  });
});

