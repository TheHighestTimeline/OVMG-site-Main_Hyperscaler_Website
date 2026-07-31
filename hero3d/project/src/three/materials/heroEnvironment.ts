/**
 * heroEnvironment.ts — a locally generated environment map.
 *
 * Stone needs something to reflect or it reads as flat clay. Rather than
 * fetching an HDRI from a CDN (no remote assets are permitted here) the
 * environment is authored in-scene: a graded dark dome plus a small number of
 * emissive light cards, pushed through PMREMGenerator. It is generated once,
 * costs one render, and is disposed with the hero.
 */

import * as THREE from 'three';
import { PALETTE } from '../../hero/heroConfig';

interface LightCard {
  color: string;
  intensity: number;
  position: [number, number, number];
  scale: [number, number];
  lookAtOrigin?: boolean;
}

const LIGHT_CARDS: LightCard[] = [
  // Cool key card, upper front-left.
  { color: '#cfe2ff', intensity: 3.4, position: [-6, 6.5, 7], scale: [9, 7] },
  // Broad soft fill from the front-right, keeps the front face from going flat.
  { color: '#7ea6d8', intensity: 1.15, position: [8, 1.5, 6], scale: [10, 9] },
  // Rim card behind, separates the silhouette from the void.
  { color: PALETTE.sky, intensity: 2.2, position: [-3.5, 1.2, -9], scale: [11, 6] },
  // Restrained warm kicker so the stone is not uniformly cold.
  { color: PALETTE.warm, intensity: 0.8, position: [6.5, -3.5, 2.5], scale: [6, 5] },
  // Faint blue bounce from below.
  { color: PALETTE.electric, intensity: 0.55, position: [0, -8, 2], scale: [12, 6] },
];

export interface HeroEnvironment {
  texture: THREE.Texture;
  dispose(): void;
}

export function createHeroEnvironment(renderer: THREE.WebGLRenderer): HeroEnvironment {
  const scene = new THREE.Scene();
  const disposables: Array<{ dispose(): void }> = [];

  // Graded dome: deep navy overhead falling to near-black below.
  const domeGeometry = new THREE.SphereGeometry(60, 24, 16);
  const domeMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.nebulaBlue).multiplyScalar(0.55) },
      uBottom: { value: new THREE.Color(PALETTE.voidTop) },
      uHorizon: { value: new THREE.Color('#1a2c4d').multiplyScalar(0.35) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec3 uHorizon;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld).y * 0.5 + 0.5;
        vec3 lower = mix(uBottom, uHorizon, smoothstep(0.0, 0.5, h));
        vec3 color = mix(lower, uTop, smoothstep(0.45, 1.0, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(domeGeometry, domeMaterial);
  scene.add(dome);
  disposables.push(domeGeometry, domeMaterial);

  const cardGeometry = new THREE.PlaneGeometry(1, 1);
  disposables.push(cardGeometry);

  for (const card of LIGHT_CARDS) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(card.color).multiplyScalar(card.intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(cardGeometry, material);
    mesh.position.set(...card.position);
    mesh.scale.set(card.scale[0], card.scale[1], 1);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    disposables.push(material);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(scene, 0.04, 0.1, 100);
  pmrem.dispose();

  for (const item of disposables) item.dispose();
  scene.clear();

  return {
    texture: target.texture,
    dispose() {
      target.dispose();
    },
  };
}
