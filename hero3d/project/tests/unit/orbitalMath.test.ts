import { describe, expect, it } from 'vitest';
import { CENTRAL_O, RESPONSIVE_PROFILES, RINGS, type RingConfig } from '../../src/hero/heroConfig';
import {
  angularGap,
  applyInclination,
  intersectsCentralSolid,
  damp,
  depthWeight,
  ellipsePoint,
  minimumGapOverPeriod,
  orbitalAngle,
  orbitalPeriod,
  orbitalPosition,
  orbitalPositionAtTime,
  smoothstep,
  wrapAngle,
  type Vec3,
} from '../../src/three/orbits/orbitalMath';
import { PARTNERS, resolvePartners } from '../../src/hero/partnerManifest';
import { cameraBasis, ringSpreadX } from '../../src/three/orbits/framing';
import { plaqueHalfExtents, plaqueSpecForAspect } from '../../src/three/orbits/medallion';

const flat: RingConfig = {
  id: 99,
  radiusX: 3,
  radiusZ: 2,
  y: 0,
  inclinationX: 0,
  inclinationZ: 0,
  direction: 1,
  angularSpeed: 0.1,
  phase: 0,
  tubeRadius: 0.01,
  opacity: 0.5,
  emphasis: 0.5,
  color: '#ffffff',
};

const out = (): Vec3 => ({ x: 0, y: 0, z: 0 });

/** Tightest orbit spread any breakpoint uses — the worst case for clearance. */
const MOBILE_SPREAD_X = Math.min(...RESPONSIVE_PROFILES.map((p) => p.orbitSpreadX));
const MOBILE_SPREAD_Z = Math.max(...RESPONSIVE_PROFILES.map((p) => p.orbitSpreadZ));

describe('wrapAngle', () => {
  it('maps any angle into [0, 2pi)', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 2)).toBeCloseTo(0, 10);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 10);
    expect(wrapAngle(Math.PI * 7.5)).toBeGreaterThanOrEqual(0);
    expect(wrapAngle(Math.PI * 7.5)).toBeLessThan(Math.PI * 2);
  });
});

describe('ellipsePoint', () => {
  it('lies on the ellipse for every sampled angle', () => {
    for (let i = 0; i < 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2;
      const p = ellipsePoint(flat, angle, 1, 1, out());
      const normalised = (p.x / flat.radiusX) ** 2 + (p.z / flat.radiusZ) ** 2;
      expect(normalised).toBeCloseTo(1, 10);
    }
  });

  it('scales with spread without changing the ellipse ratio', () => {
    const a = ellipsePoint(flat, 0.7, 1, 1, out());
    const b = ellipsePoint(flat, 0.7, 0.5, 0.5, out());
    expect(b.x).toBeCloseTo(a.x * 0.5, 10);
    expect(b.z).toBeCloseTo(a.z * 0.5, 10);
  });
});

describe('applyInclination', () => {
  it('is the identity for an un-inclined ring', () => {
    const p = { x: 1.5, y: 0.4, z: -2 };
    const r = applyInclination(flat, p, out());
    expect(r.x).toBeCloseTo(p.x, 12);
    expect(r.y).toBeCloseTo(p.y, 12);
    expect(r.z).toBeCloseTo(p.z, 12);
  });

  it('preserves length (it is a rotation)', () => {
    for (const ring of RINGS) {
      const p = { x: 1.1, y: -0.6, z: 2.3 };
      const r = applyInclination(ring, p, out());
      const before = Math.hypot(p.x, p.y, p.z);
      const after = Math.hypot(r.x, r.y, r.z);
      expect(after).toBeCloseTo(before, 10);
    }
  });

  it('matches three.js Euler XYZ composition', async () => {
    const THREE = await import('three');
    for (const ring of RINGS) {
      const euler = new THREE.Euler(ring.inclinationX, 0, ring.inclinationZ, 'XYZ');
      const vector = new THREE.Vector3(1.4, -0.35, 2.1);
      const expected = vector.clone().applyEuler(euler);
      const actual = applyInclination(ring, { x: 1.4, y: -0.35, z: 2.1 }, out());
      expect(actual.x).toBeCloseTo(expected.x, 10);
      expect(actual.y).toBeCloseTo(expected.y, 10);
      expect(actual.z).toBeCloseTo(expected.z, 10);
    }
  });
});

