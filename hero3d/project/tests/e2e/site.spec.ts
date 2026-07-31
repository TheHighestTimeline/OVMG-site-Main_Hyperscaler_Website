/**
 * site.spec.ts — verifies the built embed bundle inside the real site page.
 *
 * The unit and hero specs exercise the dev server; this one loads the actual
 * static index.html against the built hero3d/hero3d.js, which is what proves
 * the integration (mount point, asset paths, transparent background mode)
 * works in production form rather than only under Vite.
 *
 * Requires: npm run build:embed, and a static server on 127.0.0.1:4179
 * serving the repository root.
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { PARTNERS } from '../../src/hero/partnerManifest';
import { VIEWPORTS, heroState, waitForHero, watchPage } from './helpers';

const SITE = 'http://127.0.0.1:4179';
const OUT = resolve(import.meta.dirname, '../../../screenshots');
mkdirSync(OUT, { recursive: true });

const ACTIVE = PARTNERS.filter((p) => p.active !== false);

test.describe.configure({ mode: 'serial', timeout: 420_000 });

test('the built bundle mounts and renders inside the real site page', async ({ page }) => {
  const watcher = watchPage(page);
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(`${SITE}/index.html`);
  await waitForHero(page);

  const state = await heroState(page);
  expect(state.centralPresent).toBe(true);
  expect(state.partners.length).toBe(ACTIVE.length);
  for (const partner of state.partners) {
    expect(partner.hasLogoTexture, `${partner.id} missing on the site page`).toBe(true);
  }

  // Asset paths resolve relative to the module, not the page.
  expect(state.assetIssues, `asset issues: ${JSON.stringify(state.assetIssues)}`).toEqual([]);
  expect(watcher.failedRequests, `failed requests: ${watcher.failedRequests.join(' | ')}`).toEqual([]);
  expect(watcher.errors, `console errors: ${watcher.errors.join(' | ')}`).toEqual([]);
});

test('the hero sits in the page layout without covering the copy', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(`${SITE}/index.html`);
  await waitForHero(page);

  const headline = await page.locator('h1.hero-h1').boundingBox();
  const mount = await page.locator('.hero3d-mount').boundingBox();
  expect(headline).not.toBeNull();
  expect(mount).not.toBeNull();

  // Two-column hero: the visual sits beside the copy, never on top of it.
  expect(mount!.x).toBeGreaterThan(headline!.x + headline!.width - 40);
  expect(mount!.height).toBeGreaterThan(300);
});

test('the page still scrolls normally with the hero mounted', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(`${SITE}/index.html`);
  await waitForHero(page);

  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(900);
});

test('capture: the hero in the live page at desktop and phone', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(`${SITE}/index.html`);
  await waitForHero(page);
  await page.evaluate(() => window.__OVMG_HERO__?.seek(530));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, 'site-desktop-1440.png') });

  await page.setViewportSize(VIEWPORTS['phone-390']);
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__OVMG_HERO__?.seek(530));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(OUT, 'site-phone-390.png') });
});
