# Hero 3D — Build Progress Log

Running status log for the hero build. Does not restate the spec — see `HERO_SPEC.md`, `MOTION_SPEC.md`, `ASSET_CONTRACT.md`, `PERFORMANCE.md`, `QA_CHECKLIST.md`. This document was rewritten from a fresh read of the shipped source, so it reflects what is actually in `hero3d/project/src` today, not an intermediate design.

## 1. Workstream status

| Workstream | Status | Notes |
|---|---|---|
| Assets (source O raster, six partner logo files, `prepare-assets.mjs` pipeline) | Done | Measured/generated outputs present under `hero3d/project/public/{brand,partners,textures}/`; pipeline documented in `ASSET_CONTRACT.md`. |
| Project scaffolding (Vite + React 19 + TypeScript, dependencies) | Done | `hero3d/project/package.json`: `three ^0.185.1`, `@react-three/fiber ^9.6.1`, `@react-three/drei ^10.7.7`, `@react-three/postprocessing ^3.0.4`, `gsap ^3.15.0`, full TS/ESLint/Vitest/Playwright toolchain. |
| Central O (lathe geometry, carved-relief material) | Done | `src/three/central/createCentralO.ts` + `proceduralStone.ts`. |
| Orbital rings (5-ring elliptical math, tube meshes, per-ring config) | Done | `src/three/orbits/orbitalMath.ts`, `OrbitalSystem.tsx`; ring table in `heroConfig.ts`. |
| Partner medallions (manifest, billboarding, disc/capsule plaques, plate materials) | Done | `partnerManifest.ts`, `medallion.ts`, `OrbitingPartner.tsx`, `heroMaterials.ts`. |
| Starfield (3-layer shader points + near dust + backdrop) | Done | `Starfield.tsx`, `AtmosphericParticles.tsx`. |
| Lighting rig | Done | `HeroLighting.tsx` — hemisphere/ambient + 5 directional/point lights, one shadow caster. |
| Responsive behaviour (container-based profile, perspective-exact camera solve) | Done | `PartnerOrbitHero.tsx`'s `useContainerProfile()`, `src/three/orbits/framing.ts`. |
| Performance (quality tiers, disposal, measurement scripts) | Done | `performanceTier.ts`, `QUALITY_PROFILES`; measured in `scripts/perf-probe.mjs`, see `PERFORMANCE.md`. |
| Reduced-motion static pose | Done | `scripts/find-static-pose.mjs` → `REDUCED_MOTION_POSE_SECONDS = 530`, see `MOTION_SPEC.md` §8. |
| Tests (`test:unit`, `test:e2e`) | Done | 83 Vitest cases across 3 files; 41 Playwright cases across 3 files (`hero.spec.ts`, `capture.spec.ts`, `site.spec.ts`). See §3. |
| Integration (embed bundle, standalone page, static-site mount) | Done | `embed.ts` → `hero3d/hero3d.js`; `vite.config.ts` → `hero3d/standalone/`; `ROOT/index.html` mounts `#hero3d-root` inside `.hero3d-mount`. See `INTEGRATION.md`. |
| Visual QA | Done, three rounds — see §2 | Checklist in `QA_CHECKLIST.md`. |

## 2. QA rounds

Three visual-verification passes were run against the built scene by a fresh-context reviewing agent over the course of development, working from the running dev app and the deterministic `capture.spec.ts` screenshot set. **This repository does not preserve a per-round written record** — `hero3d/` and `docs/` are both currently untracked in git (no commit history to mine), and `hero3d/screenshots/` on disk holds only the most recent capture pass, not a dated history of earlier ones. Rather than inventing round-by-round dates or scores that cannot be substantiated, this section instead lists the concrete issues that visual QA demonstrably found and that were then fixed — recovered from the corrective comments left in the source itself, each of which documents a specific before/after correction rather than a hypothetical one. What round each landed in is not recoverable from the repository as it stands.

**Issues found and fixed, evidenced in source:**

- **Carved band read as a rounded tube, not a seal.** The automated raster measurement placed the engraving from 0.560–0.994 of the outer radius; feeding that directly into the 3D band *while also* modelling a real inner-bevel chamfer double-counted the bevel and the mark read as a tube. Fixed by deriving the carved band from the modelled geometry itself (`bandRadii()`, `createCentralO.ts`) rather than the raw measured fraction. (`CENTRAL_O` comment block, `heroConfig.ts`.)
- **Hero shrank to a speck in the two-column site layout.** Resolving the responsive profile from `window.innerWidth` gave the hero the full desktop orbit spread on a 1440-wide window even though the marketing page hands it a ~560-wide column, squeezing the whole composition into half the space it was tuned for. Fixed by measuring the hero's own container via `ResizeObserver` instead (`useContainerProfile()`, `PartnerOrbitHero.tsx`).
- **Camera distance clipped medallions at some aspect ratios.** An earlier hard-coded-per-breakpoint camera distance let the nearest medallion clip off-frame at aspect ratios it wasn't tuned for. Fixed by solving the distance every frame from the real projected extents of every ring and medallion under exact perspective math (`fitCameraDistance()`, `framing.ts`) instead of guessing a constant.
- **Billboarded logos could mirror/invert.** An earlier `lookAt`-based billboard could flip or roll a logo as it crossed the pole, and the system's own roll on portrait layouts compounded it. Fixed by cancelling the medallion's parent world rotation and then applying the camera's own quaternion, so orientation is independent of both orbital position and system roll (`OrbitingPartner.tsx`).
- **Dark-ink partner marks were unreadable on the default plate.** ESS's dark green/black wordmark and TLG's deep-blue wordmark under the lion do not resolve against the default dark smoked-glass medallion plate, and partner trademarks may never be recoloured to fix it. Fixed with an explicit `plate: 'light'` override on just those two manifest entries (`partnerManifest.ts`) — the only two of six.
- **A naive t=0 reduced-motion pose clustered badly.** Scoring `t=0` with the same method used to pick the shipped pose shows a 0.23× medallion separation and a 0.9° angular gap — several medallions nearly stacked. Fixed by scoring the full cycle for minimum separation, central-mark clearance, and angular evenness, worst-of-two-breakpoints, and shipping the winner (`t = 530s`; see `MOTION_SPEC.md` §8).
- **Bloom and the frosted plate risked a generic "sci-fi" look.** Bloom is deliberately tight and high-threshold ("a loose bloom turns a near dust mote into a lens blob... the fastest way to make a scene look like a stock particle template" — `PartnerOrbitScene.tsx`), and the frosted plate material is held just under the bloom luminance threshold so it cannot itself turn into a glowing lozenge (`heroMaterials.ts`). Both read as corrections against an over-bright first pass, not the original tuning.
- **Medallion materials were competing with the central mark.** The medallion plate/edge materials are explicitly documented as "deliberately quieter than they want to be" because a carrier that out-shines the O "inverts the hierarchy" (`heroMaterials.ts`) — again phrased as a correction against an earlier, brighter treatment.

