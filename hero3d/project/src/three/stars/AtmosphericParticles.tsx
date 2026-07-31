/**
 * AtmosphericParticles.tsx — the near depth layer.
 *
 * Two things live here:
 *   - a sparse field of soft near-camera motes that drift and carry the
 *     strongest parallax, which is what sells foreground depth;
 *   - a single graded backdrop that lifts the void behind the O off pure
 *     black so the silhouette has something to sit against.
 *
 * Both are deliberately faint. Nothing here should read as a particle effect.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MOTION, PALETTE, STAR_LAYERS } from '../../hero/heroConfig';
import { useHeroRuntime } from '../../hero/heroRuntime';
import { StarLayer } from './Starfield';

const BACKDROP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKDROP_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform float uOpacity;
  uniform float uDrift;
  varying vec2 vUv;

  // Interleaved gradient noise. A wide, low-contrast gradient across an 8-bit
  // buffer posterises into visible concentric arcs; a sub-LSB dither breaks
  // those bands up without adding perceptible grain.
  float dither(vec2 fragCoord) {
    return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec2 p = vUv - 0.5;
    p.x *= 1.35;
    p.y += uDrift;
    float d = length(p);
    // Two overlapping falloffs: a tight core behind the mark, a wide bloom.
    float core = 1.0 - smoothstep(0.02, 0.26, d);
    float wide = 1.0 - smoothstep(0.08, 0.44, d);
    vec3 color = mix(uEdge, uCore, core);
    float alpha = (core * 0.62 + wide * 0.38) * uOpacity;
    float n = (dither(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(color + n, max(alpha + n, 0.0));
  }
`;

export interface AtmosphericParticlesProps {
  density: number;
  pixelRatio: number;
  showDust?: boolean;
  showBackdrop?: boolean;
}

export function AtmosphericParticles({
  density,
  pixelRatio,
  showDust = true,
  showBackdrop = true,
}: AtmosphericParticlesProps) {
  const runtime = useHeroRuntime();
  const backdrop = useRef<THREE.Mesh>(null);

  const nearLayer = useMemo(() => STAR_LAYERS.find((layer) => layer.id === 'near') ?? STAR_LAYERS[0], []);

  const backdropMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BACKDROP_VERTEX,
        fragmentShader: BACKDROP_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uCore: { value: new THREE.Color(PALETTE.nebulaBlue).multiplyScalar(1.5) },
          uEdge: { value: new THREE.Color('#0a1428').multiplyScalar(0.6) },
          uOpacity: { value: 0.9 },
          uDrift: { value: 0 },
        },
      }),
    [],
  );

  const backdropGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  useEffect(
    () => () => {
      backdropMaterial.dispose();
      backdropGeometry.dispose();
    },
    [backdropMaterial, backdropGeometry],
  );

  useFrame(() => {
    const node = backdrop.current;
    if (!node) return;
    const scrollAmount = runtime.reducedMotion ? 0 : runtime.scrollResponse;
    backdropMaterial.uniforms.uOpacity.value = 0.9 * (1 - runtime.scroll * 0.6 * scrollAmount);
    backdropMaterial.uniforms.uDrift.value = runtime.reducedMotion
      ? 0
      : Math.sin(runtime.elapsed * 0.08) * 0.012 - runtime.pointerY * 0.01 * runtime.pointerResponse;
    node.position.x = -runtime.pointerX * 0.35 * runtime.pointerResponse;
  });

  return (
    <group name="atmosphere">
      {showBackdrop ? (
        <mesh
          ref={backdrop}
          geometry={backdropGeometry}
          material={backdropMaterial}
          position={[0, 0, -14]}
          scale={[46, 34, 1]}
          renderOrder={-10}
          frustumCulled={false}
          name="atmosphere-backdrop"
        />
      ) : null}
      {showDust ? <StarLayer layer={nearLayer} density={density} pixelRatio={pixelRatio} /> : null}
    </group>
  );
}

export { MOTION };
