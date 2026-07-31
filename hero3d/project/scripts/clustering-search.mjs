/**
 * clustering-search.mjs — evaluates candidate ring layouts against three
 * competing objectives and prints the trade-off, so the shipped configuration
 * is chosen from measurements rather than intuition:
 *
 *   1. how much of the time any two medallions overlap on screen
 *   2. how wide the system gets (a wide system pushes the camera back and
 *      shrinks the central mark)
 *   3. how distinct the ring planes look (variation in projected openness)
 */

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
  return { right, up };
}
const B = basis(ELEVATION, YAW);

function position(ring, angle) {
  const x = Math.cos(angle) * ring.rx;
  const y = ring.y;
  const z = Math.sin(angle) * ring.rz;
  const cz = Math.cos(ring.iz);
  const sz = Math.sin(ring.iz);
  const cx = Math.cos(ring.ix);
  const sx = Math.sin(ring.ix);
  const x1 = x * cz - y * sz;
  const y1 = x * sz + y * cz;
  return { x: x1, y: y1 * cx - z * sx, z: y1 * sx + z * cx };
}

function project(w) {
  return {
    h: w.x * B.right[0] + w.y * B.right[1] + w.z * B.right[2],
    v: w.x * B.up[0] + w.y * B.up[1] + w.z * B.up[2],
    d: w.x * Math.sin(YAW) * Math.cos(ELEVATION) + w.y * Math.sin(ELEVATION) + w.z * Math.cos(YAW) * Math.cos(ELEVATION),
  };
}

function evaluate(name, rings, partners, minutes = 40) {
  const samples = minutes * 60 * 2;
  let anyOverlap = 0;
  let worstPair = ['', 0];
  const pairCount = new Map();

  for (let s = 0; s < samples; s += 1) {
    const t = s / 2;
    const screen = partners.map((p) => {
      const ring = rings[p.ring];
      const angle = p.phase + ring.phase + ring.dir * ring.speed * t;
      return { id: p.id, ...project(position(ring, angle)), halfW: p.halfW, halfH: p.halfH };
    });
    let any = false;
    for (let i = 0; i < screen.length; i += 1) {
      for (let j = i + 1; j < screen.length; j += 1) {
        const a = screen[i];
        const b = screen[j];
        // A genuine collision: overlapping on screen AND close enough in
        // depth that occlusion cannot sell it as layering.
        if (
          Math.abs(a.h - b.h) < (a.halfW + b.halfW) * 0.55 &&
          Math.abs(a.v - b.v) < (a.halfH + b.halfH) * 0.55 &&
          Math.abs(a.d - b.d) < 1.2
        ) {
          const key = `${a.id}/${b.id}`;
          const next = (pairCount.get(key) ?? 0) + 1;
          pairCount.set(key, next);
          if (next > worstPair[1]) worstPair = [key, next];
          any = true;
        }
      }
    }
    if (any) anyOverlap += 1;
  }

  // System extents and ring openness.
  let halfWidth = 0;
  let halfHeight = 0;
  const openness = [];
  for (const ring of rings) {
    const pad = Math.max(...partners.filter((p) => rings[p.ring] === ring).map((p) => p.halfW), 0.02);
    let rw = 0;
    let rh = 0;
    for (let i = 0; i < 360; i += 1) {
      const p = project(position(ring, (i / 360) * Math.PI * 2));
      rw = Math.max(rw, Math.abs(p.h));
      rh = Math.max(rh, Math.abs(p.v));
    }
    openness.push(rh / rw);
    halfWidth = Math.max(halfWidth, rw + pad);
    halfHeight = Math.max(halfHeight, rh + pad);
  }

  const opennessSpread = Math.max(...openness) / Math.min(...openness);
  console.log(
    `${name.padEnd(22)} overlap ${((anyOverlap / samples) * 100).toFixed(1).padStart(5)}%  ` +
      `worst ${((worstPair[1] / samples) * 100).toFixed(1).padStart(4)}% (${worstPair[0] || 'none'})  ` +
      `halfW ${halfWidth.toFixed(2)}  halfH ${halfHeight.toFixed(2)}  opennessSpread ${opennessSpread.toFixed(2)}`,
  );
  return { overlap: anyOverlap / samples, halfWidth, halfHeight, opennessSpread };
}

const DISC = 0.475;
const CAP_E = { halfW: 0.63, halfH: 0.27 };
const CAP_V = { halfW: 0.7, halfH: 0.21 };

