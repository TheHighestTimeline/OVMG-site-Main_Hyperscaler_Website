# Hero 3D — Integration Guide

Four supported ways to consume the hero, plus step-by-step recipes for the most common configuration changes. Paths below are relative to the repository root (`ROOT`) unless stated otherwise.

## 1. Integration modes

### 1.1 Native React component

For any React application, import `PartnerOrbitHero` directly from source (`hero3d/project/src/hero/PartnerOrbitHero.tsx`):

```tsx
import { PartnerOrbitHero } from './hero/PartnerOrbitHero';

export function LandingHero() {
  return (
    <section style={{ position: 'relative', width: '100%', height: '640px' }}>
      <PartnerOrbitHero background="transparent" />
    </section>
  );
}
```

`PartnerOrbitHero` accepts `Partial<HeroConfig>` as props (see `HERO_SPEC.md` §5 for the full field table), merged onto `DEFAULT_HERO_CONFIG`, plus a few debug-only props (`partners`, `visibility`, `showHelpers`, `forceReducedMotion`, `ariaLabel`). It renders its own `<Canvas>` and sizes to its **immediate parent** via CSS (`height`/`minHeight` props, default `'100%'`/`'420px'`) — the parent element must establish a definite height, since the responsive profile itself is also measured from that same container (`HERO_SPEC.md` §7), not the viewport.

### 1.2 Embed bundle on the static site (current production integration)

`ROOT/index.html` mounts the built embed bundle into a placeholder div:

```html
<div class="hero3d-mount">
  <div id="hero3d-root" data-hero-background="transparent" data-hero-height="100%"></div>
</div>
<script type="module" src="hero3d/hero3d.js"></script>
```

This is the actual markup shipping today (`ROOT/index.html`, inside the two-column `.hero-grid` hero section). `.hero3d-mount` is a page-owned CSS class giving the mount point a concrete height (`clamp(400px, 58vh, 620px)` on desktop, stepping down at 900/560/380px breakpoints — see `ROOT/index.html`'s `<style>` block); `#hero3d-root` itself is `position: absolute; inset: 0` inside it.

`hero3d.js` (built by `vite.embed.config.ts`, entry `src/embed.ts`) auto-mounts into `document.getElementById('hero3d-root')` on `DOMContentLoaded` (or immediately if the document has already finished loading). It reads configuration from the mount element's `data-*` attributes:

| Attribute | Maps to | Type |
|---|---|---|
| `data-hero-height` | `height` | string (CSS length) |
| `data-hero-min-height` | `minHeight` | string (CSS length) |
| `data-hero-background` | `background` | `'dark' \| 'transparent'` |
| `data-hero-layout` | `layout` | `'full-bleed' \| 'copy-left' \| 'copy-right' \| 'centered'` |
| `data-hero-quality` | `quality` | `QualityTier \| 'auto'` |
| `data-hero-pointer` | `pointerResponse` | number (parsed via `Number(...)`) |
| `data-hero-scroll` | `scrollResponse` | number |
| `data-hero-motion` | `motionIntensity` | number |

Any attribute not present is left at `DEFAULT_HERO_CONFIG`'s value. For explicit control instead of (or in addition to) auto-mount, `embed.ts` also exports `mountPartnerOrbitHero(target, options)`:

```html
<div id="my-hero"></div>
<script type="module">
  import { mountPartnerOrbitHero } from './hero3d/hero3d.js';
  const handle = mountPartnerOrbitHero('#my-hero', { background: 'dark', quality: 'high' });
  // handle.unmount() to tear down later
</script>
```

`options` (a plain object, not data attributes) always wins over the element's own `data-*` values when both are present, since `readOptions(element)` is spread first and `options` spread second. `hero3d/assets/` holds the hashed CSS chunk and any copied texture/partner assets `hero3d.js` references at runtime (resolved relative to `import.meta.url`, not the host page's URL — see §1.4) — deploy it alongside `hero3d.js`.

