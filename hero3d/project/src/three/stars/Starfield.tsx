/**
 * Starfield.tsx — three depth-separated point layers.
 *
 * Points are drawn with a circular falloff in the fragment shader, so there
 * are no square sprites and no texture fetch. Each layer has its own density,
 * size, brightness, twinkle rate and parallax coefficients, which is what
 * produces perceived depth rather than one flat sheet of dots.
 *
 * Colour is restrained: cool white with a small spread toward pale blue and,
 * for a handful of stars, a faint warm cast. No rainbow field.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MOTION, type StarLayerConfig } from '../../hero/heroConfig';
import { useHeroRuntime } from '../../hero/heroRuntime';

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute float aPhase;
  attribute vec3 aTint;

  uniform float uTime;
  uniform float uTwinkle;
  uniform float uPixelRatio;
  uniform float uOpacity;

  varying float vBrightness;
  varying vec3 vTint;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 1.0 + uTwinkle * 0.5 * sin(uTime * 0.55 + aPhase * 6.2831);
    vBrightness = aBrightness * twinkle * uOpacity;
    vTint = aTint;
    // Size attenuates with depth, but never below a pixel: a sub-pixel point
    // is rasterised with partial coverage and effectively disappears, which is
    // what left the far layer looking like a handful of grey specks.
    float size = aSize * uPixelRatio * (300.0 / max(-mvPosition.z, 0.001));
    gl_PointSize = max(size, uPixelRatio * 1.15);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;

  uniform float uSoftness;

  varying float vBrightness;
  varying vec3 vTint;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    // Crisp core with a soft halo; uSoftness pushes the profile toward dust.
    float core = 1.0 - smoothstep(0.0, mix(0.35, 1.0, uSoftness), d);
    float halo = 1.0 - smoothstep(0.0, 1.0, d);
    float alpha = mix(core, halo * 0.55, uSoftness) * vBrightness;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(vTint, alpha);
  }
`;

/** Deterministic PRNG so the field is identical across reloads and screenshots. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export interface StarLayerProps {
  layer: StarLayerConfig;
  density: number;
  pixelRatio: number;
  visible?: boolean;
}

export function StarLayer({ layer, density, pixelRatio, visible = true }: StarLayerProps) {
  const group = useRef<THREE.Group>(null);
  const points = useRef<THREE.Points>(null);
  const runtime = useHeroRuntime();

  const { geometry, material, count } = useMemo(() => {
    const random = makeRandom(0x9e3779b9 ^ (layer.id.length * 2654435761));
    const total = Math.max(24, Math.round(layer.count * density));
    const positions = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    const brightness = new Float32Array(total);
    const phases = new Float32Array(total);
    const tints = new Float32Array(total * 3);

    const cool = new THREE.Color('#e8f1ff');
    const blue = new THREE.Color('#9dc4ff');
    const warm = new THREE.Color('#ffd9b8');
    const temp = new THREE.Color();

    for (let i = 0; i < total; i += 1) {
      // Uniform distribution across a spherical shell.
      const u = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const r = Math.cbrt(
        random() * (layer.outerRadius ** 3 - layer.innerRadius ** 3) + layer.innerRadius ** 3,
      );
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = r * s * Math.cos(theta);
      positions[i * 3 + 1] = r * s * Math.sin(theta) * 0.72; // slightly flattened field
      positions[i * 3 + 2] = r * u;

      // Size follows a power law so a few stars carry real presence.
      const roll = random();
      sizes[i] = layer.size * (1 + layer.sizeJitter * Math.pow(roll, 3) * 3.2);
      brightness[i] = layer.brightness * (0.35 + 0.65 * Math.pow(random(), 1.7));
      phases[i] = random();

      const tintRoll = random();
      if (tintRoll > 0.94) temp.copy(warm);
      else if (tintRoll > 0.7) temp.copy(blue);
      else temp.copy(cool);
      temp.lerp(cool, 0.35);
      tints[i * 3] = temp.r;
      tints[i * 3 + 1] = temp.g;
      tints[i * 3 + 2] = temp.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), layer.outerRadius * 1.2);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uTwinkle: { value: layer.twinkle },
        uPixelRatio: { value: pixelRatio },
        uSoftness: { value: layer.softness },
        uOpacity: { value: 1 },
      },
    });

    return { geometry: geo, material: mat, count: total };
  }, [layer, density, pixelRatio]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    material.uniforms.uPixelRatio.value = pixelRatio;
  }, [material, pixelRatio]);

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const t = runtime.elapsed;
    material.uniforms.uTime.value = runtime.reducedMotion ? 0 : t;

    const pointer = runtime.reducedMotion ? 0 : runtime.pointerResponse;
    const scrollAmount = runtime.reducedMotion ? 0 : runtime.scrollResponse;

    node.position.x = -runtime.pointerX * MOTION.starPointerShift * layer.pointerFactor * pointer;
    node.position.y =
      runtime.pointerY * MOTION.starPointerShift * 0.6 * layer.pointerFactor * pointer +
      runtime.scroll * MOTION.starScrollShift * layer.scrollFactor * scrollAmount;
    node.rotation.y = runtime.reducedMotion ? 0 : t * layer.drift;

    // Layers fade slightly as the hero leaves, so the section hands off cleanly.
    material.uniforms.uOpacity.value = 1 - runtime.scroll * 0.55 * scrollAmount;
  });

  return (
    <group ref={group} visible={visible} name={`star-layer-${layer.id}`}>
      <points ref={points} geometry={geometry} material={material} frustumCulled={false} userData={{ count }} />
    </group>
  );
}
