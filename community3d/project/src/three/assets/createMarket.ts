/** MARKET — small neighborhood storefront. Local origin: bottom-center of footprint, Y=0 at ground. */
import * as THREE from 'three';
import { materials, signTexture } from '../materials/materialLibrary';
import { FOOTPRINTS } from '../../scene/sceneLayout';

const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], name: string) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m as THREE.Material);
  mesh.name = name;
  return mesh;
};

export function createMarket(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Market';
  const M = materials();
  const { w, d } = FOOTPRINTS.market; // 2.5 x 1.9
  const wallH = 1.85;

  // Shell (warm brick)
  const shell = box(w, wallH, d, M.warmBrick, 'MarketShell');
  shell.position.y = wallH / 2;
  g.add(shell);

  // Parapet trim
  const parapet = box(w + 0.08, 0.16, d + 0.08, M.stoneTrim, 'MarketTrim');
  parapet.position.y = wallH + 0.08;
  g.add(parapet);

  // Flat roof + details
  const roof = box(w - 0.1, 0.06, d - 0.1, M.darkRoof, 'MarketRoof');
  roof.position.y = wallH + 0.16 + 0.03;
  g.add(roof);
  const roofDetails = new THREE.Group(); roofDetails.name = 'MarketRoofDetails';
  const vent = box(0.35, 0.22, 0.3, M.paintedMetal, 'Vent');
  vent.position.set(-0.6, wallH + 0.16 + 0.06 + 0.11, 0.25);
  const unit = box(0.5, 0.28, 0.42, M.paintedMetal, 'HvacUnit');
  unit.position.set(0.55, wallH + 0.16 + 0.06 + 0.14, -0.2);
  roofDetails.add(vent, unit);
  g.add(roofDetails);

  // Facade: storefront glazing band (front = -Z)
  const facade = new THREE.Group(); facade.name = 'MarketFacade';
  const zF = -d / 2 - 0.012;
  const glazing = box(w - 0.5, 1.05, 0.03, M.windowGlow(4, 1), 'MarketWindows');
  glazing.position.set(0.12, 0.72, zF);
  facade.add(glazing);
  // window frames
  const frameTop = box(w - 0.42, 0.07, 0.05, M.paintedMetal, 'FrameTop');
  frameTop.position.set(0.12, 1.3, zF);
  const frameBottom = box(w - 0.42, 0.1, 0.05, M.stoneTrim, 'FrameSill');
  frameBottom.position.set(0.12, 0.16, zF);
  facade.add(frameTop, frameBottom);
  g.add(facade);

  // Recessed door (left side of front)
  const door = new THREE.Group(); door.name = 'MarketDoor';
  const doorPanel = box(0.5, 1.28, 0.04, M.glass, 'DoorPanel');
  doorPanel.position.set(-w / 2 + 0.42, 0.64, -d / 2 + 0.1); // recessed
  const doorFrame = box(0.6, 1.36, 0.05, M.paintedMetal, 'DoorFrame');
  doorFrame.position.set(-w / 2 + 0.42, 0.68, -d / 2 + 0.06);
  const doorGlow = box(0.42, 1.1, 0.01, M.windowGlow(1, 1), 'DoorGlow');
  doorGlow.position.set(-w / 2 + 0.42, 0.62, -d / 2 + 0.125);
  door.add(doorFrame, doorPanel, doorGlow);
  g.add(door);

  // Step / threshold
  const step = box(0.7, 0.07, 0.3, M.concrete, 'MarketStep');
  step.position.set(-w / 2 + 0.42, 0.035, -d / 2 - 0.15);
  g.add(step);

  // Awning over glazing
  const awn = new THREE.Group(); awn.name = 'MarketAwning';
  const awnGeo = new THREE.BoxGeometry(w - 0.62, 0.04, 0.5);
  const awning = new THREE.Mesh(awnGeo, M.awning);
  awning.name = 'AwningCanopy';
  awning.position.set(0.12, 1.44, -d / 2 - 0.22);
  awning.rotation.x = 0.32;
  awn.add(awning);
  g.add(awn);

  // Sign
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.36, 0.05),
    new THREE.MeshStandardMaterial({ map: signTexture('MARKET'), roughness: 0.7 }),
  );
  sign.name = 'MarketSign';
  sign.position.set(0.12, 1.66, -d / 2 - 0.04);
  g.add(sign);

  // Interior glow anchor (soft light feel through glazing)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, 0.9), materials().lightPool);
  glow.name = 'MarketInteriorGlow';
  glow.position.set(0.12, 0.7, -d / 2 - 0.02);
  g.add(glow);

  // Crates by the door
  const crate1 = box(0.26, 0.26, 0.26, M.trunk, 'Crate1');
  crate1.position.set(w / 2 - 0.35, 0.13, -d / 2 - 0.25);
  const crate2 = box(0.22, 0.22, 0.22, M.trunk, 'Crate2');
  crate2.position.set(w / 2 - 0.62, 0.11, -d / 2 - 0.2);
  g.add(crate1, crate2);

  return g;
}
