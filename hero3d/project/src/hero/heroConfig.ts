/**
 * heroConfig.ts — the single source of truth for every tunable number in the
 * OVMG partner-orbit hero. Nothing in the render components hard-codes a
 * magnitude; they all read from here so the scene can be re-tuned, re-framed
 * or re-qualitied without touching rendering code.
 */

export type QualityTier = 'low' | 'medium' | 'high';
export type LayoutMode = 'full-bleed' | 'copy-left' | 'copy-right' | 'centered';
export type BackgroundMode = 'dark' | 'transparent';

/**
 * How partner marks resolve against the central mark.
 *
 *   'occluded'     — true depth: a mark passing behind the O is hidden by it.
 *                    Physically correct, but a partner vanishes for part of
 *                    every orbit.
 *   'always-front' — marks are drawn over the O regardless of depth, so every
 *                    partner stays visible for the whole cycle. Marks still
 *                    sort correctly against *each other*, and still shrink and
 *                    dim with distance, so the orbit continues to read as 3D.
 */
export type LogoLayerMode = 'occluded' | 'always-front';

/** One true 3D elliptical orbit plane. */
export interface RingConfig {
  /** Stable index; partner manifest entries reference this. */
  id: number;
  /** Ellipse semi-axis along the ring plane's local X. */
  radiusX: number;
  /** Ellipse semi-axis along the ring plane's local Z. */
  radiusZ: number;
  /** Plane offset along world Y before inclination is applied. */
  y: number;
  /** Plane inclination about X, radians. */
  inclinationX: number;
  /** Plane inclination about Z, radians. */
  inclinationZ: number;
  /** +1 counter-clockwise, -1 clockwise (seen from +Y). */
  direction: 1 | -1;
  /** Radians per second. Time based, never frame based. */
  angularSpeed: number;
  /** Fixed starting rotation of the whole plane, radians. */
  phase: number;
  /** Tube radius of the drawn path, world units. */
  tubeRadius: number;
  /** Base opacity of the ring material. */
  opacity: number;
  /** 0..1 — drives emissive strength / how much the ring catches light. */
  emphasis: number;
  /** Ring tint. */
  color: string;
}

export interface StarLayerConfig {
  id: string;
  count: number;
  /** Inner/outer radius of the spherical shell the layer occupies. */
  innerRadius: number;
  outerRadius: number;
  /** Base point size in world units (size-attenuated). */
  size: number;
  sizeJitter: number;
  brightness: number;
  /** Multiplier applied to pointer parallax. */
  pointerFactor: number;
  /** Multiplier applied to scroll parallax. */
  scrollFactor: number;
  /** Slow intrinsic drift, radians/second. */
  drift: number;
  /** 0 = crisp star, 1 = soft dust puff. */
  softness: number;
  twinkle: number;
}

export interface QualityProfile {
  tier: QualityTier;
  maxDpr: number;
  shadows: boolean;
  shadowMapSize: number;
  postprocessing: boolean;
  bloom: boolean;
  /** Tessellation of the carved front face of the O. */
  faceThetaSegments: number;
  faceRadialSegments: number;
  /** Lathe segments for the O body. */
  bodySegments: number;
  /** Tube segments along each orbital ring. */
  ringTubularSegments: number;
  ringRadialSegments: number;
  /** Multiplier on every star layer count. */
  starDensity: number;
  /** Medallion disc/rim tessellation. */
  medallionSegments: number;
  anisotropy: number;
}

