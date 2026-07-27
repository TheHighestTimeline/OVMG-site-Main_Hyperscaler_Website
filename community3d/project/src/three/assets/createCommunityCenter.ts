/** COMMUNITY CENTER — civic building, larger than market. Origin bottom-center, Y=0 ground. */
import * as THREE from 'three';
import { materials, signTexture } from '../materials/materialLibrary';
import { FOOTPRINTS } from '../../scene/sceneLayout';

const box = (w: number, h: number, d: number, m: THREE.Material, name: string) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.name = name;
  return mesh;
};

export function createCommunityCenter(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'CommunityCenter';
  const M = materials();
  const { w, d } = FOOTPRINTS.communityCenter; // 4.0 x 2.75
  const wallH = 2.5;

  // Main shell — dark brick
  const shell = box(w, wallH, d, M.darkBrick, 'CenterShell');
  shell.position.y = wallH / 2;
  g.add(shell);

  // Stone base course
  const base = box(w + 0.08, 0.35, d + 0.08, M.stoneTrim, 'CenterBase');
  base.position.y = 0.175;
  g.add(base);

  // Cornice trim
  const cornice = box(w + 0.14, 0.18, d + 0.14, M.stoneTrim, 'CenterTrim');
  cornice.position.y = wallH + 0.09;
  g.add(cornice);

  // Hipped roof (4-sided) using a squashed pyramid
  const roofGeo = new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 0.78, 0.85, 4);
  roofGeo.rotateY(Math.PI / 4); // bake rotation so bounding boxes reflect true extents
  const roof = new THREE.Mesh(roofGeo, M.darkRoof);
  roof.name = 'CenterRoof';
  roof.scale.set(w / Math.hypot(w, d) * 1.9, 1, d / Math.hypot(w, d) * 1.9);
  roof.position.y = wallH + 0.18 + 0.42;
  g.add(roof);

  // Roof details: solar panels + finial
  const roofDetails = new THREE.Group(); roofDetails.name = 'CenterRoofDetails';
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x14213d, roughness: 0.3, metalness: 0.5 });
  for (const [px, pz] of [[-1.0, -0.55], [0.1, -0.55], [1.1, -0.55]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.55), panelMat);
    p.name = 'SolarPanel';
    p.position.set(px, wallH + 0.62, pz);
    p.rotation.x = -0.42;
    roofDetails.add(p);
  }
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.55, 6), M.paintedMetal);
  finial.name = 'Finial';
  finial.position.y = wallH + 1.25;
  const finialTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0x44c7ff, emissive: 0x44c7ff, emissiveIntensity: 1.6 }));
  finialTip.name = 'FinialLight';
  finialTip.position.y = wallH + 1.46;
  roofDetails.add(finial, finialTip);
  g.add(roofDetails);

  // Entrance block (projecting, centered, front -Z)
  const ent = new THREE.Group(); ent.name = 'CenterEntrance';
  const entW = 1.5, entH = 2.15, entD = 0.5;
  const entBlock = box(entW, entH, entD, M.stoneTrim, 'EntranceBlock');
  entBlock.position.set(0, entH / 2, -d / 2 - entD / 2 + 0.05);
  ent.add(entBlock);
  // Columns
  const cols = new THREE.Group(); cols.name = 'CenterColumnsOrSupports';
  for (const cx of [-0.62, 0.62]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.9, 10), M.stoneTrim);
    col.name = 'Column';
    col.position.set(cx, 0.95, -d / 2 - entD + 0.02);
    cols.add(col);
  }
  ent.add(cols);
  // Double doors with glow
  const doors = new THREE.Group(); doors.name = 'CenterDoors';
  const doorGlow = box(0.95, 1.55, 0.03, M.windowGlow(2, 1), 'DoorGlazing');
  doorGlow.position.set(0, 0.85, -d / 2 - entD + 0.06);
  const doorFrame = box(1.1, 1.7, 0.04, M.paintedMetal, 'DoorFrame');
  doorFrame.position.set(0, 0.9, -d / 2 - entD + 0.04);
  const doorInner = box(1.0, 1.6, 0.02, M.windowGlow(2, 1), 'DoorInnerGlow');
  doorInner.position.set(0, 0.88, -d / 2 - 0.1);
  doors.add(doorFrame, doorGlow, doorInner);
  ent.add(doors);
  // Entrance steps
  for (let i = 0; i < 3; i++) {
    const st = box(1.7 - i * 0.15, 0.06, 0.5 - i * 0.13, M.concrete, `EntranceStep${i}`);
    st.position.set(0, 0.03 + i * 0.06, -d / 2 - entD - 0.3 + i * 0.1);
    ent.add(st);
  }
  g.add(ent);

  // Front windows (two banks flanking entrance)
  const wins = new THREE.Group(); wins.name = 'CenterWindows';
  const zF = -d / 2 - 0.012;
  for (const wx of [-1.35, 1.35]) {
    const bank = box(1.1, 1.3, 0.03, M.windowGlow(2, 2), 'WindowBank');
    bank.position.set(wx, 1.25, zF);
    const sill = box(1.2, 0.08, 0.05, M.stoneTrim, 'WindowSill');
    sill.position.set(wx, 0.56, zF);
    wins.add(bank, sill);
  }
  // Side windows
  for (const sx of [-1, 1]) {
    const side = box(0.03, 1.1, 1.8, M.windowGlow(3, 2), 'SideWindows');
    side.position.set(sx * (w / 2 + 0.012), 1.35, 0.1);
    wins.add(side);
  }
  // Clerestory row above entrance
  const cler = box(1.3, 0.4, 0.03, M.windowGlow(3, 1), 'Clerestory');
  cler.position.set(0, 2.25, zF);
  wins.add(cler);
  g.add(wins);

  // Sign above entrance
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.38, 0.05),
    new THREE.MeshStandardMaterial({ map: signTexture('COMMUNITY CENTER', 768, 128), roughness: 0.7 }),
  );
  sign.name = 'CenterSign';
  sign.position.set(0, 2.32, -d / 2 - 0.045);
  g.add(sign);

  // Interior glow plane
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.8, 1.4), materials().lightPool);
  glow.name = 'CenterInteriorGlow';
  glow.position.set(0, 1.2, zF - 0.01);
  g.add(glow);

  return g;
}
