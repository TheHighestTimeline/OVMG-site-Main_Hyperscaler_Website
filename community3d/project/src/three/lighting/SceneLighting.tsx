/**
 * SceneLighting — declarative twin of coreScene's light rig.
 * Values come straight from LIGHTING in sceneLayout; hemi + key refs are
 * registered so useScrollSequence can dim them during lifts (like setDim).
 */
import { useLayoutEffect, useRef } from 'react';
import type * as THREE from 'three';
import { LIGHTING } from '../../scene/sceneLayout';
import { setRefs } from '../../scene/SceneObjects';

export function SceneLighting() {
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    setRefs({ hemi: hemiRef.current, key: keyRef.current });
    return () => setRefs({ hemi: null, key: null });
  }, []);

  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        args={[LIGHTING.hemisphere.sky, LIGHTING.hemisphere.ground, LIGHTING.hemisphere.intensity]}
      />
      <directionalLight
        ref={keyRef}
        color={LIGHTING.key.color}
        intensity={LIGHTING.key.intensity}
        position={[LIGHTING.key.position.x, LIGHTING.key.position.y, LIGHTING.key.position.z]}
      />
      <directionalLight
        color={LIGHTING.rim.color}
        intensity={LIGHTING.rim.intensity}
        position={[LIGHTING.rim.position.x, LIGHTING.rim.position.y, LIGHTING.rim.position.z]}
      />
    </>
  );
}
