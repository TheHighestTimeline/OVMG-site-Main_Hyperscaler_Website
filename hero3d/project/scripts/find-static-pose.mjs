/**
 * find-static-pose.mjs — picks the animation time used for the reduced-motion
 * composition.
 *
 * Reduced-motion users, social-preview crawlers and the first paint all see a
 * single frozen frame, so that frame should be the best one in the cycle, not
 * whatever t=0 happens to produce. This scores every candidate moment on:
 *
 *   - the smallest gap between any two medallions (bigger is better)
 *   - how far each medallion sits from the central mark's silhouette
 *   - how evenly the six are distributed around the frame
 *
 * Run:  node scripts/find-static-pose.mjs
 * Then set REDUCED_MOTION_POSE_SECONDS in src/hero/heroRuntime.ts.
 */

import { RINGS, RESPONSIVE_PROFILES, CENTRAL_O } from '../src/hero/heroConfig.ts';
import { PARTNERS, resolvePartners } from '../src/hero/partnerManifest.ts';
import { cameraBasis, ringSpreadX } from '../src/three/orbits/framing.ts';
import { plaqueHalfExtents, plaqueSpecForAspect } from '../src/three/orbits/medallion.ts';
import { orbitalPositionAtTime } from '../src/three/orbits/orbitalMath.ts';

const partners = resolvePartners(PARTNERS);

// The frozen frame has to work on a phone as well as a desktop, and the two
// use different orbit spreads and rolls, so a pose is only as good as its
// worst breakpoint.
const SCORED_PROFILES = [
  RESPONSIVE_PROFILES[RESPONSIVE_PROFILES.length - 1],
  RESPONSIVE_PROFILES[0],
];

const point = { x: 0, y: 0, z: 0 };

function screenAt(profile, t) {
  const basis = cameraBasis(profile.cameraElevation, profile.cameraYaw);
  const cr = Math.cos(profile.systemRoll);
  const sr = Math.sin(profile.systemRoll);
  return partners.map((partner) => {
    const spec = plaqueSpecForAspect(partner.aspectHint, partner.padding);
    const { halfWidth, halfHeight } = plaqueHalfExtents(spec, partner.scale * profile.medallionScale);
    const sx = ringSpreadX(RINGS, partner.ring, profile.orbitSpreadX);
    orbitalPositionAtTime(RINGS[partner.ring], t, partner.phase, sx, profile.orbitSpreadZ, point);
    const x = (point.x * cr - point.y * sr) * profile.systemScale;
    const y = (point.x * sr + point.y * cr) * profile.systemScale;
    const z = point.z * profile.systemScale;
    return {
      id: partner.id,
      h: x * basis.rightX + y * basis.rightY + z * basis.rightZ,
      v: x * basis.upX + y * basis.upY + z * basis.upZ,
      d: x * basis.dirX + y * basis.dirY + z * basis.dirZ,
      halfWidth,
      halfHeight,
    };
  });
}

function scoreProfile(profile, t) {
  const s = screenAt(profile, t);
  const markRadius = CENTRAL_O.outerRadius * profile.systemScale;
  const boreRadius = CENTRAL_O.innerRadius * profile.systemScale;

  // 1. Smallest normalised separation between any two medallions.
  let minSeparation = Infinity;
  for (let i = 0; i < s.length; i += 1) {
    for (let j = i + 1; j < s.length; j += 1) {
      const a = s[i];
      const b = s[j];
      const dh = Math.abs(a.h - b.h) / (a.halfWidth + b.halfWidth);
      const dv = Math.abs(a.v - b.v) / (a.halfHeight + b.halfHeight);
      minSeparation = Math.min(minSeparation, Math.max(dh, dv));
    }
  }

  // 2. Clearance from the mark. Two distinct failures:
  //    - sitting on the rim, which only matters when roughly coplanar;
  //    - sitting inside the bore, which matters at ANY depth, because the
  //      opening is see-through and a logo framed in it reads as being
  //      *inside* the mark.
  let minClearance = Infinity;
  for (const body of s) {
    const radial = Math.hypot(body.h, body.v);
    const reach = Math.max(body.halfWidth, body.halfHeight);
    const rimClearance = body.d < -0.9 ? 4 : radial - markRadius - reach;
    const boreClearance = radial - boreRadius - reach * 0.5;
    minClearance = Math.min(minClearance, rimClearance, boreClearance);
  }

  // 3. Angular evenness around the frame.
  const angles = s.map((b) => Math.atan2(b.v, b.h)).sort((a, b) => a - b);
  let minAngularGap = Infinity;
  for (let i = 0; i < angles.length; i += 1) {
    const next = i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1];
    minAngularGap = Math.min(minAngularGap, next - angles[i]);
  }

  return {
    total: Math.min(minSeparation, 2.5) * 2 + Math.min(minClearance, 1.2) * 1.5 + minAngularGap * 1.2,
    minSeparation,
    minClearance,
    minAngularGap,
  };
}

/** A pose is only as good as its worst breakpoint. */
function score(t) {
  const results = SCORED_PROFILES.map((profile) => scoreProfile(profile, t));
  return {
    total: Math.min(...results.map((r) => r.total)),
    minSeparation: Math.min(...results.map((r) => r.minSeparation)),
    minClearance: Math.min(...results.map((r) => r.minClearance)),
    minAngularGap: Math.min(...results.map((r) => r.minAngularGap)),
  };
}

let best = { t: 0, ...score(0) };
for (let t = 0; t <= 1200; t += 0.25) {
  const candidate = score(t);
  if (candidate.total > best.total) best = { t, ...candidate };
}

function report(label, s) {
  console.log(
    `${label.padEnd(14)} separation ${s.minSeparation.toFixed(2)}  ` +
      `clearance ${s.minClearance.toFixed(2)}  ` +
      `angular gap ${((s.minAngularGap * 180) / Math.PI).toFixed(1)} deg`,
  );
}

console.log(`best reduced-motion pose: t = ${best.t.toFixed(2)}s`);
console.log('(scored as the worst of desktop and phone-sm; 1.0 separation = just touching)');
report('best', best);
for (const profile of SCORED_PROFILES) report(profile.label, scoreProfile(profile, best.t));
console.log('');
report('t=0', score(0));
report('t=52.75', score(52.75));
