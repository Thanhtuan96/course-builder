/**
 * RON-210 — an unpaired browser must be told HOW to pair, in the UI language, instead of dead-ending
 * on a raw English "No local server is paired." The spec runs in a fresh browser (no pairing state):
 * it switches the UI to Vietnamese, checks the storage step in onboarding, then the Settings switch
 * dialog, which must show the localized guidance and no English probe detail.
 */
import { expect, test } from '@playwright/test';
import { STUDIO_ORIGIN } from '../helpers/env.js';

const VI_GUIDANCE = /Chưa ghép nối/;
const VI_HINT = /Agent cục bộ của tôi/;
const EN_PROBE_DETAIL = 'No local server is paired.';

test('RON-210 unpaired browser explains how to pair (vi)', async ({ page }) => {
  await page.goto(`${STUDIO_ORIGIN}/`);

  // Onboarding, step 0 — switch the UI to Vietnamese, then walk to the storage step.
  await page.locator('select[name="onboardingLanguage"]').selectOption('vi');
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dữ liệu học tập của bạn nên được lưu ở đâu?' })).toBeVisible();
  await expect(page.getByText(VI_GUIDANCE)).toBeVisible();
  await expect(page.getByText(EN_PROBE_DETAIL)).toHaveCount(0);

  // Leave onboarding, then open Settings → Storage and try to switch to SQLite while unpaired.
  await page.getByRole('button', { name: 'Bỏ qua', exact: true }).click();
  await page.goto(`${STUDIO_ORIGIN}/#/settings`);
  await expect(page.getByRole('heading', { name: 'Cài đặt', exact: true, level: 1 })).toBeVisible();

  await expect(page.getByText(VI_GUIDANCE).first()).toBeVisible();
  await page.getByRole('radio').first().click();

  // The switch dialog keeps SQLite blocked but shows the pairing guidance — never a dead end.
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(VI_GUIDANCE)).toBeVisible();
  await expect(page.getByRole('dialog').getByText(VI_HINT)).toBeVisible();
  await expect(page.getByText(EN_PROBE_DETAIL)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Vẫn chuyển', exact: true })).toBeDisabled();
});
