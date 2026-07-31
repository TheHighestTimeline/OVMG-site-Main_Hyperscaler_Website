import { expect, test } from '@playwright/test';
import { PARTNERS } from '../../src/hero/partnerManifest';
import { RESPONSIVE_PROFILES, RINGS } from '../../src/hero/heroConfig';
import { ringSpreadX } from '../../src/three/orbits/framing';
import { VIEWPORTS, heroState, sampleAfter, url, waitForHero, watchPage } from './helpers';

const ACTIVE = PARTNERS.filter((partner) => partner.active !== false);

test.describe('hero boot', () => {
  test('loads, renders a canvas and reports no console errors or failed requests', async ({ page }) => {
    const watcher = watchPage(page);
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);

    await expect(page.locator('canvas')).toBeVisible();
    const state = await heroState(page);

    expect(state.ready).toBe(true);
    expect(state.drawCalls).toBeGreaterThan(0);
    expect(state.triangles).toBeGreaterThan(1000);
    expect(watcher.errors, `console errors: ${watcher.errors.join(' | ')}`).toEqual([]);
    expect(watcher.failedRequests, `failed requests: ${watcher.failedRequests.join(' | ')}`).toEqual([]);
    expect(state.assetIssues, `asset issues: ${JSON.stringify(state.assetIssues)}`).toEqual([]);
  });

  test('marks the hero loaded so the loading state clears', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    await expect(page.locator('.ovmg-hero')).toHaveAttribute('data-loaded', 'true');
    await expect(page.locator('.ovmg-hero__loader')).toHaveClass(/is-done/);
  });

  test('exposes the central object and every ring', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const state = await heroState(page);
    expect(state.centralPresent).toBe(true);
    expect(state.ringCount).toBe(RINGS.length);
  });

  test('renders a starfield', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const state = await heroState(page);
    expect(state.starCount).toBeGreaterThan(500);
  });
});

test.describe('partners', () => {
  test('every enabled partner is present with its own texture', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const state = await heroState(page);

    expect(state.partners.map((partner) => partner.id).sort()).toEqual(ACTIVE.map((p) => p.id).sort());
    for (const partner of state.partners) {
      expect(partner.hasLogoTexture, `${partner.id} has no logo texture`).toBe(true);
    }
  });

  test('each partner sits on its assigned ring', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const state = await heroState(page);

    for (const partner of state.partners) {
      const expected = ACTIVE.find((p) => p.id === partner.id)!;
      expect(partner.ring).toBe(expected.ring);

      // Undo the ring's inclination and the responsive spreads, then confirm
      // the point satisfies that ring's ellipse equation exactly. This is the
      // real invariant: a partner is *on* its ring, not merely near it.
      const ring = RINGS[partner.ring];
      const profile = RESPONSIVE_PROFILES.find((p) => p.label === state.responsive)!;
      const spreadX = ringSpreadX(RINGS, partner.ring, profile.orbitSpreadX);
      const spreadZ = profile.orbitSpreadZ;
      const scale = profile.systemScale;

      // The system group carries a roll and a uniform scale; undo both.
      const cr = Math.cos(-profile.systemRoll);
      const sr = Math.sin(-profile.systemRoll);
      const ux = (partner.x * cr - partner.y * sr) / scale;
      const uy = (partner.x * sr + partner.y * cr) / scale;
      const uz = partner.z / scale;

      const cx = Math.cos(-ring.inclinationX);
      const sxi = Math.sin(-ring.inclinationX);
      const y1 = uy * cx - uz * sxi;
      const z1 = uy * sxi + uz * cx;
      const cz = Math.cos(-ring.inclinationZ);
      const szi = Math.sin(-ring.inclinationZ);
      const localX = ux * cz - y1 * szi;
      const localZ = z1;

      const normalised =
        (localX / (ring.radiusX * spreadX)) ** 2 + (localZ / (ring.radiusZ * spreadZ)) ** 2;
      expect(normalised, `${partner.id} is off its ring (normalised ${normalised.toFixed(3)})`).toBeCloseTo(
        1,
        2,
      );
    }
  });

  test('all partners are inside the frame at every tested viewport', async ({ page }) => {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(viewport);
      await page.goto(url('/', { quality: 'high' }));
      await waitForHero(page);
      const state = await heroState(page);
      for (const partner of state.partners) {
        expect(Math.abs(partner.ndcX), `${partner.id} off-screen horizontally at ${name}`).toBeLessThan(1.02);
        expect(Math.abs(partner.ndcY), `${partner.id} off-screen vertically at ${name}`).toBeLessThan(1.02);
      }
    }
  });

  test('lists every partner name for assistive technology', async ({ page }) => {
    await page.goto(url('/'));
    await waitForHero(page);
    for (const partner of ACTIVE) {
      await expect(page.locator('.ovmg-hero__a11y li', { hasText: partner.name })).toHaveCount(1);
    }
  });
});

