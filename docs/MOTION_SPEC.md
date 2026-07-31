# Hero 3D — Motion Specification

Defines every source of motion in the scene: how it is driven, its exact tuning values, and its bounds. `heroConfig.ts` is the source of truth for every numeric constant below; the tables reproduce the shipped values exactly as of this build.

## 1. Timing model

All motion is time-based, driven by `runtime.elapsed` (`heroRuntime.ts`), advanced inside `RuntimeDriver`'s `useFrame` callback (`PartnerOrbitScene.tsx`) at priority `-1` so it runs before every other frame callback in the tree. Each frame's `delta` is clamped to `0.05` seconds before being added, so a stalled tab or a long main-thread block can never make the system jump forward by more than that bound in one step (`tests/e2e/hero.spec.ts`'s "motion is time based" test blocks the main thread for 1.5s and asserts the system advances by less than 4 seconds of animation time in the following 1.2s of wall time).

The clock pauses (`runtime.paused = true`) when the document tab is hidden (`visibilitychange`) or the hero's own element leaves an `IntersectionObserver` margin of 120px around the viewport (`useHeroScroll.ts`); this is checked regardless of whether `scrollResponse` is enabled. Orbital motion, once running, is entirely independent of scroll position — scroll drives only the secondary camera/star effects in §6, never the orbital angle itself.

Every orbital position is a pure function of `runtime.elapsed` (`orbitalPositionAtTime()`, `src/three/orbits/orbitalMath.ts`) — never of frame count — so identical elapsed time always produces an identical pose regardless of frame rate. This is what the test hook `window.__OVMG_HERO__.seek(seconds)` relies on: it jumps `runtime.elapsed` directly, and every subsequent frame renders exactly as if that much real time had passed.

## 2. Central O ambient motion

Driven by `CentralOVMGLogo.tsx`'s `useFrame`, all sinusoidal and continuous (no start/end), scaled by `runtime.motionIntensity` (`HeroConfig.motionIntensity`, default `1`) and fully zeroed under reduced motion:

| Property | Formula | Amplitude constant (`CENTRAL_O`) | Angular rate |
|---|---|---|---|
| Rotation Z | `sin(t·0.055) · spinAmplitude · intensity` | `spinAmplitude 0.052` rad (~3°) | 0.055 rad/s |
| Tilt X | `sin(t·0.041 + 1.1) · tiltAmplitude · intensity` | `tiltAmplitude 0.026` rad | 0.041 rad/s |
| Tilt Y | `sin(t·0.033 + 0.4) · tiltAmplitude·0.7 · intensity` | `0.0182` rad | 0.033 rad/s |
| Float Y (position) | `sin(t·floatSpeed) · floatAmplitude · intensity` | `floatAmplitude 0.022` world units | `floatSpeed 0.21` rad/s |

`CENTRAL_O.spinSpeed` (`0.0125`) is defined in `heroConfig.ts` but is not read by `CentralOVMGLogo.tsx` — the rotation rate actually used is the hard-coded `0.055` above.

## 3. Orbital rings

Five rings (`RINGS` in `heroConfig.ts`), each a true 3D ellipse: independent `radiusX`/`radiusZ`, a `y` plane offset, independent `inclinationX`/`inclinationZ` plane tilts (applied in three.js's `'XYZ'` Euler order), a `direction` (±1), a `phase` (fixed radian offset), and a time-based `angularSpeed` (rad/s, scaled by `motionIntensity` as `speedScale`).

| Ring | radiusX | radiusZ | y | inclinationX | inclinationZ | direction | angularSpeed | phase | period (2π/speed) | tubeRadius | opacity | emphasis | color |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 2.26 | 1.78 | 0.44 | 0.34 | 0.14 | +1 | 0.0500 | 0.0 | ~126s | 0.0075 | 0.55 | 0.85 | `#9fb6d4` |
| 1 | 3.02 | 2.24 | −0.86 | −0.36 | −0.22 | −1 | 0.0395 | 0.9 | ~159s | 0.0065 | 0.48 | 0.68 | `#93aed0` |
| 2 | 3.74 | 2.66 | 0.98 | 0.50 | 0.26 | +1 | 0.0305 | 2.1 | ~206s | 0.0056 | 0.40 | 0.54 | `#87a1c4` |
| 3 | 4.46 | 3.08 | −0.62 | −0.18 | −0.09 | −1 | 0.0225 | 3.4 | ~279s | 0.0048 | 0.32 | 0.42 | `#7d95b8` |
| 4 | 4.98 | 3.40 | 0.26 | 0.26 | 0.18 | +1 | 0.0165 | 4.7 | ~381s | 0.0042 | 0.26 | 0.34 | `#7589ab` |

Notes, verified by `tests/unit/orbitalMath.test.ts`'s "ring configuration" suite:

- Every ring has a distinct `angularSpeed` (nothing rotates as one rigid disk), and direction alternates ring-to-ring (0/2/4 run `+1`, 1/3 run `-1`).
- Angular speed decreases monotonically outward, so the outermost, largest-radius ring is also the slowest — a deliberate choice against outer rings appearing to move faster in linear terms.
- Radii increase monotonically outward and every ring's `inclinationX` differs from its neighbour's, so no two rings share a plane.
- Every ring's `radiusX`/`radiusZ` differ by more than 0.2 — genuinely elliptical, never circular.
- Every ring's period exceeds 60s — nothing laps the composition inside a minute.
- Ring tube opacity/emphasis/tubeRadius/color all decrease from ring 0 (innermost, most emphasised) to ring 4 (outermost, faintest) — depth cueing by construction, not just by perspective.

Ring geometry itself (the tube mesh) is built once per ring at `ringTubularSegments`/`ringRadialSegments` resolution (see `PERFORMANCE.md`); a per-frame shader term (`heroMaterials.ts`'s `createRingMaterial`) fades the half of each ellipse travelling away from the camera down to `uBackAlpha` (`0.22 + emphasis·0.12`), so a ring reads as receding into depth rather than as a flat, uniformly-opaque hairline circle.

## 3.1 Responsive framing profiles

`RESPONSIVE_PROFILES` (`heroConfig.ts`), selected by the hero's own container width (see `HERO_SPEC.md` §7), narrowest first:

| Profile | maxWidth | minCam / maxCam dist | cameraElevation | cameraYaw | systemRoll | fov | systemScale | orbitSpreadX | orbitSpreadZ | framePadding | medallionScale | starDensity |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `phone-sm` | 400 | 8.6 / 27 | 0.42 | 0.10 | 1.02 | 42 | 0.90 | 0.58 | 1.12 | 1.025 | 1.14 | 0.55 |
| `phone` | 540 | 8.6 / 26 | 0.40 | 0.11 | 0.94 | 41 | 0.92 | 0.62 | 1.10 | 1.025 | 1.10 | 0.60 |
| `tablet` | 820 | 9.4 / 22 | 0.38 | 0.13 | 0.52 | 36 | 0.97 | 0.84 | 1.04 | 1.05 | 1.04 | 0.78 |
| `laptop` | 1280 | 9.6 / 20 | 0.35 | 0.16 | 0.10 | 33 | 1.00 | 1.00 | 1.00 | 1.06 | 1.00 | 0.90 |
| `desktop` | ∞ | 9.4 / 20 | 0.34 | 0.17 | 0.08 | 32 | 1.04 | 1.00 | 1.00 | 1.06 | 1.00 | 1.00 |

`targetY` is `-0.02` on `phone-sm`/`phone`, `-0.03` on `tablet`/`laptop`/`desktop`; `offsetX`/`offsetY` are `0` on every profile. Portrait/narrow profiles compress `orbitSpreadX` and stretch `orbitSpreadZ` — the same anisotropic-spread mechanism `ellipsePoint()` (`orbitalMath.ts`) applies per axis — so on a phone the medallions swing toward and away from the camera instead of sliding off the left/right edges, and roll the whole system (`systemRoll` up to `1.02` rad) so the composition's long axis runs up the screen rather than across it, which is what keeps medallions larger on a narrow frame (`medallionScale` also rises to `1.14` on `phone-sm` vs `1.00` on desktop).

`minCameraDistance`/`maxCameraDistance` are floors/ceilings, not the resting distance — see `HERO_SPEC.md` §7 for the perspective-exact solver (`framing.ts`) that computes the actual value every frame from the real projected extents of the rings and medallions.

## 4. Partner logo phase

Each medallion's angular position at `elapsed = t` is `wrapAngle(phase + ring.phase + ring.direction · ring.angularSpeed · speedScale · t)` — i.e. the partner's own `phase` (radians) plus the ring's own `phase` offset (`orbitalAngle()`, `orbitalMath.ts`). Shipped values (from `partnerManifest.ts`; radians, not the `0..1` fraction an earlier design used):

| Partner | Ring | Phase (rad) |
|---|---|---|
| `ram-global` | 0 | 0.50 |
| `solr-energy` | 0 | 3.64 |
| `tlg-consulting` | 1 | 1.70 |
| `bright-sun-solar` | 2 | 4.40 |
| `ess` | 3 | 2.40 |
| `velatech` | 4 | 5.50 |

Ring 0 carries two partners; the manifest's `validateManifest()` requires same-ring phases to be at least `0.55` rad apart at load, and `ram-global`/`solr-energy` sit `|0.5 − 3.64| ≈ 3.14` rad apart (opposite sides of the ellipse) so they can never converge. `distributePhases()` (also in `partnerManifest.ts`) is a repair/debug helper that evenly redistributes phases per ring; it is not used by the shipped manifest, which ships hand-placed phases.

Medallions billboard to the camera by cancelling their parent group's world rotation and then applying the camera's own quaternion (`OrbitingPartner.tsx`) — not `Object3D.lookAt`, which can introduce roll/flip artifacts crossing the pole. This guarantees the artwork can never mirror or invert regardless of orbital position, independent of the system's own roll on portrait layouts.

## 5. Starfield

`STAR_LAYERS` (`heroConfig.ts`) — three depth-separated shells, largest/most numerous furthest out:

| Layer | count | inner/outerRadius | size | sizeJitter | brightness | pointerFactor | scrollFactor | drift (rad/s) | softness | twinkle |
|---|---|---|---|---|---|---|---|---|---|---|
| `distant` | 2600 | 42 / 78 | 0.32 | 0.7 | 0.92 | 0.10 | 0.16 | 0.0032 | 0.15 | 0.35 |
| `mid` | 1050 | 20 / 40 | 0.24 | 0.8 | 1.05 | 0.34 | 0.46 | 0.0068 | 0.30 | 0.60 |
| `near` | 340 | 11 / 19 | 0.14 | 0.5 | 0.34 | 0.85 | 1.00 | 0.0125 | 0.85 | 0.25 |

Nearer layers have strictly greater `pointerFactor` and `scrollFactor` — the standard depth-cue: near dust moves most, distant moves least. `distant`/`mid` render directly in `PartnerOrbitScene`; `near` renders inside `AtmosphericParticles` alongside a separate graded backdrop plane (dark-background mode only). Actual counts are multiplied by `quality.starDensity × responsive.starDensity` (see `PERFORMANCE.md`). Parallax offsets are in world units, scaled from the normalised pointer/scroll signal by `MOTION.starPointerShift` (`1.5`) and `MOTION.starScrollShift` (`2.6`) times the layer's own coefficient.

## 6. Camera motion (`CameraRig`, `PartnerOrbitScene.tsx`)

The camera orbits the target on a sphere (elevation is an angle, not a height, which is what keeps the orbit ellipses open rather than collapsing to flat lines):

| Term | Driven by | Constant (`MOTION`) |
|---|---|---|
| Yaw | `profile.cameraYaw − pointerX · pointerYaw · pointerResponse` | `pointerYaw 0.115` rad |
| Elevation | `profile.cameraElevation − pointerY · pointerPitch · pointerResponse` | `pointerPitch 0.075` rad |
| Distance | `baseDistance + scroll · scrollDolly · scrollResponse` | `scrollDolly 1.35` world units |
| Vertical drift | `+ scroll · scrollLift · 0.7 · scrollResponse` | `scrollLift 0.5` world units |
| Roll | `camera.rotation.z += scroll · scrollTilt · scrollResponse` (accumulated) | `scrollTilt 0.046` rad (~2.6°) |

`pointerX`/`pointerY` are exponentially damped toward the raw pointer target (`damp()`, half-life `MOTION.pointerDamping 0.34`s) before being applied, so parallax never tracks the cursor 1:1. `scroll` is damped toward `scrollTarget` with a half-life of `0.18`s. `baseDistance` is the solved value from `fitCameraDistance()` (`HERO_SPEC.md` §7), not a constant.

Scroll's other effects: the whole orbital system group tilts (`rotation.x = scroll · scrollTilt · scrollResponse`) and lifts (`position.y = −scroll · scrollLift · scrollResponse`) — the ring/medallion group itself, on top of the camera's own dolly — and every star layer plus the atmospheric backdrop fades toward `MOTION.scrollFadeTo` (`0.18`) — the backdrop's own opacity multiplier is `0.9 · (1 − scroll·0.6)`, and star layers fade by `1 − scroll·0.55`.

Scroll progress itself comes from a GSAP `ScrollTrigger` (`useHeroScroll.ts`) observing the hero element's `top top`..`bottom top` range and writing `self.progress` into `runtime.scrollTarget` — it does not pin, scrub, or otherwise hijack the page's own scrolling; the page scrolls exactly as it would without the hero mounted (verified by `tests/e2e/hero.spec.ts`'s "scroll drives hero progress and never hijacks the page" test).

## 7. Pointer parallax

`usePointerParallax.ts` listens for `pointermove` on `window`, normalises the event position against the hero element's own bounding rect to `[-1, 1]` on each axis (clamped to `[-1.6, 1.6]` before damping), and writes `pointerTargetX`/`pointerTargetY` into the runtime. It attaches no listener at all — rather than attaching one and discarding input — when `pointerResponse` is `0`, under reduced motion, or when `window.matchMedia('(pointer: coarse)')` matches (touch devices get no hover position to parallax from).

## 8. Reduced-motion behaviour and the static pose

When `prefers-reduced-motion: reduce` is active (or the `forceReducedMotion` debug prop is set), `RuntimeDriver` short-circuits every frame: `runtime.elapsed` is pinned to `REDUCED_MOTION_POSE_SECONDS` and `pointerX`/`pointerY`/`scroll` are all forced to `0`, before any damping or accumulation runs. The central O's ambient motion multiplier (`intensity` in `CentralOVMGLogo.tsx`) is explicitly `0` under reduced motion. The net effect: every orbital position, the O's rotation/tilt/float, the camera pose, and all star/backdrop parallax are frozen at exactly the pose that `elapsed = 530` produces — not merely "paused wherever it happened to be."

### 8.1 `REDUCED_MOTION_POSE_SECONDS = 530`

This value is not hand-picked. `hero3d/project/scripts/find-static-pose.mjs` samples `t = 0..1200` in `0.25`s steps and scores each candidate moment on three components, computed in the camera's own screen-plane basis (`cameraBasis()`, `framing.ts`) for every partner's real plaque half-extent:

1. **Minimum medallion separation** — for every pair on screen, `max(|Δh| / (halfWidth_a + halfWidth_b), |Δv| / (halfHeight_a + halfHeight_b))`; `1.0` means exactly touching.
2. **Minimum clearance from the central mark** — separately checks rim clearance (radial distance from the mark's silhouette, only weighted when roughly coplanar with it) and bore clearance (distance from the opening, weighted at any depth, since the opening is see-through and a medallion framed inside it reads as being *inside* the mark).
3. **Minimum angular gap** around the frame between the six medallions' screen positions.

Each candidate is scored against **both** the `desktop` and `phone-sm` responsive profiles (the two use different orbit spreads and system rolls), and the reported score is the *worse* of the two — a frozen pose that only works on desktop is not a usable answer. At the winning `t = 530s`:

| Metric | phone-sm | desktop |
|---|---|---|
| Minimum medallion separation (× touching distance) | 1.61× | 2.13× |
| Minimum angular gap between medallions | 20.9° | 18.6° |

The reported overall score takes the worse value of each metric independently across the two profiles, so the binding constraint is phone-sm on separation (1.61×) and desktop on angular gap (18.6°) — both comfortably clear of the failure zone (`t=0`, for comparison, scores 0.23× separation and a 0.9° angular gap — several medallions nearly stacked). (`heroRuntime.ts`'s own comment on `REDUCED_MOTION_POSE_SECONDS` states the separation result to one decimal: "1.6x on a phone and 2.1x on desktop," and "no medallion is framed inside the mark's opening.")

To re-derive or re-tune this value: `scripts/find-static-pose.mjs` imports directly from `.ts` source files by extensionless specifier, which plain `node scripts/find-static-pose.mjs` cannot resolve (`ERR_MODULE_NOT_FOUND`) — `tsx` is not a committed dependency of `hero3d/project`, but running it via `npx tsx scripts/find-static-pose.mjs` from `hero3d/project` works (npx fetches `tsx` on demand) and reproduces `t = 530.00s` exactly. Copy its reported `best reduced-motion pose: t = …` into `REDUCED_MOTION_POSE_SECONDS`.

Reduced motion is exercised end-to-end by `tests/e2e/hero.spec.ts`'s "freezes the composition, keeps every partner visible and disables parallax" test: it emulates `reducedMotion: 'reduce'`, moves the pointer, waits 1.5s of real time, and asserts `elapsed` did not advance, `pointerX`/`scroll` are exactly `0`, no partner moved by more than `1e-6` world units, and every partner's projected NDC coordinates stay within the frame.

## 9. Easing reference

| Context | Curve |
|---|---|
| O ambient rotation/tilt/float | `sin`/`cos` of elapsed time, continuous, no start/end |
| Ring orbital advance | Linear in angle over time (constant angular speed per ring) — the elliptical projection and inclination, not an easing curve, are what make the on-screen speed and shape read as non-uniform |
| Pointer parallax damping | Exponential smoothing toward target (`damp()`, half-life-based, frame-rate independent) |
| Scroll-driven camera/tilt/lift/fade | Exponential damping of `scroll` toward `scrollTarget` (half-life `0.18`s), `scrollTarget` itself set directly (unscrubbed) from GSAP `ScrollTrigger`'s linear `self.progress` |
| Ring far-side fade | `smoothstep` in a custom shader term keyed to view-space depth (`heroMaterials.ts`) |
