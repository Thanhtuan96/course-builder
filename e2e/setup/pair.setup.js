import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  BRIDGE_ORIGIN,
  BRIDGE_TOKEN,
  PAIRING_STATE,
  PAIRING_URL,
} from '../helpers/env.js';

test('RON-168 pairs the browser with the local bridge once', async ({ page, context }) => {
  await page.goto(PAIRING_URL);

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: /My local agent/ })).toBeVisible();
  await expect(page.getByText('Selected')).toBeVisible();
  await expect(page.getByLabel('Bridge URL')).toHaveValue(BRIDGE_ORIGIN);
  await expect(page.getByLabel('Pairing token')).toHaveValue(BRIDGE_TOKEN);

  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Response')).toBeVisible();
  await expect(page.getByText(/What do you think happens to the exit code/)).toBeVisible();

  // Persist provider + pairing + storage choice for both journeys and the origin spec.
  mkdirSync(dirname(PAIRING_STATE), { recursive: true });
  await context.storageState({ path: PAIRING_STATE });
});
