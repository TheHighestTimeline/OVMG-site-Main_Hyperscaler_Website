# Hero 3D — QA Checklist

Two kinds of items live here: things the automated suites (`npm run test:unit`, `npm run test:e2e`) already verify on every run, and things that need a human eye because they are about how the scene *reads*, not whether a number is correct. Checking a manual item means a reviewer actually looked; it does not itself constitute a record that a pass happened — log pass results in `PROGRESS.md`.

## 0. What is automatically verified today

Do not manually re-check these — they run in CI-equivalent form via `npm run typecheck`, `npm run lint`, `npm run test:unit` (Vitest, `tests/unit/*.test.ts`, 83 tests), and `npm run test:e2e` (Playwright, `tests/e2e/*.spec.ts`, 41 tests across `hero.spec.ts`, `capture.spec.ts`, `site.spec.ts`):

- Every ring's ellipse math is internally consistent and matches three.js's own `Euler('XYZ')` composition (`orbitalMath.test.ts`).
- No ring path or medallion (at any responsive profile's real plaque size) ever intersects the central stone solid, over a full orbital cycle (`orbitalMath.test.ts`).
- Near-coplanar medallion collisions stay under 10% of a sampled 20-minute cycle (`orbitalMath.test.ts`'s screen-space clustering suite).
- The shipped manifest validates cleanly (`validateManifest([]) === []`), every partner has a unique id and its own non-atlased texture file matching its id, and every partner is assigned to a real ring (`partnerManifest.test.ts`).
- Responsive profile resolution never has a viewport-width gap and is ordered narrow→wide (`responsive.test.ts`).
- The central O's lathe profile is closed, has no negative radii, and its face UVs map into `[0,1]` (`responsive.test.ts`).
- Plaque selection: aspect ≤2.2 gets a disc, >2.2 gets a capsule; aspect ratio is always preserved; a capsule's width is capped so a 7:1 wordmark cannot crowd the central mark (`responsive.test.ts`).
- Camera framing: at every tested viewport (390×844, 430×932, 768×1024, 1440×900, 1920×1080) the solved camera distance keeps every ring/medallion sample's *projected* extent (computed under real perspective, not an orthographic approximation) inside the frustum, with a real margin (never hugging the edge, never a mostly-empty frame), and the central mark stays between ~30% and ~100% of frame width (`responsive.test.ts`'s camera-framing suite).
- Quality tiers degrade monotonically and `low` structurally drops shadows/postprocessing (`responsive.test.ts`).
- Device-signal quality scoring gives a modern desktop `high`, a mid phone `medium`/`low`, forces `low` on a detected software renderer or `Save-Data`, and clamps DPR to the tier cap (`responsive.test.ts`).
- The built scene boots with zero console errors, zero failed network requests, and zero reported asset issues; the canvas is visible and draws real geometry (`hero.spec.ts`).
- Every active partner is present with a loaded logo texture, sits on its assigned ring (ellipse-membership check on the reported world position), and stays inside the frame (`|ndcX|`, `|ndcY| < 1.02`) at every tested viewport (`hero.spec.ts`).
- The animation clock advances monotonically and independently of frame count; a simulated 1.5s main-thread stall cannot advance the system by more than a few seconds (`hero.spec.ts`).
- Every partner keeps moving indefinitely (sampled across a simulated 20 minutes via the `seek()` test hook); different rings travel different distances in the same wall-clock window; at least one partner is reported `occludedByCentral` at some point in a cycle (`hero.spec.ts`).
- Pointer parallax deflects the camera without moving the page (`window.scrollY` stays `0`); scroll drives `runtime.scroll` and the page itself really scrolls (`hero.spec.ts`).
- `prefers-reduced-motion: reduce` freezes `elapsed`, zeroes pointer/scroll, holds every partner motionless to sub-micro-unit precision, and keeps every partner's projected position inside the frame in that frozen pose (`hero.spec.ts`).
- The hero survives a live resize across breakpoints without console errors and continues to draw (`hero.spec.ts`).
- A missing partner logo (simulated 404) degrades to a bare plate rather than crashing the hero or removing the partner from the accessible list (`hero.spec.ts`).
- Draw-call/texture/geometry/triangle budgets per tier, and that `low` genuinely has fewer triangles and stars than `high` (`hero.spec.ts`, see `PERFORMANCE.md` §3 for the measured numbers).
- The **built embed bundle**, loaded inside the real static site page (not just the Vite dev server), mounts, renders every partner with a loaded texture, resolves asset paths correctly relative to the module (not the page), sits beside the hero copy without covering it, and does not break the page's own scrolling (`site.spec.ts` — requires `npm run build:embed` and a static server on `127.0.0.1:4179` serving the repo root; not part of the default `npm run test:e2e` webServer wiring).
- `capture.spec.ts` produces deterministic PNGs into `hero3d/screenshots/` at a fixed animation second (via `seek()`) for every tested viewport, three orbit phases, each isolated layer, the central O alone, three scroll positions, reduced motion at two viewports, and a pointer-deflected composition — useful as a visual diff base between passes, but its assertions are structural (partner count > 0), not pixel comparisons.

**Previously-known gap, now closed:** an earlier build had `backingOpacityForTone()` returning values that contradicted its own comments, failing one unit test. Making the carrier plates opaque removed the need for a plate-opacity value at all, so `backingOpacity` and its helper were deleted rather than patched. Plate selection is now `plate` / `plateForTone()` only, and `npm run test:unit` passes 86 of 86.

## 1. Brand fidelity — manual

- [ ] The central O's engraved relief is legibly derived from the OVMG brand mark at rest, at the resting camera distance, on a 1440×900 viewport.
- [ ] The O's material reads as cool stone, not plastic, not chrome, not raw grey clay.
- [ ] The O's colour temperature does not clash with the site's existing brand palette on the page it is embedded into (`ROOT/index.html`'s hero section).
- [ ] No visible seams, UV stretching, or texture tiling artifacts on the O's front face or bevel.

## 2. Depth and composition — manual

- [ ] The O visibly and correctly occludes ring segments and medallions passing behind it at every point in the orbital cycle.
- [ ] The five rings read as distinct inclined planes, not as concentric circles on a single plane.
- [ ] The composition has a clear focal hierarchy: O first, rings/medallions second, starfield last.
- [ ] In the site integration (`ROOT/index.html`, a two-column grid with `background: 'transparent'`), no focal geometry intrudes on the headline/body copy column at any tested breakpoint above the mobile stack point (900px).

## 3. Material quality — manual

- [ ] The O's surface shows visible independent response to the key and rim lights — cross-check by comparing `?only=central` at a couple of `seek()` positions.
- [ ] Medallion smoked-glass plates (dark) show a plausible glass response (subtle specular, not matte flat black); frosted plates (`ess`, `tlg-consulting`) read as lighter/softer, not as a glowing lozenge (the code deliberately holds the frosted material just under the bloom threshold — verify it stays that way).
- [ ] Medallion bevelled edges show a metallic highlight distinct from the plate material.

## 4. Orbital quality — manual

- [ ] All five rings are simultaneously in continuous motion at visibly different relative speeds.
- [ ] Direction alternation (rings 0/2/4 vs. 1/3) is visually apparent, not so subtle it reads as one uniform spin.
- [ ] No two medallions visually overlap or collide for more than an instant at any point in a full cycle — automated coverage bounds this statistically (§0) but does not confirm it *looks* right.
- [ ] Ring tubes maintain consistent visual thickness around their full elliptical path.

## 5. Logo readability — manual

- [ ] All six partner logos are individually legible at the resting camera distance when not occluded.
- [ ] `ram-global` and `solr-energy` (both on ring 0) never visually merge or read as one shape when close together on screen.
- [ ] The two capsule wordmarks (`ess`, `velatech`) stay legible — verify their capped plaque width (`medallion.ts`'s `MAX_LOGO_WIDTH`) hasn't compressed the type illegibly small.
- [ ] `ess` and `tlg-consulting` (the two `plate: 'light'` overrides) retain good contrast against their frosted plate; the other four retain good contrast against the dark smoked plate.
- [ ] No logo ever renders mirrored, upside-down, or visibly sheared at any orbital position or camera angle (confirms the billboard quaternion cancellation in `OrbitingPartner.tsx`).

## 6. Lighting — manual

- [ ] The rim light behind the O is visible as a distinct highlight separating the O's silhouette from the starfield.
- [ ] Shadows (medium/high tier) are soft and subtle, not harsh or aliased, at `shadowMapSize` 1024/2048 respectively.
- [ ] No light produces blown-out highlights on the O or medallions at the resting camera angle.

## 7. Starfield — manual

- [ ] All three star layers are visually distinguishable by depth (size/parallax), not one flat layer.
- [ ] Star points render as soft circular falloff, not visible squares.
- [ ] Star density does not compete visually with the O/rings/medallions for attention.

## 8. Motion elegance — manual

- [ ] The O's ambient rotation/tilt/float is perceptible on close attention but not distracting at a glance.
- [ ] Pointer parallax feels damped and smooth, never twitchy or 1:1 with cursor movement.
- [ ] Scroll-driven dolly/tilt/lift/fade never feel like the composition is "flying" or "spinning out."
- [ ] Overall motion reads as ambient/atmospheric, appropriate for a hero sharing the viewport with page copy.

## 9. Mobile presentation — manual, cross-check against §0's automated frame-fit coverage

- [ ] At 390×844 and 430×932, the full composition (O + all rings) is inside frame and reads as intentional — automated coverage proves nothing clips, this item is about whether the resulting crop *looks* considered.
- [ ] The `low`-tier reduction (no shadows, no postprocessing, fewer stars) reads as a deliberately simpler variant, not a visibly broken one.
- [ ] Touch input does not trigger unintended pointer-parallax jumps — `usePointerParallax.ts` already refuses to attach a listener on coarse pointers; verify this holds on an actual touch device, not just the emulated Playwright viewport.
- [ ] On a 390-wide phone, confirm the known limitation is still true and hasn't regressed further: the hero sits **below** the headline copy in the page's stacked mobile layout (`ROOT/index.html`'s `.hero-grid` collapses to one column under 900px, copy first), so the mark is partly below the fold on first paint. This is a page-layout decision, not a hero bug — see `PROGRESS.md`.

## 10. Accessibility — partially automated

- [x] Automated: `prefers-reduced-motion: reduce` freezes the scene with every partner visible (`hero.spec.ts`).
- [x] Automated: every active partner name is present in the accessible DOM list (`hero.spec.ts`).
- [ ] Manual: toggle the OS/browser reduced-motion setting directly (not just Playwright's `emulateMedia`) and confirm the same freeze.
- [ ] Manual: keyboard-only navigation is not trapped by the canvas (the canvas is `aria-hidden="true"`, so it should never be a focus stop — verify no stray `tabindex`).
- [ ] Manual: no essential information is conveyed only via the 3D scene with no text equivalent — the partner list already covers names; check any future copy addition against this.

## 11. Genericness traps to avoid — manual

- [ ] Does not read as a "crypto token orbit" hero (avoid: saturated neon rim glow, flat gold/purple gradients, generic coin medallions).
- [ ] Does not read as a generic "solar system" / orrery template — the rings are already elliptical and inclined with varying speed by construction (§0 verifies this numerically); check the *visual* impression matches.
- [ ] Does not read as a stock "particle network" hero (avoid: line connectors between points).
- [ ] The central O is unmistakably a brand mark, not a generic ring/torus primitive.
- [ ] Bloom stays restrained (`intensity 0.26`, `luminanceThreshold 0.86`) — check it hasn't crept toward a "sci-fi UI" look during any future re-tune.
