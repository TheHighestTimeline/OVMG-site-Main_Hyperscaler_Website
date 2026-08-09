/**
 * PartnerOrbitScene.tsx — everything that lives inside the Canvas.
 *
 * Composition order matters here: the runtime driver runs at priority -1 so
 * every other useFrame in the tree reads a clock and a damped pointer that
 * were already advanced this frame.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';
import * as THREE from 'three';
import { MOTION, RINGS, STAR_LAYERS } from './heroConfig';
import { REDUCED_MOTION_POSE_SECONDS, useHeroRuntime } from './heroRuntime';
import type { ResolvedPartner } from './partnerManifest';
import { publishTelemetry, type PartnerTelemetry } from './heroTelemetry';
import { CentralOVMGLogo } from '../three/central/CentralOVMGLogo';
import { HeroLighting } from '../three/lighting/HeroLighting';
import { OrbitalSystem } from '../three/orbits/OrbitalSystem';
import { AtmosphericParticles } from '../three/stars/AtmosphericParticles';
import { StarLayer } from '../three/stars/Starfield';
import { createHeroEnvironment } from '../three/materials/heroEnvironment';
import { damp } from '../three/orbits/orbitalMath';
import { computeSystemExtents, fitCameraDistance, type MedallionExtent } from '../three/orbits/framing';
import { plaqueHalfExtents, plaqueSpecForAspect } from '../three/orbits/medallion';
import { getAssetIssues } from '../three/utils/assetLoader';
import { CENTRAL_O } from './heroConfig';

export interface SceneVisibility {
  central: boolean;
  rings: boolean;
  partners: boolean;
  stars: boolean;
  atmosphere: boolean;
}

export const FULL_SCENE: SceneVisibility = {
  central: true,
  rings: true,
  partners: true,
  stars: true,
  atmosphere: true,
};

export interface PartnerOrbitSceneProps {
  partners: ResolvedPartner[];
  visibility?: SceneVisibility;
  /** Debug helpers; never rendered in production builds. */
  showHelpers?: boolean;
}

/* ------------------------------------------------------------------ */
/* Runtime driver                                                      */
/* ------------------------------------------------------------------ */

function RuntimeDriver() {
  const runtime = useHeroRuntime();
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    // With postprocessing the composer issues several render passes per frame
    // and three resets its counters at the start of every one, so the numbers
    // left behind describe the final fullscreen pass rather than the frame.
    // Taking manual control and snapshotting at the top of the next frame
    // gives the real per-frame totals.
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);

  useFrame((_, delta) => {
    // These counters cover everything drawn since the previous snapshot, i.e.
    // one complete frame including every postprocessing pass.
    runtime.drawCalls = gl.info.render.calls;
    runtime.triangles = gl.info.render.triangles;
    gl.info.reset();

    const dt = Math.min(delta, 0.05); // a stalled tab must not jump the system
    runtime.wallClock += dt;
    runtime.frameCount += 1;
    runtime.frameMs = runtime.frameMs * 0.9 + dt * 1000 * 0.1;

    if (runtime.reducedMotion) {
      runtime.elapsed = REDUCED_MOTION_POSE_SECONDS;
      runtime.pointerX = 0;
      runtime.pointerY = 0;
      runtime.scroll = 0;
      return;
    }

    if (!runtime.paused) runtime.elapsed += dt;

    runtime.pointerX = damp(runtime.pointerX, runtime.pointerTargetX, MOTION.pointerDamping, dt);
    runtime.pointerY = damp(runtime.pointerY, runtime.pointerTargetY, MOTION.pointerDamping, dt);
    runtime.scroll = damp(runtime.scroll, runtime.scrollTarget, 0.18, dt);
  }, -1);

  return null;
}

/* ------------------------------------------------------------------ */
/* Camera rig                                                          */
/* ------------------------------------------------------------------ */

const targetVector = new THREE.Vector3();

