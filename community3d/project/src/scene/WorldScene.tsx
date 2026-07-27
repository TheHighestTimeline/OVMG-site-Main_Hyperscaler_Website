/**
 * WorldScene — R3F canvas hosting the assembled block. Orthographic camera
 * uses the exact CAMERA config + fit-math from coreScene.frameCamera
 * (viewHeight, needW = PLOT.width * 1.14, <700px mobile breakpoint).
 * frameloop="demand": frames render only when the scroll driver (or resize)
 * calls invalidate.
 */
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { PLOT, CAMERA, QUALITY } from './sceneLayout';
import { SceneLighting } from '../three/lighting/SceneLighting';
import { AssembledCityBlock } from './AssembledCityBlock';
import { useSceneLayout } from './useSceneLayout';

/** Same frustum fit as coreScene.frameCamera (non-isolate path). */
function CameraRig({ isMobile }: { isMobile: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const conf = isMobile ? CAMERA.mobile : CAMERA.desktop;
    const aspect = size.width / Math.max(size.height, 1);
    const viewH = conf.viewHeight;
    const viewW = viewH * aspect;
    const needW = PLOT.width * 1.14; // guarantee full plot width fits with padding
    const scale = viewW < needW ? needW / viewW : 1;
    camera.left = (-viewW / 2) * scale;
    camera.right = (viewW / 2) * scale;
    camera.top = (viewH / 2) * scale;
    camera.bottom = (-viewH / 2) * scale;
    camera.near = 0.1;
    camera.far = 100;
    camera.position.set(conf.position.x, conf.position.y, conf.position.z);
    camera.lookAt(conf.target.x, conf.target.y, conf.target.z);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, isMobile, invalidate]);

  return null;
}

export function WorldScene() {
  const { isMobile } = useSceneLayout();
  const dpr = Math.min(
    typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    isMobile ? QUALITY.mobileMaxPixelRatio : QUALITY.maxPixelRatio,
  );

  return (
    <Canvas
      className="city3d-canvas"
      orthographic
      frameloop="demand"
      dpr={dpr}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      <CameraRig isMobile={isMobile} />
      <SceneLighting />
      <AssembledCityBlock />
    </Canvas>
  );
}
