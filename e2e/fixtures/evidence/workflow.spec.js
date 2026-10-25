import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('publishes a status update', async ({ page }) => {
  await page.getByRole('button', { name: 'Publish update' }).click();
  await expect(page.getByText('Update published.')).toBeVisible();
});
