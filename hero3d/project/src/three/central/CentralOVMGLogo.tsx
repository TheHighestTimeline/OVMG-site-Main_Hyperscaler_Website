/**
 * CentralOVMGLogo.tsx — the dominant central object.
 *
 * Geometry comes from createCentralO (a lathed stone annulus with a recessed,
 * displacement-carved band). Motion is deliberately almost nothing: a bounded
 * rotation of about three degrees, a fraction-of-a-unit breathing float and a
 * whisper of tilt. The O anchors the composition; the logos move around it.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CENTRAL_O } from '../../hero/heroConfig';
import { useHeroRuntime } from '../../hero/heroRuntime';
import { createCentralO } from './createCentralO';
import { createStoneMaterials } from '../materials/proceduralStone';

export interface CentralOVMGLogoProps {
  envMap: THREE.Texture | null;
  visible?: boolean;
}

export function CentralOVMGLogo({ envMap, visible = true }: CentralOVMGLogoProps) {
  const group = useRef<THREE.Group>(null);
  const runtime = useHeroRuntime();
  const invalidate = useThree((state) => state.invalidate);

  const geometry = useMemo(
    () =>
      createCentralO({
        bodySegments: runtime.quality.bodySegments,
        faceThetaSegments: runtime.quality.faceThetaSegments,
        faceRadialSegments: runtime.quality.faceRadialSegments,
      }),
    [runtime.quality],
  );

  const materials = useMemo(
    () =>
      createStoneMaterials({
        anisotropy: runtime.quality.anisotropy,
        // The low tier drops geometric carving and relies on the normal map.
        reliefScale: runtime.quality.tier === 'low' ? 0 : 1,
      }),
    [runtime.quality],
  );

  useEffect(() => {
    if (!envMap) return;
    materials.body.envMap = envMap;
    materials.face.envMap = envMap;
    materials.body.needsUpdate = true;
    materials.face.needsUpdate = true;
    invalidate();
  }, [envMap, materials, invalidate]);

  useEffect(() => () => {
    geometry.dispose();
    materials.dispose();
  }, [geometry, materials]);

  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const t = runtime.elapsed;
    const intensity = runtime.reducedMotion ? 0 : runtime.motionIntensity;

    // Bounded oscillation, never a continuous spin.
    node.rotation.z = Math.sin(t * 0.055) * CENTRAL_O.spinAmplitude * intensity;
    node.rotation.x = Math.sin(t * 0.041 + 1.1) * CENTRAL_O.tiltAmplitude * intensity;
    node.rotation.y = Math.sin(t * 0.033 + 0.4) * CENTRAL_O.tiltAmplitude * 0.7 * intensity;
    node.position.y = Math.sin(t * CENTRAL_O.floatSpeed) * CENTRAL_O.floatAmplitude * intensity;
  });

  return (
    <group ref={group} visible={visible} name="central-o">
      <mesh geometry={geometry.body} material={materials.body} castShadow receiveShadow name="central-o-body" />
      <mesh
        geometry={geometry.face}
        material={materials.face}
        position={[0, 0, geometry.faceZ]}
        receiveShadow
        name="central-o-face"
      />
      <mesh
        geometry={geometry.innerRim}
        material={materials.innerGlow}
        position={[0, 0, CENTRAL_O.depth * 0.35]}
        name="central-o-inner-rim"
      />
    </group>
  );
}