// Current shipped layout.
evaluate(
  'current-4ring',
  [
    { rx: 2.24, rz: 1.74, y: 0.06, ix: 0.17, iz: 0.11, dir: 1, speed: 0.052, phase: 0.0 },
    { rx: 2.88, rz: 2.14, y: -0.24, ix: -0.33, iz: -0.19, dir: -1, speed: 0.038, phase: 0.9 },
    { rx: 3.66, rz: 2.68, y: 0.3, ix: 0.44, iz: 0.23, dir: 1, speed: 0.029, phase: 2.1 },
    { rx: 4.5, rz: 3.26, y: -0.12, ix: -0.13, iz: -0.06, dir: -1, speed: 0.02, phase: 3.4 },
  ],
  [
    { id: 'ram', ring: 0, phase: 0.62, halfW: DISC, halfH: DISC },
    { id: 'solr', ring: 0, phase: 3.76, halfW: DISC, halfH: DISC },
    { id: 'tlg', ring: 1, phase: 1.92, halfW: DISC, halfH: DISC },
    { id: 'bss', ring: 1, phase: 5.06, halfW: DISC, halfH: DISC },
    { id: 'ess', ring: 2, phase: 3.05, ...CAP_E },
    { id: 'vela', ring: 3, phase: 5.62, ...CAP_V },
  ],
);

// Five planes, one partner each except ring 0, with strong vertical separation.
const FIVE = [
  { rx: 2.26, rz: 1.78, y: 0.44, ix: 0.34, iz: 0.14, dir: 1, speed: 0.05, phase: 0.0 },
  { rx: 3.02, rz: 2.24, y: -0.86, ix: -0.36, iz: -0.22, dir: -1, speed: 0.0395, phase: 0.9 },
  { rx: 3.74, rz: 2.66, y: 0.98, ix: 0.5, iz: 0.26, dir: 1, speed: 0.0305, phase: 2.1 },
  { rx: 4.46, rz: 3.08, y: -0.62, ix: -0.18, iz: -0.09, dir: -1, speed: 0.0225, phase: 3.4 },
  { rx: 5.12, rz: 3.42, y: 0.26, ix: 0.26, iz: 0.18, dir: 1, speed: 0.0165, phase: 4.7 },
];
evaluate('five-ring-spread', FIVE, [
  { id: 'ram', ring: 0, phase: 0.5, halfW: DISC, halfH: DISC },
  { id: 'solr', ring: 0, phase: 3.64, halfW: DISC, halfH: DISC },
  { id: 'tlg', ring: 1, phase: 1.7, halfW: DISC, halfH: DISC },
  { id: 'bss', ring: 2, phase: 4.4, halfW: DISC, halfH: DISC },
  { id: 'ess', ring: 3, phase: 2.4, ...CAP_E },
  { id: 'vela', ring: 4, phase: 5.5, ...CAP_V },
]);

// Same five planes but with smaller medallions.
const SMALL = 0.4;
evaluate('five-ring-small', FIVE, [
  { id: 'ram', ring: 0, phase: 0.5, halfW: SMALL, halfH: SMALL },
  { id: 'solr', ring: 0, phase: 3.64, halfW: SMALL, halfH: SMALL },
  { id: 'tlg', ring: 1, phase: 1.7, halfW: SMALL, halfH: SMALL },
  { id: 'bss', ring: 2, phase: 4.4, halfW: SMALL, halfH: SMALL },
  { id: 'ess', ring: 3, phase: 2.4, halfW: 0.55, halfH: 0.24 },
  { id: 'vela', ring: 4, phase: 5.5, halfW: 0.6, halfH: 0.18 },
]);

// Four planes, but pushed much further apart vertically and radially.
evaluate(
  'four-ring-tall',
  [
    { rx: 2.3, rz: 1.8, y: 0.62, ix: 0.36, iz: 0.14, dir: 1, speed: 0.05, phase: 0.0 },
    { rx: 3.26, rz: 2.34, y: -1.05, ix: -0.38, iz: -0.22, dir: -1, speed: 0.0385, phase: 0.9 },
    { rx: 4.18, rz: 2.9, y: 1.18, ix: 0.52, iz: 0.27, dir: 1, speed: 0.0285, phase: 2.1 },
    { rx: 5.0, rz: 3.36, y: -0.5, ix: -0.16, iz: -0.08, dir: -1, speed: 0.0195, phase: 3.4 },
  ],
  [
    { id: 'ram', ring: 0, phase: 0.5, halfW: DISC, halfH: DISC },
    { id: 'solr', ring: 0, phase: 3.64, halfW: DISC, halfH: DISC },
    { id: 'tlg', ring: 1, phase: 1.7, halfW: DISC, halfH: DISC },
    { id: 'bss', ring: 2, phase: 4.4, halfW: DISC, halfH: DISC },
    { id: 'ess', ring: 3, phase: 2.4, ...CAP_E },
    { id: 'vela', ring: 2, phase: 1.1, ...CAP_V },
  ],
);
