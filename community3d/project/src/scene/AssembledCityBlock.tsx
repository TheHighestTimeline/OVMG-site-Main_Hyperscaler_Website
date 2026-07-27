/**
 * AssembledCityBlock — R3F assembly of the four procedural assets, mirroring
 * coreScene's world graph exactly (same placements, AO pads, lamp pools, and
 * real-point-light budget). Assets are built ONCE via useMemo; the lift groups
 * are plain <group>s whose position.y is driven imperatively by
 * useScrollSequence through the SceneObjects registry — zero React re-renders
 * during scroll.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  MARKET, COMMUNITY_CENTER, LAMPS, FOOTPRINTS, LIGHTING, QUALITY,
} from './sceneLayout';
import { createBaseWorld } from '../three/assets/createBaseWorld';
import { createMarket } from '../three/assets/createMarket';
import { createCommunityCenter } from '../three/assets/createCommunityCenter';
import { createStreetLamp } from '../three/assets/createStreetLamp';
import { materials } from '../three/materials/materialLibrary';
import { setRefs } from './SceneObjects';
import { useSceneLayout } from './useSceneLayout';

interface BuiltWorld {
  baseWorld: THREE.Group;
  market: THREE.Group;
  communityCenter: THREE.Group;
  lamps: THREE.Group[];
  lampPointLights: THREE.PointLight[];
  aoMarket: THREE.Mesh;
  aoCommunityCenter: THREE.Mesh;
  lampPoolMat: THREE.MeshBasicMaterial;
}

function buildWorld(): BuiltWorld {
  const M = materials();
  const baseWorld = createBaseWorld();
  const market = createMarket();
  const communityCenter = createCommunityCenter();

  const lamps: THREE.Group[] = [];
  const lampPointLights: THREE.PointLight[] = [];
  LAMPS.forEach(() => {
    const lamp = createStreetLamp();
    // Real light on every lamp; budget is applied via `visible` (see effect
    // below) so crossing the mobile breakpoint never rebuilds geometry.
    const anchor = lamp.getObjectByName('LampLightAnchor');
    const pt = new THREE.PointLight(LIGHTING.lampColor, 5.5, 4.2, 1.8);
    (anchor ?? lamp).add(pt);
    lamps.push(lamp);
    lampPointLights.push(pt);
  });

  // AO contact pads under buildings (same sizes/positions as coreScene).
  // Cloned per-pad materials so opacity can fade independently during lifts.
  const aoMat = () =>
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
  const aoPad = (w: number, d: number, x: number, z: number, name: string) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat());
    m.name = name;
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    return m;
  };
  const aoMarket = aoPad(
    FOOTPRINTS.market.w + 0.5, FOOTPRINTS.market.d + 0.5,
    MARKET.position.x, MARKET.position.z, 'AOMarket',
  );
  const aoCommunityCenter = aoPad(
    FOOTPRINTS.communityCenter.w + 0.6, FOOTPRINTS.communityCenter.d + 0.6,
    COMMUNITY_CENTER.position.x, COMMUNITY_CENTER.position.z, 'AOCommunityCenter',
  );
  baseWorld.add(aoMarket, aoCommunityCenter);

  // Static warm pools under each lamp head (never lift with the lamp; fade as lamps rise).
  const lampPoolMat = M.lightPool.clone();
  LAMPS.forEach((lp, i) => {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), lampPoolMat);
    pool.name = `LampPool${i}`;
    pool.rotation.x = -Math.PI / 2;
    const headOffset = 0.38 * (lp.rotationY === 0 ? -1 : 1);
    pool.position.set(lp.position.x, 0.075, lp.position.z + headOffset);
    baseWorld.add(pool);
  });

  return { baseWorld, market, communityCenter, lamps, lampPointLights, aoMarket, aoCommunityCenter, lampPoolMat };
}

export function AssembledCityBlock() {
  const { isMobile } = useSceneLayout();
  const invalidate = useThree((s) => s.invalidate);
  const world = useMemo(buildWorld, []);

  const baseWorldRef = useRef<THREE.Group>(null);
  const marketRef = useRef<THREE.Group>(null);
  const communityCenterRef = useRef<THREE.Group>(null);
  const streetLightsRef = useRef<THREE.Group>(null);
  const lampGroupRefs = useRef<(THREE.Group | null)[]>([]);

  // Register animation targets with the scroll driver.
  useLayoutEffect(() => {
    setRefs({
      baseWorld: baseWorldRef.current,
      market: marketRef.current,
      communityCenter: communityCenterRef.current,
      streetLights: streetLightsRef.current,
      lampGroups: lampGroupRefs.current.filter((g): g is THREE.Group => g !== null),
      aoMarket: world.aoMarket,
      aoCommunityCenter: world.aoCommunityCenter,
      lampPoolMat: world.lampPoolMat,
      lampPointLights: world.lampPointLights,
    });
    return () => {
      setRefs({
        baseWorld: null, market: null, communityCenter: null, streetLights: null,
        lampGroups: [], aoMarket: null, aoCommunityCenter: null,
      });
    };
  }, [world]);

  // Real-lamp-light budget (coreScene: first N lamps only get a PointLight).
  useEffect(() => {
    const budget = isMobile ? QUALITY.mobileRealLampLights : QUALITY.desktopRealLampLights;
    world.lampPointLights.forEach((pt, i) => { pt.visible = i < budget; });
    invalidate();
  }, [isMobile, world, invalidate]);

  // Dispose geometries created by this assembly on unmount (materials are the
  // shared library singletons except the cloned AO mats).
  useEffect(() => {
    return () => {
      [world.baseWorld, world.market, world.communityCenter, ...world.lamps].forEach((root) => {
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
      });
      (world.aoMarket.material as THREE.Material).dispose();
      (world.aoCommunityCenter.material as THREE.Material).dispose();
    };
  }, [world]);

  return (
    <group name="World">
      <group ref={baseWorldRef} name="BaseWorldRoot">
        <primitive object={world.baseWorld} />
      </group>

      <group
        ref={marketRef}
        name="MarketLift"
        position={[MARKET.position.x, MARKET.position.y, MARKET.position.z]}
        rotation={[0, MARKET.rotationY, 0]}
      >
        <primitive object={world.market} />
      </group>

      <group
        ref={communityCenterRef}
        name="CommunityCenterLift"
        position={[COMMUNITY_CENTER.position.x, COMMUNITY_CENTER.position.y, COMMUNITY_CENTER.position.z]}
        rotation={[0, COMMUNITY_CENTER.rotationY, 0]}
      >
        <primitive object={world.communityCenter} />
      </group>

      <group ref={streetLightsRef} name="StreetLights">
        {world.lamps.map((lamp, i) => (
          <group
            key={i}
            ref={(g) => { lampGroupRefs.current[i] = g; }}
            name={`StreetLampLift${i}`}
            position={[LAMPS[i].position.x, LAMPS[i].position.y, LAMPS[i].position.z]}
            rotation={[0, LAMPS[i].rotationY, 0]}
          >
            <primitive object={lamp} />
          </group>
        ))}
      </group>
    </group>
  );
}
