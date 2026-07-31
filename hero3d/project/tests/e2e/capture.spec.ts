/**
 * capture.spec.ts — the screenshot harness for visual review.
 *
 * Writes deterministic PNGs into hero3d/screenshots/. Run with:
 *   npx playwright test tests/e2e/capture.spec.ts
 *
 * Every shot waits for the scene to be built and for a fixed number of
 * animation seconds to elapse, so a given filename always shows the same
 * moment in the orbit and reviews are comparable between passes.
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { VIEWPORTS, heroState, url, waitForHero } from './helpers';

const OUT = resolve(import.meta.dirname, '../../../screenshots');
mkdirSync(OUT, { recursive: true });

// Headless Chromium rasterises WebGL in software, so a full-quality frame
// costs far more than it does on a GPU. Capture runs get a generous budget.
test.describe.configure({ mode: 'serial', timeout: 420_000 });

/**
 * Jumps the animation clock to an exact moment and lets a few frames settle.
 * Waiting in real time is not viable here: headless Chromium rasterises WebGL
 * in software, so the clock advances far slower than wall time.
 */
async function seekTo(page: import('@playwright/test').Page, seconds: number) {
  await page.evaluate((target) => window.__OVMG_HERO__?.seek(target), seconds);
  await page.waitForTimeout(900);
}

async function shot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`), animations: 'allow' });
}

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`capture: full hero at ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(url('/', { quality: viewport.width < 820 ? 'medium' : 'high' }));
    await waitForHero(page);
    await seekTo(page, 530);
    await shot(page, `hero-${name}`);
  });
}

test('capture: orbit phases at desktop', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(url('/', { quality: 'high', speed: 14 }));
  await waitForHero(page);
  // Three moments spread across the cycle: partners front, side and behind.
  for (const [index, seconds] of [12, 34, 58].entries()) {
    await seekTo(page, seconds);
    await shot(page, `orbit-phase-${index + 1}`);
  }
  const state = await heroState(page);
  expect(state.partners.length).toBeGreaterThan(0);
});

test('capture: isolated layers', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  for (const layer of ['central', 'rings', 'partners', 'stars'] as const) {
    await page.goto(url('/', { quality: 'high', only: layer, speed: 3 }));
    await waitForHero(page);
    await seekTo(page, 10);
    await shot(page, `isolate-${layer}`);
  }
});

test('capture: a partner crossing behind the central mark', async ({ page }) => {
  // Proof shot for the layering decision: finds a moment when a mark is
  // geometrically behind the O and captures it, so the "stays visible"
  // behaviour is reviewable by eye and not only by assertion.
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(url('/', { quality: 'high' }));
  await waitForHero(page);

  let found = false;
  for (let t = 0; t < 1600 && !found; t += 19) {
    await page.evaluate((s) => window.__OVMG_HERO__?.seek(s), t);
    await page.waitForFunction(
      (s) => {
        const elapsed = window.__OVMG_HERO__?.getState().elapsed ?? -1;
        return elapsed >= s && elapsed < s + 8;
      },
      t,
      { timeout: 30_000 },
    );
    const state = await heroState(page);
    found = state.partners.some((p) => p.occludedByCentral && p.onScreen);
  }
  expect(found, 'no partner passed behind the central mark').toBe(true);

  await page.waitForTimeout(700);
  await shot(page, 'layering-partner-behind-mark');
});

test('capture: central O close study', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1200 });
  await page.goto(url('/', { quality: 'high', only: 'central', speed: 1 }));
  await waitForHero(page);
  await seekTo(page, 8);
  await shot(page, 'central-o-square');
});

test('capture: scroll-reactive state', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(url('/', { quality: 'high', scroll: 1, speed: 3 }));
  await waitForHero(page);
  await seekTo(page, 10);
  await shot(page, 'scroll-0');

  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.45)));
  await page.waitForTimeout(1400);
  await shot(page, 'scroll-45');

  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.85)));
  await page.waitForTimeout(1400);
  await shot(page, 'scroll-85');
});

test('capture: reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(url('/', { quality: 'high' }));
  await waitForHero(page);
  await page.waitForTimeout(1200);
  await shot(page, 'reduced-motion-desktop');

  await page.setViewportSize(VIEWPORTS['phone-390']);
  await page.waitForTimeout(1200);
  await shot(page, 'reduced-motion-phone');
});

test('capture: pointer-deflected composition', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS['laptop-1440']);
  await page.goto(url('/', { quality: 'high', speed: 3 }));
  await waitForHero(page);
  await seekTo(page, 10);
  await page.mouse.move(1340, 220);
  await page.waitForTimeout(1200);
  await shot(page, 'pointer-deflected');
});