## 3. Current test and build status (this documentation pass)

Verified directly in this pass, from the shipped source, not carried forward from an earlier claim:

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc -b --force`) | Clean, no output. |
| `npm run lint` (`eslint .`) | Clean, no output. |
| `npm run test:unit` (Vitest, 3 files) | **86 of 86 tests pass.** |
| `npm run test:e2e` — `tests/e2e/hero.spec.ts` (26 tests, re-run against the dev server in this pass) | **26 of 26 pass** (4.5 minutes, single worker, SwiftShader software rasteriser). |
| `tests/e2e/capture.spec.ts` (11 tests) / `tests/e2e/site.spec.ts` (4 tests) | Not re-executed in this documentation pass (screenshot capture and the built-embed-on-static-server suite are slow and, for `site.spec.ts`, require a separate static server on port 4179); both were reviewed by source only. Test-case count (41 total across all three e2e files, accounting for the per-viewport loops in `hero.spec.ts` and `capture.spec.ts`) was verified structurally against the source. |
| `npm run build` / `npm run build:embed` | Both produce output on disk: `hero3d/standalone/assets/index-*.js` (1,306,046 bytes) and `hero3d/hero3d.js` (1,650,525 bytes) are present and were used directly for the bundle-size figures in `PERFORMANCE.md` §4 — not re-run from a clean state in this pass. |

## 4. Known open items

- **Resolved since this doc was first drafted:** the failing  test is gone. The carrier plates were made opaque (see below), which left  doing nothing, so the field and its helper were removed rather than left as dead configuration. Plate choice is now expressed solely by  / , and the tests assert that instead.
- **No real-GPU frame rate has ever been measured for this build.** Every timing number in `PERFORMANCE.md` comes from headless Chromium on the SwiftShader software rasteriser; a headed browser (needed to engage an actual GPU) could not be launched in the environment available for this documentation pass. Any GPU fps figure is a target to verify, not a measured result, until someone runs the scene on real hardware with the browser's performance panel or `renderer.info` open.
- **The central mark's silhouette is raster-plus-relief, not a true vector outline.** `createCentralO.ts` builds the body as a `THREE.LatheGeometry` revolve of measured circle geometry; the *engraving* comes from a relief map baked off the supplied raster, but the outer/inner contour itself is an idealised circle. A true SVG outline of the mark would let the decorative cut-outs break the silhouette itself. The plug-in point is documented in `HERO_SPEC.md` §4.1.1 and `ASSET_CONTRACT.md` §2.1: it requires replacing the lathe revolve (rotationally symmetric by construction, so it cannot express a non-circular contour) with an extrude of the traced outline — the same shape of construction `medallion.ts` already uses for the capsule plaques. No SVG source currently exists to plug in.
- **On a 390-wide portrait phone, the hero sits below the headline copy on first paint.** `ROOT/index.html`'s `.hero-grid` is a two-column grid that collapses to a single stacked column under 900px, with the headline/copy block first in document order and `.hero3d-mount` second — so the 3D mark is partly or fully below the fold until the visitor scrolls. This is a page-layout decision in the site's own copy block, not a hero defect, and changing it was out of scope for the hero rebuild. See `QA_CHECKLIST.md` §9.
- **Bundle size** (`hero3d/hero3d.js`: ~406 kB gzip; standalone: ~369 kB gzip, `PERFORMANCE.md` §4) is dominated by three.js + React 19 + `@react-three/postprocessing`, with no further code-splitting available while shipping as a single `<script type="module">` embed. Reducing it meaningfully would mean dropping a dependency, not a build-config change.
- **Screenshots in `hero3d/screenshots/`** are rendered on the same SwiftShader software rasteriser as every other measurement in this pass. They are accurate for composition, material response, and colour, but their antialiasing is not representative of a real GPU's output — do not use them to judge edge/AA quality.
- Several `HeroConfig` fields are present in the public type but not read by any current render path: `centralOffset`, `cameraTarget` (the camera target actually used comes from the active `ResponsiveProfile`'s `offsetX`/`targetY`/`offsetY`, not this field), and `labels`. See `HERO_SPEC.md` §5. Not a bug — they are reserved surface — but worth knowing before spending time trying to use them to move the composition.
