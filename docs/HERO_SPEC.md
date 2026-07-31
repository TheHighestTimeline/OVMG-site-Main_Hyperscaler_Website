# Hero 3D — Specification

Status: as-built reference. This document, together with `ASSET_CONTRACT.md`, `MOTION_SPEC.md`, `QA_CHECKLIST.md`, `PERFORMANCE.md`, and `INTEGRATION.md`, describes the OVMG partner-orbit hero as it actually ships. Where this document and the running code in `hero3d/project/src` disagree, the code is authoritative — `heroConfig.ts` in particular is the single source of truth for every numeric constant named below.

## 1. Goals

- A real, dimensional Three.js scene — a central engraved "O" occluding five inclined elliptical orbital rings that carry six partner-logo medallions — replacing the flat CSS/SVG orbit widget that previously lived in the repo-root static site.
- Read as premium hyperscale-infrastructure / media-group brand work — restrained, cinematic, physically grounded.
- Ship as a small, self-contained ES module embeddable in the existing plain-HTML marketing site with zero build-tool coupling for the host page.
- Stay usable on integrated GPUs and mid-range mobile via an automatic quality tier, without visibly downgrading the desktop experience.

## 2. Non-goals

- No physics simulation. Each ring is a fixed, hand-tuned elliptical path (`heroConfig.ts` → `RINGS`); orbital motion is deterministic angle-over-time, not an n-body simulation.
- No CMS-driven content editing UI. Partner data changes are file edits (`partnerManifest.ts` + an image file), not an admin panel.
- No WebGPU renderer. WebGL2 via three.js (`^0.185.1`) is the only supported backend.
- No server-side rendering of the canvas. The scene mounts client-side only.
- No arbitrary camera controls (orbit/pan/zoom by the visitor). Camera motion is authored — a solved resting distance, damped pointer parallax, and a GSAP-observed scroll dolly/tilt — never visitor-driven free camera.

## 3. Repository layout

The static marketing site lives at the repo root (`index.html`, `about.html`, etc.) and is plain HTML/CSS/JS with no build step. The hero is developed as a separate Vite app and built down into two drop-in artifacts.

```
repo-root/
  index.html                    # mounts the hero into <div id="hero3d-root"> inside .hero3d-mount
  hero3d/
    index.html                  # standalone hero page (iframe / Framer embed target)
    hero3d.js                   # embed build output — a single ES module (vite.embed.config.ts)
    assets/                     # hashed CSS chunk + copied texture/partner assets hero3d.js references
    standalone/                 # standalone build output (vite.config.ts) — index-*.js / index-*.css
    screenshots/                # deterministic Playwright capture output, see capture.spec.ts
    tools/                      # standalone asset pipeline (its own package.json, only dep: sharp)
      prepare-assets.mjs
      README.md
    project/                    # Vite + React 19 + TypeScript source app — this is what is developed against
      src/
        hero/
          heroConfig.ts         # single source of truth: CENTRAL_O, RINGS, STAR_LAYERS, QUALITY_PROFILES,
                                 # RESPONSIVE_PROFILES, MOTION, PALETTE, DEFAULT_HERO_CONFIG
          partnerManifest.ts    # single source of truth for partner data (PARTNERS)
          heroRuntime.ts        # shared mutable animation-state object (HeroRuntime) + REDUCED_MOTION_POSE_SECONDS
          heroTelemetry.ts      # window.__OVMG_HERO__ read/seek hook for tests
          PartnerOrbitHero.tsx  # public React component — DOM shell, container-based responsive profile
          PartnerOrbitScene.tsx # everything inside <Canvas>: runtime driver, camera rig, postprocessing
          useHeroScroll.ts      # GSAP ScrollTrigger-observed scroll progress + IntersectionObserver pause
          usePointerParallax.ts # pointer position -> runtime, disabled on coarse pointers
          useReducedMotion.ts   # live prefers-reduced-motion tracking
          hero.css              # DOM-shell styling only, injected as a <style> tag (not imported as an asset)
        three/
          central/createCentralO.ts       # lathe geometry for the central O
          orbits/framing.ts                # camera-distance solver
          orbits/medallion.ts              # disc/capsule plaque geometry
          orbits/orbitalMath.ts            # pure orbital math (ellipse, inclination, damping)
          orbits/OrbitalSystem.tsx         # per-ring tube meshes + per-partner medallions
          materials/heroMaterials.ts       # medallion plate/edge/logo/ring materials
          materials/proceduralStone.ts     # central-O stone materials + baked maps
          materials/heroEnvironment.ts     # in-scene-authored PMREM environment map
          stars/Starfield.tsx              # shader-based point-sprite star layer
          stars/AtmosphericParticles.tsx   # near dust layer + graded backdrop plane
          lighting/HeroLighting.tsx        # key/rim/fill/bounce/kicker lighting rig
          utils/performanceTier.ts         # device-signal quality scoring
          utils/assetLoader.ts             # texture loading, asset-base resolution, issue reporting
        embed.ts                # entry point built to hero3d/hero3d.js
        main.tsx                # dev-only mount for the Vite app itself
      public/
        brand/o-metrics.json    # measured geometry of the source O raster
        partners/<id>.webp      # one file per partner, never atlased
        partners/assets.json    # per-logo width/height/aspect/tone, generated by prepare-assets.mjs
        textures/               # baked stone/relief maps consumed by proceduralStone.ts
      tests/
        unit/                  # vitest: orbitalMath.test.ts, partnerManifest.test.ts, responsive.test.ts
        e2e/                   # Playwright: hero.spec.ts, capture.spec.ts, site.spec.ts, helpers.ts
      scripts/
        find-static-pose.mjs   # picks REDUCED_MOTION_POSE_SECONDS
        perf-probe.mjs         # measures draw calls/triangles/frame time per quality tier
        clustering-scan.mjs, clustering-search.mjs
      package.json
      vite.config.ts           # standalone build (outDir ../standalone)
      vite.embed.config.ts     # embed library build (outDir .., fileName hero3d.js)
      playwright.config.ts
      tsconfig.json
```

