import { expect, test } from '@playwright/test';

/** Replace the whole CodeMirror document through its accessible textbox role. */
async function replaceEditorText(page, text) {
  const editor = page.getByRole('textbox').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

test.describe('RON-168 generated programming course', () => {
  test('RON-168 walks new course, lesson, quiz, tutor, local run and revision', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your courses' })).toBeVisible();

    // New course -> generated syllabus.
    await page.getByRole('button', { name: 'New course' }).click();
    await expect(page.getByRole('heading', { name: 'New course' })).toBeVisible();
    await page.getByLabel('What do you want to learn?').fill('Bash scripting foundations');
    await page.getByRole('button', { name: 'Propose syllabus' }).click();
    await expect(page.getByText('Syllabus · 4 lessons')).toBeVisible();
    await page.getByRole('button', { name: 'Start course' }).click();

    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Bash Scripting Foundations' })).toBeVisible();
    const courseUrl = page.url();

    // Lesson -> generate the written lesson.
    await page.getByRole('button', { name: 'Start', exact: true }).first().click();
    await expect(page.getByText('No lesson content yet')).toBeVisible();
    await page.getByRole('button', { name: 'Generate lesson' }).click();
    await expect(page.getByText(/A script is a file that the shell executes/)).toBeVisible();
    await expect(page.getByText('In progress')).toBeVisible();

    // Quiz -> answer all five correctly.
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Check your understanding' }).click();
    const answers = [
      'echo',
      'Success',
      'exit 1',
      'bash main.sh',
      'To tell the caller whether the work succeeded',
    ];
    for (let i = 0; i < answers.length; i += 1) {
      await page.getByRole('button', { name: new RegExp(`^[A-D] ${answers[i]}$`) }).click();
      await page
        .getByRole('button', { name: i === answers.length - 1 ? 'See score' : 'Next question' })
        .click();
    }
    await expect(page.getByText('You got 5 of 5 correct.')).toBeVisible();
    await expect(page.getByText('Saved to your attempts.')).toBeVisible();
    await expect(page.getByText('5 / 5')).toBeVisible();

    // Tutor -> one message, streamed Socratic reply.
    await page.getByRole('button', { name: 'Tutor', exact: true }).click();
    await page.getByLabel('Message the tutor').fill('I think the exit code tells the caller if it worked.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/What do you think happens to the exit code/)).toBeVisible();

    // Workspace -> local machine, one-time acknowledgement, first run exits 1.
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(page.getByText('Local machine').first()).toBeVisible();
    await expect(page.getByText('Code runs on your machine')).toBeVisible();
    // RON-196: the workspace seeds from lesson.content_md, but generated content lives in
    // lesson_versions. RON-197: findExerciseSection treats a column-0 # comment inside a fence as
    // a Markdown heading. Both bugs force this workaround (type the exercise, keep the fixture
    // comment-free); remove it once RON-196 and RON-197 are fixed.
    await replaceEditorText(
      page,
      '#!/usr/bin/env bash\necho "TODO: finish the exercise"\nexit 1\n'
    );
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(
      page.getByText('Confirm where your code runs before the first local run.')
    ).toBeVisible();
    await page.getByRole('button', { name: 'I understand — run my code' }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByText('exit 1', { exact: true }).last()).toBeVisible();

    // Edit the exercise and run again -> exit 0.
    await replaceEditorText(
      page,
      '#!/usr/bin/env bash\necho "Exercise complete"\nexit 0\n'
    );
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByText('exit 0', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Exercise complete')).toBeVisible();
    await expect(page.getByText('Attempt history (2)')).toBeVisible();

    // Revision -> tutor review, Revise this attempt, second review, attempt history.
    await page.getByRole('button', { name: 'Tutor', exact: true }).click();
    await page.getByRole('button', { name: 'Review my attempt' }).click();
    await expect(page.getByText('Not met').first()).toBeVisible();
    await expect(page.getByText('Revise this attempt')).toBeVisible();

    await page.getByRole('button', { name: 'Revise this attempt' }).click();
    await page
      .getByLabel('Message the tutor')
      .fill('REVISED-ATTEMPT: the run exited 1, so a non-zero status signalled failure.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/REVISED-ATTEMPT: the run exited 1/)).toBeVisible();

    await page.getByRole('button', { name: 'Review my attempt' }).click();
    await expect(page.getByText('Attempt history (2)').last()).toBeVisible();
    await page.getByText('Attempt history (2)').last().click();
    await expect(page.getByText('2 → 3 of 3 met')).toBeVisible();
    await expect(page.getByText('c2: Not met → Met')).toBeVisible();

    // A generated capstone is in-app: no external evidence surface is reachable.
    await page.goto(courseUrl);
    await expect(page.getByText('🔒 Locked')).toBeVisible();
    await expect(page.getByText('Verify externally')).toHaveCount(0);
  });
});