### 1.3 Standalone hosted route (iframe target)

`hero3d/index.html` + `hero3d/standalone/` (built by `vite.config.ts`) is a second, independent page built from the same component, for embedding via `<iframe>`:

```html
<iframe
  src="https://onevibemediagroup.com/hero3d/"
  title="OneVibeMediaGroup partner ecosystem"
  loading="lazy"
  style="width: 100%; height: 640px; border: 0; display: block;"
></iframe>
```

The actual shipped `hero3d/index.html` mounts with `data-hero-background="dark"` and `data-hero-layout="full-bleed"` (opaque dark background, since an iframed document has no visual relationship to its host page's background) and sets `#hero3d-root { height: 100vh; height: 100svh; }`, `overflow: hidden` on `html, body`. Height is set by the host page's `iframe` element; the value above is illustrative — pick one that comfortably clears `minHeight`.

### 1.4 Framer embed

Framer's embed/iframe component loads an external URL under the hood, so this mode reuses §1.3's `hero3d/index.html`:

1. Add an "Embed"/"iframe" component to the Framer page.
2. Set its source URL to the deployed `hero3d/index.html` (or the `hero3d/` directory, if the host serves `index.html` implicitly).
3. Set the embed's height in Framer to comfortably clear the hero's `minHeight` (`'420px'` default).
4. Leave both Framer's own background and `hero3d/index.html`'s `data-hero-background="dark"` as-is unless the embedding section's background is a known, solid colour — `hero3d/index.html` ships opaque for exactly this reason.

Both the embed bundle (§1.2) and the standalone build (§1.3) resolve their asset URLs the same way `assetUrl()` (`src/three/utils/assetLoader.ts`) does: the embed build defines `__HERO_ASSET_BASE__` as `'@module'`, so asset paths resolve against `import.meta.url` (i.e. relative to wherever `hero3d.js` itself was loaded from, not the page that loaded it) — this is what lets one `hero3d.js` work correctly whether it's loaded from the site root or from `hero3d/index.html`. The standalone build defines it as `''`, so its assets resolve against the document base URL instead.

## 2. Background modes

| Mode | Behaviour | Used by |
|---|---|---|
| `'transparent'` | `gl.setClearColor(0x000000, 0)`; the canvas edges are masked with a radial gradient (`.ovmg-hero--bg-transparent .ovmg-hero__canvas` in `hero.css`) so the scene dissolves into the host page instead of ending at a hard rectangle; the CSS gradient backdrop and `AtmosphericParticles`' graded plane are both suppressed. | `ROOT/index.html`'s static-site mount (§1.2), which already supplies its own dark section background. |
| `'dark'` (default) | `scene.background = null` with `gl.setClearColor(0x05070d, 1)`; the CSS gradient backdrop (`.ovmg-hero--bg-dark` in `hero.css`) and the graded plane both render. | `hero3d/index.html` standalone/iframe route (§1.3), which has no guaranteed background behind it. |

Set via `background` (React prop) or `data-hero-background` (embed data attribute).

## 3. Safe zone

`safeZone: { left, right, top, bottom }` (percent, all default `0`) is written as CSS custom properties (`--ovmg-safe-left`, `--ovmg-safe-right`) and consumed only by two CSS rules in `hero.css`:

```css
.ovmg-hero--copy-left .ovmg-hero__canvas { left: var(--ovmg-safe-left, 0%); }
.ovmg-hero--copy-right .ovmg-hero__canvas { right: var(--ovmg-safe-right, 0%); }
```

i.e. it only has an effect when `layout` is `'copy-left'` or `'copy-right'`, and it clips the canvas element itself (a CSS inset), not the 3D composition — there is no corresponding camera/framing adjustment. `top`/`bottom` are part of the `HeroConfig` type but are not consumed by any current CSS rule. The production integration (`ROOT/index.html`) does not use this mechanism at all: it achieves its two-column layout by giving the hero its own grid column with a fixed CSS height (`.hero3d-mount`) and leaving `layout` at its default `'full-bleed'` — the container-based responsive profile (`HERO_SPEC.md` §7) does the rest by measuring that column's real width.

```tsx
<PartnerOrbitHero layout="copy-right" safeZone={{ left: 42, right: 0, top: 0, bottom: 0 }} />
```

## 4. Recipes

### 4.1 Replace a partner logo

1. Drop the new source file in `ROOT/images/` (PNG or WebP; real alpha transparency preferred — see `ASSET_CONTRACT.md` §3.3 for the auto-key-out fallback).
2. Find the partner's entry in `hero3d/tools/prepare-assets.mjs`'s `LOGO_SOURCES` array and point `file` at the new filename (or overwrite the existing source file in place and leave the entry as-is).
3. Run the pipeline:
   ```sh
   cd hero3d/tools
   node prepare-assets.mjs
   ```
   This regenerates `hero3d/project/public/partners/<id>.webp` and its row in `assets.json` (new width/height/aspect/tone).
4. If the new mark's aspect ratio or measured tone changed meaningfully, update the matching fields in `hero3d/project/src/hero/partnerManifest.ts` (`aspectHint`, `tone`, and `plate` if the tone crossed into needing an override — see §4.3 of `ASSET_CONTRACT.md`). `aspectHint` is only a first-frame hint — `OrbitingPartner.tsx` re-measures the decoded image and logs a dev-console warning if the manifest value is off by more than 5%, but it does not fail the build.

### 4.2 Add a new partner

1. Add the source file to `ROOT/images/` and an entry to `LOGO_SOURCES` in `hero3d/tools/prepare-assets.mjs`, then run `node prepare-assets.mjs` from `hero3d/tools/` (see `ASSET_CONTRACT.md` §5).
2. Add a new entry to `PARTNERS` in `hero3d/project/src/hero/partnerManifest.ts`:
   ```ts
   {
     id: 'new-partner',
     name: 'New Partner',
     logoUrl: 'partners/new-partner.webp',
     ring: 2,
     phase: 5.0,
     scale: 0.9,
     tone: 'light',
     aspectHint: 1.2, // from the generated assets.json row
     active: true,
   },
   ```
3. Choose `ring` (`0`–`4`, indexing `RINGS` in `heroConfig.ts`) and `phase` (**radians**, not a 0–1 fraction) so it lands at least `0.55` rad from any existing partner on the same ring — `validateManifest()` logs a console warning on mount if it doesn't, but does not block rendering. Check current phases in `MOTION_SPEC.md` §4 before picking a value.
4. No changes to `OrbitalSystem.tsx`, `OrbitingPartner.tsx`, or any other scene component are required — medallion instantiation is driven entirely by the manifest array, and `PartnerOrbitHero.tsx` re-validates and re-resolves it (`resolvePartners()`) on every render of the `partners` prop.

### 4.3 Change a partner's ring assignment

```ts
// partnerManifest.ts — move "ess" from ring 3 to ring 4
{ id: 'ess', name: 'Energy Storage Solutions', logoUrl: 'partners/ess.webp', ring: 4, phase: 1.2, /* ... */ },
```

Pick a `phase` that clears whatever else is already on the destination ring (`velatech` is currently the only occupant of ring 4, at phase `5.5`). `ring` must be `0..RINGS.length - 1` (currently `0..4`) or `validateManifest()` reports an error and the partner is filtered out of the resolved list before rendering (`PartnerOrbitHero.tsx` pre-filters `partnerSource.filter((p) => p.ring >= 0 && p.ring < RINGS.length)`).

### 4.4 Change orbit speed (or any ring parameter)

Ring parameters live in `RINGS` in `heroConfig.ts`, not in `partnerManifest.ts`:

```ts
// heroConfig.ts
export const RINGS: RingConfig[] = [
  { id: 0, radiusX: 2.26, radiusZ: 1.78, y: 0.44, inclinationX: 0.34, inclinationZ: 0.14,
    direction: 1, angularSpeed: 0.05, phase: 0.0, tubeRadius: 0.0075, opacity: 0.55,
    emphasis: 0.85, color: '#9fb6d4' },
  // ...
];
```

Edit `angularSpeed` (rad/s) for the ring being tuned; a larger magnitude spins faster, `direction` (`1 | -1`) sets rotation sense. See `MOTION_SPEC.md` §3 for the meaning and shipped value of every field. No changes to `orbitalMath.ts` or `OrbitalSystem.tsx` are required for a parameter tune. After changing ring geometry (`radiusX`/`radiusZ`/`inclinationX`/`inclinationZ`), consider re-running `node scripts/find-static-pose.mjs` (via `npx tsx scripts/find-static-pose.mjs` from `hero3d/project` — see `MOTION_SPEC.md` §8.1) since `REDUCED_MOTION_POSE_SECONDS` was chosen against the current ring/partner configuration and may no longer be the best frozen frame after a geometry change.

### 4.5 Change the central O asset

1. Replace `ROOT/images/ovmg-o-stone.webp` with the new first-party source raster.
2. Run `node prepare-assets.mjs` from `hero3d/tools/` to regenerate `public/brand/o-metrics.json` and the five relief/normal/rough/ao/albedo maps under `public/textures/` (`ASSET_CONTRACT.md` §2).
3. Open the regenerated `o-metrics.json` and hand-transcribe `innerRadiusNorm` into `CENTRAL_O.innerRadius` / `CENTRAL_O.outerRadius`'s ratio in `heroConfig.ts` if the new mark's proportions differ meaningfully from the shipped `0.5571` — these are not read from the JSON file at runtime, only referenced by it for the pipeline's own measurement record.
4. No changes to `createCentralO.ts` are required for a like-for-like raster swap of similar proportions, since it consumes `CENTRAL_O` constants and the generated map filenames, not the source file directly.
5. For a genuinely different silhouette (not just a re-photographed version of the same ring shape), see the vector-outline plug-in point in `HERO_SPEC.md` §4.1.1 and `ASSET_CONTRACT.md` §2.1 — that is a larger change than this recipe covers, since `createCentralO.ts` currently assumes rotational symmetry.

### 4.6 Force a quality tier

```tsx
<PartnerOrbitHero quality="low" /> {/* 'auto' | 'low' | 'medium' | 'high' */}
```

or via the embed bundle:

```html
<div id="hero3d-root" data-hero-quality="low"></div>
```

`'auto'` (the default) resolves via `resolveQualityProfile()` → `scoreDevice()` (`src/three/utils/performanceTier.ts`) from `hardwareConcurrency`, `deviceMemory`, viewport width, pointer coarseness, DPR, `navigator.connection.saveData`, and a software-renderer sniff — see `PERFORMANCE.md` §2. An explicit value bypasses detection entirely, including on desktop — useful to verify the `low`-tier visual treatment without spoofing a device.

### 4.7 Disable pointer response

```tsx
<PartnerOrbitHero pointerResponse={0} />
```

or `data-hero-pointer="0"` on the embed mount element. `usePointerParallax.ts` checks `pointerResponse > 0` (and `!reducedMotion`) before attaching its `pointermove` listener at all — disabling is a listener that's never attached, not one attached-and-ignored. `pointerResponse` also gates the star-layer and atmospheric-backdrop pointer parallax, since all three read the same `runtime.pointerResponse` value.

### 4.8 Disable scroll response

```tsx
<PartnerOrbitHero scrollResponse={0} />
```

or `data-hero-scroll="0"`. `useHeroScroll.ts` never creates a GSAP `ScrollTrigger` when `enabled` is false (`scrollResponse > 0 && !reducedMotion`) — `runtime.scrollTarget`/`runtime.scroll` are explicitly zeroed instead. Note the `IntersectionObserver`-driven visibility pause (which stops the animation clock when the hero scrolls out of view) is **not** gated by this flag — it always runs, independent of whether scroll-driven camera/star effects are enabled.

### 4.9 Switch background mode

```tsx
<PartnerOrbitHero background="dark" />   {/* or "transparent" */}
```

or `data-hero-background="dark"`. See §2 for exactly what each mode changes.

### 4.10 Set the safe zone

```tsx
<PartnerOrbitHero layout="copy-right" safeZone={{ left: 0, right: 38, top: 0, bottom: 0 }} />
```

Only meaningful combined with `layout: 'copy-left' | 'copy-right'` — see §3 for what it actually does (a CSS canvas inset, not a 3D-composition adjustment) and its current limits (`top`/`bottom` have no effect).

---

## Carrier style and layering

Two decisions govern how a partner mark is presented. Both are configuration,
not code changes.

### Carrier: bare artwork vs. a plaque

`PartnerDefinition.plate` selects what the mark rides on:

| Value | Result |
| --- | --- |
| `'none'` | The artwork alone — **the shipped default for all six partners**. No disc, no capsule, no rim. |
| `'dark'` | Smoked-glass plaque with a machined metal edge. |
| `'light'` | Frosted plaque, for artwork drawn in dark ink. |

Marks drawn in dark ink lose contrast when bare, and partner trademarks may
never be recoloured. `halo` (0..1, `plate: 'none'` only) traces a light outline
around the artwork's **own silhouette** — it dilates the logo's alpha channel
and emits a flat light colour through it, so it hugs the letterforms like a
text stroke. It is not a disc or a soft oval behind the mark; where the artwork
has no ink, nothing is drawn.

Shipped values: `ess` `halo: 0.62`, `tlg-consulting` `halo: 0.58`, everything
else `0`. To strip a mark completely bare, set its `halo` to `0`.

```ts
// src/hero/partnerManifest.ts
{
  id: 'ess',
  plate: 'none',   // no bubble behind the mark
  halo: 0.62,      // light outline so the dark green type still reads
  // ...
}
```

To put the plaques back for every partner, delete the `plate: 'none'` lines —
`plateForTone(tone)` then picks a dark or light plaque automatically.

### Layering: may the central mark hide a partner?

`HeroConfig.logoLayer` decides whether the O is allowed to occlude a partner
passing behind it:

| Value | Result |
| --- | --- |
| `'always-front'` | **Shipped default.** Marks are drawn over the O, so no partner disappears for part of its orbit. They still sort correctly against each other, and still shrink and dim with distance, so the orbit keeps reading as three-dimensional. |
| `'occluded'` | Physically correct depth: a mark travelling behind the O is hidden by it. |

```tsx
<PartnerOrbitHero logoLayer="occluded" />
```

```html
<!-- the embed reads it from a data attribute -->
<div id="hero3d-root" data-hero-layer="occluded"></div>
```

`always-front` is an art-direction choice, not a limitation of the renderer.
The trade-off is explicit: true occlusion is more physically honest, but it
hides a partner for a stretch of every cycle, and partner visibility is the
point of the panel. The scene keeps every other depth cue — perspective scale
(measured 1.33x on the inner ring to 1.79x on the outer), depth-driven dimming,
ring front/back falloff, and correct mark-against-mark sorting — so switching
this on costs the O's silhouette occlusion and nothing else.

Verified by `tests/e2e/hero.spec.ts`:
- *a partner passing behind the central mark stays visible* — seeks the orbit
  until a mark is geometrically behind the O, then asserts against the live
  material state that it is still drawn in front.
- *occlusion can still be switched back on* — asserts the `'occluded'` mode
  restores depth testing.

The proof screenshot is `hero3d/screenshots/layering-partner-behind-mark.png`.