export interface ResponsiveProfile {
  /** Max viewport width this profile applies to (Infinity for desktop). */
  maxWidth: number;
  label: string;
  /** Lower bound on the fitted camera distance. */
  minCameraDistance: number;
  /** Upper bound, so a very narrow frame cannot push the mark to a speck. */
  maxCameraDistance: number;
  /** Camera elevation above the system equator, radians. Drives how open the
   * orbit ellipses read: too low and every ring collapses to a flat line. */
  cameraElevation: number;
  /** Fixed azimuth, radians. Non-zero gives the off-axis three-quarter view. */
  cameraYaw: number;
  /** Roll of the whole system about the view axis, radians. Portrait frames
   * roll the composition so its long axis runs up the screen instead of
   * across it, which is what keeps the mark large on a phone. */
  systemRoll: number;
  targetY: number;
  fov: number;
  /** Uniform scale applied to the whole orbital system. */
  systemScale: number;
  /**
   * Anisotropic orbit spread. Portrait viewports compress X (little horizontal
   * room) and stretch Z (depth is free), so medallions travel toward and away
   * from the camera rather than sliding off the edges.
   */
  orbitSpreadX: number;
  orbitSpreadZ: number;
  /** Margin left around the composition when fitting the camera. */
  framePadding: number;
  /** World-space offset of the composition, used to clear hero copy. */
  offsetX: number;
  offsetY: number;
  medallionScale: number;
  starDensity: number;
}

export interface HeroConfig {
  layout: LayoutMode;
  background: BackgroundMode;
  height: string;
  minHeight: string;
  /** Nudge the O away from dead centre (world units) for copy-beside layouts. */
  centralOffset: [number, number, number];
  cameraTarget: [number, number, number];
  /** 0..1 global multiplier on all motion. */
  motionIntensity: number;
  pointerResponse: number;
  scrollResponse: number;
  quality: QualityTier | 'auto';
  labels: boolean;
  /** Whether the central mark may hide a partner passing behind it. */
  logoLayer: LogoLayerMode;
  /** Fraction of the canvas width reserved for DOM copy (kept clear of orbits). */
  safeZone: { left: number; right: number; top: number; bottom: number };
}

/* ------------------------------------------------------------------ */
/* Central object                                                      */
/* ------------------------------------------------------------------ */

/**
 * Radii are world units derived from the brand raster's measured proportions
 * (hero3d/tools/prepare-assets.mjs -> public/brand/o-metrics.json).
 *
 * Measured from the supplied 460x460 asset:
 *   innerRadius / outerRadius = 0.5571  ->  0.724 / 1.30
 *
 * The automated band measurement reported the engraving running from 0.56 of
 * the outer radius, but inspecting the baked relief map shows that inner
 * stretch is the photographed object's *inner bevel*, not decoration. Painting
 * that bevel onto a flat face while also modelling a real chamfer doubled it,
 * which is what made the mark read as a rounded tube. The carved band is
 * therefore taken from where the glyphs actually begin (0.72 of the outer
 * radius), and the inner bevel is real geometry.
 */
export const CENTRAL_O = {
  outerRadius: 1.3,
  innerRadius: 0.724,
  /** Half-depth: the O spans -depth..+depth along Z. */
  depth: 0.175,
  /**
   * Radial start/end of the recessed carved band, as a fraction of
   * outerRadius. Clamped against the bevels by bandRadii().
   *
   * Measured twice, independently, and both measurements agree: the engraving
   * covers essentially the WHOLE face. `o-metrics.json` puts it at 0.560–0.994
   * of the outer radius from the brand raster ("there is no flat undecorated
   * lip on either side of the carving"), and an angular-luminance-variance scan
   * of the reference photograph puts the bore edge at 0.63 and continuous
   * carving from 0.64 to 0.99.
   *
   * An earlier pass pulled `bandInner` in to 0.72 to cure a "rounded tube"
   * read. That was the wrong lever: the tube came from double-counting the
   * inner chamfer, not from the band being too wide. Pulling the band in left a
   * broad smooth plateau between the bore and the first glyph — roughly a third
   * of the face — which is not on the real object. The chamfer is now modelled
   * once (see `innerBevelDrop`) and the band runs nearly edge to edge, as it
   * does on the reference.
   */
  bandInner: 0.569,
  bandOuter: 0.99,
  /** Width of the flat lip between the OUTER bevel and the carved band. */
  faceLip: 0.006,
  /**
   * Hairline flat between the bore and the first glyph.
   *
   * Kept deliberately tiny. The raster has no smooth inner stretch at all, so
   * anything wider than a hairline here invents a plateau the object does not
   * have.
   */
  innerFaceLip: 0.016,
  /**
   * How far the inner chamfer drops from the face plane to the bore. Small:
   * it is an edge-break on the opening, not a conical surface. An earlier pass
   * had this at 0.058 across a wide radial run, which produced the broad
   * light-catching cone that read as an undecorated plateau.
   */
  innerBevelDrop: 0.014,
  /** How far the carved band floor sits below the outer front face. */
  bandRecess: 0.028,
  /** Bevel width on the outer edge. */
  edgeBevel: 0.016,
  /** Displacement applied to the carved relief (negative = engraved inward). */
  reliefDepth: 0.03,
  /** Ambient motion budget. */
  spinSpeed: 0.0125, // rad/s -> a few degrees over a slow cycle
  spinAmplitude: 0.052, // rad, max deviation from rest (~3 degrees)
  floatAmplitude: 0.022, // world units
  floatSpeed: 0.21,
  tiltAmplitude: 0.026,
} as const;

