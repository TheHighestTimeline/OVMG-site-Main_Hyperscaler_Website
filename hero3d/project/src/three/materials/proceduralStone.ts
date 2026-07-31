/**
 * proceduralStone.ts — the stone look for the central O.
 *
 * Two surfaces make up the O:
 *   body — the lathed solid (outer bevel, side wall, inner chamfer, back).
 *          Fine mineral breakup comes from a tileable fbm noise normal map.
 *   face — the recessed carved band on the front. Its engraved character comes
 *          from maps baked off the supplied brand raster (relief/normal/rough/
 *          ao/albedo), so the carved pattern is the real OVMG artwork rather
 *          than an invented texture.
 *
 * If a baked map is unavailable the material still renders — it simply loses
 * that channel — and a runtime canvas noise texture stands in for the tileable
 * breakup so the stone never falls back to flat grey plastic.
 */

import * as THREE from 'three';
import { CENTRAL_O, PALETTE } from '../../hero/heroConfig';
import { loadTexture } from '../utils/assetLoader';

export interface StoneMaterials {
  body: THREE.MeshStandardMaterial;
  face: THREE.MeshStandardMaterial;
  innerGlow: THREE.MeshBasicMaterial;
  dispose(): void;
}

/**
 * Value-noise fbm rendered to a canvas. Only used when the baked tileable
 * noise map is missing; wraps by sampling a toroidal lattice.
 */
function createFallbackNoiseTexture(size = 256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const image = ctx.createImageData(size, size);
  const lattice = 16;
  const grid = new Float32Array(lattice * lattice);
  let seed = 20240727;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();

  const sample = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const fx = xf * xf * (3 - 2 * xf);
    const fy = yf * yf * (3 - 2 * yf);
    const at = (a: number, b: number) => grid[(((b % lattice) + lattice) % lattice) * lattice + (((a % lattice) + lattice) % lattice)];
    const v00 = at(xi, yi);
    const v10 = at(xi + 1, yi);
    const v01 = at(xi, yi + 1);
    const v11 = at(xi + 1, yi + 1);
    return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let amplitude = 0.5;
      let frequency = lattice / size;
      let value = 0;
      for (let octave = 0; octave < 4; octave += 1) {
        value += sample(x * frequency, y * frequency) * amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      const level = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      const index = (y * size + x) * 4;
      image.data[index] = level;
      image.data[index + 1] = level;
      image.data[index + 2] = level;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export interface StoneOptions {
  anisotropy: number;
  /** Scales relief displacement; 0 disables geometric carving. */
  reliefScale: number;
}

export function createStoneMaterials(options: StoneOptions): StoneMaterials {
  const owned: Array<{ dispose(): void }> = [];

  const body = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.stone).multiplyScalar(0.44),
    roughness: 0.88,
    metalness: 0.05,
    envMapIntensity: 0.42,
    flatShading: false,
  });

  const face = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.stone).multiplyScalar(0.6),
    roughness: 0.82,
    metalness: 0.045,
    envMapIntensity: 0.5,
    displacementScale: CENTRAL_O.reliefDepth * options.reliefScale,
    displacementBias: -CENTRAL_O.reliefDepth * options.reliefScale,
  });

  // A very restrained cool light bounced from inside the opening. Not a glow
  // effect — it exists to separate the inner chamfer from the background.
  const innerGlow = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8fb4d8').multiplyScalar(0.22),
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const dataOptions = { srgb: false as const, anisotropy: options.anisotropy };

  // Body breakup: tileable fbm noise as a normal map, repeated around the solid.
  void loadTexture('textures/stone-noise-normal.png', {
    ...dataOptions,
    wrap: THREE.RepeatWrapping,
  }).then((texture) => {
    const map = texture ?? createFallbackNoiseTexture();
    if (!texture) owned.push(map);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2.6, 2.6);
    body.normalMap = map;
    body.normalScale.set(1.05, 1.05);
    body.needsUpdate = true;
  });

  void loadTexture('textures/stone-noise.png', {
    ...dataOptions,
    wrap: THREE.RepeatWrapping,
  }).then((texture) => {
    if (!texture) return;
    texture.repeat.set(2.2, 2.2);
    body.roughnessMap = texture;
    body.roughness = 0.94;
    body.needsUpdate = true;
  });

  // Carved face maps, baked from the brand raster.
  void loadTexture('textures/o-albedo.png', { anisotropy: options.anisotropy }).then((texture) => {
    if (!texture) return;
    face.map = texture;
    face.needsUpdate = true;
  });
  void loadTexture('textures/o-normal.png', dataOptions).then((texture) => {
    if (!texture) return;
    face.normalMap = texture;
    face.normalScale.set(1.6, 1.6);
    face.needsUpdate = true;
  });
  void loadTexture('textures/o-rough.png', dataOptions).then((texture) => {
    if (!texture) return;
    face.roughnessMap = texture;
    face.needsUpdate = true;
  });
  void loadTexture('textures/o-ao.png', dataOptions).then((texture) => {
    if (!texture) return;
    face.aoMap = texture;
    face.aoMapIntensity = 1.8;
    face.needsUpdate = true;
  });
  void loadTexture('textures/o-relief.png', dataOptions).then((texture) => {
    if (!texture) return;
    face.displacementMap = texture;
    face.needsUpdate = true;
  });

  return {
    body,
    face,
    innerGlow,
    dispose() {
      body.dispose();
      face.dispose();
      innerGlow.dispose();
      for (const item of owned) item.dispose();
      owned.length = 0;
    },
  };
}
