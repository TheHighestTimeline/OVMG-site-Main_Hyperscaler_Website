/** STREET LAMP — reusable classic urban lamp. Origin bottom-center, Y=0 ground.
 *  Geometry/materials are shared across instances via module-level caches. */
import * as THREE from 'three';
import { materials } from '../materials';

let cache: {
  base: THREE.CylinderGeometry; base2: THREE.CylinderGeometry;
  pole: THREE.CylinderGeometry; collar: THREE.TorusGeometry;
  arm: THREE.CylinderGeometry; housing: THREE.CylinderGeometry;
  glass: THREE.SphereGeometry; bulb: THREE.SphereGeometry;
  cap: THREE.ConeGeometry;
} | null = null;

function geo() {
  if (!cache) {
    cache = {
      base: new THREE.CylinderGeometry(0.14, 0.18, 0.16, 10),
      base2: new THREE.CylinderGeometry(0.09, 0.14, 0.22, 10),
      pole: new THREE.CylinderGeometry(0.035, 0.05, 2.2, 9),
      collar: new THREE.TorusGeometry(0.05, 0.015, 6, 12),
      arm: new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8),
      housing: new THREE.CylinderGeometry(0.1, 0.065, 0.1, 8),
      glass: new THREE.SphereGeometry(0.1, 12, 10),
      bulb: new THREE.SphereGeometry(0.045, 8, 8),
      cap: new THREE.ConeGeometry(0.12, 0.1, 8),
    };
  }
  return cache;
}

/** Lamp head faces -Z in local space (rotate instance so head faces the road). */
export function createStreetLamp(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'StreetLamp';
  const M = materials();
  const G = geo();

  const base = new THREE.Mesh(G.base, M.paintedMetal); base.name = 'LampBase'; base.position.y = 0.08;
  const base2 = new THREE.Mesh(G.base2, M.paintedMetal); base2.name = 'LampBaseUpper'; base2.position.y = 0.27;
  const pole = new THREE.Mesh(G.pole, M.paintedMetal); pole.name = 'LampPole'; pole.position.y = 0.38 + 1.1;
  const collar = new THREE.Mesh(G.collar, M.paintedMetal); collar.name = 'LampCollar';
  collar.position.y = 1.7; collar.rotation.x = Math.PI / 2;

  const arm = new THREE.Mesh(G.arm, M.paintedMetal); arm.name = 'LampArm';
  arm.position.set(0, 2.62, -0.2); arm.rotation.x = Math.PI / 2 - 0.35;

  const housing = new THREE.Mesh(G.housing, M.paintedMetal); housing.name = 'LampHousing';
  housing.position.set(0, 2.76, -0.38);
  const cap = new THREE.Mesh(G.cap, M.paintedMetal); cap.name = 'LampCap';
  cap.position.set(0, 2.85, -0.38);
  const glass = new THREE.Mesh(G.glass, M.lampGlass); glass.name = 'LampGlass';
  glass.position.set(0, 2.62, -0.38);
  const bulb = new THREE.Mesh(G.bulb, M.bulb); bulb.name = 'LampBulb';
  bulb.position.set(0, 2.62, -0.38);

  // Light anchor: empty object marking where a real PointLight may be attached
  const anchor = new THREE.Object3D(); anchor.name = 'LampLightAnchor';
  anchor.position.set(0, 2.55, -0.38);

  g.add(base, base2, pole, collar, arm, housing, cap, glass, bulb, anchor);
  return g;
}