/* ------------------------------------------------------------------ */
/* Orbital rings                                                       */
/* ------------------------------------------------------------------ */

/**
 * Four orbit planes. The inclinations deliberately alternate in sign and vary
 * in magnitude: combined with the camera elevation this makes some rings read
 * wide open and others nearly edge-on, which is what separates them into
 * distinct planes rather than one flat tangle of ellipses.
 */
export const RINGS: RingConfig[] = [
  {
    id: 0,
    // Sized so that even at the tightest mobile spread the medallion never
    // interpenetrates the stone when it is level with the O's plane.
    radiusX: 2.26,
    radiusZ: 1.78,
    y: 0.44,
    inclinationX: 0.34,
    inclinationZ: 0.14,
    direction: 1,
    angularSpeed: 0.05,
    phase: 0.0,
    tubeRadius: 0.0075,
    opacity: 0.55,
    emphasis: 0.85,
    color: '#9fb6d4',
  },
  {
    id: 1,
    radiusX: 3.02,
    radiusZ: 2.24,
    y: -0.86,
    inclinationX: -0.36,
    inclinationZ: -0.22,
    direction: -1,
    angularSpeed: 0.0395,
    phase: 0.9,
    tubeRadius: 0.0065,
    opacity: 0.48,
    emphasis: 0.68,
    color: '#93aed0',
  },
  {
    id: 2,
    radiusX: 3.74,
    radiusZ: 2.66,
    y: 0.98,
    inclinationX: 0.5,
    inclinationZ: 0.26,
    direction: 1,
    angularSpeed: 0.0305,
    phase: 2.1,
    tubeRadius: 0.0056,
    opacity: 0.4,
    emphasis: 0.54,
    color: '#87a1c4',
  },
  {
    id: 3,
    radiusX: 4.46,
    radiusZ: 3.08,
    y: -0.62,
    inclinationX: -0.18,
    inclinationZ: -0.09,
    direction: -1,
    angularSpeed: 0.0225,
    phase: 3.4,
    tubeRadius: 0.0048,
    opacity: 0.32,
    emphasis: 0.42,
    color: '#7d95b8',
  },
  {
    id: 4,
    radiusX: 4.98,
    radiusZ: 3.4,
    y: 0.26,
    inclinationX: 0.26,
    inclinationZ: 0.18,
    direction: 1,
    angularSpeed: 0.0165,
    phase: 4.7,
    tubeRadius: 0.0042,
    opacity: 0.26,
    emphasis: 0.34,
    color: '#7589ab',
  },
];

/* ------------------------------------------------------------------ */
/* Starfield                                                           */
/* ------------------------------------------------------------------ */

