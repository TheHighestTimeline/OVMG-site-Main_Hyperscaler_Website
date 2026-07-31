/**
 * medallion.ts — the spatial carrier a partner mark travels on.
 *
 * Most marks are square-ish and read best on a circular medallion. Two of the
 * supplied marks are extreme wordmarks (7.0:1 and 3.5:1); forcing those into a
 * circle would shrink them to an illegible sliver, so they get a capsule
 * plaque instead. Both shapes are the same construction — a rounded outline
 * extruded with a bevel — so they share materials and read as one family.
 *
 * The extrusion gives two material groups: group 0 is the front/back face
 * (smoked glass), group 1 is the bevelled edge (machined metal).
 */

import * as THREE from 'three';

/** Above this aspect a circular medallion stops being the better treatment. */
export const WIDE_ASPECT = 2.2;

/** Padding between the logo and the plaque edge, in plaque units. */
const DISC_PADDING = 0.2;

export type PlaqueShape = 'disc' | 'capsule';

export interface PlaqueSpec {
  shape: PlaqueShape;
  /** Plaque size in medallion units (a disc is exactly 1 x 1). */
  width: number;
  height: number;
  cornerRadius: number;
  /** Logo plane size in the same units, aspect preserved exactly. */
  logoWidth: number;
  logoHeight: number;
}

/** Largest rectangle of the given aspect that fits inside a circle of radius r. */
export function fitRectInCircle(aspect: number, radius: number): [number, number] {
  const width = (2 * radius * aspect) / Math.sqrt(1 + aspect * aspect);
  return [width, width / aspect];
}

/**
 * Chooses the carrier for a mark of the given aspect ratio.
 * Aspect is always preserved — the plaque adapts to the logo, never the reverse.
 */
export function plaqueSpecForAspect(aspect: number, padding = DISC_PADDING): PlaqueSpec {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

  if (safeAspect <= WIDE_ASPECT) {
    const [logoWidth, logoHeight] = fitRectInCircle(safeAspect, 0.5 - padding);
    return { shape: 'disc', width: 1, height: 1, cornerRadius: 0.5, logoWidth, logoHeight };
  }

  // Capsule: start from a comfortable cap height, then clamp the total width so
  // even a 7:1 wordmark cannot grow wide enough to crowd the central mark.
  const MAX_LOGO_WIDTH = 1.16;
  let logoHeight = Math.min(0.3, Math.max(0.15, 0.3 - (safeAspect - WIDE_ASPECT) * 0.02));
  let logoWidth = logoHeight * safeAspect;
  if (logoWidth > MAX_LOGO_WIDTH) {
    logoWidth = MAX_LOGO_WIDTH;
    logoHeight = logoWidth / safeAspect;
  }
  const height = logoHeight + 0.26;
  const width = logoWidth + 0.3;
  return { shape: 'capsule', width, height, cornerRadius: height / 2, logoWidth, logoHeight };
}

/** Half-extents of a plaque once instance scaling is applied. */
export function plaqueHalfExtents(spec: PlaqueSpec, scale: number): { halfWidth: number; halfHeight: number } {
  return { halfWidth: (spec.width / 2) * scale, halfHeight: (spec.height / 2) * scale };
}

function roundedOutline(width: number, height: number, radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);

  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.absarc(w - r, -h + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w, h - r);
  shape.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w + r, h);
  shape.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w, -h + r);
  shape.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

export interface PlaqueGeometrySet {
  plate: THREE.ExtrudeGeometry;
  logo: THREE.PlaneGeometry;
  /** Half-depth of the plaque along Z. */
  halfDepth: number;
  dispose(): void;
}

const cache = new Map<string, { set: PlaqueGeometrySet; refs: number }>();

function cacheKey(spec: PlaqueSpec, segments: number): string {
  return `${spec.shape}:${spec.width.toFixed(3)}:${spec.height.toFixed(3)}:${segments}`;
}

/**
 * Shared, reference-counted geometry. Two partners with the same plaque
 * proportions upload one set of buffers between them.
 */
export function acquirePlaqueGeometry(spec: PlaqueSpec, segments: number): PlaqueGeometrySet {
  const key = cacheKey(spec, segments);
  const existing = cache.get(key);
  if (existing) {
    existing.refs += 1;
    return existing.set;
  }

  const depth = 0.038;
  const bevel = 0.016;
  const curveSegments = Math.max(12, Math.round(segments / 4));

  const outline = roundedOutline(spec.width, spec.height, spec.cornerRadius);
  const plate = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments,
  });
  // Extrude builds from z=0 forward; centre it so the plaque straddles its origin.
  plate.translate(0, 0, -(depth / 2 + bevel / 2));
  plate.computeVertexNormals();

  const logo = new THREE.PlaneGeometry(1, 1);

  const set: PlaqueGeometrySet = {
    plate,
    logo,
    halfDepth: depth / 2 + bevel,
    dispose() {
      const entry = cache.get(key);
      if (!entry) return;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      cache.delete(key);
      plate.dispose();
      logo.dispose();
    },
  };

  cache.set(key, { set, refs: 1 });
  return set;
}

/** Test/teardown helper: how many distinct plaque geometries are resident. */
export function plaqueCacheSize(): number {
  return cache.size;
}
