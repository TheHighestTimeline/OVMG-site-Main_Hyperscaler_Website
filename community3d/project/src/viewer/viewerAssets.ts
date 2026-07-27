/** Asset registry for the dev viewer. Builds preview groups from the shared
 *  procedural builders. Placement for the assembled view comes from sceneLayout —
 *  never hardcoded here. */
import * as THREE from 'three';
import { createBaseWorld } from '../three/assets/createBaseWorld';
import { createMarket } from '../three/assets/createMarket';
import { createCommunityCenter } from '../three/assets/createCommunityCenter';
import { createStreetLamp } from '../three/assets/createStreetLamp';
import { MARKET, COMMUNITY_CENTER, LAMPS, type Placement } from '../scene/sceneLayout';

export const ASSET_NAMES = [
  'base-world',
  'market',
  'community-center',
  'street-lamp',
  'assembled',
] as const;

export type ViewerAssetName = (typeof ASSET_NAMES)[number];

export function isViewerAssetName(v: string | null): v is ViewerAssetName {
  return v !== null && (ASSET_NAMES as readonly string[]).includes(v);
}

function place(group: THREE.Group, p: Placement): THREE.Group {
  group.position.set(p.position.x, p.position.y, p.position.z);
  group.rotation.y = p.rotationY;
  return group;
}

/** Full scene assembly (read-only preview of the production layout). */
export function createAssembled(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Assembled';
  g.add(createBaseWorld());
  g.add(place(createMarket(), MARKET));
  g.add(place(createCommunityCenter(), COMMUNITY_CENTER));
  LAMPS.forEach((p, i) => {
    const lamp = place(createStreetLamp(), p);
    lamp.name = `StreetLamp_${i}`;
    g.add(lamp);
  });
  return g;
}

export const VIEWER_BUILDERS: Record<ViewerAssetName, () => THREE.Group> = {
  'base-world': createBaseWorld,
  'market': createMarket,
  'community-center': createCommunityCenter,
  'street-lamp': createStreetLamp,
  'assembled': createAssembled,
};