/**
 * The camera distance is solved, not hard-coded: the rig measures how far the
 * outermost medallion actually reaches and backs off until that fits the
 * current aspect ratio. A 390-wide portrait phone and a 1920 desktop therefore
 * both frame the whole system with nothing cropped.
 */
function CameraRig({ partners, visibility }: { partners: ResolvedPartner[]; visibility: SceneVisibility }) {
  const runtime = useHeroRuntime();
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);

  const extents = useMemo(() => {
    const profile = runtime.responsive;
    const view = {
      elevation: profile.cameraElevation,
      yaw: profile.cameraYaw,
      roll: profile.systemRoll,
      systemScale: profile.systemScale,
    };

    // With the orbital system hidden — the debug/inspection views — frame the
    // central mark itself instead of an empty region the size of the orbits.
    if (!visibility.rings && !visibility.partners) {
      const reach = CENTRAL_O.outerRadius * profile.systemScale * 1.08;
      const depth = CENTRAL_O.depth * profile.systemScale;
      return {
        halfWidth: reach,
        halfHeight: reach,
        maxTowardCamera: depth,
        samples: new Float32Array([reach, reach, depth]),
      };
    }

    const medallions: MedallionExtent[] = visibility.partners
      ? partners.map((partner) => {
          const spec = plaqueSpecForAspect(partner.aspectHint, partner.padding);
          const { halfWidth, halfHeight } = plaqueHalfExtents(spec, partner.scale * profile.medallionScale);
          return { ring: partner.ring, halfWidth, halfHeight };
        })
      : [];

    return computeSystemExtents(RINGS, profile.orbitSpreadX, profile.orbitSpreadZ, medallions, view);
  }, [partners, runtime.responsive, visibility.rings, visibility.partners]);

  const baseDistance = useMemo(() => {
    const profile = runtime.responsive;
    return fitCameraDistance(extents, {
      fovDegrees: profile.fov,
      aspect: size.width / Math.max(size.height, 1),
      padding: profile.framePadding,
      minDistance: visibility.rings || visibility.partners ? profile.minCameraDistance : 2.4,
      maxDistance: profile.maxCameraDistance,
      nearClearance: 3.4,
    });
  }, [extents, runtime.responsive, size.width, size.height, visibility.rings, visibility.partners]);

  useEffect(() => {
    camera.fov = runtime.responsive.fov;
    camera.near = 0.1;
    camera.far = 190;
    camera.updateProjectionMatrix();
  }, [camera, runtime.responsive]);

  useFrame(() => {
    const profile = runtime.responsive;
    const pointer = runtime.reducedMotion ? 0 : runtime.pointerResponse;
    const scrollAmount = runtime.reducedMotion ? 0 : runtime.scrollResponse;

    // An off-axis three-quarter view: never dead-on flat, never wide-angle.
    // The camera rides a sphere around the target, so elevation is an angle
    // rather than a height — that is what keeps the orbit ellipses open
    // instead of collapsing them into flat lines.
    const yaw = profile.cameraYaw - runtime.pointerX * MOTION.pointerYaw * pointer;
    const elevation = profile.cameraElevation - runtime.pointerY * MOTION.pointerPitch * pointer;
    const distance = baseDistance + runtime.scroll * MOTION.scrollDolly * scrollAmount;
    const ce = Math.cos(elevation);

    camera.position.set(
      Math.sin(yaw) * ce * distance,
      Math.sin(elevation) * distance + runtime.scroll * MOTION.scrollLift * 0.7 * scrollAmount,
      Math.cos(yaw) * ce * distance,
    );

    targetVector.set(profile.offsetX, profile.targetY + profile.offsetY, 0);
    camera.lookAt(targetVector);
    // A couple of degrees of roll as the hero leaves; nothing more.
    camera.rotation.z += runtime.scroll * MOTION.scrollTilt * scrollAmount;
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

/**
 * Builds the environment map once per renderer.
 *
 * It is created during render rather than in an effect so the very first
 * drawn frame already has reflections — creating it in an effect meant one
 * frame of flat, unlit stone followed by a re-render.
 */
function useHeroEnvironment(): THREE.Texture | null {
  const gl = useThree((state) => state.gl);
  const environment = useMemo(() => createHeroEnvironment(gl), [gl]);
  useEffect(() => () => environment.dispose(), [environment]);
  return environment.texture;
}

/* ------------------------------------------------------------------ */
/* Telemetry reporter                                                  */
/* ------------------------------------------------------------------ */

const ndc = new THREE.Vector3();
const centralSphere = new THREE.Sphere(new THREE.Vector3(), CENTRAL_O.outerRadius);
const ray = new THREE.Ray();

function TelemetryReporter({ partners }: { partners: ResolvedPartner[] }) {
  const runtime = useHeroRuntime();
  const { gl, camera, scene } = useThree();
  const positions = useRef(new Map<string, THREE.Vector3>());
  const frames = useRef(0);

  const record = useMemo(
    () => (id: string, position: THREE.Vector3) => {
      const existing = positions.current.get(id);
      if (existing) existing.copy(position);
      else positions.current.set(id, position.clone());
    },
    [],
  );

  useEffect(() => {
    // Expose the recorder so OrbitalSystem can feed it.
    (scene.userData as { recordPartner?: typeof record }).recordPartner = record;
  }, [scene, record]);

  useFrame(() => {
    frames.current += 1;
    // Telemetry at ~6Hz; it exists for tests, not for the render loop.
    if (frames.current % 10 !== 0) return;

    const info = gl.info;
    const partnerState: PartnerTelemetry[] = [];
    const central = scene.getObjectByName('central-o');

    for (const partner of partners) {
      const world = positions.current.get(partner.id);
      const object = scene.getObjectByName(`partner-${partner.id}`);
      if (!world) continue;
      ndc.copy(world).project(camera);
      const distance = camera.position.distanceTo(world);

      // Occlusion: does the segment camera->medallion pass through the O?
      ray.origin.copy(camera.position);
      ray.direction.copy(world).sub(camera.position).normalize();
      const hit = ray.intersectsSphere(centralSphere);
      const centralDistance = camera.position.length();
      const occluded = hit && distance > centralDistance;

      const logoMesh = object?.getObjectByProperty('type', 'Mesh');
      void logoMesh;

      partnerState.push({
        id: partner.id,
        name: partner.name,
        ring: partner.ring,
        x: world.x,
        y: world.y,
        z: world.z,
        ndcX: ndc.x,
        ndcY: ndc.y,
        onScreen: Math.abs(ndc.x) <= 1.05 && Math.abs(ndc.y) <= 1.05 && ndc.z < 1,
        occludedByCentral: occluded,
        distance,
        hasLogoTexture: hasLogoTexture(object),
        drawnInFront: isDrawnInFront(object),
      });
    }

    publishTelemetry({
      ready: runtime.ready,
      reducedMotion: runtime.reducedMotion,
      quality: runtime.quality.tier,
      responsive: runtime.responsive.label,
      elapsed: runtime.elapsed,
      scroll: runtime.scroll,
      pointerX: runtime.pointerX,
      pointerY: runtime.pointerY,
      fps: runtime.frameMs > 0 ? 1000 / runtime.frameMs : 0,
      frameMs: runtime.frameMs,
      drawCalls: runtime.drawCalls,
      triangles: runtime.triangles,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      starCount: countStars(scene),
      ringCount: RINGS.length,
      partners: partnerState,
      assetIssues: getAssetIssues(),
      centralPresent: Boolean(central),
      logoLayer: runtime.logoLayer,
    });
  });

  return null;
}

function hasLogoTexture(object: THREE.Object3D | undefined): boolean {
  if (!object) return false;
  let found = false;
  object.traverse((child) => {
    if (found) return;
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (material && 'map' in material && material.map && material.opacity > 0) found = true;
  });
  return found;
}

/**
 * A mark is drawn in front when its materials have depth testing disabled, so
 * nothing in the scene — including the central object — can hide it.
 */
function isDrawnInFront(object: THREE.Object3D | undefined): boolean {
  if (!object) return false;
  let found = false;
  let allFront = true;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      found = true;
      if (material.depthTest) allFront = false;
    }
  });
  return found && allFront;
}