describe('orbitalAngle', () => {
  it('is time based and monotonic within a revolution', () => {
    const a = orbitalAngle(flat, 0, 0);
    const b = orbitalAngle(flat, 1, 0);
    const c = orbitalAngle(flat, 2, 0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('reverses for a retrograde ring', () => {
    const retro: RingConfig = { ...flat, direction: -1 };
    const a = orbitalAngle(retro, 0, 1);
    const b = orbitalAngle(retro, 1, 1);
    expect(b).toBeLessThan(a);
  });

  it('returns to its start after exactly one period', () => {
    for (const ring of RINGS) {
      const period = orbitalPeriod(ring);
      const start = orbitalAngle(ring, 0, 0.4);
      const end = orbitalAngle(ring, period, 0.4);
      expect(angularGap(start, end)).toBeLessThan(1e-9);
    }
  });

  it('folds the per-ring phase offset in', () => {
    const offset: RingConfig = { ...flat, phase: 1.25 };
    expect(orbitalAngle(offset, 0, 0)).toBeCloseTo(1.25, 12);
  });

  it('is independent of how the elapsed time was accumulated', () => {
    // Simulates a frame-rate change: 1000 tiny steps vs one big step.
    let stepped = 0;
    for (let i = 0; i < 1000; i += 1) stepped += 0.01;
    const a = orbitalAngle(RINGS[0], stepped, 0.3);
    const b = orbitalAngle(RINGS[0], 10, 0.3);
    expect(angularGap(a, b)).toBeLessThan(1e-6);
  });
});

describe('orbitalPosition', () => {
  it('never returns NaN for any ring at any angle', () => {
    for (const ring of RINGS) {
      for (let i = 0; i < 90; i += 1) {
        const p = orbitalPosition(ring, (i / 90) * Math.PI * 2, 0.84, 1.1, out());
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.z)).toBe(true);
      }
    }
  });

  it('produces continuous motion — no jumps between adjacent frames', () => {
    for (const ring of RINGS) {
      const a = out();
      const b = out();
      let previous: Vec3 | null = null;
      for (let t = 0; t < 240; t += 1 / 60) {
        orbitalPositionAtTime(ring, t, 0.2, 1, 1, t % 2 === 0 ? a : b);
        const current = t % 2 === 0 ? a : b;
        if (previous) {
          const step = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
          // At the fastest ring, one frame moves well under a hundredth of a unit.
          expect(step).toBeLessThan(0.02);
        }
        previous = { ...current };
      }
    }
  });

  it('never cuts a ring path through the stone solid', () => {
    for (const [index, ring] of RINGS.entries()) {
      const sx = ringSpreadX(RINGS, index, MOBILE_SPREAD_X);
      for (let i = 0; i < 720; i += 1) {
        const p = orbitalPosition(ring, (i / 720) * Math.PI * 2, sx, MOBILE_SPREAD_Z, out());
        // A ring filament is hairline, so only its own radius matters.
        expect(intersectsCentralSolid(p, CENTRAL_O.outerRadius, CENTRAL_O.depth, ring.tubeRadius)).toBe(false);
      }
    }
  });

  it('does send rings behind the O — that is what produces occlusion', () => {
    const behind = RINGS.map((ring) => {
      let deepest = 0;
      for (let i = 0; i < 360; i += 1) {
        const p = orbitalPosition(ring, (i / 360) * Math.PI * 2, 1, 1, out());
        deepest = Math.min(deepest, p.z);
      }
      return deepest;
    });
    for (const z of behind) expect(z).toBeLessThan(-CENTRAL_O.depth);
  });
});

describe('partner distribution', () => {
  it('keeps same-ring partners apart for the whole cycle', () => {
    const partners = resolvePartners(PARTNERS);
    const byRing = new Map<number, number[]>();
    for (const partner of partners) {
      const list = byRing.get(partner.ring) ?? [];
      list.push(partner.phase);
      byRing.set(partner.ring, list);
    }
    for (const [ringIndex, phases] of byRing) {
      if (phases.length < 2) continue;
      const gap = minimumGapOverPeriod(RINGS[ringIndex], phases, 32);
      expect(gap).toBeGreaterThan(0.55);
    }
  });

  it('never drives a medallion into the stone, at any breakpoint', () => {
    const partners = resolvePartners(PARTNERS);
    // Checked against every responsive profile, using each partner's real
    // plaque size on its real ring — not an averaged approximation.
    for (const profile of RESPONSIVE_PROFILES) {
      for (const partner of partners) {
        const ring = RINGS[partner.ring];
        const spec = plaqueSpecForAspect(partner.aspectHint, partner.padding);
        const { halfWidth, halfHeight } = plaqueHalfExtents(spec, partner.scale * profile.medallionScale);
        const reach = Math.hypot(halfWidth, halfHeight);
        const sx = ringSpreadX(RINGS, partner.ring, profile.orbitSpreadX);
        for (let i = 0; i < 720; i += 1) {
          const angle = (i / 720) * Math.PI * 2;
          const p = orbitalPosition(ring, angle, sx, profile.orbitSpreadZ, out());
          expect(
            intersectsCentralSolid(p, CENTRAL_O.outerRadius, CENTRAL_O.depth, reach),
            `${partner.id} hits the stone at ${profile.label}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('screen-space clustering', () => {
  /**
   * Bodies on different rings travel at different speeds, so their relative
   * angle sweeps through every value regardless of starting phase: phases
   * shift *when* two medallions cross, never *how often*. Crossing frequency
   * is a property of the ring geometry alone, which is why it is asserted here
   * rather than tuned away.
   *
   * Crossings themselves are correct — they are what makes the system read as
   * real 3D. What must stay rare is a *near-coplanar* collision, where the two
   * medallions sit at almost the same depth and occlusion cannot sell the
   * layering.
   */
  it('keeps near-coplanar medallion collisions rare across the whole cycle', () => {
    const profile = RESPONSIVE_PROFILES[RESPONSIVE_PROFILES.length - 1];
    const partners = resolvePartners(PARTNERS);
    const basis = cameraBasis(profile.cameraElevation, profile.cameraYaw);

    const bodies = partners.map((partner) => {
      const spec = plaqueSpecForAspect(partner.aspectHint, partner.padding);
      const { halfWidth, halfHeight } = plaqueHalfExtents(spec, partner.scale * profile.medallionScale);
      return {
        id: partner.id,
        ring: RINGS[partner.ring],
        ringIndex: partner.ring,
        phase: partner.phase,
        halfWidth,
        halfHeight,
      };
    });

    const point = out();
    const samples = 2400; // 20 minutes at 2Hz
    let collisions = 0;

    for (let s = 0; s < samples; s += 1) {
      const t = s / 2;
      const screen = bodies.map((body) => {
        const sx = ringSpreadX(RINGS, body.ringIndex, profile.orbitSpreadX);
        orbitalPositionAtTime(body.ring, t, body.phase, sx, profile.orbitSpreadZ, point);
        const x = point.x * profile.systemScale;
        const y = point.y * profile.systemScale;
        const z = point.z * profile.systemScale;
        return {
          h: x * basis.rightX + y * basis.rightY + z * basis.rightZ,
          v: x * basis.upX + y * basis.upY + z * basis.upZ,
          d: x * basis.dirX + y * basis.dirY + z * basis.dirZ,
          halfWidth: body.halfWidth,
          halfHeight: body.halfHeight,
        };
      });

      let collided = false;
      for (let i = 0; i < screen.length && !collided; i += 1) {
        for (let j = i + 1; j < screen.length; j += 1) {
          const a = screen[i];
          const b = screen[j];
          if (
            Math.abs(a.h - b.h) < (a.halfWidth + b.halfWidth) * 0.55 &&
            Math.abs(a.v - b.v) < (a.halfHeight + b.halfHeight) * 0.55 &&
            Math.abs(a.d - b.d) < 1.2
          ) {
            collided = true;
            break;
          }
        }
      }
      if (collided) collisions += 1;
    }

    const fraction = collisions / samples;
    expect(fraction, `medallions collide ${(fraction * 100).toFixed(1)}% of the cycle`).toBeLessThan(0.1);
  });

  it('gives every ring its own plane rather than stacking two on one', () => {
    const used = new Set(resolvePartners(PARTNERS).map((p) => p.ring));
    // Six partners across five rings: only one ring may carry two.
    expect(used.size).toBeGreaterThanOrEqual(RINGS.length - 1);
  });

  it('puts same-ring partners on opposite sides so they can never converge', () => {
    const byRing = new Map<number, number[]>();
    for (const partner of resolvePartners(PARTNERS)) {
      const list = byRing.get(partner.ring) ?? [];
      list.push(partner.phase);
      byRing.set(partner.ring, list);
    }
    for (const [ring, phases] of byRing) {
      if (phases.length < 2) continue;
      expect(angularGap(phases[0], phases[1]), `ring ${ring}`).toBeGreaterThan(2.6);
    }
  });
});

describe('helpers', () => {
  it('depthWeight clamps to 0..1 and is 1 at the near plane', () => {
    expect(depthWeight(5, 5, 1)).toBe(1);
    expect(depthWeight(1, 5, 1)).toBe(0);
    expect(depthWeight(3, 5, 1)).toBeCloseTo(0.5, 10);
    expect(depthWeight(99, 5, 1)).toBe(1);
  });

  it('smoothstep is monotonic and bounded', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('damp converges and is frame-rate independent', () => {
    let coarse = 0;
    for (let i = 0; i < 30; i += 1) coarse = damp(coarse, 1, 0.25, 1 / 30);
    let fine = 0;
    for (let i = 0; i < 120; i += 1) fine = damp(fine, 1, 0.25, 1 / 120);
    expect(Math.abs(coarse - fine)).toBeLessThan(0.01);
    expect(coarse).toBeGreaterThan(0.9);
  });

  it('angularGap is symmetric and never exceeds pi', () => {
    expect(angularGap(0.1, 6.2)).toBeCloseTo(angularGap(6.2, 0.1), 12);
    expect(angularGap(0, Math.PI * 1.5)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('ring configuration', () => {
  it('uses distinct speeds so nothing rotates as one disk', () => {
    const speeds = RINGS.map((r) => r.angularSpeed);
    expect(new Set(speeds).size).toBe(speeds.length);
  });

  it('includes at least one counter-rotating ring', () => {
    const directions = new Set(RINGS.map((r) => r.direction));
    expect(directions.size).toBeGreaterThan(1);
  });

  it('orders radii outward with no two rings sharing a plane', () => {
    for (let i = 1; i < RINGS.length; i += 1) {
      expect(RINGS[i].radiusX).toBeGreaterThan(RINGS[i - 1].radiusX);
      expect(RINGS[i].inclinationX).not.toBe(RINGS[i - 1].inclinationX);
    }
  });

  it('is elliptical, not circular', () => {
    for (const ring of RINGS) {
      expect(Math.abs(ring.radiusX - ring.radiusZ)).toBeGreaterThan(0.2);
    }
  });

  it('completes a revolution slowly enough to read as calm', () => {
    for (const ring of RINGS) {
      // Nothing should lap the composition in under a minute.
      expect(orbitalPeriod(ring)).toBeGreaterThan(60);
    }
  });
});
