/** Scene assembly, camera, lighting, scroll-lift API. */
import * as THREE from 'three';
import {
  PLOT, MARKET, COMMUNITY_CENTER, LAMPS, CAMERA, LIFTS, STAGES, LIGHTING, QUALITY, FOOTPRINTS,
  type FeatureName,
} from '../scene/sceneLayout';
import { createBaseWorld } from './assets/createBaseWorld';
import { createMarket } from './assets/createMarket';
import { createCommunityCenter } from './assets/createCommunityCenter';
import { createStreetLamp } from './assets/createStreetLamp';
import { materials } from './materials/materialLibrary';

export interface City3D {
  setProgress(p: number): void;                       // standalone 4-stage timeline
  setLift(kind: 'market' | 'communityCenter' | 'streetLamps', amount01: number): void;
  setDim(amount01: number): void;
  activeFeature(): FeatureName;
  onFeatureChange(cb: (f: FeatureName) => void): void;
  refs: { baseWorld: THREE.Group; market: THREE.Group; communityCenter: THREE.Group; streetLights: THREE.Group };
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderOnce(): void;
  dispose(): void;
}

export interface MountOptions {
  container: HTMLElement;
  isolate?: 'base-world' | 'market' | 'community-center' | 'street-lamp' | null;
  interactive?: boolean; // rAF loop with visibility gating (default true)
}

