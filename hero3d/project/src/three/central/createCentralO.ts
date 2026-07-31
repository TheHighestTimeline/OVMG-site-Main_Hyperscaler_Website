/**
 * createCentralO.ts — true 3D geometry for the OneVibeMediaGroup "O".
 *
 * The brand mark is a carved stone annulus: an outer bevelled rim, a recessed
 * band carrying a Greek-key style engraving, an inner lip and a chamfered
 * opening. That cross-section is modelled literally as a lathe profile, so the
 * silhouette, the bevels and the recess are real geometry — not a texture on a
 * torus and not a flat plane pretending to be a model.
 *
 *   profile (r, z half-plane)          z
 *      ┌──────────────┐  outer bevel   ▲
 *      │   ┌───┐      │  band recess   │  front = +z
 *   ───┴───┘   └──────┴───              └──► r
 *
 * The engraved band floor is covered by a densely tessellated ring mesh whose
 * displacement map is derived from the supplied brand raster, so the carving
 * is genuine geometric relief that self-shades and breaks the silhouette at
 * grazing angles.
 *
 * The only raster-derived input is surface detail. A future SVG outline of the
 * mark would let the *silhouette* itself carry the decorative cut-outs; see
 * docs/ASSET_CONTRACT.md.
 */

import * as THREE from 'three';
import { CENTRAL_O } from '../../hero/heroConfig';

export interface CentralOGeometry {
  body: THREE.LatheGeometry;
  face: THREE.RingGeometry;
  innerRim: THREE.TorusGeometry;
  /** Radius at which the carved band starts/ends, world units. */
  bandInnerRadius: number;
  bandOuterRadius: number;
  faceZ: number;
  dispose(): void;
}

export interface CentralOOptions {
  bodySegments: number;
  faceThetaSegments: number;
  faceRadialSegments: number;
}

/**
 * Builds the lathe profile as a closed loop in the (radius, depth) half-plane.
 * Exported for unit tests: the loop must be closed, monotonic where it should
 * be, and never produce a negative radius.
 */
/**
 * Radial extents of the recessed carved band.
 *
 * The measured artwork puts the engraving across essentially the whole ring
 * face (0.560 to 0.994 of the outer radius), leaving no flat lip worth
 * modelling. The band is therefore derived from the geometry — just inside the
 * chamfers — rather than from free-floating fractions. Deriving it is what
 * keeps the lathe profile valid: an independently-authored `bandInner` smaller
 * than `innerRadius + bevel` folds the profile back on itself and produces a
 * fat plain ring that reads as a tube instead of a carved seal.
 */
export function bandRadii(): { inner: number; outer: number } {
  const R = CENTRAL_O.outerRadius;
  const Ri = CENTRAL_O.innerRadius;
  const bev = CENTRAL_O.edgeBevel;
  const lip = CENTRAL_O.faceLip;

  const minInner = Ri + bev + lip;
  const maxOuter = R - bev - lip;
  const inner = Math.max(minInner, R * CENTRAL_O.bandInner);
  const outer = Math.min(maxOuter, R * CENTRAL_O.bandOuter);
  return { inner, outer: Math.max(outer, inner + 0.12) };
}

export function buildProfile(): THREE.Vector2[] {
  const R = CENTRAL_O.outerRadius;
  const Ri = CENTRAL_O.innerRadius;
  const D = CENTRAL_O.depth;
  const bev = CENTRAL_O.edgeBevel;
  const { inner: bandInner, outer: bandOuter } = bandRadii();

  // The lathe floor sits below the displaced face so the two never z-fight.
  const floorZ = D - CENTRAL_O.bandRecess - CENTRAL_O.reliefDepth - 0.006;
  const wall = Math.max(0.008, Math.min(0.022, (bandInner - Ri - bev) * 0.9));

  const p = (r: number, z: number) => new THREE.Vector2(r, z);

  const points: THREE.Vector2[] = [
    // Inner bevel: a real chamfer sloping from the bore up to the face plane.
    // The reference object has this bevel, and modelling it (rather than
    // baking it into the face texture) is what gives the opening a crisp,
    // light-catching edge instead of a soft painted ring.
    p(Ri, D - CENTRAL_O.innerBevelDrop),
    p(bandInner - wall, D),
    p(bandInner, floorZ + 0.004),
    p(bandInner + 0.005, floorZ),
    // band floor
    p(bandOuter - 0.005, floorZ),
    // back up to the outer rim
    p(bandOuter, floorZ + 0.004),
    p(bandOuter + wall, D),
    // outer front flat, then the outer bevel and side wall
    p(R - bev, D),
    p(R, D - bev),
    p(R, -D + bev),
    // back bevel and back face
    p(R - bev, -D),
    p(Ri + bev * 1.1, -D),
    // back inner chamfer, then straight up the bore wall
    p(Ri, -D + bev * 1.1),
  ];

  // Close the loop so the lathe produces a solid.
  points.push(points[0].clone());
  return points;
}

/** Planar XY projection matched to the source raster's square framing. */
function applyPlanarUv(geometry: THREE.BufferGeometry, extentRadius: number): void {
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const span = extentRadius * 2;
  for (let i = 0; i < position.count; i += 1) {
    uv[i * 2] = position.getX(i) / span + 0.5;
    uv[i * 2 + 1] = position.getY(i) / span + 0.5;
  }
  const attribute = new THREE.BufferAttribute(uv, 2);
  geometry.setAttribute('uv', attribute);
  // aoMap reads the second UV set.
  geometry.setAttribute('uv1', attribute.clone());
}

export function createCentralO(options: CentralOOptions): CentralOGeometry {
  const R = CENTRAL_O.outerRadius;
  const profile = buildProfile();

  const body = new THREE.LatheGeometry(profile, options.bodySegments, 0, Math.PI * 2);
  // Lathe revolves around Y; stand the mark up so it faces the camera (+Z).
  body.rotateX(Math.PI / 2);
  body.computeVertexNormals();
  // Tileable noise wraps around the solid rather than projecting flat.
  body.computeBoundingSphere();

  const band = bandRadii();
  const bandInnerRadius = band.inner + 0.005;
  const bandOuterRadius = band.outer - 0.005;
  const faceZ = CENTRAL_O.depth - CENTRAL_O.bandRecess;

  const face = new THREE.RingGeometry(
    bandInnerRadius,
    bandOuterRadius,
    options.faceThetaSegments,
    options.faceRadialSegments,
  );
  applyPlanarUv(face, R);
  face.computeVertexNormals();

  // A hairline catch-light tucked into the inner chamfer. It reads as light
  // grazing the opening, not as a glowing ring.
  const innerRim = new THREE.TorusGeometry(
    CENTRAL_O.innerRadius + 0.004,
    0.0075,
    8,
    Math.max(96, Math.round(options.bodySegments * 0.6)),
  );

  return {
    body,
    face,
    innerRim,
    bandInnerRadius,
    bandOuterRadius,
    faceZ,
    dispose() {
      body.dispose();
      face.dispose();
      innerRim.dispose();
    },
  };
}