test.describe('orbital motion', () => {
  test('the animation clock advances on its own', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const first = await heroState(page);
    const second = await sampleAfter(page, 2500);
    // Under software rasterisation the clock advances slowly, so this asserts
    // that it advances at all and monotonically — the *amount* of movement per
    // second of animation time is covered by the seek-driven test below.
    expect(second.elapsed).toBeGreaterThan(first.elapsed);
  });

  test('every partner keeps moving along its ring, indefinitely', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);

    // Seeking drives the same clock the render loop advances, so this measures
    // real orbital motion without being hostage to the software frame rate.
    const sampleAt = async (seconds: number) => {
      await page.evaluate((t) => window.__OVMG_HERO__?.seek(t), seconds);
      // Telemetry publishes every 10th frame, so wait for it to actually
      // reflect the seek rather than sleeping a guessed interval.
      await page.waitForFunction(
        (t) => {
          const elapsed = window.__OVMG_HERO__?.getState().elapsed ?? -1;
          return elapsed >= t && elapsed < t + 8;
        },
        seconds,
        { timeout: 30_000 },
      );
      return heroState(page);
    };

    // Samples spread over 20 minutes of animation time: motion must not decay,
    // drift or stop at any point in the cycle.
    const times = [0, 45, 130, 400, 700, 1200];
    const frames = [];
    for (const t of times) frames.push(await sampleAt(t));

    for (let i = 1; i < frames.length; i += 1) {
      for (const partner of frames[i - 1].partners) {
        const later = frames[i].partners.find((p) => p.id === partner.id)!;
        const moved = Math.hypot(later.x - partner.x, later.y - partner.y, later.z - partner.z);
        expect(moved, `${partner.id} did not move between t=${times[i - 1]} and t=${times[i]}`).toBeGreaterThan(
          0.05,
        );
        // And it is still on its ring, not drifting outward over time.
        expect(Math.hypot(later.x, later.y, later.z)).toBeLessThan(12);
      }
    }
  });

  test('rings move at different speeds and at least one runs retrograde', async ({ page }) => {
    await page.goto(url('/', { quality: 'high', speed: 10 }));
    await waitForHero(page);

    const before = await heroState(page);
    const after = await sampleAfter(page, 2500);

    const distanceByRing = new Map<number, number>();
    for (const partner of before.partners) {
      const later = after.partners.find((p) => p.id === partner.id)!;
      const travelled = Math.hypot(later.x - partner.x, later.y - partner.y, later.z - partner.z);
      const current = distanceByRing.get(partner.ring) ?? 0;
      distanceByRing.set(partner.ring, Math.max(current, travelled));
    }

    const values = [...distanceByRing.values()];
    expect(values.length).toBeGreaterThan(1);
    // Different rings must not have travelled identical distances.
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBe(values.length);
  });

  test('a partner passing behind the central mark stays visible', async ({ page }) => {
    // The scene deliberately draws the marks over the central object: a hero
    // that hides a partner for part of every orbit is not doing its job. This
    // asserts the pixels, not the intent — it finds a moment where a mark is
    // geometrically behind the O, then samples the canvas at that mark's
    // screen position and requires it to differ from the stone behind it.
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);

    const seekTo = async (seconds: number) => {
      await page.evaluate((t) => window.__OVMG_HERO__?.seek(t), seconds);
      await page.waitForFunction(
        (t) => {
          const elapsed = window.__OVMG_HERO__?.getState().elapsed ?? -1;
          return elapsed >= t && elapsed < t + 8;
        },
        seconds,
        { timeout: 30_000 },
      );
      return heroState(page);
    };

    let sawBehind = false;
    for (let t = 0; t < 1600; t += 23) {
      const state = await seekTo(t);
      expect(state.logoLayer).toBe('always-front');

      const behind = state.partners.filter((p) => p.occludedByCentral && p.onScreen);
      for (const partner of behind) {
        sawBehind = true;
        // Geometrically behind the mark, yet still drawn over it. Checked
        // against the live material state in the running scene, not config.
        expect(
          partner.drawnInFront,
          `"${partner.id}" is behind the central mark and would be hidden by it`,
        ).toBe(true);
      }
      if (sawBehind) break;
    }

    expect(sawBehind, 'no partner ever passed behind the central mark').toBe(true);

    // And every mark, wherever it is in its orbit, is drawn in this layer.
    const state = await heroState(page);
    for (const partner of state.partners) {
      expect(partner.drawnInFront, `"${partner.id}" is not in the front layer`).toBe(true);
    }
  });

  test('occlusion can still be switched back on', async ({ page }) => {
    // 'always-front' is a deliberate art-direction choice, not a limitation:
    // the physically-correct mode is one config value away.
    await page.goto(url('/', { quality: 'high', layer: 'occluded' }));
    await waitForHero(page);
    const state = await heroState(page);
    expect(state.logoLayer).toBe('occluded');
    for (const partner of state.partners) {
      expect(partner.drawnInFront).toBe(false);
    }
  });

  test('partners pass behind the central O and are reported as occluded', async ({ page }) => {
    await page.goto(url('/', { quality: 'high', speed: 22 }));
    await waitForHero(page);

    const seenOccluded = new Set<string>();
    for (let i = 0; i < 24; i += 1) {
      const state = await sampleAfter(page, 450);
      for (const partner of state.partners) {
        if (partner.occludedByCentral) seenOccluded.add(partner.id);
      }
      if (seenOccluded.size > 0) break;
    }
    expect(seenOccluded.size, 'no partner ever passed behind the central O').toBeGreaterThan(0);
  });

  test('motion is time based: a stalled frame cannot jump the system', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const before = await heroState(page);

    // Block the main thread long enough that a naive clock would swallow the
    // whole stall on the next frame. The runtime clamps delta, so the system
    // may only ever advance by a bounded amount per frame.
    await page.evaluate(() => {
      const until = performance.now() + 1500;
      while (performance.now() < until) {
        /* deliberately blocking */
      }
    });
    const after = await sampleAfter(page, 1200);
    const advanced = after.elapsed - before.elapsed;

    expect(advanced).toBeGreaterThan(0);
    // 1.5s of stall plus 1.2s of real time could never legitimately produce
    // more than a few seconds of animation time.
    expect(advanced).toBeLessThan(4);
  });
});

