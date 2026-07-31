# Hero 3D — Asset Contract

Defines every asset the hero scene consumes, where it lives, how it is produced, and the rules for changing it. This is the contract `hero3d/tools/prepare-assets.mjs` implements and that `partnerManifest.ts` and `createCentralO.ts`/`proceduralStone.ts` depend on.

## 1. Licensing and sourcing

Every asset used by the hero — the central O source raster, all generated texture maps, all six partner logo files, and the starfield/point shader — is first-party: supplied directly by OVMG or by the named partner for use in this scene. There are no remote font, texture, icon, or model fetches at build time or at runtime. `prepare-assets.mjs` reads only from `REPO/images/` and writes only into `hero3d/project/public/{brand,partners,textures}/`. This keeps the built bundle fully self-contained.

`hero3d/tools` is deliberately isolated from `hero3d/project`: it has its own `package.json` with a single dependency (`sharp`), so the asset pipeline never becomes a runtime dependency of the shipped app. Re-running it:

```sh
cd hero3d/tools
npm install      # first time only
node prepare-assets.mjs
```

It is idempotent — every output is fully regenerated from `REPO/images/` on each run — and touches nothing outside `hero3d/tools/` and `hero3d/project/public/{brand,partners,textures}/`.

## 2. Central O source and generated maps

### 2.1 Source

- Source: `REPO/images/ovmg-o-stone.webp`, a first-party OVMG brand raster, decoded at **460×460px** (an earlier brief assumed 464×464; the pipeline measures and uses the real decoded size rather than hard-coding either figure — see the `notes` field in the generated `o-metrics.json`).
- `prepare-assets.mjs` (Part A) measures this raster directly rather than trusting hand-entered numbers: it scans the alpha channel at 720 angular samples to find the mean outer-silhouette and inner-hole radii (both came back very close to circular: outer std 0.23px, inner std 0.24px), and separately scans angular luminance variance per radius bin to find where the carved Greek-key band actually begins/ends. The measured result, written to `hero3d/project/public/brand/o-metrics.json`:

  | Field | Value |
  |---|---|
  | `sourceWidth` / `sourceHeight` | 460 / 460 |
  | `centerX` / `centerY` | 229.5 / 229.5 |
  | `outerRadiusPx` | 228.69 |
  | `innerRadiusPx` | 127.41 |
  | `outerRadiusNorm` | 0.9943 |
  | `innerRadiusNorm` | 0.5571 |
  | `patternInnerNorm` | 0.5599 |
  | `patternOuterNorm` | 0.9936 |

  `innerRadiusNorm` (0.5571) is what `CENTRAL_O.innerRadius`/`CENTRAL_O.outerRadius` in `heroConfig.ts` (`0.724 / 1.30`) is derived from. `patternInnerNorm`/`patternOuterNorm` describe the raw measured engraving extent (0.560–0.994 of the outer radius — essentially the whole ring face, no flat lip); `CENTRAL_O.bandInner`/`bandOuter` (`0.72`/`0.96`) intentionally do **not** copy those figures verbatim — see §2.1.1.
- This is raster-only today. A true vector outline (SVG path data for the O's outer/inner contours) is the plug-in point described in `HERO_SPEC.md` §4.1.1: it would let the mark's decorative cut-outs break the silhouette itself, not just the surface relief. Landing it means replacing `createCentralO.ts`'s `THREE.LatheGeometry` revolve (which can only produce a rotationally-symmetric solid) with an extrude of the traced contour — the codebase already extrudes a traced 2D outline elsewhere (`src/three/orbits/medallion.ts`'s capsule plaque via `THREE.ExtrudeGeometry`), which is the shape of change that would be needed. The raster would remain the only input to the relief-map generation step (§2.2).

#### 2.1.1 Why the carved band isn't the raw measured extent