## 4. Scene graph

`PartnerOrbitScene.tsx` composes the `<Canvas>` contents; `RuntimeDriver` runs at `useFrame` priority `-1` so every other frame callback in the tree reads an already-advanced clock and damped pointer that frame.

```
<Canvas>
  <RuntimeDriver />                 # advances runtime.elapsed, damps pointer/scroll, snapshots gl.info
  <CameraRig />                     # solves camera distance per-frame from real scene extents
  <HeroLighting />                  # hemisphere/ambient + 5 directional/point lights, one shadow caster
  <AtmosphericParticles />          # near dust layer + graded backdrop plane (dark mode only)
  <StarLayer /> x2                  # distant + mid layers (near layer lives inside AtmosphericParticles)
  <group scale=systemScale rotation.z=systemRoll name="hero-system">
    <CentralOVMGLogo />             # lathed stone annulus + carved face + inner rim
    <OrbitalSystem>                 # 5 ring tube meshes + 6 partner medallion groups
  </group>
  <TelemetryReporter />             # publishes window.__OVMG_HERO__ state, ~6Hz (every 10th frame)
  <EffectComposer>                  # Bloom + Vignette, high/medium tiers only
</Canvas>
```

### 4.1 Central O

- Geometry (`src/three/central/createCentralO.ts`): a `THREE.LatheGeometry` revolved from a closed 2D profile (`buildProfile()`) in the (radius, depth) half-plane — inner bevel, recessed carved band, outer bevel, back face, back inner chamfer. This is real geometric relief, not a texture on a torus or a flat plane. Because a lathe is revolved 360° around one axis, the body is exactly rotationally symmetric; see §4.1.1 for what that constrains.
- `CENTRAL_O` (`heroConfig.ts`): `outerRadius 1.3`, `innerRadius 0.724`, `depth 0.175` (half-depth — the O spans `-depth..+depth` along Z), `bandInner 0.72`, `bandOuter 0.96` (fractions of `outerRadius`, clamped against the bevels by `bandRadii()`), `faceLip 0.014`, `innerBevelDrop 0.058`, `bandRecess 0.028`, `edgeBevel 0.032`, `reliefDepth 0.023`.
  - `outerRadius`/`innerRadius` come from measuring the supplied 460×460 brand raster (`hero3d/project/public/brand/o-metrics.json`: `innerRadiusNorm 0.5571` → `0.724 / 1.30`).
  - The carved band (`bandInner`/`bandOuter`) is derived from the geometry itself rather than the raw measured `patternInnerNorm`/`patternOuterNorm` (0.560–0.994): painting the measured inner bevel onto a flat face while also modelling a real chamfer doubled it, which read as a rounded tube. The band is taken from where the glyphs actually begin (0.72) instead.
