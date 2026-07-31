/**
 * perf-probe.mjs — measures draw calls, triangles and frame time per quality
 * tier in a real browser. Headless Chromium rasterises WebGL in software, so
 * the frame times here are a worst-case floor, not a GPU benchmark; the draw
 * call and triangle counts are exact either way.
 */
import { chromium } from '@playwright/test';

const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: true, args: GL_ARGS });

const rows = [];
for (const [tier, viewport] of [
  ['high', { width: 1920, height: 1080 }],
  ['high', { width: 1440, height: 900 }],
  ['medium', { width: 768, height: 1024 }],
  ['low', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`http://127.0.0.1:5178/?quality=${tier}`, { waitUntil: 'load' });
  await page.waitForFunction(() => (window.__OVMG_HERO__?.getState().drawCalls ?? 0) > 0, undefined, {
    timeout: 120000,
  });
  await page.waitForTimeout(6000);
  const s = await page.evaluate(() => window.__OVMG_HERO__.getState());
  rows.push({
    tier,
    viewport: `${viewport.width}x${viewport.height}`,
    drawCalls: s.drawCalls,
    triangles: s.triangles,
    programs: s.programs,
    geometries: s.geometries,
    textures: s.textures,
    stars: s.starCount,
    frameMs: Number(s.frameMs.toFixed(1)),
  });
  await page.close();
}
await browser.close();
console.table(rows);
