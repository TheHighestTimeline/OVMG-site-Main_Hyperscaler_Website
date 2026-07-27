/**
 * sceneLayout.ts — SINGLE SOURCE OF TRUTH for all world-space placement.
 * Right-handed Three.js coords. 1 unit ≈ 1 m. Base top surface = Y 0.
 * X = width across plot, Y = up, Z = depth. Building fronts face -Z (the road).
 * Every asset has its local origin at bottom-center of its ground footprint.
 */

export interface Vec3 { x: number; y: number; z: number }
export interface Placement { position: Vec3; rotationY: number }

export const PLOT = {
  width: 14.0,          // X
  depth: 9.0,           // Z
  slabThickness: 1.0,   // thick rocky slab edge (adjusted from 0.65 after visual QA)
  minX: -7.0, maxX: 7.0,
  minZ: -4.5, maxZ: 4.5,
} as const;

export const ROAD = {
  length: 14.0,
  width: 2.8,
  centerZ: -0.65,       // spans Z -2.05 → 0.75
  minZ: -2.05, maxZ: 0.75,
  surfaceY: 0.005,      // above slab top (0), below sidewalks/curbs — was -0.035 which buried the road inside the slab
} as const;

export const SIDEWALKS = {
  building: { width: 0.95, centerZ: 1.225, minZ: 0.75, maxZ: 1.70, topY: 0.06 },
  front:    { width: 0.90, centerZ: -2.50, minZ: -2.95, maxZ: -2.05, topY: 0.06 },
} as const;

export const CROSSWALK = {
  centerX: -4.90,       // pulled inboard after visual QA (was -5.60, overshot plot edge)
  stripeCount: 5,
  stripeWidth: 0.36,    // along X
  stripeGap: 0.20,
} as const;

/** Local footprint targets for asset builders (bounding sizes). */
export const FOOTPRINTS = {
  market:          { w: 2.5, d: 1.9, h: 2.25 },
  communityCenter: { w: 4.0, d: 2.75, h: 3.35 },
  streetLamp:      { w: 0.55, d: 0.55, h: 3.1 },
} as const;

export const MARKET: Placement = {
  position: { x: -4.55, y: 0, z: 2.72 }, rotationY: 0,
};

export const COMMUNITY_CENTER: Placement = {
  position: { x: 1.65, y: 0, z: 2.83 }, rotationY: 0,
};

/** Lamps must sit on sidewalks only (Z within a sidewalk band), never in the road. */
export const LAMPS: Placement[] = [
  { position: { x: -5.55, y: 0, z: 0.98 }, rotationY: 0 },
  { position: { x: -1.70, y: 0, z: -2.30 }, rotationY: Math.PI },
  { position: { x: 4.30, y: 0, z: 0.98 }, rotationY: 0 }, // moved off the CC entrance sightline (QA round 2)
  { position: { x: 5.35, y: 0, z: -2.30 }, rotationY: Math.PI },
];

export const CAMERA = {
  // Camera sits on the road side (-Z) so building fronts and the street face the viewer,
  // matching the isometric reference composition.
  desktop: { position: { x: 11.5, y: 9.0, z: -10.5 }, target: { x: 0, y: 1.7, z: 0 }, viewHeight: 11.6 },
  mobile:  { position: { x: 11.5, y: 9.0, z: -10.5 }, target: { x: 0, y: 1.7, z: 0 }, viewHeight: 12.4 },
  mobileBreakpoint: 700,
} as const;

export const LIFTS = {
  market: 2.25,
  communityCenter: 2.75,
  streetLamps: 1.9, // raised from 1.5 so the lamp stage reads clearly (QA round 2)
  lampStagger: 0.06, // fraction of lamp-phase offset per lamp
} as const;

/** Standalone 4-stage scroll timeline (used when driven by setProgress). */
export const STAGES = {
  overview:        { start: 0.0,  end: 0.20 },
  market:          { start: 0.20, end: 0.45 },
  communityCenter: { start: 0.45, end: 0.70 },
  streetLamps:     { start: 0.70, end: 0.95 },
  settle:          { start: 0.95, end: 1.0 },
} as const;

export type FeatureName = 'overview' | 'market' | 'community-center' | 'street-lights';

export const LIGHTING = {
  hemisphere: { sky: 0x39496e, ground: 0x11141c, intensity: 1.0 },
  key: { color: 0xaebfe6, intensity: 1.5, position: { x: 6, y: 12, z: -8 } },
  rim: { color: 0x44c7ff, intensity: 0.5, position: { x: -8, y: 6, z: 7 } },
  lampColor: 0xffc36b,
  windowColor: 0xffb757,
  background: 0x000000, // canvas is alpha:true; page supplies the dark bg
} as const;

export const QUALITY = {
  maxPixelRatio: 2,
  mobileMaxPixelRatio: 1.75,
  mobileRealLampLights: 2, // remaining lamps use emissive + ground pools only
  desktopRealLampLights: 4,
} as const;
