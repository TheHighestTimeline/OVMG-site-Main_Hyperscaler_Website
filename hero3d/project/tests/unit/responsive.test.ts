import { describe, expect, it } from 'vitest';
import {
  CENTRAL_O,
  QUALITY_PROFILES,
  RESPONSIVE_PROFILES,
  RINGS,
  STAR_LAYERS,
  resolveResponsiveProfile,
} from '../../src/hero/heroConfig';
import { clampDpr, scoreDevice, type DeviceSignals } from '../../src/three/utils/performanceTier';
import { buildProfile, createCentralO } from '../../src/three/central/createCentralO';
import {
  fitRectInCircle,
  plaqueHalfExtents,
  plaqueSpecForAspect,
  WIDE_ASPECT,
} from '../../src/three/orbits/medallion';
import {
  cameraBasis,
  computeSystemExtents,
  fitCameraDistance,
  frameFraction,
  maxProjectedFraction,
  ringSpreadX,
} from '../../src/three/orbits/framing';
import { orbitalPosition } from '../../src/three/orbits/orbitalMath';
import { PARTNERS, resolvePartners } from '../../src/hero/partnerManifest';

const TEST_VIEWPORTS = [390, 430, 768, 1440, 1920];

describe('responsive profiles', () => {
  it('resolves a profile for every tested viewport', () => {
    for (const width of TEST_VIEWPORTS) {
      const profile = resolveResponsiveProfile(width);
      expect(profile).toBeDefined();
      expect(profile.minCameraDistance).toBeGreaterThan(0);
      expect(profile.fov).toBeGreaterThan(20);
      expect(profile.fov).toBeLessThan(45);
    }
  });

  it('tightens the system on phones', () => {
    const phone = resolveResponsiveProfile(390);
    const desktop = resolveResponsiveProfile(1920);
    // minCameraDistance is only a floor: the distance actually used is solved
    // from the aspect ratio, and is asserted in the camera-framing suite.
    expect(phone.orbitSpreadX).toBeLessThan(desktop.orbitSpreadX);
    expect(phone.systemScale).toBeLessThan(desktop.systemScale);
    expect(phone.starDensity).toBeLessThan(desktop.starDensity);
  });

  it('keeps medallions larger on phones so logos stay recognisable', () => {
    expect(resolveResponsiveProfile(390).medallionScale).toBeGreaterThan(
      resolveResponsiveProfile(1440).medallionScale,
    );
  });

  it('never leaves a gap between breakpoints', () => {
    for (let width = 240; width <= 2600; width += 7) {
      expect(resolveResponsiveProfile(width)).toBeDefined();
    }
  });

  it('is ordered narrow to wide', () => {
    for (let i = 1; i < RESPONSIVE_PROFILES.length; i += 1) {
      expect(RESPONSIVE_PROFILES[i].maxWidth).toBeGreaterThan(RESPONSIVE_PROFILES[i - 1].maxWidth);
    }
  });
});

describe('quality tiers', () => {
  it('degrades monotonically', () => {
    const { high, medium, low } = QUALITY_PROFILES;
    expect(high.maxDpr).toBeGreaterThanOrEqual(medium.maxDpr);
    expect(medium.maxDpr).toBeGreaterThanOrEqual(low.maxDpr);
    expect(high.starDensity).toBeGreaterThan(medium.starDensity);
    expect(medium.starDensity).toBeGreaterThan(low.starDensity);
    expect(high.ringTubularSegments).toBeGreaterThan(low.ringTubularSegments);
    expect(high.faceThetaSegments).toBeGreaterThan(low.faceThetaSegments);
  });

  it('drops postprocessing and shadows on the low tier', () => {
    expect(QUALITY_PROFILES.low.postprocessing).toBe(false);
    expect(QUALITY_PROFILES.low.shadows).toBe(false);
  });

  it('never renders below native-ish resolution on a dense panel', () => {
    // Half-resolution rendering upscaled to a 3x panel is what made the mark
    // read as a low-poly game asset. Every tier now resolves to at least 2x.
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(clampDpr(QUALITY_PROFILES[tier], 3)).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps anisotropic filtering high enough for angled logo faces', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(QUALITY_PROFILES[tier].anisotropy).toBeGreaterThanOrEqual(8);
    }
  });
});

