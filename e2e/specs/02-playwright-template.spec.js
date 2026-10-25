import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { EVIDENCE_FIXTURE, EVIDENCE_SPEC } from '../helpers/env.js';

const PREFLIGHT = [
  /I have a web app I can run locally/,
  /Node is installed/,
  /Playwright is installed and runs/,
  /A Chromium browser is installed/,
  /I understand Studio never runs Playwright/,
];

/** Mark the next not-done template lesson done through the real reflection dialog. */
async function markNextLessonDone(page) {
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Finish lesson' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('What was hardest?').fill('Keeping the workflow small.');
  await dialog.getByRole('button', { name: 'Mark done' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('RON-168 Playwright template journey', () => {
  test('RON-168 covers pre-flight, external evidence, R1-R7 review and both-journey report', async ({
    page,
  }) => {
    await page.goto('/#/new');
    await expect(page.getByRole('heading', { name: 'New course' })).toBeVisible();

    const notReady = page.getByRole('button', { name: 'Tick all five to start' });
    await expect(notReady).toBeDisabled();
    for (const label of PREFLIGHT) {
      await page.getByLabel(label).check();
    }
    const start = page.getByRole('button', { name: 'Start the Playwright course' });
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    await expect(
      page.getByRole('heading', {
        name: 'Ship your first reliable Playwright E2E test for a real web workflow',
      })
    ).toBeVisible();

    // All five template lessons must be done before the capstone unlocks.
    for (let i = 0; i < 5; i += 1) {
      await markNextLessonDone(page);
    }
    await expect(page.getByText('🔓 Unlocked')).toBeVisible();

    await page.getByRole('button', { name: 'Start capstone' }).click();
    await expect(page.getByRole('heading', { name: 'Capstone' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Verify externally' })).toBeVisible();

    // Paste the committed real-run fixture and confirm the parsed facts.
    await page
      .getByLabel('Paste the reporter output')
      .fill(readFileSync(EVIDENCE_FIXTURE, 'utf8'));
    await expect(page.getByText('self-reported evidence', { exact: true })).toBeVisible();
    await expect(page.getByText('Chromium', { exact: true })).toBeVisible();
    await expect(page.getByText('Playwright: 1.64.1')).toBeVisible();
    await page.getByLabel(/I confirm these facts match the run I just did/).check();

    // Submit the matching spec source and write-up.
    await page.getByLabel('Spec file path').fill('workflow.spec.js');
    await page.getByLabel('Spec source').fill(readFileSync(EVIDENCE_SPEC, 'utf8'));
    await page
      .getByLabel('Your submission')
      .fill(
        'One real workflow in my own app. I used getByRole for the button and a web-first ' +
          'toBeVisible assertion, no fixed waits, and beforeEach keeps the test isolated.'
      );
    await page.getByRole('button', { name: 'Submit for review' }).click();

    // Code-owned verdict from the R1-R7 criteria plus the verified facts.
    await expect(page.getByText('🏆 Course Complete')).toBeVisible();
    await expect(page.getByText('Met', { exact: true })).toHaveCount(7);
    await expect(page.getByText(/corrected code|Here is the corrected/)).toHaveCount(0);

    // Beta report: preview, download and assert both journeys are represented.
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Preview beta report' }).click();
    await expect(page.getByText(/Workspace runs: [1-9]/)).toBeVisible();
    await expect(page.getByText(/Quizzes completed: [1-9]/)).toBeVisible();
    await expect(page.getByText(/Capstone checkpoints: [1-9]/)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download beta report' }).click();
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
