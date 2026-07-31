/**
 * framing.ts — camera framing derived from the scene's real extents.
 *
 * Rather than hard-coding a camera distance per breakpoint and hoping nothing
 * falls off the edge, the system projects every orbit onto the camera's own
 * screen plane, measures how far the outermost medallion actually reaches, and
 * solves for the distance that keeps that inside the frustum at the current
 * aspect ratio. "Nothing clips against the viewport" is therefore a property
 * of the code rather than a hope.
 *
 * Pure functions, no three.js objects: directly unit-testable.
 */

import type { RingConfig } from '../../hero/heroConfig';
import { orbitalPosition, type Vec3 } from './orbitalMath';

export interface SystemExtents {
  /** Largest horizontal reach on the camera's screen plane, plus plaque size. */
  halfWidth: number;
  /** Largest vertical reach on the camera's screen plane, plus plaque size. */
  halfHeight: number;
  /** Closest approach toward the camera along its view axis. */
  maxTowardCamera: number;
  /**
   * Every sampled extreme as [horizontalReach, verticalReach, towardCamera],
   * with the plaque's own size already folded in.
   *
   * The fit needs these rather than the bounding half-extents because the
   * projection is perspective, not orthographic: a medallion swinging toward
   * the camera projects further from centre than its world offset implies. A
   * fit computed from bounding extents alone lets the nearest medallion clip
   * off the edge even though the bounding box "fits".
   */
  samples: Float32Array;
}

export interface MedallionExtent {
  ring: number;
  halfWidth: number;
  halfHeight: number;
}

export interface ViewBasis {
  /** Camera elevation above the system's equator, radians. */
  elevation: number;
  /** Camera azimuth, radians. Non-zero gives the off-axis three-quarter view. */
  yaw: number;
  /** Roll of the whole system about the view axis, radians. */
  roll: number;
  /** Uniform scale applied to the system group. */
  systemScale: number;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Horizontal compression applied to one ring, as a multiplier on its radiusX.
 *
 * A narrow portrait frame has to squeeze the system, but the innermost ring
 * cannot be squeezed: doing so would drive its medallions into the central
 * stone. So the innermost radius is pinned and only the *gaps* between rings
 * are scaled. Scaling gaps rather than interpolating a per-ring factor is what
 * keeps the ordering monotonic — a naive ramp can compress an outer ring past
 * the one inside it and make the two swap places.
 */
export function ringSpreadX(rings: RingConfig[], ringIndex: number, spreadX: number): number {
  if (rings.length <= 1 || ringIndex <= 0) return 1;
  const base = rings[0].radiusX;
  const own = rings[ringIndex].radiusX;
  if (own <= 0) return 1;
  return (base + (own - base) * spreadX) / own;
}

interface Basis {
  rightX: number;
  rightY: number;
  rightZ: number;
  upX: number;
  upY: number;
  upZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
}

/**
 * Orthonormal camera basis for a camera orbiting the origin at `elevation` and
 * `yaw`. `dir` points from the origin toward the camera.
 */
export function cameraBasis(elevation: number, yaw: number): Basis {
  const ce = Math.cos(elevation);
  const se = Math.sin(elevation);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Direction from target to camera.
  const dirX = sy * ce;
  const dirY = se;
  const dirZ = cy * ce;

  // right = normalize(cross(worldUp, dir)); worldUp is +Y.
  const rx = 1 * dirZ - 0 * dirY;
  const ry = 0 * dirX - 0 * dirZ;
  const rz = 0 * dirY - 1 * dirX;
  const rl = Math.hypot(rx, ry, rz) || 1;

  const rightX = rx / rl;
  const rightY = ry / rl;
  const rightZ = rz / rl;

  // up = cross(dir, right)
  const upX = dirY * rightZ - dirZ * rightY;
  const upY = dirZ * rightX - dirX * rightZ;
  const upZ = dirX * rightY - dirY * rightX;

  return { rightX, rightY, rightZ, upX, upY, upZ, dirX, dirY, dirZ };
}

/**
 * Samples every ring and projects it onto the camera's screen plane to find
 * the true bounding half-extents of the composition.
 */
export function computeSystemExtents(
  rings: RingConfig[],
  spreadX: number,
  spreadZ: number,
  medallions: MedallionExtent[],
  view: ViewBasis,
  samples = 240,
): SystemExtents {
  const basis = cameraBasis(view.elevation, view.yaw);
  const cr = Math.cos(view.roll);
  const sr = Math.sin(view.roll);

  let halfWidth = 0;
  let halfHeight = 0;
  let maxTowardCamera = 0;
  const samples_ = new Float32Array(rings.length * samples * 3);
  let cursor = 0;

  for (const [index, ring] of rings.entries()) {
    const onRing = medallions.filter((m) => m.ring === ring.id);
    const padX = onRing.length ? Math.max(...onRing.map((m) => m.halfWidth)) : ring.tubeRadius;
    const padY = onRing.length ? Math.max(...onRing.map((m) => m.halfHeight)) : ring.tubeRadius;
    const sx = ringSpreadX(rings, index, spreadX);

    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      orbitalPosition(ring, angle, sx, spreadZ, scratch);

      // System roll about Z, then the uniform system scale.
      const rx = (scratch.x * cr - scratch.y * sr) * view.systemScale;
      const ry = (scratch.x * sr + scratch.y * cr) * view.systemScale;
      const rz = scratch.z * view.systemScale;

      const horizontal = rx * basis.rightX + ry * basis.rightY + rz * basis.rightZ;
      const vertical = rx * basis.upX + ry * basis.upY + rz * basis.upZ;
      const toward = rx * basis.dirX + ry * basis.dirY + rz * basis.dirZ;

      const h = Math.abs(horizontal) + padX;
      const v = Math.abs(vertical) + padY;
      halfWidth = Math.max(halfWidth, h);
      halfHeight = Math.max(halfHeight, v);
      maxTowardCamera = Math.max(maxTowardCamera, toward + Math.max(padX, padY));

      samples_[cursor] = h;
      samples_[cursor + 1] = v;
      samples_[cursor + 2] = toward;
      cursor += 3;
    }
  }