The automated measurement (`patternInnerNorm`/`patternOuterNorm`) puts the engraving across almost the entire ring face. Feeding that directly into the 3D band, while *also* modelling a real inner-bevel chamfer, doubled the visual bevel and made the mark read as a rounded tube rather than a carved seal — the measured "engraving start" partly captured the raster's own photographed inner bevel, not decoration. `bandRadii()` (`createCentralO.ts`) therefore derives the band from the *geometry* (just inside the modelled bevels: `Ri + edgeBevel + faceLip` .. `R - edgeBevel - faceLip`), clamped against `CENTRAL_O.bandInner`/`bandOuter` (`0.72`/`0.96` of `outerRadius`) rather than the raw measured fractions.

### 2.2 Generated texture maps

`prepare-assets.mjs` (Part B, run against the same 460×460 source) writes five maps at **1024×1024** to `public/textures/`, all consumed by `CentralOVMGLogo`'s face material (`proceduralStone.ts`):

| Map | File | Derivation | Consumer |
|---|---|---|---|
| Relief / height | `o-relief.png` | Contrast-stretched luminance within the measured band radius, upscaled to 1024² with a 0.8px blur | `face.displacementMap` |
| Normal | `o-normal.png` | Sobel filter (strength 2.2) over the relief height buffer, not tileable — a single medallion, not a repeating pattern | `face.normalMap` |
| Roughness | `o-rough.png` | Blend of a base roughness (0.82) toward 0.95 in recesses and toward 0.62 on raised edges, weighted by gradient magnitude | `face.roughnessMap` |
| Ambient occlusion | `o-ao.png` | Box-blurred (radius 4) inverse of the recess-darkening seed, masked to the band radius | `face.aoMap` (`aoMapIntensity 1.8`) |
| Albedo | `o-albedo.png` | Flat stone palette (`#b9bec6` raised / `#7d838d` recessed) modulated by relief height plus low-amplitude fbm noise (±10/255) for mineral breakup — no photographic colour is copied from the source | `face.map` |

A separate pair of maps (Part C) gives the body's stone breakup — **512×512**, fully procedural, no raster input:

| Map | File | Purpose |
|---|---|---|
| Tileable noise | `stone-noise.png` | 5-octave fbm value noise, tileable by construction (the noise lattice wraps at integer frequencies, not by mirroring) | `body.roughnessMap` |
| Tileable noise normal | `stone-noise-normal.png` | Sobel (strength 1.1, wrap-around) of the noise above | `body.normalMap` (`repeat 2.6, 2.6`) |

If a baked map fails to load at runtime, the material still renders — it simply loses that channel — and `proceduralStone.ts` synthesises a runtime `CanvasTexture` fallback (a lighter-weight value-noise fbm) for the body normal map specifically, so the stone never falls back to flat grey plastic even with `public/textures/` missing entirely.

## 3. Partner logo assets

### 3.1 Manifest interface (`src/hero/partnerManifest.ts`)

```ts
export type LogoTone = 'light' | 'dark' | 'mixed';
export type PlateStyle = 'none' | 'dark' | 'light';

export interface PartnerDefinition {
  id: string;              // stable slug, also the texture filename stem
  name: string;             // accessible DOM list / alt text
  logoUrl: string;           // path relative to the hero's asset root
  ring: number;              // index into RINGS (0..4)
  phase: number;             // starting orbital angle, radians
  scale: number;             // medallion size multiplier
  emphasis?: number;         // 0..1 brightness/presence, default 0.72
  padding?: number;          // 0..0.5, clear space kept around the logo, default 0.05
  tone?: LogoTone;           // measured luminance class, default 'mixed'
  plate?: PlateStyle;        // carrier: none (shipped default), dark or light
  halo?: number;             // 0..1 outline traced around the artwork, plate none only
  emissiveIntensity?: number;// extra emissive lift, default 0.16
  aspectHint?: number;       // width/height from assets.json, default 1
  active?: boolean;          // default true
}
```

`phase` is radians (not a 0–1 fraction). `tone` drives the default `plate` via `plateForTone(tone)` (`'dark'` tone → `'light'` plate; anything else → `'dark'` plate). `plate` is the **only** lawful contrast lever for a mark that reads badly on its default plate, because partner trademarks may never be recoloured.

