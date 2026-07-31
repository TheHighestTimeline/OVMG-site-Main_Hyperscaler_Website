/**
 * depth-probe.mjs — measures the near/far screen-size ratio the perspective
 * camera actually produces for the orbiting medallions, by sampling each
 * partner's camera distance across the orbital cycle.
 */
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:5178/?quality=high', { waitUntil: 'load' });
await page.waitForFunction(() => (window.__OVMG_HERO__?.getState().drawCalls ?? 0) > 0, undefined, {
  timeout: 120000,
});

const stats = new Map();
for (let t = 0; t < 900; t += 37) {
  await page.evaluate((s) => window.__OVMG_HERO__?.seek(s), t);
  await page.waitForFunction((s) => (window.__OVMG_HERO__?.getState().elapsed ?? -1) >= s, t, { timeout: 30000 });
  const state = await page.evaluate(() => window.__OVMG_HERO__.getState());
  for (const p of state.partners) {
    const e = stats.get(p.id) ?? { min: Infinity, max: 0 };
    e.min = Math.min(e.min, p.distance);
    e.max = Math.max(e.max, p.distance);
    stats.set(p.id, e);
  }
}
await browser.close();

console.log('partner            nearest   farthest   apparent size ratio (near/far)');
for (const [id, e] of stats) {
  console.log(`${id.padEnd(18)} ${e.min.toFixed(2).padStart(7)} ${e.max.toFixed(2).padStart(10)}   ${(e.max / e.min).toFixed(2)}x`);
}
