import * as THREE from 'three';
import { brickTexture, asphaltTexture, pavingTexture, windowTexture } from './proceduralTextures';

/** Shared, reused materials. */
export class MaterialLibrary {
  readonly darkBrick = new THREE.MeshStandardMaterial({ map: brickTexture('#43342d', '#241f1a'), roughness: 0.92 });
  readonly warmBrick = new THREE.MeshStandardMaterial({ map: brickTexture('#5b4436', '#2e251e'), roughness: 0.9 });
  readonly stoneTrim = new THREE.MeshStandardMaterial({ color: 0x8f8878, roughness: 0.8 });
  readonly darkRoof = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.75, metalness: 0.15 });
  readonly asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95 });
  readonly concrete = new THREE.MeshStandardMaterial({ map: pavingTexture('#9a9184', '#7d766b'), roughness: 0.9 });
  readonly paving = new THREE.MeshStandardMaterial({ map: (() => { const t = pavingTexture('#6f695f', '#57524b'); t.repeat.set(4, 3); return t; })(), roughness: 0.95 });
  readonly soil = new THREE.MeshStandardMaterial({ color: 0x201a16, roughness: 1 });
  readonly rockSide = new THREE.MeshStandardMaterial({ map: brickTexture('#4a433d', '#211d19', [5, 1]), roughness: 1 });
  readonly paintedMetal = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.55, metalness: 0.3 });
  readonly glass = new THREE.MeshStandardMaterial({ color: 0x0e1420, roughness: 0.15, metalness: 0.4 });
  readonly awning = new THREE.MeshStandardMaterial({ color: 0x1d3470, roughness: 0.8 });
  readonly foliage = new THREE.MeshStandardMaterial({ color: 0x46632a, roughness: 0.95 });
  readonly trunk = new THREE.MeshStandardMaterial({ color: 0x3d2f24, roughness: 1 });
  readonly curb = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.85 });
  readonly marking = new THREE.MeshStandardMaterial({ color: 0xd8b13c, roughness: 0.9, emissive: 0x6a5210, emissiveIntensity: 0.5 });
  readonly whiteMarking = new THREE.MeshStandardMaterial({ color: 0xd9d4c5, roughness: 0.9, emissive: 0x3a382f, emissiveIntensity: 0.5 });
  readonly windowGlow = (cols: number, rows: number) => new THREE.MeshStandardMaterial({
    map: windowTexture(cols, rows),
    emissive: 0xffb757, emissiveIntensity: 0.55,
    emissiveMap: windowTexture(cols, rows),
    roughness: 0.4,
  });
  readonly bulb = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc36b, emissiveIntensity: 3.2 });
  readonly lampGlass = new THREE.MeshStandardMaterial({ color: 0xffe9c4, transparent: true, opacity: 0.35, roughness: 0.1, emissive: 0xffc36b, emissiveIntensity: 0.5 });
  readonly lightPool = new THREE.MeshBasicMaterial({ color: 0xff9d3d, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  readonly ironwork = new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.9, metalness: 0.1 });
  readonly aoBlob = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
}

let lib: MaterialLibrary | null = null;
export function materials(): MaterialLibrary {
  if (!lib) lib = new MaterialLibrary();
  return lib;
}

export { signTexture, brickTexture, asphaltTexture, pavingTexture, windowTexture } from './proceduralTextures';
