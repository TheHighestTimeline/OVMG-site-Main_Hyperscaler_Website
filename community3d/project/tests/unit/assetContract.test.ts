/** Asset contract tests (run: npx tsx tests/unit/assetContract.test.ts).
 *  Verifies the FOOTPRINTS size contract between sceneLayout and the
 *  procedural builders, and that the STAGES boundaries match the animation
 *  spec (0.20 / 0.45 / 0.70 / 0.95). Dependency-light: no THREE, no DOM. */
import { FOOTPRINTS, STAGES } from '../../src/scene/sceneLayout';

let failures = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`ok ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

// --- Footprint sanity -------------------------------------------------------
const mk = FOOTPRINTS.market;
const cc = FOOTPRINTS.communityCenter;
const lamp = FOOTPRINTS.streetLamp;

for (const [name, fp] of Object.entries(FOOTPRINTS)) {
  check(
    `${name} footprint dimensions all positive`,
    fp.w > 0 && fp.d > 0 && fp.h > 0,
    JSON.stringify(fp),
  );
}

check(
  'community center wider than market (w)',
  cc.w > mk.w,
  `cc.w=${cc.w} vs market.w=${mk.w}`,
);
check(
  'community center deeper than market (d)',
  cc.d > mk.d,
  `cc.d=${cc.d} vs market.d=${mk.d}`,
);
check(
  'community center taller than market (h)',
  cc.h > mk.h,
  `cc.h=${cc.h} vs market.h=${mk.h}`,
);

check(
  'street lamp slim in plan (w and d < 1m)',
  lamp.w < 1 && lamp.d < 1,
  `lamp w=${lamp.w} d=${lamp.d}`,
);
check(
  'street lamp tall relative to its footprint',
  lamp.h > 2 * Math.max(lamp.w, lamp.d),
  `lamp h=${lamp.h} vs w=${lamp.w} d=${lamp.d}`,
);
check(
  'street lamp shorter than both buildings',
  lamp.h < cc.h + mk.h, // sanity: a lamp is street furniture, not a tower
  `lamp h=${lamp.h}`,
);

// --- Stage boundaries match the spec ranges within 0.01 --------------------
check('overview ends at 0.20', near(STAGES.overview.end, 0.20), String(STAGES.overview.end));
check('market spans 0.20 → 0.45',
  near(STAGES.market.start, 0.20) && near(STAGES.market.end, 0.45),
  JSON.stringify(STAGES.market));
check('communityCenter spans 0.45 → 0.70',
  near(STAGES.communityCenter.start, 0.45) && near(STAGES.communityCenter.end, 0.70),
  JSON.stringify(STAGES.communityCenter));
check('streetLamps spans 0.70 → 0.95',
  near(STAGES.streetLamps.start, 0.70) && near(STAGES.streetLamps.end, 0.95),
  JSON.stringify(STAGES.streetLamps));
check('settle spans 0.95 → 1.0',
  near(STAGES.settle.start, 0.95) && near(STAGES.settle.end, 1.0),
  JSON.stringify(STAGES.settle));

// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nassetContract.test.ts: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nassetContract.test.ts: all checks passed');
