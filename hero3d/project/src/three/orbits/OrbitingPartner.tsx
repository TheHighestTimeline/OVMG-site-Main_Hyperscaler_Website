/**
 * OrbitingPartner.tsx — one partner travelling its ring.
 *
 * A partner rides its ring as a real object in space. Its position each frame
 * comes from orbitalMath, so it is genuinely orbiting rather than being spun
 * around a circle by a parent transform.
 *
 * The artwork can sit bare (plate: 'none', the shipped default) or on an
 * extruded plaque with a bevelled metal edge. Either way it billboards to the
 * camera, which guarantees it can never mirror, invert, go edge-on or shear
 * while crossing an axis.
 *
 * When runtime.logoLayer is 'always-front' the marks are drawn over the
 * central mark instead of being occluded by it, so no partner disappears for
 * part of its orbit. They still sort correctly against each other, and still
 * shrink and dim with distance, so the orbit keeps reading as 3D.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RingConfig } from '../../hero/heroConfig';
import { useHeroRuntime } from '../../hero/heroRuntime';
import type { ResolvedPartner } from '../../hero/partnerManifest';
import {
  createLogoHaloMaterial,
  createLogoMaterial,
  type MedallionMaterialSet,
} from '../materials/heroMaterials';
import { loadTexture } from '../utils/assetLoader';
import { acquirePlaqueGeometry, plaqueSpecForAspect, type PlaqueGeometrySet } from './medallion';
import { orbitalPositionAtTime, smoothstep, type Vec3 } from './orbitalMath';

export interface OrbitingPartnerProps {
  partner: ResolvedPartner;
  ring: RingConfig;
  spreadX: number;
  spreadZ: number;
  scaleMultiplier: number;
  segments: number;
  materials: MedallionMaterialSet;
  envMap: THREE.Texture | null;
  onPosition?: (id: string, position: THREE.Vector3) => void;
  visible?: boolean;
}

const scratch: Vec3 = { x: 0, y: 0, z: 0 };
const worldPosition = new THREE.Vector3();
const parentQuaternion = new THREE.Quaternion();

/**
 * renderOrder band used when marks are drawn in front of everything. The base
 * is far above every other object's order, and the span converts a camera
 * distance into a descending integer so nearer marks sort last.
 */
const FRONT_LAYER_BASE = 4000;
const FRONT_LAYER_SPAN = 60;