function countStars(scene: THREE.Scene): number {
  let total = 0;
  scene.traverse((child) => {
    if ((child as THREE.Points).isPoints) {
      const points = child as THREE.Points;
      total += points.geometry.getAttribute('position')?.count ?? 0;
    }
  });
  return total;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export function PartnerOrbitScene({ partners, visibility = FULL_SCENE, showHelpers = false }: PartnerOrbitSceneProps) {
  const runtime = useHeroRuntime();
  const envMap = useHeroEnvironment();
  const { scene, gl } = useThree();
  const system = useRef<THREE.Group>(null);

  const pixelRatio = Math.min(runtime.quality.maxDpr, gl.getPixelRatio());
  const starDensity = runtime.quality.starDensity * runtime.responsive.starDensity;

  useEffect(() => {
    if (envMap) runtime.ready = true;
  }, [envMap, runtime]);

  const recordPartner = useMemo(
    () => (id: string, position: THREE.Vector3) => {
      const recorder = (scene.userData as { recordPartner?: (id: string, p: THREE.Vector3) => void }).recordPartner;
      recorder?.(id, position);
    },
    [scene],
  );

  // Scroll drives a small tilt and lift of the whole system. Orbits themselves
  // are untouched by scroll: they run on their own clock.
  useFrame(() => {
    const node = system.current;
    if (!node) return;
    const scrollAmount = runtime.reducedMotion ? 0 : runtime.scrollResponse;
    node.rotation.x = runtime.scroll * MOTION.scrollTilt * scrollAmount;
    node.rotation.z = runtime.responsive.systemRoll;
    node.position.y = -runtime.scroll * MOTION.scrollLift * scrollAmount;
  });

  const backgroundLayers = useMemo(() => STAR_LAYERS.filter((layer) => layer.id !== 'near'), []);

  return (
    <>
      <RuntimeDriver />
      <CameraRig partners={partners} visibility={visibility} />
      <HeroLighting shadows={runtime.quality.shadows} shadowMapSize={runtime.quality.shadowMapSize} />

      {visibility.atmosphere ? (
        <AtmosphericParticles
          density={starDensity}
          pixelRatio={pixelRatio}
          showBackdrop={!runtime.transparentBackground}
          showDust={visibility.stars}
        />
      ) : null}

      {visibility.stars
        ? backgroundLayers.map((layer) => (
            <StarLayer key={layer.id} layer={layer} density={starDensity} pixelRatio={pixelRatio} />
          ))
        : null}

      <group
        ref={system}
        scale={runtime.responsive.systemScale}
        rotation={[0, 0, runtime.responsive.systemRoll]}
        name="hero-system"
      >
        <CentralOVMGLogo envMap={envMap} visible={visibility.central} />
        <OrbitalSystem
          partners={partners}
          envMap={envMap}
          showRings={visibility.rings}
          showPartners={visibility.partners}
          onPosition={recordPartner}
        />
        {showHelpers ? <axesHelper args={[3]} /> : null}
      </group>

      <TelemetryReporter partners={partners} />

      {runtime.quality.postprocessing ? (
        <EffectComposer enableNormalPass={false} multisampling={runtime.quality.tier === 'low' ? 0 : 4}>
          {/* Tight and high-threshold on purpose: a loose bloom turns a near
              dust mote into a lens blob, which is the single fastest way to
              make a scene look like a stock particle template. */}
          <Bloom
            intensity={0.26}
            luminanceThreshold={0.86}
            luminanceSmoothing={0.16}
            kernelSize={KernelSize.MEDIUM}
            mipmapBlur
          />
          <Vignette offset={0.26} darkness={0.66} blendFunction={BlendFunction.NORMAL} />
        </EffectComposer>
      ) : null}
    </>
  );
}
