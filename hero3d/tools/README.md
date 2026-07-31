# hero3d asset tools

Standalone, self-contained tooling that prepares every brand/texture asset consumed by the
hero3d Three.js build. This folder is intentionally isolated from `hero3d/project` - it has
its own `package.json` and its own `node_modules` (only dependency: `sharp`), so the asset
pipeline never becomes a runtime dependency of the shipped app.

## What it does

Running the script regenerates everything under `hero3d/project/public/`:

- **`public/brand/o-metrics.json`** - measured geometry of the OVMG "O" glyph
  (`images/ovmg-o-stone.webp`): centre, outer/inner radius, and the radial extent of the
  carved Greek-key band. Measured by scanning the alpha channel (silhouette + hole edges)
  and the angular variance of luminance (carved band vs flat stone) - not hardcoded.
- **`public/brand/ovmg-o-source.webp`** - byte-identical copy of the source O art.
- **`public/textures/o-relief.png` / `o-normal.png` / `o-rough.png` / `o-ao.png` / `o-albedo.png`**
  - a full PBR-ish material set (1024x1024) derived from the O's carved face: a height map,
  a Sobel-derived normal map, roughness, ambient occlusion, and a flat stone-colour albedo
  with subtle procedural mineral noise (no photographic colour is copied from the source).
- **`public/textures/stone-noise.png` / `stone-noise-normal.png`** - a seamlessly tileable
  fbm noise texture (512x512) and its normal map, for fine surface breakup on stone
  geometry. Tiling is achieved by construction (the noise lattice wraps at integer
  frequencies), not by mirroring.
- **`public/partners/<id>.webp`** + **`public/partners/assets.json`** - each partner logo,
  trimmed to its content bounding box, background-keyed if it wasn't already transparent,
  fit inside a 512x512 box without stretching/cropping/upscaling, and exported as WebP with
  alpha preserved. `assets.json` records width/height/aspect and a measured `tone`
  (`light` / `dark` / `mixed`) driven by the mean luminance of the logo's own opaque
  pixels, so the 3D scene can choose a matching backing plate.

## Re-running

```sh
cd hero3d/tools
npm install      # first time only - installs sharp locally in this folder
node prepare-assets.mjs
```

The script is idempotent: every output is fully regenerated from the source files in
`REPO/images/` each run, so re-running after a source-image change is always safe. It never
touches anything outside `hero3d/tools/` and `hero3d/project/public/{brand,partners,textures}/`.

## Adding a new partner logo

1. Drop the logo file in `REPO/images/` (PNG or WebP, ideally with real transparency;
   if it has a flat opaque background instead, the script will attempt to key it out
   automatically via a border flood-fill).
2. Add an entry to the `LOGO_SOURCES` array near the top of `prepare-assets.mjs`:
   `{ id: 'new-partner-id', file: 'logo-new-partner.png' }`.
3. Re-run `node prepare-assets.mjs`. The new `public/partners/new-partner-id.webp` and its
   row in `assets.json` will be created alongside the existing ones.

## Notes / known deviations from nominal spec

- The brief assumed the source O art is 464x464px; the actual decoded WebP is 460x460px.
  The script measures and uses the real dimensions rather than hardcoding 464 - see the
  `notes` field in the generated `o-metrics.json` for the exact figure.
- All six partner logos already ship with genuine alpha transparency (verified by sampling
  border pixels before running), so the background-keying step is a verified no-op for the
  current asset set; it remains active for any future logo delivered with a flat opaque
  background instead of alpha.