  return { halfWidth, halfHeight, maxTowardCamera, samples: samples_ };
}

export interface FitOptions {
  fovDegrees: number;
  aspect: number;
  /** Multiplier on the required extents; 1.06 leaves a 6% margin. */
  padding: number;
  minDistance: number;
  maxDistance: number;
  /** Extra clearance so the nearest medallion never crosses the near plane. */
  nearClearance: number;
}

/**
 * Distance at which every sampled point fits the frustum.
 *
 * For a point `d` units toward the camera with screen-plane reach `h`, the
 * camera must sit at distance D such that h <= tan(fov/2) * aspect * (D - d),
 * i.e. D >= h / (tan * aspect) + d. Solving that per sample and taking the
 * maximum is exact under perspective, where a fit computed from bounding
 * extents alone would let the nearest medallion clip off the edge.
 *
 * The horizontal term divides by aspect, which is what makes a narrow portrait
 * frame pull the camera back instead of cropping the outer ring.
 */
export function fitCameraDistance(extents: SystemExtents, options: FitOptions): number {
  const t = Math.tan((options.fovDegrees * Math.PI) / 360);
  const aspect = Math.max(options.aspect, 0.01);
  const pad = options.padding;

  let required = 0;
  const samples = extents.samples;
  for (let i = 0; i < samples.length; i += 3) {
    const h = samples[i] * pad;
    const v = samples[i + 1] * pad;
    const d = samples[i + 2];
    const forWidth = h / (t * aspect) + d;
    const forHeight = v / t + d;
    if (forWidth > required) required = forWidth;
    if (forHeight > required) required = forHeight;
  }

  const withClearance = Math.max(required, extents.maxTowardCamera + options.nearClearance);
  return Math.min(options.maxDistance, Math.max(options.minDistance, withClearance));
}

/**
 * Largest projected screen-space offset, as a fraction of the frame half-size.
 * Anything above 1 is clipped. Used by tests to prove nothing leaves the frame.
 */
export function maxProjectedFraction(
  extents: SystemExtents,
  distance: number,
  fovDegrees: number,
  aspect: number,
): { horizontal: number; vertical: number } {
  const t = Math.tan((fovDegrees * Math.PI) / 360);
  let horizontal = 0;
  let vertical = 0;
  const samples = extents.samples;
  for (let i = 0; i < samples.length; i += 3) {
    const depth = Math.max(distance - samples[i + 2], 0.001);
    horizontal = Math.max(horizontal, samples[i] / (t * aspect * depth));
    vertical = Math.max(vertical, samples[i + 1] / (t * depth));
  }
  return { horizontal, vertical };
}

/**
 * Projects a world half-extent to a fraction of the frame's half-width, so
 * tests can assert how much of the viewport the central mark occupies.
 */
export function frameFraction(halfExtent: number, distance: number, fovDegrees: number, aspect: number): number {
  const t = Math.tan((fovDegrees * Math.PI) / 360);
  const halfWidthAtDistance = t * distance * aspect;
  return halfExtent / halfWidthAtDistance;
}