const baseSignals: DeviceSignals = {
  hardwareConcurrency: 8,
  deviceMemory: 8,
  coarsePointer: false,
  viewportWidth: 1440,
  devicePixelRatio: 2,
  renderer: 'NVIDIA GeForce RTX',
  saveData: false,
};

describe('device scoring', () => {
  it('gives a modern desktop the high tier', () => {
    expect(scoreDevice(baseSignals)).toBe('high');
  });

  it('gives a current iPhone the medium tier, not low', () => {
    // Safari reports no deviceMemory at all; this is the real signal shape.
    const iphone = scoreDevice({
      ...baseSignals,
      hardwareConcurrency: 4,
      deviceMemory: undefined,
      coarsePointer: true,
      viewportWidth: 390,
      devicePixelRatio: 3,
      renderer: 'Apple GPU',
    });
    expect(iphone).toBe('medium');
  });

  it('still drops a genuinely weak phone to low', () => {
    const budget = scoreDevice({
      ...baseSignals,
      hardwareConcurrency: 4,
      deviceMemory: 2,
      coarsePointer: true,
      viewportWidth: 360,
      devicePixelRatio: 2,
      renderer: 'Mali-G52',
    });
    expect(budget).toBe('low');
  });

  it('never lets a phone outrank a desktop', () => {
    const phone = scoreDevice({
      ...baseSignals,
      hardwareConcurrency: 6,
      deviceMemory: undefined,
      coarsePointer: true,
      viewportWidth: 390,
      devicePixelRatio: 3,
      renderer: 'Apple GPU',
    });
    expect(phone).not.toBe('high');
  });

  it('forces low on a software renderer', () => {
    expect(scoreDevice({ ...baseSignals, renderer: 'SwiftShader Device' })).toBe('low');
    expect(scoreDevice({ ...baseSignals, renderer: 'llvmpipe (LLVM 15)' })).toBe('low');
  });

  it('respects Save-Data', () => {
    expect(scoreDevice({ ...baseSignals, saveData: true })).toBe('low');
  });

  it('clamps device pixel ratio to the tier cap', () => {
    expect(clampDpr(QUALITY_PROFILES.low, 3)).toBe(2);
    expect(clampDpr(QUALITY_PROFILES.high, 3)).toBe(2);
    expect(clampDpr(QUALITY_PROFILES.high, 1)).toBe(1);
  });
});

describe('starfield layers', () => {
  it('has three depth-separated layers', () => {
    expect(STAR_LAYERS.length).toBe(3);
    for (let i = 1; i < STAR_LAYERS.length; i += 1) {
      expect(STAR_LAYERS[i].outerRadius).toBeLessThan(STAR_LAYERS[i - 1].outerRadius);
    }
  });

  it('gives nearer layers stronger parallax', () => {
    for (let i = 1; i < STAR_LAYERS.length; i += 1) {
      expect(STAR_LAYERS[i].pointerFactor).toBeGreaterThan(STAR_LAYERS[i - 1].pointerFactor);
      expect(STAR_LAYERS[i].scrollFactor).toBeGreaterThan(STAR_LAYERS[i - 1].scrollFactor);
    }
  });

  it('keeps shells non-overlapping and positive', () => {
    for (const layer of STAR_LAYERS) {
      expect(layer.innerRadius).toBeGreaterThan(0);
      expect(layer.outerRadius).toBeGreaterThan(layer.innerRadius);
      expect(layer.count).toBeGreaterThan(0);
    }
  });
});