export const STAR_LAYERS: StarLayerConfig[] = [
  {
    id: 'distant',
    count: 2600,
    innerRadius: 42,
    outerRadius: 78,
    size: 0.32,
    sizeJitter: 0.7,
    brightness: 0.92,
    pointerFactor: 0.1,
    scrollFactor: 0.16,
    drift: 0.0032,
    softness: 0.15,
    twinkle: 0.35,
  },
  {
    id: 'mid',
    count: 1050,
    innerRadius: 20,
    outerRadius: 40,
    size: 0.24,
    sizeJitter: 0.8,
    brightness: 1.05,
    pointerFactor: 0.34,
    scrollFactor: 0.46,
    drift: 0.0068,
    softness: 0.3,
    twinkle: 0.6,
  },
  {
    id: 'near',
    count: 340,
    innerRadius: 11,
    outerRadius: 19,
    size: 0.14,
    sizeJitter: 0.5,
    brightness: 0.34,
    pointerFactor: 0.85,
    scrollFactor: 1.0,
    drift: 0.0125,
    softness: 0.85,
    twinkle: 0.25,
  },
];

/* ------------------------------------------------------------------ */
/* Quality tiers                                                       */
/* ------------------------------------------------------------------ */

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    tier: 'high',
    maxDpr: 2,
    shadows: true,
    shadowMapSize: 2048,
    postprocessing: true,
    bloom: true,
    faceThetaSegments: 720,
    faceRadialSegments: 44,
    bodySegments: 192,
    ringTubularSegments: 420,
    ringRadialSegments: 8,
    starDensity: 1,
    medallionSegments: 72,
    anisotropy: 16,
  },
  medium: {
    tier: 'medium',
    maxDpr: 2,
    shadows: true,
    shadowMapSize: 1024,
    postprocessing: true,
    bloom: true,
    faceThetaSegments: 480,
    faceRadialSegments: 30,
    bodySegments: 128,
    ringTubularSegments: 280,
    ringRadialSegments: 6,
    starDensity: 0.72,
    medallionSegments: 56,
    anisotropy: 8,
  },
  low: {
    tier: 'low',
    maxDpr: 2,
    shadows: false,
    shadowMapSize: 512,
    postprocessing: false,
    bloom: false,
    faceThetaSegments: 320,
    faceRadialSegments: 22,
    bodySegments: 96,
    ringTubularSegments: 180,
    ringRadialSegments: 5,
    starDensity: 0.46,
    medallionSegments: 40,
    anisotropy: 8,
  },
};

/* ------------------------------------------------------------------ */
/* Responsive framing                                                  */
/* ------------------------------------------------------------------ */

