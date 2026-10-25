import { expect, test } from '@playwright/test';
import {
  BRIDGE_HEALTH_URL,
  BRIDGE_TOKEN,
  FOREIGN_ORIGIN,
  STUDIO_ORIGIN,
  STUDIO_ORIGINS,
} from '../helpers/env.js';

test.describe('RON-168 bridge origin isolation', () => {
  test('RON-168 blocks a foreign origin with and without the token, but serves Studio', async ({
    page,
  }) => {
    expect(STUDIO_ORIGINS).toBe(STUDIO_ORIGIN);
    expect(process.env.STUDIO_ALLOW_NON_LOOPBACK).toBeUndefined();

    await page.goto(`${FOREIGN_ORIGIN}/`);
    await expect(page.getByRole('heading', { name: 'Foreign origin' })).toBeVisible();

    const withToken = await page.evaluate(
      async ({ url, token }) => window.callBridge(url, token),
      { url: BRIDGE_HEALTH_URL, token: BRIDGE_TOKEN }
    );
    expect(withToken.ok).toBe(false);
    if (!withToken.error) {
      expect([401, 403]).toContain(withToken.status);
    }
    expect(String(withToken.body || '')).not.toContain('agents');

    const withoutToken = await page.evaluate(
      async ({ url }) => window.callBridge(url, null),
      { url: BRIDGE_HEALTH_URL }
    );
    expect(withoutToken.ok).toBe(false);
    if (!withoutToken.error) {
      expect([401, 403]).toContain(withoutToken.status);
    }
    expect(String(withoutToken.body || '')).not.toContain('agents');

    // Control: the same call from the Studio origin succeeds.
    await page.goto(`${STUDIO_ORIGIN}/`);
    const allowed = await page.evaluate(
      async ({ url, token }) => {
        const res = await fetch(url, { headers: { 'X-Studio-Token': token } });
        return { ok: res.ok, status: res.status, body: await res.json() };
      },
      { url: BRIDGE_HEALTH_URL, token: BRIDGE_TOKEN }
    );
    expect(allowed.status).toBe(200);
    expect(allowed.ok).toBe(true);
    expect(allowed.body.ok).toBe(true);
  });
});