- Face: a `THREE.RingGeometry` (`bandInnerRadius..bandOuterRadius`) with a planar XY→UV projection matched to the source raster's square framing, carrying the baked relief/normal/roughness/AO/albedo maps (see `ASSET_CONTRACT.md`).
- A `THREE.TorusGeometry` inner rim sits just inside the bore as a hairline catch-light.
- Materials (`src/three/materials/proceduralStone.ts`): `MeshStandardMaterial` body (`roughness 0.88`, `metalness 0.05`) and face (`roughness 0.82`, `metalness 0.045`, displaced by the baked relief map, `displacementScale = reliefDepth * reliefScale`). A `MeshBasicMaterial` inner-glow plane adds a restrained cool bounce inside the opening.
- Motion budget (`CENTRAL_O`): `spinSpeed 0.0125` rad/s, `spinAmplitude 0.052` rad (~3°), `floatAmplitude 0.022` world units, `floatSpeed 0.21`, `tiltAmplitude 0.026` rad. See `MOTION_SPEC.md`.
- Depth: the O is a real opaque mesh in the depth buffer. Rings and medallions passing behind it are occluded by the renderer's own depth test (`heroTelemetry` even reports `occludedByCentral` per partner by ray-testing against a bounding sphere of radius `CENTRAL_O.outerRadius`).

#### 4.1.1 Silhouette: raster-plus-relief today, plug-in point for a vector outline

The current silhouette is exact measured circle geometry (`bandRadii()`/`buildProfile()` in `createCentralO.ts`), with the *engraving* — not the outer shape — carried by the baked relief map derived from the supplied raster (`hero3d/tools/prepare-assets.mjs`, part B). A true vector (SVG) outline of the mark would let the decorative cut-outs break the silhouette itself instead of only the surface relief.