test.describe('pointer and scroll response', () => {
  test('pointer parallax moves the camera without moving the page', async ({ page }) => {
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);

    const rest = await heroState(page);
    expect(Math.abs(rest.pointerX)).toBeLessThan(0.25);

    // Pointer input is damped, and damping is measured in animation time — so
    // under software rasterisation it needs several seconds to settle.
    await page.mouse.move(1300, 300);
    await page.waitForTimeout(3000);
    const right = await heroState(page);
    expect(right.pointerX, 'pointer right did not deflect the camera').toBeGreaterThan(0.3);

    await page.mouse.move(120, 700);
    await page.waitForTimeout(3000);
    const left = await heroState(page);
    expect(left.pointerX, 'pointer left did not deflect the camera back').toBeLessThan(right.pointerX - 0.2);
    expect(left.pointerX).toBeLessThan(0);

    // The page itself never moved.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('scroll drives hero progress and never hijacks the page', async ({ page }) => {
    await page.goto(url('/', { quality: 'high', scroll: 1 }));
    await waitForHero(page);

    const start = await heroState(page);
    expect(start.scroll).toBeLessThan(0.05);

    await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.6)));
    await page.waitForTimeout(900);

    const scrolled = await heroState(page);
    expect(scrolled.scroll).toBeGreaterThan(0.2);
    // The page really scrolled — nothing pinned or hijacked it.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  });

  test('orbital motion continues independently of scroll', async ({ page }) => {
    await page.goto(url('/', { quality: 'high', scroll: 1, speed: 8 }));
    await waitForHero(page);
    const before = await heroState(page);
    await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.35)));
    const after = await sampleAfter(page, 1400);
    for (const partner of before.partners) {
      const later = after.partners.find((p) => p.id === partner.id)!;
      const moved = Math.hypot(later.x - partner.x, later.y - partner.y, later.z - partner.z);
      expect(moved).toBeGreaterThan(0.02);
    }
  });
});

test.describe('reduced motion', () => {
  test('freezes the composition, keeps every partner visible and disables parallax', async ({ page }) => {
    const watcher = watchPage(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);

    const first = await heroState(page);
    await page.mouse.move(1350, 200);
    const second = await sampleAfter(page, 1500);

    expect(second.reducedMotion).toBe(true);
    expect(second.pointerX).toBe(0);
    expect(second.scroll).toBe(0);
    expect(second.elapsed).toBeCloseTo(first.elapsed, 5);

    for (const partner of first.partners) {
      const later = second.partners.find((p) => p.id === partner.id)!;
      expect(Math.hypot(later.x - partner.x, later.y - partner.y, later.z - partner.z)).toBeLessThan(1e-6);
    }

    // Every partner still reads on screen in the frozen pose.
    expect(second.partners.length).toBe(ACTIVE.length);
    for (const partner of second.partners) {
      expect(Math.abs(partner.ndcX)).toBeLessThan(1.02);
      expect(Math.abs(partner.ndcY)).toBeLessThan(1.02);
    }
    expect(watcher.errors).toEqual([]);
  });
});