export function OrbitingPartner({
  partner,
  ring,
  spreadX,
  spreadZ,
  scaleMultiplier,
  segments,
  materials,
  envMap,
  onPosition,
  visible = true,
}: OrbitingPartnerProps) {
  const group = useRef<THREE.Group>(null);
  const billboard = useRef<THREE.Group>(null);
  const runtime = useHeroRuntime();
  const camera = useThree((state) => state.camera);

  // Start from the manifest hint so the plaque is correctly proportioned on
  // the very first frame, then adopt the decoded image's true aspect.
  const [aspect, setAspect] = useState(partner.aspectHint);

  const spec = useMemo(() => plaqueSpecForAspect(aspect, partner.padding), [aspect, partner.padding]);

  const geometry = useMemo<PlaqueGeometrySet>(
    () => acquirePlaqueGeometry(spec, segments),
    [spec, segments],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const plateMaterial = useMemo(() => {
    const source = partner.plate === 'light' ? materials.plateLight : materials.plate;
    const clone = source.clone();
    return clone;
  }, [materials.plate, materials.plateLight, partner.plate]);
  const edgeMaterial = useMemo(() => materials.edge.clone(), [materials.edge]);
  const logoMaterial = useMemo(
    () => createLogoMaterial(null, partner.emissiveIntensity),
    [partner.emissiveIntensity],
  );

  const haloMaterial = useMemo(() => {
    if (partner.plate !== 'none' || partner.halo <= 0) return null;
    return createLogoHaloMaterial();
  }, [partner.plate, partner.halo]);

  useEffect(() => {
    if (!haloMaterial) return;
    return () => haloMaterial.dispose();
  }, [haloMaterial]);

  const alwaysFront = runtime.logoLayer === 'always-front';

  /**
   * Drawing the marks over the central object means switching depth testing
   * off for them. Order then has to come from renderOrder instead, which the
   * frame loop maintains from camera distance.
   */
  useEffect(() => {
    const affected: THREE.Material[] = [plateMaterial, edgeMaterial, logoMaterial];
    if (haloMaterial) affected.push(haloMaterial);
    for (const material of affected) {
      material.depthTest = !alwaysFront;
      material.needsUpdate = true;
    }
    if (alwaysFront) {
      // Nothing may write depth in this mode, or a mark would occlude the
      // marks drawn after it regardless of which is actually nearer.
      plateMaterial.depthWrite = false;
      edgeMaterial.depthWrite = false;
      logoMaterial.depthWrite = false;
    }
  }, [alwaysFront, plateMaterial, edgeMaterial, logoMaterial, haloMaterial]);

  const plaqueMaterials = useMemo(() => [plateMaterial, edgeMaterial], [plateMaterial, edgeMaterial]);
  const baseEdgeColor = useMemo(() => edgeMaterial.color.clone(), [edgeMaterial]);
  const basePlateColor = useMemo(() => plateMaterial.color.clone(), [plateMaterial]);
  const baseLogoColor = useMemo(() => logoMaterial.color.clone(), [logoMaterial]);

  useEffect(() => {
    let cancelled = false;
    void loadTexture(partner.logoUrl, { anisotropy: runtime.quality.anisotropy }).then((texture) => {
      if (cancelled) return;
      if (!texture) {
        // Missing artwork must not remove the partner from the system: the
        // medallion stays, so the ecosystem still reads correctly.
        logoMaterial.opacity = 0;
        logoMaterial.needsUpdate = true;
        return;
      }
      logoMaterial.map = texture;
      logoMaterial.emissiveMap = texture;
      haloMaterial?.setMap(texture);
      logoMaterial.opacity = 1;
      logoMaterial.needsUpdate = true;

      const image = texture.image as { width?: number; height?: number } | undefined;
      if (image?.width && image?.height) {
        const real = image.width / image.height;
        if (import.meta.env.DEV && Math.abs(real - partner.aspectHint) / real > 0.05) {
          console.warn(
            `[ovmg-hero] "${partner.id}" aspectHint ${partner.aspectHint} does not match the artwork (${real.toFixed(4)}). Update the manifest.`,
          );
        }
        setAspect(real);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [partner.logoUrl, partner.id, partner.aspectHint, logoMaterial, haloMaterial, runtime.quality.anisotropy]);

  useEffect(() => {
    if (!envMap) return;
    plateMaterial.envMap = envMap;
    edgeMaterial.envMap = envMap;
    logoMaterial.envMap = envMap;
    plateMaterial.needsUpdate = true;
    edgeMaterial.needsUpdate = true;
    logoMaterial.needsUpdate = true;
  }, [envMap, plateMaterial, edgeMaterial, logoMaterial]);

  useEffect(
    () => () => {
      plateMaterial.dispose();
      edgeMaterial.dispose();
      logoMaterial.dispose();
    },
    [plateMaterial, edgeMaterial, logoMaterial],
  );

  useFrame(() => {
    const node = group.current;
    const face = billboard.current;
    if (!node || !face) return;

    orbitalPositionAtTime(
      ring,
      runtime.elapsed,
      partner.phase,
      spreadX,
      spreadZ,
      scratch,
      runtime.motionIntensity,
    );
    node.position.set(scratch.x, scratch.y, scratch.z);

    // Billboard: the face must end up parallel to the image plane in WORLD
    // space. The system group carries a roll on portrait layouts, so copying
    // the camera quaternion into the local slot would inherit that roll and
    // tilt every logo. Cancelling the parent's world rotation first is what
    // keeps the artwork upright at every breakpoint.
    node.getWorldQuaternion(parentQuaternion);
    face.quaternion.copy(parentQuaternion).invert().multiply(camera.quaternion);

    // Depth presentation. Perspective already handles size; this handles
    // prominence, so the far side of the system recedes instead of competing.
    node.getWorldPosition(worldPosition);
    const distance = camera.position.distanceTo(worldPosition);
    const reach = Math.max(ring.radiusX * spreadX, ring.radiusZ * spreadZ);
    const centre = camera.position.length();
    const depth = 1 - smoothstep(centre - reach, centre + reach, distance);

    const presence = (0.3 + depth * 0.7) * partner.emphasis;

    // Opaque plates cannot fade, so the far side recedes by darkening.
    plateMaterial.color.copy(basePlateColor).multiplyScalar(0.46 + depth * 0.62);
    edgeMaterial.color.copy(baseEdgeColor).multiplyScalar(0.34 + presence * 0.9);
    logoMaterial.color.copy(baseLogoColor).multiplyScalar(0.5 + presence * 0.7);
    logoMaterial.emissiveIntensity =
      partner.plate === 'light' ? 0 : partner.emissiveIntensity * (0.18 + depth * 1.05);
    haloMaterial?.setStrength(partner.halo * (0.45 + depth * 0.55));

    // In 'always-front' mode depth testing is off, so ordering has to be
    // supplied explicitly. Deriving renderOrder from distance keeps the marks
    // sorted correctly against EACH OTHER — a nearer mark still covers a
    // farther one — while none of them can be hidden by the central mark.
    if (alwaysFront) {
      const order = FRONT_LAYER_BASE + Math.round((FRONT_LAYER_SPAN - distance) * 24) * 4;
      face.children.forEach((child, index) => {
        child.renderOrder = order + index;
      });
    }

    onPosition?.(partner.id, worldPosition);
  });

  const size = partner.scale * scaleMultiplier;
  const hasPlaque = partner.plate !== 'none';

  return (
    <group ref={group} visible={visible} name={`partner-${partner.id}`}>
      <group ref={billboard} scale={size}>
        {hasPlaque ? (
          <mesh geometry={geometry.plate} material={plaqueMaterials} castShadow renderOrder={3} />
        ) : null}
        {haloMaterial ? (
          <mesh
            geometry={geometry.logo}
            material={haloMaterial}
            scale={[spec.logoWidth * 1.08, spec.logoHeight * 1.08, 1]}
            position={[0, 0, geometry.halfDepth + 0.004]}
            renderOrder={5}
          />
        ) : null}
        <mesh
          geometry={geometry.logo}
          material={logoMaterial}
          scale={[spec.logoWidth, spec.logoHeight, 1]}
          position={[0, 0, geometry.halfDepth + 0.006]}
          renderOrder={6}
        />
      </group>
    </group>
  );
}
