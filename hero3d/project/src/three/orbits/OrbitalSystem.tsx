/**
 * OrbitalSystem.tsx — the rings and everyone travelling on them.
 *
 * Owns the shared medallion material library and reports live world positions
 * upward for telemetry and browser tests.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RINGS } from '../../hero/heroConfig';
import { useHeroRuntime } from '../../hero/heroRuntime';
import type { ResolvedPartner } from '../../hero/partnerManifest';
import { createMedallionMaterials } from '../materials/heroMaterials';
import { ringSpreadX } from './framing';
import { OrbitalRing } from './OrbitalRing';
import { OrbitingPartner } from './OrbitingPartner';

export interface OrbitalSystemProps {
  partners: ResolvedPartner[];
  envMap: THREE.Texture | null;
  showRings?: boolean;
  showPartners?: boolean;
  onPosition?: (id: string, position: THREE.Vector3) => void;
}

export function OrbitalSystem({
  partners,
  envMap,
  showRings = true,
  showPartners = true,
  onPosition,
}: OrbitalSystemProps) {
  const runtime = useHeroRuntime();
  const spreadX = runtime.responsive.orbitSpreadX;
  const spreadZ = runtime.responsive.orbitSpreadZ;

  const materials = useMemo(() => createMedallionMaterials(), []);
  useEffect(() => () => materials.dispose(), [materials]);

  return (
    <group name="orbital-system">
      {RINGS.map((ring, index) => (
        <OrbitalRing
          key={ring.id}
          ring={ring}
          spreadX={ringSpreadX(RINGS, index, spreadX)}
          spreadZ={spreadZ}
          tubularSegments={Math.max(64, Math.round(runtime.quality.ringTubularSegments * (1 - ring.id * 0.08)))}
          radialSegments={runtime.quality.ringRadialSegments}
          envMap={envMap}
          visible={showRings}
        />
      ))}

      {partners.map((partner) => {
        const index = Math.min(Math.max(partner.ring, 0), RINGS.length - 1);
        const ring = RINGS[index];
        return (
          <OrbitingPartner
            key={partner.id}
            partner={partner}
            ring={ring}
            spreadX={ringSpreadX(RINGS, index, spreadX)}
            spreadZ={spreadZ}
            scaleMultiplier={runtime.responsive.medallionScale}
            segments={runtime.quality.medallionSegments}
            materials={materials}
            envMap={envMap}
            onPosition={onPosition}
            visible={showPartners}
          />
        );
      })}
    </group>
  );
}
