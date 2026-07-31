/**
 * HeroLighting.tsx — a cinematic three-quarter setup.
 *
 *   key     cool white, upper front-left, the only shadow caster
 *   rim     cool blue from behind-left, separates the O from the void
 *   fill    broad low-intensity front-right, stops the face going muddy
 *   bounce  deep blue from below, reads as light off the orbital plane
 *   kicker  restrained warm point, keeps the stone from reading sterile
 *
 * One shadow-casting light total. Nothing per-partner.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../../hero/heroConfig';
import { useHeroRuntime } from '../../hero/heroRuntime';

export interface HeroLightingProps {
  shadows: boolean;
  shadowMapSize: number;
}

export function HeroLighting({ shadows, shadowMapSize }: HeroLightingProps) {
  const key = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const runtime = useHeroRuntime();

  useEffect(() => {
    const light = key.current;
    if (!light) return;
    light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const camera = light.shadow.camera;
    camera.left = -7;
    camera.right = 7;
    camera.top = 7;
    camera.bottom = -7;
    camera.near = 1;
    camera.far = 26;
    camera.updateProjectionMatrix();
    light.shadow.bias = -0.0012;
    light.shadow.normalBias = 0.022;
    light.shadow.radius = 2.5;
  }, [shadowMapSize]);

  useFrame(() => {
    // The lighting drifts by a hair so highlights on the stone are never static.
    const t = runtime.reducedMotion ? 0 : runtime.elapsed;
    const keyLight = key.current;
    const rimLight = rim.current;
    if (keyLight) {
      keyLight.position.set(
        -4.6 + Math.sin(t * 0.045) * 0.5 + runtime.pointerX * 0.6 * runtime.pointerResponse,
        5.4 + Math.sin(t * 0.037 + 2.0) * 0.32,
        6.4,
      );
    }
    if (rimLight) {
      rimLight.position.set(-4.4 + Math.sin(t * 0.031 + 1.4) * 0.6, 1.9, -6.2);
    }
  });

  return (
    <group name="hero-lighting">
      <hemisphereLight args={['#6f8dc4', '#070b14', 0.26]} />
      <ambientLight color="#1b2740" intensity={0.18} />

      <directionalLight
        ref={key}
        color="#eaf2ff"
        intensity={4.1}
        position={[-4.6, 5.4, 6.4]}
        castShadow={shadows}
      />

      <directionalLight ref={rim} color="#9fc8f0" intensity={1.45} position={[-4.4, 1.9, -6.2]} />

      <directionalLight color="#9fbde4" intensity={0.62} position={[6.4, 1.1, 4.8]} />

      <pointLight color={PALETTE.electric} intensity={5.2} distance={12} decay={2} position={[-1.9, -2.6, 1.4]} />

      <pointLight color={PALETTE.warm} intensity={6.4} distance={10.5} decay={2} position={[3.1, -1.4, 2.6]} />

      {/* Low back-rim: without it the mark's lower silhouette dissolves
          into the background and the object loses its footing. */}
      <directionalLight color="#7fa8d8" intensity={1.15} position={[1.6, -4.2, -3.4]} />

      {/* Sits inside the opening; grazes the inner chamfer only. */}
      <pointLight color="#8fd0ff" intensity={1.5} distance={3.0} decay={2} position={[0, 0, -0.35]} />
    </group>
  );
}