export function mountCity3D(opts: MountOptions): City3D {
  const { container } = opts;
  const isMobile = () => Math.min(window.innerWidth, container.clientWidth || window.innerWidth) < CAMERA.mobileBreakpoint;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const maxDpr = isMobile() ? QUALITY.mobileMaxPixelRatio : QUALITY.maxPixelRatio;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;';

  const scene = new THREE.Scene();

  // ---- Camera (orthographic isometric) ----
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const ISOLATE_VIEW: Record<string, { viewHeight: number; targetY: number }> = {
    'base-world': { viewHeight: 11.5, targetY: 0.6 },
    'market': { viewHeight: 4.6, targetY: 1.0 },
    'community-center': { viewHeight: 6.4, targetY: 1.6 },
    'street-lamp': { viewHeight: 4.6, targetY: 1.4 },
  };
  function frameCamera() {
    const conf = isMobile() ? CAMERA.mobile : CAMERA.desktop;
    const w = container.clientWidth || 600, h = container.clientHeight || 450;
    const aspect = w / h;
    const iso = opts.isolate ? ISOLATE_VIEW[opts.isolate] : null;
    const viewH = iso ? iso.viewHeight : conf.viewHeight;
    const viewW = viewH * aspect;
    // guarantee full plot width fits with padding
    const needW = iso ? 0 : PLOT.width * 1.14;
    const scale = viewW < needW ? needW / viewW : 1;
    camera.left = -viewW / 2 * scale; camera.right = viewW / 2 * scale;
    camera.top = viewH / 2 * scale; camera.bottom = -viewH / 2 * scale;
    camera.position.set(conf.position.x, conf.position.y, conf.position.z);
    const ty = iso ? iso.targetY : conf.target.y;
    camera.lookAt(conf.target.x, ty, conf.target.z);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  // ---- Lighting ----
  const hemi = new THREE.HemisphereLight(LIGHTING.hemisphere.sky, LIGHTING.hemisphere.ground, LIGHTING.hemisphere.intensity);
  const key = new THREE.DirectionalLight(LIGHTING.key.color, LIGHTING.key.intensity);
  key.position.set(LIGHTING.key.position.x, LIGHTING.key.position.y, LIGHTING.key.position.z);
  const rim = new THREE.DirectionalLight(LIGHTING.rim.color, LIGHTING.rim.intensity);
  rim.position.set(LIGHTING.rim.position.x, LIGHTING.rim.position.y, LIGHTING.rim.position.z);
  scene.add(hemi, key, rim);

  // ---- Assemble world ----
  const baseWorld = createBaseWorld();
  const market = createMarket();
  const communityCenter = createCommunityCenter();
  const streetLights = new THREE.Group();
  streetLights.name = 'StreetLights';

  const marketGroup = new THREE.Group(); marketGroup.name = 'MarketLift';
  marketGroup.position.set(MARKET.position.x, MARKET.position.y, MARKET.position.z);
  marketGroup.rotation.y = MARKET.rotationY;
  marketGroup.add(market);

  const ccGroup = new THREE.Group(); ccGroup.name = 'CommunityCenterLift';
  ccGroup.position.set(COMMUNITY_CENTER.position.x, COMMUNITY_CENTER.position.y, COMMUNITY_CENTER.position.z);
  ccGroup.rotation.y = COMMUNITY_CENTER.rotationY;
  ccGroup.add(communityCenter);

  const lampGroups: THREE.Group[] = [];
  const lampPointLights: THREE.PointLight[] = [];
  const realLightBudget = isMobile() ? QUALITY.mobileRealLampLights : QUALITY.desktopRealLampLights;
  LAMPS.forEach((lp, i) => {
    const lamp = createStreetLamp();
    const lg = new THREE.Group(); lg.name = `StreetLampLift${i}`;
    lg.position.set(lp.position.x, lp.position.y, lp.position.z);
    lg.rotation.y = lp.rotationY;
    lg.add(lamp);
    if (i < realLightBudget) {
      const anchor = lamp.getObjectByName('LampLightAnchor')!;
      const pt = new THREE.PointLight(LIGHTING.lampColor, 5.5, 4.2, 1.8);
      anchor.add(pt);
      lampPointLights.push(pt);
    }
    lampGroups.push(lg);
    streetLights.add(lg);
  });

  // AO contact blobs under buildings (cheap grounded feel)
  const M = materials();
  function aoBlob(w: number, d: number, x: number, z: number, name: string) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.aoBlob);
    m.name = name; m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    return m;
  }
  const aoMat = () => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
  const aoMarket = aoBlob(FOOTPRINTS.market.w + 0.5, FOOTPRINTS.market.d + 0.5, MARKET.position.x, MARKET.position.z, 'AOMarket');
  aoMarket.material = aoMat();
  const aoCC = aoBlob(FOOTPRINTS.communityCenter.w + 0.6, FOOTPRINTS.communityCenter.d + 0.6, COMMUNITY_CENTER.position.x, COMMUNITY_CENTER.position.z, 'AOCommunityCenter');
  aoCC.material = aoMat();
  baseWorld.add(aoMarket, aoCC);
  // static warm pools under each lamp head (never lift with the lamp; fade as lamps rise)
  const lampPools: THREE.Mesh[] = [];
  const lampPoolMat = M.lightPool.clone();
  LAMPS.forEach((lp, i) => {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20), lampPoolMat);
    lampPools.push(pool);
    pool.name = `LampPool${i}`;
    pool.rotation.x = -Math.PI / 2;
    const headOffset = 0.38 * (lp.rotationY === 0 ? -1 : 1);
    pool.position.set(lp.position.x, 0.075, lp.position.z + headOffset);
    baseWorld.add(pool);
  });

  const world = new THREE.Group(); world.name = 'World';
  const isolate = opts.isolate ?? null;
  if (!isolate) {
    world.add(baseWorld, marketGroup, ccGroup, streetLights);
  } else if (isolate === 'base-world') world.add(baseWorld);
  else if (isolate === 'market') world.add(marketGroup), marketGroup.position.set(0, 0, 0);
  else if (isolate === 'community-center') world.add(ccGroup), ccGroup.position.set(0, 0, 0);
  else if (isolate === 'street-lamp') {
    const lone = lampGroups[0]; lone.position.set(0, 0, 0); lone.rotation.y = 0;
    world.add(lone);
  }
  scene.add(world);

  if (isolate) {
    // preview framing + neutral fill so isolated assets are fully readable
    const fill = new THREE.AmbientLight(0x8a97b8, 0.9);
    scene.add(fill);
  }

  // ---- Lift + dim control ----
  const dimmables: THREE.Material[] = [M.paving, M.concrete, M.asphalt, M.rockSide, M.curb, M.soil, M.foliage, M.stoneTrim];
  let dimAmount = 0;
  function setDim(a: number) {
    dimAmount = THREE.MathUtils.clamp(a, 0, 1);
    hemi.intensity = LIGHTING.hemisphere.intensity * (1 - 0.45 * dimAmount);
    key.intensity = LIGHTING.key.intensity * (1 - 0.4 * dimAmount);
  }

  function setLift(kind: 'market' | 'communityCenter' | 'streetLamps', a: number) {
    const t = THREE.MathUtils.clamp(a, 0, 1);
    if (kind === 'market') {
      marketGroup.position.y = MARKET.position.y + LIFTS.market * t;
      (aoMarket.material as THREE.MeshBasicMaterial).opacity = 0.38 - 0.2 * t;
      aoMarket.scale.setScalar(1 - 0.18 * t);
    }
    else if (kind === 'communityCenter') {
      ccGroup.position.y = COMMUNITY_CENTER.position.y + LIFTS.communityCenter * t;
      (aoCC.material as THREE.MeshBasicMaterial).opacity = 0.38 - 0.2 * t;
      aoCC.scale.setScalar(1 - 0.18 * t);
    }
    else {
      lampGroups.forEach((lg, i) => {
        const s = THREE.MathUtils.clamp(t * (1 + LIFTS.lampStagger * lampGroups.length) - i * LIFTS.lampStagger, 0, 1);
        lg.position.y = LAMPS[i].position.y + LIFTS.streetLamps * s;
      });
      // hero-stage glow: ground pools fade as light leaves, bulbs + real lights surge
      lampPoolMat.opacity = 0.16 * (1 - t);
      M.bulb.emissiveIntensity = 3.2 + 3.8 * t;
      lampPointLights.forEach((pl) => { pl.intensity = 5.5 * (1 + 1.4 * t); });
    }
    needsRender = true;
  }

  // ---- Standalone 4-stage timeline ----
  let feature: FeatureName = 'overview';
  const featureCbs: ((f: FeatureName) => void)[] = [];
  function fireFeature(f: FeatureName) {
    if (f !== feature) { feature = f; featureCbs.forEach((cb) => cb(f)); }
  }
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function phase(p: number, s: number, e: number) { return THREE.MathUtils.clamp((p - s) / (e - s), 0, 1); }
  function upDown(t: number) { return t < 0.5 ? ease(t * 2) : ease((1 - t) * 2); }

  function setProgress(p: number) {
    p = THREE.MathUtils.clamp(p, 0, 1);
    const mk = phase(p, STAGES.market.start, STAGES.market.end);
    const cc = phase(p, STAGES.communityCenter.start, STAGES.communityCenter.end);
    const sl = phase(p, STAGES.streetLamps.start, STAGES.streetLamps.end);
    setLift('market', upDown(mk));
    setLift('communityCenter', upDown(cc));
    setLift('streetLamps', upDown(sl));
    const anyActive = Math.max(upDown(mk), upDown(cc), upDown(sl));
    setDim(anyActive * 0.8);
    if (mk > 0 && mk < 1) fireFeature('market');
    else if (cc > 0 && cc < 1) fireFeature('community-center');
    else if (sl > 0 && sl < 1) fireFeature('street-lights');
    else fireFeature('overview');
    needsRender = true;
  }

  // ---- Render loop (dirty-flag + visibility gated) ----
  let needsRender = true;
  let visible = true;
  let disposed = false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) needsRender = true; }).observe(container);
  }
  function render() { renderer.render(scene, camera); }
  function loop() {
    if (disposed) return;
    if (visible && needsRender) { render(); needsRender = false; }
    requestAnimationFrame(loop);
  }
  frameCamera();
  if (opts.interactive !== false && !reduce) loop();
  else render();

  const onResize = () => { frameCamera(); needsRender = true; if (reduce || opts.interactive === false) render(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  return {
    setProgress, setLift, setDim,
    activeFeature: () => feature,
    onFeatureChange: (cb) => featureCbs.push(cb),
    refs: { baseWorld, market, communityCenter, streetLights },
    renderer, scene, camera,
    renderOnce: () => { frameCamera(); render(); },
    dispose() {
      disposed = true;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      renderer.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      container.removeChild(renderer.domElement);
    },
  };
}
