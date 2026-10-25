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
    // Default-off reproduction hook for the CI streaming race; see fake-agent.js slow mode.
    const slowMarker = process.env.E2E_SLOW_AGENT === '1' ? ' SLOW-STREAM' : '';
    const revisedMessage =
      'REVISED-ATTEMPT: the run exited 1, so a non-zero status signalled failure.' + slowMarker;
    const fullTutorReply =
      /What do you think happens to the exit code when the last command in a script fails\? Try it once and tell me what you observed\./;
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your courses', exact: true, level: 1 })).toBeVisible();

    // New course -> generated syllabus.
    await page.getByRole('button', { name: 'New course', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New course', exact: true, level: 1 })).toBeVisible();
    await page.getByLabel('What do you want to learn?', { exact: true }).fill('Bash scripting foundations');
    await page.getByRole('button', { name: 'Propose syllabus', exact: true }).click();
    await expect(page.getByText('Syllabus · 4 lessons', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start course', exact: true }).click();

    await expect(page).toHaveURL(/#\/course\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Bash Scripting Foundations', exact: true, level: 1 })).toBeVisible();
    const courseUrl = page.url();

    // Lesson -> generate the written lesson.
    await page.getByRole('button', { name: 'Start', exact: true }).first().click();
    await expect(page.getByText('No lesson content yet', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Generate lesson', exact: true }).click();
    await expect(page.getByText(/A script is a file that the shell executes/)).toBeVisible();
    await expect(page.getByText('In progress', { exact: true })).toBeVisible();

    // Quiz -> answer all five correctly.
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.getByRole('button', { name: 'Check your understanding', exact: true }).click();
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
        .getByRole('button', { name: i === answers.length - 1 ? 'See score' : 'Next question', exact: true })
        .click();
    }
    await expect(page.getByText('You got 5 of 5 correct.', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved to your attempts.', { exact: true })).toBeVisible();
    await expect(page.getByText('5 / 5', { exact: true })).toBeVisible();

    // Tutor -> one message, streamed Socratic reply.
    await page.getByRole('button', { name: 'Tutor', exact: true }).click();
    await page.getByLabel('Message the tutor', { exact: true }).fill('I think the exit code tells the caller if it worked.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(fullTutorReply)).toHaveCount(1);
    await expect(page.getByText('thinking…', { exact: true })).toHaveCount(0);

    // Workspace -> local machine, one-time acknowledgement, first run exits 1.
    await page.getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(page.getByText('Local machine', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Code runs on your machine', { exact: true })).toBeVisible();
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
      page.getByText('Confirm where your code runs before the first local run.', { exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'I understand — run my code', exact: true }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByText('exit 1', { exact: true }).last()).toBeVisible();

    // Edit the exercise and run again -> exit 0.
    await replaceEditorText(
      page,
      '#!/usr/bin/env bash\necho "Exercise complete"\nexit 0\n'
    );
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByText('exit 0', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Exercise complete', { exact: true })).toBeVisible();
    await expect(page.getByText('Attempt history (2)', { exact: true })).toBeVisible();

    // Revision -> tutor review, Revise this attempt, second review, attempt history.
    await page.getByRole('button', { name: 'Tutor', exact: true }).click();
    await page.getByRole('button', { name: 'Review my attempt', exact: true }).click();
    await expect(page.getByText('Not met', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Revise this attempt', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Revise this attempt', exact: true }).click();
    await page
      .getByLabel('Message the tutor', { exact: true })
      .fill(revisedMessage);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(revisedMessage, { exact: true })).toBeVisible();

    // CI race: the review click must wait until the revised-message reply has finished streaming
    // and the quick action is re-enabled. Prefix text appears early, so assert the full reply and
    // the streaming indicator explicitly instead of clicking from a stale render.
    await expect(page.getByText(fullTutorReply)).toHaveCount(2);
    await expect(page.getByText('thinking…', { exact: true })).toHaveCount(0);
    const reviewButton = page.getByRole('button', { name: 'Review my attempt', exact: true });
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();
    await expect(page.getByText('Attempt history (2)', { exact: true }).last()).toBeVisible();
    await page.getByText('Attempt history (2)', { exact: true }).last().click();
    await expect(page.getByText('2 → 3 of 3 met', { exact: true })).toBeVisible();
    await expect(page.getByText('c2: Not met → Met', { exact: true })).toBeVisible();

    // A generated capstone is in-app: no external evidence surface is reachable.
    await page.goto(courseUrl);
    await expect(page.getByText('🔒 Locked', { exact: true })).toBeVisible();
    await expect(page.getByText('Verify externally', { exact: true })).toHaveCount(0);
  });
});
