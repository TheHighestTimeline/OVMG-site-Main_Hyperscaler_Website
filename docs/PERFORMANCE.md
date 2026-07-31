# Hero 3D — Performance Budget

Tier definitions, measurement method, and measured results for the hero scene. `heroConfig.ts`'s `QUALITY_PROFILES` is the authority for every number in §2; this document records how the shipped values were measured and what they produced.

## 1. Measurement caveat — software rasteriser, not a GPU benchmark

Every number in §3 was captured by `hero3d/project/scripts/perf-probe.mjs`, which launches headless Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. SwiftShader is a **software** rasteriser — every fragment is shaded on the CPU. That makes the frame-time (`frameMs`) column a **worst-case floor**, not a representative GPU frame rate: a real integrated or discrete GPU will render the same scene dramatically faster. Draw-call, triangle, program, geometry, and texture counts are exact regardless of rasteriser, since those are renderer-state facts, not timing.

A real-GPU frame-rate measurement was not possible in the environment this documentation pass was produced in: headed Chromium (needed to engage an actual GPU) could not be launched. **No GPU fps number in this document is a measured result** — any target frame rate stated here is a target to verify on real hardware, not a claim already substantiated by a run.

## 2. Quality tier table (`QUALITY_PROFILES`, `heroConfig.ts`)

| Parameter | `low` | `medium` | `high` |
|---|---|---|---|
| `maxDpr` | 1.5 | 1.75 | 2.0 |
| `shadows` | false | true | true |
| `shadowMapSize` | 512 | 1024 | 2048 |
| `postprocessing` | false | true | true |
| `bloom` | false | true | true |
| `faceThetaSegments` (O carved band) | 320 | 480 | 720 |
| `faceRadialSegments` | 22 | 30 | 44 |
| `bodySegments` (O lathe) | 96 | 128 | 192 |
| `ringTubularSegments` | 180 | 280 | 420 |
| `ringRadialSegments` | 5 | 6 | 8 |
| `starDensity` (multiplier on `STAR_LAYERS` counts) | 0.46 | 0.72 | 1.0 |
| `medallionSegments` (plaque bevel curve segments) | 40 | 56 | 72 |
| `anisotropy` | 2 | 4 | 8 |

Every parameter degrades monotonically low→high (asserted in `tests/unit/responsive.test.ts`). Tier resolution (`src/three/utils/performanceTier.ts`):

- `resolveQualityProfile(requested, signals)` returns `QUALITY_PROFILES[requested]` directly unless `requested === 'auto'`, in which case it calls `scoreDevice()`.
- `scoreDevice()` forces `low` unconditionally if `navigator.connection.saveData` is set, or if the unmasked WebGL renderer string matches `/swiftshader|llvmpipe|software|basic render/i` (so a software-rendered browser — including this doc's own measurement environment — always gets the cheapest tier regardless of any other signal).
- Otherwise it sums a score from `hardwareConcurrency` (0/1/2), `deviceMemory` (0/1/2, or `1` if unknown), and `viewportWidth` (0/1/2), then subtracts 1 for a coarse pointer and a further 1 if `devicePixelRatio ≥ 3` on a coarse pointer. `score ≥ 5` → `high`, `score ≥ 2` → `medium`, else `low`.
- The DPR actually handed to the WebGL renderer is `clampDpr()`: `min(profile.maxDpr, max(1, devicePixelRatio))`.

## 3. Measured results (`scripts/perf-probe.mjs`, SwiftShader software rasteriser)

| tier | viewport | drawCalls | triangles | programs | geometries | textures | stars | frameMs |
|---|---|---|---|---|---|---|---|---|
| high | 1920×1080 | 67 | 134,719 | 31 | 19 | 35 | 3990 | 37.4 |
| high | 1440×900 | 67 | 134,719 | 30 | 19 | 35 | 3990 | 45.7 |
| medium | 768×1024 | 67 | 75,583 | 30 | 19 | 35 | 2241 | 47.8 |
| low | 390×844 | 37 | 37,614 | 25 | 18 | 16 | 1010 | 16.6 |

Read `frameMs` as "how long a software rasteriser takes," not as a GPU frame budget — the `low` tier's lower `frameMs` here is explained entirely by it having 30 fewer draw calls and no postprocessing, not by any GPU-relevant optimisation being absent at `high`.

The 67 vs. 37 draw-call split: the scene itself costs **37 draw calls** at every tier (5 ring tubes, 6 medallions at two material groups plus a logo mesh each = 18, 3 central-O meshes, 3 star-layer point clouds, the atmospheric backdrop plane, plus the shadow-map pass) — identical to what `low` reports, since `low` has both `postprocessing: false` and `shadows: false`. `medium`/`high` add **~30 more small draw calls** for the bloom pass's mipmap-chain blur (`Bloom`'s `mipmapBlur: true` in `PartnerOrbitScene.tsx`) — cheap individually, but real draw calls, which is why the Playwright performance-budget test (`tests/e2e/hero.spec.ts`) asserts the `low`-tier and full-postprocessing budgets separately (`≤40` and `≤70` respectively) rather than hiding the difference behind one shared number.

