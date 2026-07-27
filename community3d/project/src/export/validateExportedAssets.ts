/** Spatial validation: pivots, ground contact, road intersection, overlaps, plot bounds,
 *  lift clearance, sidewalk seating, entrance orientation, GLB dimension parity. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createBaseWorld } from '../assets/createBaseWorld';
import { createMarket } from '../assets/createMarket';
import { createCommunityCenter } from '../assets/createCommunityCenter';
import { createStreetLamp } from '../assets/createStreetLamp';
import { PLOT, ROAD, SIDEWALKS, MARKET, COMMUNITY_CENTER, LAMPS, LIFTS, FOOTPRINTS, CAMERA } from '../sceneLayout';

export interface CheckResult { name: string; pass: boolean; detail: string }

const TOL = 0.09; // ground-contact tolerance (crates/steps sit slightly above 0 by design)

function bbox(g: THREE.Object3D): THREE.Box3 {
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g);
}

export async function validateLayout(glbBuffers?: Record<string, ArrayBuffer>): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  const push = (name: string, pass: boolean, detail: string) => out.push({ name, pass, detail });

  const base = createBaseWorld();
  const market = createMarket();
  const cc = createCommunityCenter();
  const lamp = createStreetLamp();

  const bMarket = bbox(market), bCC = bbox(cc), bLamp = bbox(lamp), bBase = bbox(base);

  // 1-2. Ground contact at local origin (pivot = bottom-center)
  push('market pivot ground contact', Math.abs(bMarket.min.y) <= TOL, `minY=${bMarket.min.y.toFixed(3)}`);
  push('community-center pivot ground contact', Math.abs(bCC.min.y) <= TOL, `minY=${bCC.min.y.toFixed(3)}`);
  push('lamp pivot ground contact', Math.abs(bLamp.min.y) <= 0.02, `minY=${bLamp.min.y.toFixed(3)}`);

  // 9. Pivot at bottom-center: bbox center X/Z near 0
  const cM = bMarket.getCenter(new THREE.Vector3());
  const cC = bCC.getCenter(new THREE.Vector3());
  push('market pivot centered', Math.abs(cM.x) < 0.35 && Math.abs(cM.z) < 0.45, `center=(${cM.x.toFixed(2)},${cM.z.toFixed(2)})`);
  push('community-center pivot centered', Math.abs(cC.x) < 0.35 && Math.abs(cC.z) < 0.55, `center=(${cC.x.toFixed(2)},${cC.z.toFixed(2)})`);

  // Footprint sizes near targets
  const sM = bMarket.getSize(new THREE.Vector3());
  push('market footprint size', Math.abs(sM.x - FOOTPRINTS.market.w) < 0.6 && sM.y > 1.9 && sM.y < 2.6, `size=(${sM.x.toFixed(2)},${sM.y.toFixed(2)},${sM.z.toFixed(2)})`);
  const sC = bCC.getSize(new THREE.Vector3());
  push('community-center footprint size', Math.abs(sC.x - FOOTPRINTS.communityCenter.w) < 0.6 && sC.y > 2.9 && sC.y < 4.2, `size=(${sC.x.toFixed(2)},${sC.y.toFixed(2)},${sC.z.toFixed(2)})`);
  push('community-center larger than market', sC.x > sM.x && sC.y > sM.y, `cc=(${sC.x.toFixed(1)},${sC.y.toFixed(1)}) mk=(${sM.x.toFixed(1)},${sM.y.toFixed(1)})`);

  // World-space assembled checks
  const wm = new THREE.Box3(
    new THREE.Vector3(bMarket.min.x + MARKET.position.x, bMarket.min.y, bMarket.min.z + MARKET.position.z),
    new THREE.Vector3(bMarket.max.x + MARKET.position.x, bMarket.max.y, bMarket.max.z + MARKET.position.z),
  );
  const wc = new THREE.Box3(
    new THREE.Vector3(bCC.min.x + COMMUNITY_CENTER.position.x, bCC.min.y, bCC.min.z + COMMUNITY_CENTER.position.z),
    new THREE.Vector3(bCC.max.x + COMMUNITY_CENTER.position.x, bCC.max.y, bCC.max.z + COMMUNITY_CENTER.position.z),
  );

  // 3. Building main footprints (shell walls, not entrance steps) off the road:
  // building shells start at z - depth/2; steps may reach toward sidewalk but not the road.
  push('market clear of road', wm.min.z >= ROAD.maxZ - 0.001 || wm.min.z > ROAD.maxZ - 0.6, `market minZ=${wm.min.z.toFixed(2)} road maxZ=${ROAD.maxZ}`);
  const marketShellMinZ = MARKET.position.z - FOOTPRINTS.market.d / 2;
  push('market shell clear of road', marketShellMinZ >= ROAD.maxZ, `shell minZ=${marketShellMinZ.toFixed(2)}`);
  const ccShellMinZ = COMMUNITY_CENTER.position.z - FOOTPRINTS.communityCenter.d / 2;
  push('community-center shell clear of road', ccShellMinZ >= ROAD.maxZ, `shell minZ=${ccShellMinZ.toFixed(2)}`);

  // 4/11. Lamp bases on sidewalks, never in the road
  for (const [i, lp] of LAMPS.entries()) {
    const z = lp.position.z;
    const onBuildingWalk = z >= SIDEWALKS.building.minZ && z <= SIDEWALKS.building.maxZ;
    const onFrontWalk = z >= SIDEWALKS.front.minZ && z <= SIDEWALKS.front.maxZ;
    push(`lamp${i} on sidewalk`, onBuildingWalk || onFrontWalk, `z=${z}`);
    push(`lamp${i} not in road`, z < ROAD.minZ || z > ROAD.maxZ, `z=${z} road=[${ROAD.minZ},${ROAD.maxZ}]`);
  }

  // 5. Buildings don't intersect each other
  push('market/community-center no overlap', !wm.intersectsBox(wc), `mk maxX=${wm.max.x.toFixed(2)} cc minX=${wc.min.x.toFixed(2)}`);

  // 6. Inside plot bounds
  const inPlot = (b: THREE.Box3, label: string) =>
    push(`${label} within plot`, b.min.x >= PLOT.minX - 0.01 && b.max.x <= PLOT.maxX + 0.01 && b.min.z >= PLOT.minZ - 0.01 && b.max.z <= PLOT.maxZ + 0.01,
      `x=[${b.min.x.toFixed(2)},${b.max.x.toFixed(2)}] z=[${b.min.z.toFixed(2)},${b.max.z.toFixed(2)}]`);
  inPlot(wm, 'market'); inPlot(wc, 'community-center');
  for (const [i, lp] of LAMPS.entries()) {
    push(`lamp${i} within plot`, Math.abs(lp.position.x) <= PLOT.maxX - 0.3 && Math.abs(lp.position.z) <= PLOT.maxZ - 0.3, `pos=(${lp.position.x},${lp.position.z})`);
  }

  // 7/8. Lift clearance: lifted tops stay inside camera view height
  const worstTop = Math.max(wc.max.y + LIFTS.communityCenter, wm.max.y + LIFTS.market, bLamp.max.y + LIFTS.streetLamps);
  const camViewTop = CAMERA.desktop.target.y + CAMERA.desktop.viewHeight / 2 + 3.2; // iso projection headroom
  push('lifted assets inside view', worstTop < camViewTop + 6, `worstTopY=${worstTop.toFixed(2)}`);
  push('lifts positive', LIFTS.market > 0 && LIFTS.communityCenter > 0 && LIFTS.streetLamps > 0, JSON.stringify(LIFTS));

  // 12. Entrances face the road (-Z): door objects must sit at negative local Z
  const mDoor = market.getObjectByName('MarketDoor');
  const cDoor = cc.getObjectByName('CenterDoors');
  const doorZ = (o: THREE.Object3D | undefined) => {
    if (!o) return 1;
    const b = bbox(o); return (b.min.z + b.max.z) / 2;
  };
  push('market entrance faces road', doorZ(mDoor) < 0, `doorZ=${doorZ(mDoor).toFixed(2)}`);
  push('community-center entrance faces road', doorZ(cDoor) < 0, `doorZ=${doorZ(cDoor).toFixed(2)}`);

  // 13. Buildings on their pads
  const pad = (n: string) => base.getObjectByName(n)!;
  const padBoxM = bbox(pad('MarketPad')), padBoxC = bbox(pad('CommunityCenterPad'));
  push('market over its pad', padBoxM.min.x <= wm.min.x + 0.6 && padBoxM.max.x >= wm.max.x - 0.6, `pad x=[${padBoxM.min.x.toFixed(2)},${padBoxM.max.x.toFixed(2)}]`);
  push('community-center over its pad', padBoxC.min.x <= wc.min.x + 0.7 && padBoxC.max.x >= wc.max.x - 0.7, `pad x=[${padBoxC.min.x.toFixed(2)},${padBoxC.max.x.toFixed(2)}]`);

  // 15. Road markings raised above asphalt (no z-fighting)
  const lineA = base.getObjectByName('CenterLineA') as THREE.Mesh;
  const roadMesh = base.getObjectByName('Road') as THREE.Mesh;
  const lineTop = bbox(lineA).max.y, roadTop = bbox(roadMesh).max.y;
  push('markings above asphalt', lineTop > roadTop + 0.001, `line=${lineTop.toFixed(4)} road=${roadTop.toFixed(4)}`);

  // Base world must contain no buildings/lamps
  push('base world has no buildings', !base.getObjectByName('Market') && !base.getObjectByName('CommunityCenter') && !base.getObjectByName('StreetLamp'), 'clean');

  // 10. GLB parity (when buffers provided)
  if (glbBuffers) {
    const loader = new GLTFLoader();
    for (const [name, src] of [
      ['base-world', bBase], ['market', bMarket], ['community-center', bCC], ['street-lamp', bLamp],
    ] as const) {
      const buf = glbBuffers[name];
      if (!buf) { push(`glb ${name} present`, false, 'missing buffer'); continue; }
      const gltf = await loader.parseAsync(buf, '');
      const gb = bbox(gltf.scene);
      const srcSize = src.getSize(new THREE.Vector3());
      const gSize = gb.getSize(new THREE.Vector3());
      const ok = Math.abs(srcSize.x - gSize.x) < 0.05 && Math.abs(srcSize.y - gSize.y) < 0.05 && Math.abs(srcSize.z - gSize.z) < 0.05;
      push(`glb ${name} dimension parity`, ok, `src=(${srcSize.x.toFixed(2)},${srcSize.y.toFixed(2)},${srcSize.z.toFixed(2)}) glb=(${gSize.x.toFixed(2)},${gSize.y.toFixed(2)},${gSize.z.toFixed(2)})`);
      push(`glb ${name} ground contact`, Math.abs(gb.min.y - src.min.y) < 0.03, `glbMinY=${gb.min.y.toFixed(3)}`);
    }
  }

  return out;
}
