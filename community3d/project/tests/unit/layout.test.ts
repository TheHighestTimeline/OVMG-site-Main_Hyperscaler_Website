/** Pure-TS invariant tests for src/scene/sceneLayout.ts (run: npx tsx tests/unit/layout.test.ts).
 *  No DOM, no THREE — just geometry/contract assertions on the layout constants. */
import {
  PLOT,
  ROAD,
  SIDEWALKS,
  FOOTPRINTS,
  MARKET,
  COMMUNITY_CENTER,
  LAMPS,
  CAMERA,
  LIFTS,
  STAGES,
} from '../../src/scene/sceneLayout';

let failures = 0;
const EPS = 1e-9;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`ok ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const near = (a: number, b: number, eps = EPS) => Math.abs(a - b) <= eps;

// --- Road inside plot -------------------------------------------------------
check(
  'road length fits inside plot width',
  ROAD.length <= PLOT.width + EPS,
  `road length ${ROAD.length} > plot width ${PLOT.width}`,
);
check(
  'road z-band inside plot',
  ROAD.minZ >= PLOT.minZ - EPS && ROAD.maxZ <= PLOT.maxZ + EPS,
  `road z [${ROAD.minZ}, ${ROAD.maxZ}] vs plot z [${PLOT.minZ}, ${PLOT.maxZ}]`,
);
check(
  'road z-band self-consistent (min/max match center/width)',
  near(ROAD.maxZ - ROAD.minZ, ROAD.width) && near((ROAD.minZ + ROAD.maxZ) / 2, ROAD.centerZ),
  `minZ=${ROAD.minZ} maxZ=${ROAD.maxZ} width=${ROAD.width} centerZ=${ROAD.centerZ}`,
);

// --- Sidewalks adjacent to road edges --------------------------------------
check(
  'building sidewalk minZ == road maxZ',
  near(SIDEWALKS.building.minZ, ROAD.maxZ),
  `${SIDEWALKS.building.minZ} != ${ROAD.maxZ}`,
);
check(
  'front sidewalk maxZ == road minZ',
  near(SIDEWALKS.front.maxZ, ROAD.minZ),
  `${SIDEWALKS.front.maxZ} != ${ROAD.minZ}`,
);
check(
  'sidewalk bands self-consistent widths',
  near(SIDEWALKS.building.maxZ - SIDEWALKS.building.minZ, SIDEWALKS.building.width) &&
    near(SIDEWALKS.front.maxZ - SIDEWALKS.front.minZ, SIDEWALKS.front.width),
  JSON.stringify(SIDEWALKS),
);

// --- Lamps: z inside a sidewalk band, outside road, x inside plot ----------
LAMPS.forEach((lamp, i) => {
  const z = lamp.position.z;
  const inBuildingBand = z >= SIDEWALKS.building.minZ - EPS && z <= SIDEWALKS.building.maxZ + EPS;
  const inFrontBand = z >= SIDEWALKS.front.minZ - EPS && z <= SIDEWALKS.front.maxZ + EPS;
  check(
    `lamp ${i} z inside a sidewalk band`,
    inBuildingBand || inFrontBand,
    `z=${z}, building [${SIDEWALKS.building.minZ}, ${SIDEWALKS.building.maxZ}], front [${SIDEWALKS.front.minZ}, ${SIDEWALKS.front.maxZ}]`,
  );
  check(
    `lamp ${i} z outside road interior`,
    !(z > ROAD.minZ + EPS && z < ROAD.maxZ - EPS),
    `z=${z} inside road (${ROAD.minZ}, ${ROAD.maxZ})`,
  );
  check(
    `lamp ${i} x inside plot`,
    lamp.position.x >= PLOT.minX - EPS && lamp.position.x <= PLOT.maxX + EPS,
    `x=${lamp.position.x}`,
  );
});

// --- Building shells clear of road and inside plot -------------------------
interface Shell { name: string; minX: number; maxX: number; minZ: number; maxZ: number }
function shell(name: string, pos: { x: number; z: number }, fp: { w: number; d: number }): Shell {
  return {
    name,
    minX: pos.x - fp.w / 2,
    maxX: pos.x + fp.w / 2,
    minZ: pos.z - fp.d / 2,
    maxZ: pos.z + fp.d / 2,
  };
}
const marketShell = shell('market', MARKET.position, FOOTPRINTS.market);
const ccShell = shell('community center', COMMUNITY_CENTER.position, FOOTPRINTS.communityCenter);

for (const s of [marketShell, ccShell]) {
  check(
    `${s.name} shell clear of road`,
    s.minZ >= ROAD.maxZ - EPS || s.maxZ <= ROAD.minZ + EPS,
    `shell z [${s.minZ.toFixed(3)}, ${s.maxZ.toFixed(3)}] overlaps road [${ROAD.minZ}, ${ROAD.maxZ}]`,
  );
  check(
    `${s.name} shell inside plot`,
    s.minX >= PLOT.minX - EPS &&
      s.maxX <= PLOT.maxX + EPS &&
      s.minZ >= PLOT.minZ - EPS &&
      s.maxZ <= PLOT.maxZ + EPS,
    `shell x [${s.minX}, ${s.maxX}] z [${s.minZ}, ${s.maxZ}] vs plot`,
  );
}

// --- Market / community-center x-ranges disjoint ---------------------------
check(
  'market and community-center x-ranges disjoint',
  marketShell.maxX <= ccShell.minX + EPS || ccShell.maxX <= marketShell.minX + EPS,
  `market x [${marketShell.minX}, ${marketShell.maxX}] vs cc x [${ccShell.minX}, ${ccShell.maxX}]`,
);

// --- Stages ordered, contiguous, covering 0 → 1 ----------------------------
const stageOrder = ['overview', 'market', 'communityCenter', 'streetLamps', 'settle'] as const;
check('stages start at 0', near(STAGES[stageOrder[0]].start, 0), `start=${STAGES[stageOrder[0]].start}`);
check('stages end at 1', near(STAGES[stageOrder[stageOrder.length - 1]].end, 1));
for (const key of stageOrder) {
  check(`stage ${key} start < end`, STAGES[key].start < STAGES[key].end, JSON.stringify(STAGES[key]));
}
for (let i = 0; i < stageOrder.length - 1; i++) {
  const a = STAGES[stageOrder[i]];
  const b = STAGES[stageOrder[i + 1]];
  check(
    `stages contiguous: ${stageOrder[i]} → ${stageOrder[i + 1]}`,
    near(a.end, b.start),
    `${a.end} != ${b.start}`,
  );
}

// --- Lifts all positive -----------------------------------------------------
for (const [key, value] of Object.entries(LIFTS)) {
  check(`lift ${key} > 0`, typeof value === 'number' && value > 0, `${key}=${value}`);
}

// --- Camera -----------------------------------------------------------------
check('camera desktop viewHeight > 0', CAMERA.desktop.viewHeight > 0, String(CAMERA.desktop.viewHeight));
check('camera mobile viewHeight > 0', CAMERA.mobile.viewHeight > 0, String(CAMERA.mobile.viewHeight));

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nlayout.test.ts: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nlayout.test.ts: all checks passed');