Other budgets that test enforces at the `high` tier: `textures ≤ 40`, `geometries ≤ 28`, `triangles ≤ 200,000` — all comfortably above the measured `35`/`19`/`134,719`.

## 4. Bundle size

Measured directly from the built artifacts in this repository (`npm run build:all`):

| Artifact | Raw | Gzip |
|---|---|---|
| `hero3d/hero3d.js` (embed build, `vite.embed.config.ts`) | 1,650,525 bytes (~1650 kB) | 406,264 bytes (~406 kB) |
| `hero3d/standalone/assets/index-*.js` (standalone build, `vite.config.ts`) | 1,306,046 bytes (~1306 kB) | 368,672 bytes (~369 kB) |

Both bundles are dominated by three.js, React 19, and `@react-three/postprocessing`; there is no code-splitting opportunity within a single-file embed target (`inlineDynamicImports: true` in `vite.embed.config.ts` is deliberate — the embed ships as one `<script type="module">` with no companion chunk-loading logic on the host page). The embed build additionally sets `process.env.NODE_ENV = 'production'` explicitly, since Vite's library mode does not substitute it automatically — without that define, React's development build would ship, which is both larger and measurably slower.

## 5. Structural performance rules (verified in source)

- Geometries and materials are created once per distinct configuration and shared/cached: `acquirePlaqueGeometry()` (`medallion.ts`) reference-counts plaque geometry by shape/size/segment key so two partners with matching plaque proportions share one buffer set; `createCentralO()`, `createStoneMaterials()`, `createMedallionMaterials()` are each called once via `useMemo`, keyed on the quality profile.
- No per-frame allocation in the hot paths: `orbitalMath.ts`'s functions all write into a caller-supplied `out: Vec3` rather than allocating; `PartnerOrbitScene.tsx`/`OrbitingPartner.tsx` reuse module-scoped `THREE.Vector3`/`THREE.Quaternion` scratch objects (`targetVector`, `worldPosition`, `parentQuaternion`, `ndc`, `ray`) across frames.
- No React state drives per-frame animation. `HeroRuntime` (`heroRuntime.ts`) is one plain mutable object read and written inside `useFrame`; the component tree re-renders on mount and on responsive-profile/quality changes only.
- The render loop's own cost is gated by visibility: `useHeroScroll.ts`'s `IntersectionObserver` (120px margin) and the `visibilitychange` listener both set `runtime.paused = true`, which stops `elapsed` from accumulating — though note this pauses the *animation clock*, not the R3F `frameloop`, which is set to `"always"` (`PartnerOrbitHero.tsx`); an off-screen hero still issues frames, it just renders a static pose while doing so.
- Postprocessing is skipped structurally, not just visually, on `low`: `runtime.quality.postprocessing` gates whether `<EffectComposer>` is constructed at all (`PartnerOrbitScene.tsx`), not merely whether it's visible.

## 6. Disposal

- `PartnerOrbitHero.tsx` calls `disposeTextureCache()` (`assetLoader.ts`) on unmount, which disposes every cached `THREE.Texture` and clears the asset-issue log.
- Every geometry/material factory in `src/three/` returns a `dispose()` that is wired to the owning component's cleanup effect: `createCentralO()`, `createStoneMaterials()`, `createMedallionMaterials()`, `acquirePlaqueGeometry()` (reference-counted — only physically disposed when the last referencing partner unmounts), `createHeroEnvironment()` (disposes its `PMREMGenerator` render target), and each `StarLayer`'s geometry/material.
- React Three Fiber owns `WebGLRenderer` disposal on `<Canvas>` unmount; nothing in this codebase disposes the renderer manually.
- No explicit teardown test exercises "zero console errors after a full unmount/remount cycle" today; the closest coverage is `tests/e2e/hero.spec.ts`'s "survives a live resize between breakpoints" test, which resizes across three breakpoints in one page session and asserts no console errors accumulate.

## 7. Known limitations

- **No real-GPU frame rate has been measured for this build.** §1 explains why; treat any GPU fps figure quoted elsewhere (in a proposal, a meeting, marketing copy) as an unverified target until it is re-measured with a headed browser on representative hardware.
- Bundle size (~406 kB gzip for the embed, §4) is dominated by three.js + React + postprocessing and has no further code-splitting lever available while shipping as a single `<script type="module">` file; reducing it further would mean dropping a dependency (e.g. rendering without `@react-three/postprocessing`) rather than build-configuration tuning.
- `hero3d/screenshots/` (produced by `tests/e2e/capture.spec.ts` and `site.spec.ts`) is rendered on the same SwiftShader software rasteriser as §1 — the screenshots are accurate for composition, material response, and colour, but their antialiasing quality is not representative of a real GPU's MSAA/TAA output.
