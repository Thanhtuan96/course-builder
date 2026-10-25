import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { EVIDENCE_FIXTURE, EVIDENCE_SPEC } from '../helpers/env.js';

const PREFLIGHT = [
  'I have a web app I can run locally (or a deployed URL) with at least one real workflow.',
  'Node is installed — running `node -v` prints a version.',
  'Playwright is installed and runs — `npx playwright --version` prints a version.',
  'A Chromium browser is installed — `npx playwright install chromium`.',
  'I understand Studio never runs Playwright: I run it in my own terminal and paste the output back.',
];

/** Mark the next not-done template lesson done through the real reflection dialog. */
async function markNextLessonDone(page) {
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Finish lesson', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('What was hardest?', { exact: true }).fill('Keeping the workflow small.');
  await dialog.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test.describe('RON-168 Playwright template journey', () => {
  test('RON-168 covers pre-flight, external evidence, R1-R7 review and both-journey report', async ({
    page,
  }) => {
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: 'New course', exact: true, level: 1 })).toBeVisible();

    const notReady = page.getByRole('button', { name: 'Tick all five to start', exact: true });
    await expect(notReady).toBeDisabled();
    for (const label of PREFLIGHT) {
      await page.getByLabel(label, { exact: true }).check();
    }
    const start = page.getByRole('button', { name: 'Start the Playwright course', exact: true });
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    await expect(
      page.getByRole('heading', {
        name: 'Ship your first reliable Playwright E2E test for a real web workflow',
        exact: true,
        level: 1,
      })
    ).toBeVisible();

    // All five template lessons must be done before the capstone unlocks.
    for (let i = 0; i < 5; i += 1) {
      await markNextLessonDone(page);
    }
    await expect(page.getByText('🔓 Unlocked', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Start capstone', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Capstone', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify externally', exact: true, level: 2 })).toBeVisible();

    // Paste the committed real-run fixture and confirm the parsed facts.
    await page
      .getByLabel('Paste the reporter output', { exact: true })
      .fill(readFileSync(EVIDENCE_FIXTURE, 'utf8'));
    await expect(page.getByText('self-reported evidence', { exact: true })).toBeVisible();
    await expect(page.getByText('Chromium', { exact: true })).toBeVisible();
    await expect(page.getByText('Playwright: 1.64.1', { exact: true })).toBeVisible();
    await page.getByLabel(/^I confirm these facts match the run I just did/).check();

    // Submit the matching spec source and write-up.
    await page.getByLabel('Spec file path', { exact: true }).fill('workflow.spec.js');
    await page.getByLabel('Spec source', { exact: true }).fill(readFileSync(EVIDENCE_SPEC, 'utf8'));
    await page
      .getByLabel('Your submission', { exact: true })
      .fill(
        'One real workflow in my own app. I used getByRole for the button and a web-first ' +
          'toBeVisible assertion, no fixed waits, and beforeEach keeps the test isolated.'
      );
    await page.getByRole('button', { name: 'Submit for review', exact: true }).click();

    // Code-owned verdict from the R1-R7 criteria plus the verified facts.
    await expect(page.getByText('🏆 Course Complete', { exact: true })).toBeVisible();
    await expect(page.getByText('Met', { exact: true })).toHaveCount(7);
    await expect(page.getByText(/corrected code|Here is the corrected/)).toHaveCount(0);

    // Beta report: preview, download and assert both journeys are represented.
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Preview beta report', exact: true }).click();
    await expect(page.getByText(/Workspace runs: [1-9]/)).toBeVisible();
    await expect(page.getByText(/Quizzes completed: [1-9]/)).toBeVisible();
    await expect(page.getByText(/Capstone checkpoints: [1-9]/)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download beta report', exact: true }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const report = JSON.parse(readFileSync(filePath, 'utf8'));

    expect(report.schemaVersion).toBe(1);
    expect(report.loops.byKind.quiz_completed).toBeGreaterThanOrEqual(1);
    expect(report.loops.byKind.workspace_run).toBeGreaterThanOrEqual(1);
    expect(report.loops.byKind.capstone_checkpoint).toBeGreaterThanOrEqual(1);
    expect(report.loops.revisions.tutor).toBeGreaterThanOrEqual(1);
    expect(report.capstone.externalEvidence).toBeGreaterThanOrEqual(1);
    expect(report.capstone.verdict).toBe('course_complete');
  });
});
