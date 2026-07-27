/** BASE WORLD — floating plot, road, sidewalks, curbs, crosswalk, pads, landscaping.
 *  Contains NO buildings and NO lamps. Local origin: center of plot, top surface Y=0. */
import * as THREE from 'three';
import { materials } from '../materials/materialLibrary';
import { PLOT, ROAD, SIDEWALKS, CROSSWALK, MARKET, COMMUNITY_CENTER, FOOTPRINTS } from '../../scene/sceneLayout';

const box = (w: number, h: number, d: number, m: THREE.Material, name: string) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.name = name;
  return mesh;
};

export function createBaseWorld(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'BaseWorld';
  const M = materials();

  // Terrain slab: paved top + rocky sides + soil bottom lip
  const slab = new THREE.Group(); slab.name = 'TerrainSlab';
  const top = box(PLOT.width, 0.12, PLOT.depth, M.paving, 'SlabTop');
  top.position.y = -0.06;
  const body = box(PLOT.width, PLOT.slabThickness - 0.12, PLOT.depth, M.rockSide, 'SlabBody');
  body.position.y = -0.12 - (PLOT.slabThickness - 0.12) / 2;
  slab.add(top, body);
  g.add(slab);

  // Road (recessed slightly)
  const road = box(ROAD.length, 0.1, ROAD.width, M.asphalt, 'Road');
  road.position.set(0, ROAD.surfaceY - 0.05 + 0.05, ROAD.centerZ);
  road.position.y = ROAD.surfaceY - 0.05;
  g.add(road);

  // Center line (double yellow, weathered) — raised 2mm to avoid z-fighting
  const lineY = ROAD.surfaceY + 0.004;
  const line1 = box(ROAD.length * 0.96, 0.004, 0.06, M.marking, 'CenterLineA');
  line1.position.set(0, lineY, ROAD.centerZ - 0.05);
  const line2 = line1.clone(); line2.name = 'CenterLineB'; line2.position.z = ROAD.centerZ + 0.05;
  g.add(line1, line2);

  // Manhole
  const manhole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.01, 20), M.ironwork);
  manhole.name = 'Manhole';
  manhole.position.set(1.6, lineY, ROAD.centerZ + 0.6);
  g.add(manhole);

  // Sidewalks (raised)
  const swB = box(PLOT.width, SIDEWALKS.building.topY, SIDEWALKS.building.width, M.concrete, 'SidewalkNorth');
  swB.position.set(0, SIDEWALKS.building.topY / 2, SIDEWALKS.building.centerZ);
  const swF = box(PLOT.width, SIDEWALKS.front.topY, SIDEWALKS.front.width, M.concrete, 'SidewalkSouth');
  swF.position.set(0, SIDEWALKS.front.topY / 2, SIDEWALKS.front.centerZ);
  g.add(swB, swF);

  // Curbs
  const curbs = new THREE.Group(); curbs.name = 'Curbs';
  const curbN = box(PLOT.width, 0.09, 0.09, M.curb, 'CurbNorth');
  curbN.position.set(0, 0.045 - 0.02, ROAD.maxZ + 0.045);
  const curbS = box(PLOT.width, 0.09, 0.09, M.curb, 'CurbSouth');
  curbS.position.set(0, 0.045 - 0.02, ROAD.minZ - 0.045);
  curbs.add(curbN, curbS);
  g.add(curbs);

  // Crosswalk — stripes parallel to Z spanning road width, raised to avoid z-fighting
  const cw = new THREE.Group(); cw.name = 'Crosswalk';
  const totalSpan = CROSSWALK.stripeCount * CROSSWALK.stripeWidth + (CROSSWALK.stripeCount - 1) * CROSSWALK.stripeGap;
  for (let i = 0; i < CROSSWALK.stripeCount; i++) {
    const s = box(CROSSWALK.stripeWidth, 0.004, ROAD.width * 0.92, M.whiteMarking, `CrosswalkStripe${i}`);
    s.position.set(CROSSWALK.centerX - totalSpan / 2 + CROSSWALK.stripeWidth / 2 + i * (CROSSWALK.stripeWidth + CROSSWALK.stripeGap), lineY + 0.001, ROAD.centerZ);
    cw.add(s);
  }
  g.add(cw);

  // Building pads (slightly raised bordered slabs)
  const padMat = M.stoneTrim;
  const mp = box(FOOTPRINTS.market.w + 0.5, 0.05, FOOTPRINTS.market.d + 0.5, padMat, 'MarketPad');
  mp.position.set(MARKET.position.x, 0.025, MARKET.position.z);
  const cp = box(FOOTPRINTS.communityCenter.w + 0.6, 0.05, FOOTPRINTS.communityCenter.d + 0.6, padMat, 'CommunityCenterPad');
  cp.position.set(COMMUNITY_CENTER.position.x, 0.025, COMMUNITY_CENTER.position.z);
  g.add(mp, cp);

  // Ground details: drain grate near curb
  const details = new THREE.Group(); details.name = 'GroundDetails';
  const drain = box(0.5, 0.012, 0.22, M.ironwork, 'Drain');
  drain.position.set(3.4, ROAD.surfaceY + 0.006, ROAD.maxZ - 0.16);
  details.add(drain);
  g.add(details);

  // Landscaping: trees at plot ends + planter + shrubs (kept clear of pads & lamps)
  const land = new THREE.Group(); land.name = 'Landscaping';
  land.add(tree(-6.3, 3.6, 1.25), tree(6.3, 3.7, 1.15), tree(6.35, -3.8, 1.0));
  const planter = box(2.2, 0.42, 0.6, M.rockSide, 'Planter');
  planter.position.set(5.0, 0.21, 2.2);
  const hedge = box(2.0, 0.3, 0.42, M.foliage, 'PlanterHedge');
  hedge.position.set(5.0, 0.55, 2.2);
  land.add(planter, hedge);
  const shrub1 = shrub(-6.4, 1.3), shrub2 = shrub(-2.6, 4.1), shrub3 = shrub(4.4, -3.9);
  land.add(shrub1, shrub2, shrub3);
  g.add(land);

  return g;
}

function tree(x: number, z: number, s: number): THREE.Group {
  const M = materials();
  const t = new THREE.Group(); t.name = 'Tree';
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.1 * s, 0.9 * s, 7), M.trunk);
  trunk.position.y = 0.45 * s;
  const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 1), M.foliage);
  c1.position.y = 1.25 * s;
  const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * s, 1), M.foliage);
  c2.position.set(0.3 * s, 1.0 * s, 0.15 * s);
  t.add(trunk, c1, c2);
  t.position.set(x, 0, z);
  return t;
}

function shrub(x: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), materials().foliage);
  m.name = 'Shrub';
  m.position.set(x, 0.2, z);
  m.scale.y = 0.7;
  return m;
}