describe('central O geometry', () => {
  it('builds a closed lathe profile with no negative radii', () => {
    const profile = buildProfile();
    expect(profile.length).toBeGreaterThan(10);
    expect(profile[0].x).toBeCloseTo(profile[profile.length - 1].x, 10);
    expect(profile[0].y).toBeCloseTo(profile[profile.length - 1].y, 10);
    for (const point of profile) {
      expect(point.x).toBeGreaterThan(0);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('produces real geometry with the expected extents', () => {
    const geometry = createCentralO({ bodySegments: 64, faceThetaSegments: 96, faceRadialSegments: 6 });
    geometry.body.computeBoundingBox();
    const box = geometry.body.boundingBox!;
    expect(box.max.x).toBeCloseTo(1.3, 1);
    expect(box.max.z).toBeGreaterThan(0.1);
    expect(box.min.z).toBeLessThan(-0.1);
    expect(geometry.body.getAttribute('position').count).toBeGreaterThan(500);
    expect(geometry.face.getAttribute('uv1')).toBeDefined();
    geometry.dispose();
  });

  it('maps face UVs into 0..1 across the mark', () => {
    const geometry = createCentralO({ bodySegments: 32, faceThetaSegments: 64, faceRadialSegments: 4 });
    const uv = geometry.face.getAttribute('uv');
    for (let i = 0; i < uv.count; i += 1) {
      expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(i)).toBeLessThanOrEqual(1);
      expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(i)).toBeLessThanOrEqual(1);
    }
    geometry.dispose();
  });
});

describe('logo fitting', () => {
  it('preserves aspect ratio exactly', () => {
    for (const aspect of [0.4, 1, 2.5, 6]) {
      const [w, h] = fitRectInCircle(aspect, 0.3);
      expect(w / h).toBeCloseTo(aspect, 10);
    }
  });

  it('always fits inside the medallion', () => {
    for (const aspect of [0.4, 1, 2.5, 6]) {
      const [w, h] = fitRectInCircle(aspect, 0.3);
      expect(Math.hypot(w / 2, h / 2)).toBeLessThanOrEqual(0.3 + 1e-9);
    }
  });
});

describe('plaque selection', () => {
  it('gives compact marks a disc and wide wordmarks a capsule', () => {
    expect(plaqueSpecForAspect(1).shape).toBe('disc');
    expect(plaqueSpecForAspect(WIDE_ASPECT - 0.01).shape).toBe('disc');
    expect(plaqueSpecForAspect(3.5068).shape).toBe('capsule');
    expect(plaqueSpecForAspect(7.0137).shape).toBe('capsule');
  });

  it('never distorts the artwork, whatever the plaque', () => {
    for (const partner of PARTNERS) {
      const spec = plaqueSpecForAspect(partner.aspectHint ?? 1, partner.padding);
      expect(spec.logoWidth / spec.logoHeight).toBeCloseTo(partner.aspectHint ?? 1, 6);
      expect(spec.logoWidth).toBeLessThan(spec.width);
      expect(spec.logoHeight).toBeLessThan(spec.height);
    }
  });

  it('keeps a 7:1 wordmark legibly tall instead of shrinking it into a circle', () => {
    const disc = fitRectInCircle(7.0137, 0.3)[1];
    const capsule = plaqueSpecForAspect(7.0137).logoHeight;
    expect(capsule).toBeGreaterThan(disc * 1.5);
  });

  it('caps how wide a capsule can grow', () => {
    for (const aspect of [3, 5, 7, 12, 20]) {
      expect(plaqueSpecForAspect(aspect).width).toBeLessThan(1.5);
    }
  });

  it('falls back to a disc for a degenerate aspect', () => {
    expect(plaqueSpecForAspect(Number.NaN).shape).toBe('disc');
    expect(plaqueSpecForAspect(0).shape).toBe('disc');
  });
});

describe('camera framing', () => {
  const medallions = resolvePartners(PARTNERS).map((partner) => {
    const spec = plaqueSpecForAspect(partner.aspectHint, partner.padding);
    const { halfWidth, halfHeight } = plaqueHalfExtents(spec, partner.scale);
    return { ring: partner.ring, halfWidth, halfHeight };
  });

  const TEST_FRAMES = [
    { name: '390x844', width: 390, height: 844 },
    { name: '430x932', width: 430, height: 932 },
    { name: '768x1024', width: 768, height: 1024 },
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1920x1080', width: 1920, height: 1080 },
  ];

  function frameFor(frame: (typeof TEST_FRAMES)[number]) {
    const profile = resolveResponsiveProfile(frame.width);
    const scaled = medallions.map((m) => ({
      ring: m.ring,
      halfWidth: m.halfWidth * profile.medallionScale,
      halfHeight: m.halfHeight * profile.medallionScale,
    }));
    const extents = computeSystemExtents(RINGS, profile.orbitSpreadX, profile.orbitSpreadZ, scaled, {
      elevation: profile.cameraElevation,
      yaw: profile.cameraYaw,
      roll: profile.systemRoll,
      systemScale: profile.systemScale,
    });
    const aspect = frame.width / frame.height;
    const distance = fitCameraDistance(extents, {
      fovDegrees: profile.fov,
      aspect,
      padding: profile.framePadding,
      minDistance: profile.minCameraDistance,
      maxDistance: profile.maxCameraDistance,
      nearClearance: 3.4,
    });
    return { profile, extents, aspect, distance };
  }

  it('fits the entire system inside the frame at every tested viewport', () => {
    for (const frame of TEST_FRAMES) {
      const { profile, extents, aspect, distance } = frameFor(frame);
      // Measured under real perspective, not an orthographic approximation:
      // a medallion swinging toward the camera projects further from centre
      // than its world offset, and that is exactly what used to clip.
      const projected = maxProjectedFraction(extents, distance, profile.fov, aspect);

      expect(projected.horizontal, `${frame.name} clips horizontally`).toBeLessThanOrEqual(1);
      expect(projected.vertical, `${frame.name} clips vertically`).toBeLessThanOrEqual(1);
      // And the nearest medallion never crosses the camera.
      expect(distance, `${frame.name} near-plane clearance`).toBeGreaterThan(extents.maxTowardCamera + 1);
    }
  });

  it('leaves a real margin rather than hugging the frame edge', () => {
    for (const frame of TEST_FRAMES) {
      const { profile, extents, aspect, distance } = frameFor(frame);
      const projected = maxProjectedFraction(extents, distance, profile.fov, aspect);
      expect(Math.max(projected.horizontal, projected.vertical), `${frame.name} margin`).toBeLessThan(0.99);
    }
  });

  it('actually fills the frame instead of leaving a mostly empty hero', () => {
    for (const frame of TEST_FRAMES) {
      const { profile, extents, aspect, distance } = frameFor(frame);
      const projected = maxProjectedFraction(extents, distance, profile.fov, aspect);
      const larger = Math.max(projected.horizontal, projected.vertical);
      const smaller = Math.min(projected.horizontal, projected.vertical);
      // One axis is filled to the padding limit by construction; the other
      // must not collapse to a thin band in the middle of the frame.
      expect(larger, `${frame.name} primary-axis coverage`).toBeGreaterThan(0.9);
      expect(smaller, `${frame.name} secondary-axis coverage`).toBeGreaterThan(0.42);
    }
  });

  it('keeps the central mark at a readable size at every viewport', () => {
    for (const frame of TEST_FRAMES) {
      const { profile, aspect, distance } = frameFor(frame);
      const markHalfWidth = CENTRAL_O.outerRadius * profile.systemScale;
      const fraction = frameFraction(markHalfWidth, distance, profile.fov, aspect);
      // The mark spans at least ~30% of the frame width and never dominates it.
      expect(fraction * 2, `${frame.name} mark size`).toBeGreaterThan(0.3);
      expect(fraction * 2, `${frame.name} mark size`).toBeLessThan(1.05);
    }
  });

  it('backs the camera off further as the frame narrows', () => {
    const profile = resolveResponsiveProfile(1440);
    const extents = computeSystemExtents(RINGS, profile.orbitSpreadX, profile.orbitSpreadZ, medallions, {
      elevation: profile.cameraElevation,
      yaw: profile.cameraYaw,
      roll: 0,
      systemScale: profile.systemScale,
    });
    const options = {
      fovDegrees: profile.fov,
      padding: profile.framePadding,
      minDistance: profile.minCameraDistance,
      maxDistance: 999,
      nearClearance: 3.4,
    };
    const wide = fitCameraDistance(extents, { ...options, aspect: 16 / 9 });
    const narrow = fitCameraDistance(extents, { ...options, aspect: 9 / 16 });
    expect(narrow).toBeGreaterThan(wide);
  });

  it('gives the orbits enough depth for perspective to read', () => {
    // A medallion swinging toward the camera must appear meaningfully larger
    // than the same medallion on the far side, or the scene reads as 2.5D no
    // matter how correct the geometry is. Measured near/far distance ratio
    // must exceed 1.3x on the innermost ring and 1.7x on the outermost.
    const profile = resolveResponsiveProfile(1440);
    const aspect = 1440 / 900;
    const partners = resolvePartners(PARTNERS);
    const medallions = partners.map((partner) => {
      const spec = plaqueSpecForAspect(partner.aspectHint, partner.padding);
      const { halfWidth, halfHeight } = plaqueHalfExtents(spec, partner.scale * profile.medallionScale);
      return { ring: partner.ring, halfWidth, halfHeight };
    });
    const view = {
      elevation: profile.cameraElevation,
      yaw: profile.cameraYaw,
      roll: profile.systemRoll,
      systemScale: profile.systemScale,
    };
    const extents = computeSystemExtents(RINGS, profile.orbitSpreadX, profile.orbitSpreadZ, medallions, view);
    const distance = fitCameraDistance(extents, {
      fovDegrees: profile.fov,
      aspect,
      padding: profile.framePadding,
      minDistance: profile.minCameraDistance,
      maxDistance: profile.maxCameraDistance,
      nearClearance: 3.4,
    });

    const basis = cameraBasis(profile.cameraElevation, profile.cameraYaw);
    const point = { x: 0, y: 0, z: 0 };
    const ratios = RINGS.map((ring, index) => {
      const sx = ringSpreadX(RINGS, index, profile.orbitSpreadX);
      let near = Infinity;
      let far = 0;
      for (let i = 0; i < 360; i += 1) {
        orbitalPosition(ring, (i / 360) * Math.PI * 2, sx, profile.orbitSpreadZ, point);
        const x = point.x * profile.systemScale;
        const y = point.y * profile.systemScale;
        const z = point.z * profile.systemScale;
        const toward = x * basis.dirX + y * basis.dirY + z * basis.dirZ;
        near = Math.min(near, distance - toward);
        far = Math.max(far, distance - toward);
      }
      return far / near;
    });

    expect(ratios[0], `inner ring near/far ratio ${ratios[0].toFixed(2)}`).toBeGreaterThan(1.3);
    expect(ratios[RINGS.length - 1], `outer ring ratio ${ratios[RINGS.length - 1].toFixed(2)}`).toBeGreaterThan(1.7);
    // Outer orbits must read deeper than inner ones.
    expect(ratios[RINGS.length - 1]).toBeGreaterThan(ratios[0]);
  });

  it('rolls the composition on portrait so the mark stays large', () => {
    const phone = resolveResponsiveProfile(390);
    const desktop = resolveResponsiveProfile(1920);
    expect(phone.systemRoll).toBeGreaterThan(desktop.systemRoll);

    const aspect = 390 / 844;
    const build = (roll: number) =>
      computeSystemExtents(RINGS, phone.orbitSpreadX, phone.orbitSpreadZ, medallions, {
        elevation: phone.cameraElevation,
        yaw: phone.cameraYaw,
        roll,
        systemScale: phone.systemScale,
      });
    const options = {
      fovDegrees: phone.fov,
      aspect,
      padding: phone.framePadding,
      minDistance: phone.minCameraDistance,
      maxDistance: 999,
      nearClearance: 3.4,
    };
    const rolled = fitCameraDistance(build(phone.systemRoll), options);
    const unrolled = fitCameraDistance(build(0), options);
    // Rolling the long axis up the screen lets the camera sit closer.
    expect(rolled).toBeLessThan(unrolled);
  });

  it('opens the orbit ellipses instead of collapsing them to flat lines', () => {
    // Every ring must present a meaningful vertical extent from the shipped
    // camera elevation; a ring that projects to a line reads as flat.
    const profile = resolveResponsiveProfile(1440);
    for (const [index, ring] of RINGS.entries()) {
      const extents = computeSystemExtents([ring], profile.orbitSpreadX, profile.orbitSpreadZ, [], {
        elevation: profile.cameraElevation,
        yaw: profile.cameraYaw,
        roll: profile.systemRoll,
        systemScale: profile.systemScale,
      });
      const openness = extents.halfHeight / extents.halfWidth;
      expect(openness, `ring ${index} projects almost edge-on`).toBeGreaterThan(0.1);
    }
    // And the rings must not all present the same openness, or they read as
    // one flat tangle rather than distinct planes.
    const opennessValues = RINGS.map((ring) => {
      const e = computeSystemExtents([ring], profile.orbitSpreadX, profile.orbitSpreadZ, [], {
        elevation: profile.cameraElevation,
        yaw: profile.cameraYaw,
        roll: profile.systemRoll,
        systemScale: profile.systemScale,
      });
      return e.halfHeight / e.halfWidth;
    });
    expect(Math.max(...opennessValues) / Math.min(...opennessValues)).toBeGreaterThan(1.6);
  });
});
