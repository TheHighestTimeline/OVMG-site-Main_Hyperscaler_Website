/**
 * SceneObjects — tiny module-level registry bridging the R3F component tree
 * (AssembledCityBlock / SceneLighting) and the imperative scroll driver
 * (useScrollSequence). Refs are written once on mount and read per scroll
 * update; no React state is involved, so scroll never re-renders the canvas.
 */
import type * as THREE from 'three';

export interface SceneRefs {
  baseWorld: THREE.Group | null;
  market: THREE.Group | null;            // lift group at MARKET.position
  communityCenter: THREE.Group | null;   // lift group at COMMUNITY_CENTER.position
  streetLights: THREE.Group | null;      // parent of the 4 lamp lift groups
  lampGroups: THREE.Group[];             // one lift group per LAMPS entry
  aoMarket: THREE.Mesh | null;           // static AO pad (fades during market lift)
  aoCommunityCenter: THREE.Mesh | null;  // static AO pad (fades during CC lift)
  hemi: THREE.HemisphereLight | null;    // dimmed during lifts
  key: THREE.DirectionalLight | null;    // dimmed during lifts
  lampPoolMat: THREE.MeshBasicMaterial | null; // ground pools; fade as lamps rise
  lampPointLights: THREE.PointLight[];   // surge during the street-light stage
}

const refs: SceneRefs = {
  baseWorld: null,
  market: null,
  communityCenter: null,
  streetLights: null,
  lampGroups: [],
  aoMarket: null,
  aoCommunityCenter: null,
  hemi: null,
  key: null,
  lampPoolMat: null,
  lampPointLights: [],
};

export function setRefs(partial: Partial<SceneRefs>): void {
  Object.assign(refs, partial);
}

export function clearRefs(): void {
  refs.baseWorld = null;
  refs.market = null;
  refs.communityCenter = null;
  refs.streetLights = null;
  refs.lampGroups = [];
  refs.aoMarket = null;
  refs.aoCommunityCenter = null;
  refs.hemi = null;
  refs.key = null;
}

export function getRefs(): SceneRefs {
  return refs;
}
