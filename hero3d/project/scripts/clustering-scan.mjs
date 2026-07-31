/**
 * clustering-scan.mjs — measures how often two partner medallions overlap in
 * screen space, across a long stretch of the orbital cycle.
 *
 * Partners on different rings will occasionally cross; that is natural and
 * reads as depth. What must not happen is persistent stacking. This script
 * reports the fraction of sampled time each pair spends overlapping, so ring
 * speeds and phases can be tuned against a number instead of a guess.
 *
 *   node scripts/clustering-scan.mjs [minutes]
 */

const RINGS = [
  { id: 0, rx: 2.24, rz: 1.74, y: 0.06, ix: 0.17, iz: 0.11, dir: 1, speed: 0.052, phase: 0.0 },
  { id: 1, rx: 2.88, rz: 2.14, y: -0.24, ix: -0.33, iz: -0.19, dir: -1, speed: 0.038, phase: 0.9 },
  { id: 2, rx: 3.66, rz: 2.68, y: 0.3, ix: 0.44, iz: 0.23, dir: 1, speed: 0.029, phase: 2.1 },
  { id: 3, rx: 4.5, rz: 3.26, y: -0.12, ix: -0.13, iz: -0.06, dir: -1, speed: 0.02, phase: 3.4 },
];

const PARTNERS = [
  { id: 'ram-global', ring: 0, phase: 0.62, halfW: 0.475, halfH: 0.475 },
  { id: 'solr-energy', ring: 0, phase: 3.76, halfW: 0.475, halfH: 0.475 },
  { id: 'tlg-consulting', ring: 1, phase: 1.92, halfW: 0.47, halfH: 0.47 },
  { id: 'bright-sun-solar', ring: 1, phase: 5.06, halfW: 0.47, halfH: 0.47 },
  { id: 'ess', ring: 2, phase: 3.05, halfW: 0.63, halfH: 0.27 },
  { id: 'velatech', ring: 3, phase: 5.62, halfW: 0.7, halfH: 0.21 },
];

const ELEVATION = 0.35;
const YAW = 0.16;

function basis(elev, yaw) {
  const ce = Math.cos(elev);
  const se = Math.sin(elev);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const dir = [sy * ce, se, cy * ce];
  const r = [dir[2], 0, -dir[0]];
  const rl = Math.hypot(...r);
  const right = [r[0] / rl, r[1] / rl, r[2] / rl];
  const up = [
    dir[1] * right[2] - dir[2] * right[1],
    dir[2] * right[0] - dir[0] * right[2],
    dir[0] * right[1] - dir[1] * right[0],
  ];
  return { right, up, dir };
}

function ringSpreadX(index, count, spreadX) {
  if (count <= 1) return spreadX;
  return 1 + (spreadX - 1) * (index / (count - 1));
}

function position(ring, angle, sx, sz) {
  const x = Math.cos(angle) * ring.rx * sx;
  const y = ring.y;
  const z = Math.sin(angle) * ring.rz * sz;
  const cz = Math.cos(ring.iz);
  const szn = Math.sin(ring.iz);
  const cx = Math.cos(ring.ix);
  const sxn = Math.sin(ring.ix);
  const x1 = x * cz - y * szn;
  const y1 = x * szn + y * cz;
  return { x: x1, y: y1 * cx - z * sxn, z: y1 * sxn + z * cx };
}

const minutes = Number(process.argv[2] ?? 20);
const B = basis(ELEVATION, YAW);
const samples = Math.round(minutes * 60 * 4); // 4 Hz
const overlap = new Map();
let anyOverlapSamples = 0;

for (let s = 0; s < samples; s += 1) {
  const t = s / 4;
  const screen = PARTNERS.map((p) => {
    const ring = RINGS[p.ring];
    const sx = ringSpreadX(p.ring, RINGS.length, 1);
    const angle = p.phase + ring.phase + ring.dir * ring.speed * t;
    const w = position(ring, angle, sx, 1);
    return {
      id: p.id,
      h: w.x * B.right[0] + w.y * B.right[1] + w.z * B.right[2],
      v: w.x * B.up[0] + w.y * B.up[1] + w.z * B.up[2],
      halfW: p.halfW,
      halfH: p.halfH,
    };
  });

  let any = false;
  for (let i = 0; i < screen.length; i += 1) {
    for (let j = i + 1; j < screen.length; j += 1) {
      const a = screen[i];
      const b = screen[j];
      const dh = Math.abs(a.h - b.h);
      const dv = Math.abs(a.v - b.v);
      if (dh < (a.halfW + b.halfW) * 0.85 && dv < (a.halfH + b.halfH) * 0.85) {
        const key = `${a.id} / ${b.id}`;
        overlap.set(key, (overlap.get(key) ?? 0) + 1);
        any = true;
      }
    }
  }
  if (any) anyOverlapSamples += 1;
}

const rows = [...overlap.entries()].sort((a, b) => b[1] - a[1]);
console.log(`sampled ${minutes} min at 4Hz (${samples} samples)`);
console.log(`frames with any overlap: ${((anyOverlapSamples / samples) * 100).toFixed(1)}%`);
for (const [pair, count] of rows) {
  console.log(`  ${pair.padEnd(36)} ${((count / samples) * 100).toFixed(1)}%`);
}
if (!rows.length) console.log('  no pair ever overlaps');
