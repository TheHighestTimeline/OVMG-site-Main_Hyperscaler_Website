/**
 * OrbitalRing.tsx — one true 3D elliptical orbit path.
 *
 * The path is a TubeGeometry swept along a parametric ellipse in the ring's
 * own inclined plane. It is real geometry in the depth buffer, so the central
 * O occludes the far half of every ring exactly as it occludes the medallions.
 */

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RingConfig } from '../../hero/heroConfig';
import { createRingMaterial } from '../materials/heroMaterials';

/** Parametric ellipse in the XZ plane at a fixed height. */
class EllipseCurve3 extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radiusX: number,
    private readonly radiusZ: number,
    private readonly height: number,
  ) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2;
    return target.set(Math.cos(angle) * this.radiusX, this.height, Math.sin(angle) * this.radiusZ);
  }
}

export interface OrbitalRingProps {
  ring: RingConfig;
  spreadX: number;
  spreadZ: number;
  tubularSegments: number;
  radialSegments: number;
  envMap: THREE.Texture | null;
  visible?: boolean;
}

export function OrbitalRing({
  ring,
  spreadX,
  spreadZ,
  tubularSegments,
  radialSegments,
  envMap,
  visible = true,
}: OrbitalRingProps) {
  const geometry = useMemo(() => {
    const curve = new EllipseCurve3(ring.radiusX * spreadX, ring.radiusZ * spreadZ, ring.y);
    return new THREE.TubeGeometry(curve, tubularSegments, ring.tubeRadius, radialSegments, true);
  }, [ring, spreadX, spreadZ, tubularSegments, radialSegments]);

  const material = useMemo(() => createRingMaterial(ring), [ring]);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (!envMap) return;
    material.envMap = envMap;
    material.needsUpdate = true;
  }, [envMap, material]);

  useFrame(() => {
    // Keep the near/far band tied to the actual camera distance so the
    // front-to-back falloff holds at every breakpoint and scroll position.
    const distance = camera.position.length();
    const reach = Math.max(ring.radiusX * spreadX, ring.radiusZ * spreadZ);
    material.depthUniforms.uNear.value = distance - reach;
    material.depthUniforms.uFar.value = distance + reach;
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <group rotation={[ring.inclinationX, 0, ring.inclinationZ]} visible={visible} name={`orbit-ring-${ring.id}`}>
      <mesh geometry={geometry} material={material} renderOrder={2} />
    </group>
  );
}