/** Ordered narrow -> wide. First profile whose maxWidth >= viewport wins. */
export const RESPONSIVE_PROFILES: ResponsiveProfile[] = [
  {
    maxWidth: 400,
    label: 'phone-sm',
    minCameraDistance: 8.6,
    maxCameraDistance: 27,
    cameraElevation: 0.42,
    cameraYaw: 0.1,
    systemRoll: 1.02,
    targetY: -0.02,
    fov: 42,
    systemScale: 0.9,
    orbitSpreadX: 0.58,
    orbitSpreadZ: 1.12,
    framePadding: 1.025,
    offsetX: 0,
    offsetY: 0.0,
    medallionScale: 1.14,
    starDensity: 0.55,
  },
  {
    maxWidth: 540,
    label: 'phone',
    minCameraDistance: 8.6,
    maxCameraDistance: 26,
    cameraElevation: 0.4,
    cameraYaw: 0.11,
    systemRoll: 0.94,
    targetY: -0.02,
    fov: 41,
    systemScale: 0.92,
    orbitSpreadX: 0.62,
    orbitSpreadZ: 1.1,
    framePadding: 1.025,
    offsetX: 0,
    offsetY: 0.0,
    medallionScale: 1.1,
    starDensity: 0.6,
  },
  {
    maxWidth: 820,
    label: 'tablet',
    minCameraDistance: 9.4,
    maxCameraDistance: 22,
    cameraElevation: 0.38,
    cameraYaw: 0.13,
    systemRoll: 0.52,
    targetY: -0.02,
    fov: 36,
    systemScale: 0.97,
    orbitSpreadX: 0.84,
    orbitSpreadZ: 1.26,
    framePadding: 1.05,
    offsetX: 0,
    offsetY: 0.0,
    medallionScale: 1.24,
    starDensity: 0.78,
  },
  {
    maxWidth: 1280,
    label: 'laptop',
    minCameraDistance: 9.6,
    maxCameraDistance: 20,
    cameraElevation: 0.35,
    cameraYaw: 0.16,
    systemRoll: 0.1,
    targetY: -0.03,
    fov: 33,
    systemScale: 1.0,
    orbitSpreadX: 1.0,
    orbitSpreadZ: 1.32,
    framePadding: 1.06,
    offsetX: 0,
    offsetY: 0.0,
    medallionScale: 1.0,
    starDensity: 0.9,
  },
  {
    maxWidth: Number.POSITIVE_INFINITY,
    label: 'desktop',
    minCameraDistance: 9.4,
    maxCameraDistance: 20,
    cameraElevation: 0.34,
    cameraYaw: 0.17,
    systemRoll: 0.08,
    targetY: -0.03,
    fov: 32,
    systemScale: 1.04,
    orbitSpreadX: 1.0,
    orbitSpreadZ: 1.34,
    framePadding: 1.06,
    offsetX: 0,
    offsetY: 0.0,
    medallionScale: 1.0,
    starDensity: 1,
  },
];

export function resolveResponsiveProfile(viewportWidth: number): ResponsiveProfile {
  for (const profile of RESPONSIVE_PROFILES) {
    if (viewportWidth <= profile.maxWidth) return profile;
  }
  return RESPONSIVE_PROFILES[RESPONSIVE_PROFILES.length - 1];
}

/* ------------------------------------------------------------------ */
/* Motion budgets                                                      */
/* ------------------------------------------------------------------ */

export const MOTION = {
  /** Pointer parallax, in radians of camera yaw/pitch at full deflection. */
  pointerYaw: 0.115,
  pointerPitch: 0.075,
  /** Exponential smoothing half-life for pointer easing, seconds. */
  pointerDamping: 0.34,
  /** Scroll-driven camera dolly along Z, world units over the full hero exit. */
  scrollDolly: 1.35,
  /** Scroll-driven scene tilt, radians (~2.6 degrees max). */
  scrollTilt: 0.046,
  /** Scroll-driven vertical drift of the whole system. */
  scrollLift: 0.5,
  /** Scroll fade: opacity multiplier reaches this at progress 1. */
  scrollFadeTo: 0.18,
  /** Star parallax at full pointer deflection, world units (before layer factor). */
  starPointerShift: 1.5,
  /** Star parallax over full scroll, world units (before layer factor). */
  starScrollShift: 2.6,
} as const;

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  layout: 'full-bleed',
  background: 'dark',
  height: '100%',
  minHeight: '420px',
  centralOffset: [0, 0, 0],
  cameraTarget: [0, -0.03, 0],
  motionIntensity: 1,
  pointerResponse: 1,
  scrollResponse: 1,
  quality: 'auto',
  labels: false,
  // Spatial truth wins: a mark passing behind the O is hidden by it, the same
  // way the rings are. Marks reappear as they come back around the front.
  logoLayer: 'occluded',
  safeZone: { left: 0, right: 0, top: 0, bottom: 0 },
};

/** Palette shared between WebGL materials and the DOM chrome. */
export const PALETTE = {
  voidTop: '#05070d',
  voidBottom: '#0b1020',
  nebulaBlue: '#12233f',
  stone: '#cfc9c0',
  stoneDeep: '#7f7a73',
  silver: '#d6dde6',
  electric: '#1e6bff',
  sky: '#44c7ff',
  teal: '#4fd3c4',
  warm: '#ffd2a1',
} as const;
