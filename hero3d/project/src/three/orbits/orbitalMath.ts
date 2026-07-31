/**
 * orbitalMath.ts — pure orbital mathematics. No three.js scene objects, no
 * React, no DOM, so every function here is directly unit-testable.
 *
 * An orbit is an ellipse lying in its own plane. The plane starts in world XZ
 * at height `y`, is inclined by `inclinationX` about X and `inclinationZ`
 * about Z, then spun by the ring's fixed `phase`. A body's position is the
 * ellipse point at its current angle, pushed through that plane transform.
 */

import type { RingConfig } from '../../hero/heroConfig';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const TWO_PI = Math.PI * 2;

export function wrapAngle(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Angle of a body at time `elapsed`. Time-based: the result depends only on
 * absolute elapsed seconds, never on how many frames have been drawn, so a
 * dropped frame or a paused tab can never make the system drift.
 *
 * `ring.phase` is a per-ring offset applied on top of the body's own phase.
 * Because the path is a closed ellipse, an angular offset only changes where a
 * body starts — it never changes the drawn ring.
 */
export function orbitalAngle(ring: RingConfig, elapsed: number, phase: number, speedScale = 1): number {
  return wrapAngle(phase + ring.phase + ring.direction * ring.angularSpeed * speedScale * elapsed);
}

/**
 * The un-inclined ellipse point, in the ring plane's local frame.
 *
 * Spread is anisotropic on purpose. Narrow portrait viewports have very little
 * horizontal room but plenty of depth, so phones compress the ellipse in X and
 * stretch it in Z: the medallions swing toward and away from the camera
 * instead of sliding off the left and right edges.
 */
export function ellipsePoint(
  ring: RingConfig,
  angle: number,
  spreadX: number,
  spreadZ: number,
  out: Vec3,
): Vec3 {
  out.x = Math.cos(angle) * ring.radiusX * spreadX;
  out.y = ring.y;
  out.z = Math.sin(angle) * ring.radiusZ * spreadZ;
  return out;
}

/**
 * Rotates a local ring-plane point into system space.
 *
 * three.js composes Euler order 'XYZ' as R = Rx * Ry * Rz, i.e. Z is applied
 * to the vector first and X last. This mirrors that exactly, so a ring group
 * carrying rotation=[inclinationX, 0, inclinationZ] and the bodies positioned
 * by this function share one frame — the drawn tube and the orbiting
 * medallions can never drift apart.
 */
export function applyInclination(ring: RingConfig, point: Vec3, out: Vec3): Vec3 {
  const cx = Math.cos(ring.inclinationX);
  const sx = Math.sin(ring.inclinationX);
  const cz = Math.cos(ring.inclinationZ);
  const sz = Math.sin(ring.inclinationZ);

  // Rotate about Z first.
  const x1 = point.x * cz - point.y * sz;
  const y1 = point.x * sz + point.y * cz;
  const z1 = point.z;

  // Then about X.
  out.x = x1;
  out.y = y1 * cx - z1 * sx;
  out.z = y1 * sx + z1 * cx;
  return out;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Full position of a body on `ring` at `angle`, in system space.
 * Allocation-free: pass a reusable `out`.
 */
export function orbitalPosition(
  ring: RingConfig,
  angle: number,
  spreadX: number,
  spreadZ: number,
  out: Vec3,
): Vec3 {
  ellipsePoint(ring, angle, spreadX, spreadZ, scratch);
  return applyInclination(ring, scratch, out);
}

/** Position at a given time — the composition used by the render loop. */
export function orbitalPositionAtTime(
  ring: RingConfig,
  elapsed: number,
  phase: number,
  spreadX: number,
  spreadZ: number,
  out: Vec3,
  speedScale = 1,
): Vec3 {
  return orbitalPosition(ring, orbitalAngle(ring, elapsed, phase, speedScale), spreadX, spreadZ, out);
}

/** Seconds for one full revolution. */
export function orbitalPeriod(ring: RingConfig, speedScale = 1): number {
  const speed = Math.abs(ring.angularSpeed * speedScale);
  return speed === 0 ? Number.POSITIVE_INFINITY : TWO_PI / speed;
}

/**
 * Depth-based presentation weight. Bodies further from the camera read
 * smaller and quieter; this returns 0..1 where 1 is nearest.
 * `z` is the body's view-space depth contribution (system-space z here,
 * since the camera looks down -Z at the system).
 */
export function depthWeight(z: number, nearZ: number, farZ: number): number {
  if (farZ === nearZ) return 1;
  const t = (z - farZ) / (nearZ - farZ);
  return Math.min(1, Math.max(0, t));
}

/** Smoothstep, used for depth-driven fades. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential smoothing.
 * `halfLife` is the time in seconds for the remaining error to halve.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  const factor = 1 - Math.pow(2, -dt / halfLife);
  return current + (target - current) * factor;
}

/**
 * Angular gap between two bodies on the same ring, in radians (0..PI).
 * Used to prove the manifest never lets medallions overlap.
 */
export function angularGap(a: number, b: number): number {
  const diff = Math.abs(wrapAngle(a) - wrapAngle(b));
  return diff > Math.PI ? TWO_PI - diff : diff;
}

/**
 * Minimum angular gap seen over one full period for a set of bodies sharing a
 * ring. Because they all travel at the same speed the gap is constant, but
 * this samples anyway so the guarantee is measured rather than assumed.
 */
export function minimumGapOverPeriod(
  ring: RingConfig,
  phases: number[],
  samples = 64,
  speedScale = 1,
): number {
  if (phases.length < 2) return Math.PI;
  const period = orbitalPeriod(ring, speedScale);
  let min = Math.PI;
  for (let s = 0; s < samples; s += 1) {
    const t = (s / samples) * (Number.isFinite(period) ? period : 1);
    const angles = phases.map((p) => orbitalAngle(ring, t, p, speedScale));
    for (let i = 0; i < angles.length; i += 1) {
      for (let j = i + 1; j < angles.length; j += 1) {
        min = Math.min(min, angularGap(angles[i], angles[j]));
      }
    }
  }
  return min;
}

/**
 * Composition guard: does a medallion at `pos` physically interpenetrate the
 * central stone?
 *
 * Passing *behind* or *in front of* the O is not a collision — it is the whole
 * point, and real depth testing handles it. A collision is only when the
 * medallion is level with the O's slab (|z| within the stone's depth) and its
 * disc overlaps the annulus in the plane.
 */
export function intersectsCentralSolid(
  pos: Vec3,
  centralOuterRadius: number,
  centralDepth: number,
  medallionRadius: number,
  medallionHalfThickness = 0.05,
): boolean {
  if (Math.abs(pos.z) > centralDepth + medallionHalfThickness) return false;
  const radial = Math.hypot(pos.x, pos.y);
  // Fully outside the mark's silhouette.
  return radial - medallionRadius <= centralOuterRadius;
}