### 3.2 The shipped manifest

Ring assignment follows the artwork, not the alphabet: compact near-square marks sit on the tight inner rings where arc length is short; the two extreme wordmarks (3.5:1 and 7:1) live on the outer rings where their capsule plaques have room to breathe.

| id | name | ring | phase (rad) | scale | tone | plate | aspectHint | plaque shape |
|---|---|---|---|---|---|---|---|---|
| `ram-global` | RAM Global | 0 | 0.5 | 0.86 | light | dark (default) | 1.0 | disc |
| `solr-energy` | SOLR Energy | 0 | 3.64 | 0.86 | light | dark (default) | 1.2361 | disc |
| `tlg-consulting` | TLG Consulting | 1 | 1.7 | 0.86 | mixed | **light (override)** | 1.3778 | disc |
| `bright-sun-solar` | Bright Sun Solar | 2 | 4.4 | 0.87 | light | dark (default) | 1.4504 | disc |
| `ess` | Energy Storage Solutions | 3 | 2.4 | 0.92 | mixed | **light (override)** | 3.5068 | capsule |
| `velatech` | Vela Tech | 4 | 5.5 | 0.94 | mixed | dark (default) | 7.0137 | capsule |

`ess` and `tlg-consulting` are the only two entries with an explicit `plate: 'light'` override: ESS's mark is dark green and black type and TLG's wordmark sits under the lion in deep blue — both are simply unreadable on the default dark smoked-glass plate, so they sit on a lighter frosted plate instead (`heroMaterials.ts`'s `plateLight`). Every ring carries exactly one partner except ring 0, which carries two (`ram-global`, `solr-energy`) — five rings, six partners.

`WIDE_ASPECT = 2.2` (`src/three/orbits/medallion.ts`) is the cutoff: `ess` (3.5068) and `velatech` (7.0137) get a capsule plaque; the other four (all ≤1.4504) get a disc.

### 3.3 File rules

- One file per partner at `public/partners/<id>.webp`. Never atlased — no sprite sheet, no shared texture with UV offsets. `tests/unit/partnerManifest.test.ts` asserts every `logoUrl` matches `^partners/[a-z0-9-]+\.(webp|png)$` and contains its own `id`.
- Format: WebP with alpha (`prepare-assets.mjs` Part D: `quality 90`, `alphaQuality 100`, `effort 5`). If the source has an opaque flat-colour background instead of real transparency, the pipeline flood-fills from the border pixels to key it out automatically (verified as a no-op for all six shipped logos, which already carry genuine alpha).
- Trimmed to content bounding box before writing — no baked-in blank padding; in-medallion clear space is controlled by the manifest's `padding` field instead.
- Aspect ratio is always preserved; fit inside a 512×512 box (`LOGO_MAX_BOX`) without upscaling — a logo whose usable source is smaller than 512px on its long edge ships at its native size.
- Tone (`light` / `dark` / `mixed`) is measured, not eyeballed: mean luminance of the logo's own opaque pixels, thresholded at `>0.62` → `light`, `<0.34` → `dark`, else `mixed`. `assets.json` records this per logo; `partnerManifest.ts`'s `tone` field is a hand-set value that should track it but is not read from the file at runtime.

The shipped `public/partners/assets.json` (generated, one row per logo):

| id | width×height | aspect | meanLuminance | tone |
|---|---|---|---|---|
| `velatech` | 512×73 | 7.0137 | 0.5224 | mixed |
| `tlg-consulting` | 496×360 | 1.3778 | 0.5807 | mixed |
| `solr-energy` | 445×360 | 1.2361 | 0.8011 | light |
| `bright-sun-solar` | 512×353 | 1.4504 | 0.6740 | light |
| `ess` | 512×146 | 3.5068 | 0.3901 | mixed |
| `ram-global` | 347×347 | 1.0000 | 0.8494 | light |

### 3.4 Runtime behaviour when an asset is missing

`src/three/utils/assetLoader.ts`'s `loadTexture()` never rejects — a failed fetch resolves to `null`, is recorded via `reportAssetIssue()` (surfaced through `window.__OVMG_HERO__.getState().assetIssues` and a console error in dev / warning in production), and the caller degrades gracefully: `OrbitingPartner.tsx` sets the logo material's opacity to `0` rather than removing the medallion, so a broken manifest entry still shows its plate and keeps its ring position. This is exercised by `tests/e2e/hero.spec.ts`'s "a missing partner logo degrades gracefully" test, which 404s `ess.webp` and asserts the hero still renders every other partner.

### 3.5 Change recipes

See `INTEGRATION.md` §4 for the full step-by-step recipes (replace a logo, add a partner, move a partner to a different ring, etc.).

## 4. Starfield assets

The starfield uses no image textures. All three layers (`Starfield.tsx`) and the near-dust/backdrop (`AtmosphericParticles.tsx`) are drawn with hand-written GLSL: a vertex shader that sizes points by `300 / -viewZ` (clamped to a minimum of `1.15 * pixelRatio` so a distant point never rasterises to sub-pixel and disappears) and a fragment shader that computes a circular soft falloff from `gl_PointCoord`, so there are no square sprite artifacts and no texture-fetch dependency.

## 5. Pipeline (`hero3d/tools/prepare-assets.mjs`)

Standalone Node script (only dependency: `sharp`), run manually — it is **not** wired into `npm run build` in `hero3d/project/package.json`; the project's own `assets` script (`node ../tools/prepare-assets.mjs`) is the intended entry point. Responsibilities, in order:

1. **Part A** — measure `REPO/images/ovmg-o-stone.webp` and write `public/brand/o-metrics.json` (§2.1).
2. **Part B** — derive the five 1024×1024 O face maps and write them to `public/textures/` (§2.2).
3. **Part C** — generate the two 512×512 tileable stone-noise maps (§2.2).
4. **Part D** — for each entry in the script's `LOGO_SOURCES` array, read `REPO/images/<file>`, key out a flat background if present, trim to content bounds, fit into a 512px box without upscaling, write `public/partners/<id>.webp`, measure tone/luminance, and append a row to `public/partners/assets.json`.
5. **Part E** — copy `REPO/images/ovmg-o-stone.webp` byte-identical to `public/brand/ovmg-o-source.webp`, and rewrite this folder's own `README.md` from an inline template.
6. **Verification pass** — stats every expected output file and throws if any is missing.

It performs no network access at any point and is idempotent: re-running after a source-image change is always safe, and touches nothing outside `hero3d/tools/` and `hero3d/project/public/{brand,partners,textures}/`.

## 6. Asset inventory summary

| Asset | Location | Generated by | Runtime consumer |
|---|---|---|---|
| O source raster | `REPO/images/ovmg-o-stone.webp` (460×460) | first-party supplied | `prepare-assets.mjs` only (build-time input) |
| O metrics | `public/brand/o-metrics.json` | `prepare-assets.mjs` (measured) | `heroConfig.ts`'s `CENTRAL_O` constants (hand-transcribed, not read at runtime) |
| O relief/normal/rough/ao/albedo maps | `public/textures/o-*.png` (1024²) | `prepare-assets.mjs` | `proceduralStone.ts` face material |
| Stone tileable noise + normal | `public/textures/stone-noise*.png` (512²) | `prepare-assets.mjs` (procedural) | `proceduralStone.ts` body material |
| Partner logo files | `public/partners/<id>.webp` | first-party/partner supplied, normalised by `prepare-assets.mjs` | `OrbitingPartner.tsx` via `partnerManifest.ts` |
| Partner asset metrics | `public/partners/assets.json` | `prepare-assets.mjs` (measured) | reference only — `aspectHint`/`tone` in `partnerManifest.ts` are hand-transcribed from it |
| Starfield shaders | inline GLSL in `Starfield.tsx` / `AtmosphericParticles.tsx` | hand-authored | those components directly |