That upgrade is constrained by the current geometry choice: `createCentralO.ts` builds the body with `THREE.LatheGeometry`, which is inherently rotationally symmetric — it cannot express a non-circular contour no matter what profile is fed to it. Plugging in a real outline means replacing the lathe revolve with a swept/extruded solid built from the traced 2D contour (the codebase already has a working precedent for exactly this shape of construction: `src/three/orbits/medallion.ts`'s `acquirePlaqueGeometry()` builds a capsule plaque via `THREE.ExtrudeGeometry` from a `THREE.Shape` outline). The two changes that would land: `buildProfile()`/`bandRadii()` in `createCentralO.ts` would need to consume outline path data instead of `outerRadius`/`innerRadius` circle math, and the lathe revolve would become an extrude of that outline with the existing bevel/recess cross-section swept along it rather than around a single axis.

### 4.2 Orbital rings

Five rings (`RINGS` in `heroConfig.ts`), each a true 3D ellipse: independent `radiusX`/`radiusZ`, a `y` plane offset, independent `inclinationX`/`inclinationZ` plane tilts, a fixed `phase`, a `direction` (±1), and a time-based `angularSpeed` in rad/s. The plane math (`src/three/orbits/orbitalMath.ts`) applies inclination in the same Euler `'XYZ'` composition three.js uses for the ring group's own `rotation`, so the drawn tube and the orbiting medallions can never drift apart (verified in `tests/unit/orbitalMath.test.ts` against `THREE.Euler`).

Each ring renders as one tube mesh (shared geometry, one draw call) via `OrbitalSystem`; medallions are positioned each frame from `orbitalPositionAtTime()`. Inclinations deliberately alternate in sign and vary in magnitude so, combined with the camera elevation, some rings read wide-open and others near edge-on. See `MOTION_SPEC.md` §3 for the full table.

### 4.3 Partner medallions

Six partner logos, each on a plaque (`src/three/orbits/medallion.ts`): a disc for aspect ratios ≤ `WIDE_ASPECT` (2.2), a rounded capsule above it. The plaque is a `THREE.ExtrudeGeometry` (rounded outline, bevelled) with two material groups — group 0 the front/back face (smoked or frosted glass), group 1 the bevelled edge (machined metal) — plus a separate logo plane. Plaque geometry is cached and reference-counted (`acquirePlaqueGeometry`) so two partners sharing plaque proportions share one set of buffers. Logo aspect ratio is always preserved; the plaque adapts to the logo, never the reverse. Assignment of partner → ring/phase/scale/tone/plate is entirely data-driven from `partnerManifest.ts`; see §6 and `ASSET_CONTRACT.md`.

### 4.4 Starfield

Three `StarLayer` instances (`distant`, `mid`, `near`) plus a graded backdrop plane, all in `heroConfig.ts` → `STAR_LAYERS`. Each is a `THREE.Points` field using a custom circular-falloff fragment shader (not square GPU sprites), with independent count, size, brightness, twinkle, softness, and pointer/scroll parallax coefficients. `distant` and `mid` render directly in `PartnerOrbitScene`; `near` renders inside `AtmosphericParticles` alongside the graded backdrop. See `MOTION_SPEC.md` §5.

### 4.5 Lighting

`HeroLighting.tsx`: a hemisphere light, a low ambient, a cool-white key directional light (the only shadow caster), a cool-blue rim light from behind-left, a broad low-intensity fill from front-right, a deep-blue point-light bounce from below, a restrained warm point-light kicker, a low back-rim directional light, and a small point light grazing the inner chamfer only. The key and rim lights drift by a fraction of a radian over time and with pointer position so highlights on the stone are never static.

### 4.6 Postprocessing

`@react-three/postprocessing`'s `EffectComposer` with `Bloom` (`intensity 0.26`, `luminanceThreshold 0.86`, `luminanceSmoothing 0.16`, `KernelSize.MEDIUM`, `mipmapBlur`) and `Vignette` (`offset 0.26`, `darkness 0.66`). Enabled on the `high` and `medium` quality tiers (`QUALITY_PROFILES[tier].postprocessing`); fully skipped — the composer is not constructed — on `low`. `multisampling` is 4 on `high`, 0 on `medium`.

## 5. Config surface (`heroConfig.ts` / `HeroConfig`)

`PartnerOrbitHero` accepts `Partial<HeroConfig>` as props, merged onto `DEFAULT_HERO_CONFIG`:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `layout` | `'full-bleed' \| 'copy-left' \| 'copy-right' \| 'centered'` | `'full-bleed'` | Sets a CSS modifier class (`ovmg-hero--<layout>`); `copy-left`/`copy-right` also let the CSS-level safe-zone padding (`--ovmg-safe-left`/`--ovmg-safe-right`) clip the canvas edge. |
| `background` | `'dark' \| 'transparent'` | `'dark'` | `dark` clears to `#05070d` and shows the CSS gradient backdrop plus `AtmosphericParticles`' graded plane; `transparent` clears alpha 0 and masks the canvas edges with a radial gradient so it dissolves into the host page. |
| `height` | `string` | `'100%'` | CSS height of the hero's root element. |
| `minHeight` | `string` | `'420px'` | CSS min-height floor. |
| `centralOffset` | `[number, number, number]` | `[0, 0, 0]` | Present in the type; not currently read by any render path (the system group is positioned by `offsetX`/`offsetY` on the responsive profile instead — see §7). |
| `cameraTarget` | `[number, number, number]` | `[0, -0.03, 0]` | Present in the type; the live camera target actually used each frame is `profile.offsetX, profile.targetY + profile.offsetY, 0` from the active `ResponsiveProfile` (`CameraRig` in `PartnerOrbitScene.tsx`). |
| `motionIntensity` | `number` | `1` | Multiplies the central O's ambient rotation/tilt/float amplitude (`CentralOVMGLogo.tsx`) and is passed as the `speedScale` argument to every partner's `orbitalPositionAtTime()` call (`OrbitingPartner.tsx`), so it scales orbital angular speed too. Not clamped to `0..1` at the type level — the standalone app's `?speed=<n>` debug query (`App.tsx`) feeds values up to `22` through this same field to fast-forward the orbit for screenshot capture. |
| `pointerResponse` | `number` | `1` | `0` (or `reducedMotion`) disables the pointer listener entirely (`usePointerParallax`) and zeroes `runtime.pointerResponse`, which gates camera yaw/pitch, star parallax, and the atmospheric backdrop drift. |
| `scrollResponse` | `number` | `1` | `0` (or `reducedMotion`) skips creating the `ScrollTrigger` (`useHeroScroll`) and zeroes `runtime.scrollResponse`, gating camera dolly/lift/tilt, star scroll parallax, and the fade terms. |
| `quality` | `QualityTier \| 'auto'` | `'auto'` | Resolved via `resolveQualityProfile()` (`src/three/utils/performanceTier.ts`) into one of `QUALITY_PROFILES`. |
| `labels` | `boolean` | `false` | Present in the type; not currently read by any render path (partner names are always exposed via the accessible `<ul>`, independent of this flag). |
| `safeZone` | `{ left, right, top, bottom }` (percent) | all `0` | Written as CSS custom properties `--ovmg-safe-left`/`--ovmg-safe-right`, consumed only by `.ovmg-hero--copy-left`/`--copy-right` in `hero.css`. `top`/`bottom` are present in the type but not consumed by any current CSS rule. |

The **responsive profile is chosen from the hero's own container width via a `ResizeObserver`**, not `window.innerWidth` — see §7. Numbers not listed as a named `HeroConfig` field (ring geometry, star counts, DPR caps, camera solve parameters, etc.) are internal constants sourced from `heroConfig.ts`; see `MOTION_SPEC.md` and `PERFORMANCE.md` for their shipped values.

## 6. Partner data contract

Partner content is entirely separated from scene code. See `ASSET_CONTRACT.md` §3 for the full `PartnerDefinition` interface and asset rules. Six partners (`ram-global`, `solr-energy`, `tlg-consulting`, `bright-sun-solar`, `ess`, `velatech`) are declared in `hero/partnerManifest.ts` (`PARTNERS`); each owns one untouched, un-atlased texture file at `public/partners/<id>.webp`. Ring assignment follows the artwork, not the alphabet — see `MOTION_SPEC.md` §4 for the shipped ring/phase table and §4.1 below for why two of the six use a capsule plaque instead of a disc. Changing a logo is a one-file edit; adding a partner is one new manifest entry plus one file. No scene component contains partner-specific logic or hardcoded logo paths. `validateManifest()` runs on every mount and logs any ring-range, duplicate-id, or same-ring-clustering issue to the console (`error` blocks nothing at runtime; `warning` is advisory).

## 7. Responsiveness

`resolveResponsiveProfile(width)` picks the narrowest `ResponsiveProfile` in `RESPONSIVE_PROFILES` whose `maxWidth` is ≥ the measured width (`phone-sm ≤400`, `phone ≤540`, `tablet ≤820`, `laptop ≤1280`, `desktop` = everything wider). `PartnerOrbitHero`'s `useContainerProfile()` hook measures the hero's own root element via `ResizeObserver` (with an `orientationchange` listener as a fallback trigger), not `window.innerWidth` — the hero is not always full-bleed: on the marketing page it occupies one column of a two-column grid, so a 1440-wide window can hand it a ~560-wide box, and keying off `window.innerWidth` there previously gave it the desktop profile squeezed into half the width.

Each profile carries `cameraElevation`, `cameraYaw`, `systemRoll`, `orbitSpreadX`, `orbitSpreadZ`, `framePadding`, `minCameraDistance`, `maxCameraDistance`, `fov`, `systemScale`, `targetY`, `offsetX`/`offsetY`, `medallionScale`, and `starDensity` — see `MOTION_SPEC.md` §3.1 for the full table. Tested breakpoints across the unit and Playwright suites: 390×844, 430×932, 768×1024, 1440×900, 1920×1080.

**Camera distance is solved, not hard-coded.** `CameraRig` (`PartnerOrbitScene.tsx`) calls `computeSystemExtents()` then `fitCameraDistance()` (`src/three/orbits/framing.ts`) every time the partner set, responsive profile, or canvas aspect changes: it samples every ring's ellipse (240 points/ring) plus each partner's real plaque half-extent, projects onto the camera's own screen-plane basis, and solves the smallest distance (clamped to `[minCameraDistance, maxCameraDistance]`) at which every sample fits the current FOV/aspect under exact perspective math — not an orthographic approximation. `minCameraDistance`/`maxCameraDistance` are therefore floors/ceilings on the solved value, not the value itself.

## 8. Accessibility and motion preference

`prefers-reduced-motion: reduce` (or the `forceReducedMotion` debug prop) freezes `runtime.elapsed` at `REDUCED_MOTION_POSE_SECONDS` (`530`, see `MOTION_SPEC.md` §8), zeroes pointer and scroll response, and holds every partner motionless in that single authored pose — chosen by `scripts/find-static-pose.mjs` specifically so no medallion sits inside the mark's opening or crowds another medallion, on both the desktop and phone-sm breakpoints. The canvas itself is `aria-hidden`; every active partner name is exposed via a visually-hidden `<ul>` (`.ovmg-hero__a11y`) regardless of motion state, so assistive technology never depends on the 3D scene rendering at all.