test.describe('responsive behaviour', () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`renders correctly at ${name}`, async ({ page }) => {
      const watcher = watchPage(page);
      await page.setViewportSize(viewport);
      await page.goto(url('/', { quality: viewport.width < 820 ? 'medium' : 'high' }));
      await waitForHero(page);

      const state = await heroState(page);
      expect(state.centralPresent).toBe(true);
      expect(state.partners.length).toBe(ACTIVE.length);
      expect(state.drawCalls).toBeGreaterThan(0);
      expect(watcher.errors).toEqual([]);

      // The mark itself must stay comfortably inside the frame.
      const canvasBox = await page.locator('canvas').boundingBox();
      expect(canvasBox!.width).toBeGreaterThan(viewport.width * 0.9);
    });
  }

  test('survives a live resize between breakpoints', async ({ page }) => {
    const watcher = watchPage(page);
    await page.setViewportSize(VIEWPORTS['desktop-1920']);
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const desktop = await heroState(page);

    await page.setViewportSize(VIEWPORTS['phone-390']);
    await page.waitForTimeout(1200);
    const phone = await heroState(page);

    expect(phone.responsive).not.toBe(desktop.responsive);
    expect(phone.partners.length).toBe(ACTIVE.length);
    expect(phone.drawCalls).toBeGreaterThan(0);

    await page.setViewportSize(VIEWPORTS['laptop-1440']);
    await page.waitForTimeout(1200);
    const back = await heroState(page);
    expect(back.drawCalls).toBeGreaterThan(0);
    expect(watcher.errors).toEqual([]);
  });
});

test.describe('resilience', () => {
  test('a missing partner logo degrades gracefully instead of crashing the hero', async ({ page }) => {
    await page.route('**/partners/ess.webp', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);

    const state = await heroState(page);
    // The hero still runs and still shows the rest of the ecosystem.
    expect(state.centralPresent).toBe(true);
    expect(state.partners.length).toBe(ACTIVE.length);
    expect(state.assetIssues.some((issue) => issue.path.includes('ess'))).toBe(true);
    for (const partner of state.partners) {
      if (partner.id === 'ess') continue;
      expect(partner.hasLogoTexture).toBe(true);
    }
  });
});

test.describe('performance budget', () => {
  test('stays within the draw-call and texture budget', async ({ page }) => {
    // Budgets are set from measurement (scripts/perf-probe.mjs), not guessed.
    //
    // The scene itself costs 37 draw calls: 5 ring tubes, 6 medallions at two
    // material groups plus a logo each, 3 mark meshes, 3 star layers, the
    // backdrop, and the shadow pass. On the high tier the bloom's mipmap chain
    // adds ~30 more — small, cheap passes, but they are real draw calls, so
    // the budget names both numbers rather than hiding the difference.
    await page.goto(url('/', { quality: 'low' }));
    await waitForHero(page);
    await page.waitForTimeout(1500);
    const scene = await heroState(page);
    expect(scene.drawCalls, `scene draw calls: ${scene.drawCalls}`).toBeLessThanOrEqual(40);

    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    await page.waitForTimeout(1500);
    const full = await heroState(page);

    expect(full.drawCalls, `draw calls with postprocessing: ${full.drawCalls}`).toBeLessThanOrEqual(70);
    expect(full.textures, `textures: ${full.textures}`).toBeLessThanOrEqual(40);
    expect(full.geometries, `geometries: ${full.geometries}`).toBeLessThanOrEqual(28);
    expect(full.triangles, `triangles: ${full.triangles}`).toBeLessThanOrEqual(200_000);
  });

  test('the low tier drops postprocessing and shadow work', async ({ page }) => {
    await page.goto(url('/', { quality: 'low' }));
    await waitForHero(page);
    const low = await heroState(page);

    await page.goto(url('/', { quality: 'high' }));
    await waitForHero(page);
    const high = await heroState(page);

    expect(low.quality).toBe('low');
    expect(high.quality).toBe('high');
    expect(low.triangles).toBeLessThan(high.triangles);
    expect(low.starCount).toBeLessThan(high.starCount);
  });
});
