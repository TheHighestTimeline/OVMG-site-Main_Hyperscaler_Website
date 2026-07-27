/**
 * useScrollSequence — GSAP ScrollTrigger scrub bound to the scroll track.
 * Maps 0..1 progress through STAGES with the same easing shape as
 * coreScene.setProgress (upDown = easeInOutQuad up then back down), driving
 * group.position.y / AO fade / light dim DIRECTLY on the registered refs in
 * onUpdate — no React state per frame. Only the coarse activeFeature stage
 * change touches React state (and fires the `city3d:feature` CustomEvent).
 * prefers-reduced-motion: no ScrollTrigger, scene static at rest.
 */
import { materials } from '../three/materials/materialLibrary';
import { useEffect, useState, type RefObject } from 'react';
import { invalidate } from '@react-three/fiber';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  MARKET, COMMUNITY_CENTER, LAMPS, LIFTS, STAGES, LIGHTING, type FeatureName,
} from './sceneLayout';
import { getRefs } from './SceneObjects';

declare global {
  interface Window {
    City3D_React?: { activeFeature: () => FeatureName };
    CITY3D_DISABLE_LABELS?: boolean;
  }
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
// Same shapes as coreScene.setProgress:
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const phase = (p: number, s: number, e: number) => clamp01((p - s) / (e - s));
const upDown = (t: number) => (t < 0.5 ? ease(t * 2) : ease((1 - t) * 2));

let currentFeature: FeatureName = 'overview';

/** Apply lifts + AO fade + dim for a raw progress value. Pure ref writes. */
function applyProgress(p: number): void {
  const refs = getRefs();
  const mkRaw = phase(p, STAGES.market.start, STAGES.market.end);
  const ccRaw = phase(p, STAGES.communityCenter.start, STAGES.communityCenter.end);
  const slRaw = phase(p, STAGES.streetLamps.start, STAGES.streetLamps.end);
  const mk = upDown(mkRaw);
  const cc = upDown(ccRaw);
  const sl = upDown(slRaw);

  if (refs.market) refs.market.position.y = MARKET.position.y + LIFTS.market * mk;
  if (refs.aoMarket) {
    (refs.aoMarket.material as { opacity: number }).opacity = 0.38 - 0.2 * mk;
    refs.aoMarket.scale.setScalar(1 - 0.18 * mk);
  }

  if (refs.communityCenter) {
    refs.communityCenter.position.y = COMMUNITY_CENTER.position.y + LIFTS.communityCenter * cc;
  }
  if (refs.aoCommunityCenter) {
    (refs.aoCommunityCenter.material as { opacity: number }).opacity = 0.38 - 0.2 * cc;
    refs.aoCommunityCenter.scale.setScalar(1 - 0.18 * cc);
  }

  const n = refs.lampGroups.length;
  refs.lampGroups.forEach((lg, i) => {
    const s = clamp01(sl * (1 + LIFTS.lampStagger * n) - i * LIFTS.lampStagger);
    lg.position.y = LAMPS[i].position.y + LIFTS.streetLamps * s;
  });
  // Street-light hero stage: ground pools fade out as the lamps rise, bulbs + real lights surge.
  if (refs.lampPoolMat) refs.lampPoolMat.opacity = 0.16 * (1 - sl);
  materials().bulb.emissiveIntensity = 3.2 + 3.8 * sl;
  refs.lampPointLights.forEach((pl) => { pl.intensity = 5.5 * (1 + 1.4 * sl); });

  // Subtle scene dim during lifts (coreScene.setDim, amount = anyActive * 0.8).
  const dim = Math.max(mk, cc, sl) * 0.8;
  if (refs.hemi) refs.hemi.intensity = LIGHTING.hemisphere.intensity * (1 - 0.45 * dim);
  if (refs.key) refs.key.intensity = LIGHTING.key.intensity * (1 - 0.4 * dim);

  invalidate();
}

/** Same stage resolution as coreScene.setProgress (raw phase, not eased). */
function featureFor(p: number): FeatureName {
  const mk = phase(p, STAGES.market.start, STAGES.market.end);
  const cc = phase(p, STAGES.communityCenter.start, STAGES.communityCenter.end);
  const sl = phase(p, STAGES.streetLamps.start, STAGES.streetLamps.end);
  if (mk > 0 && mk < 1) return 'market';
  if (cc > 0 && cc < 1) return 'community-center';
  if (sl > 0 && sl < 1) return 'street-lights';
  return 'overview';
}

/**
 * Bind the scroll sequence to the given track element. Returns the current
 * activeFeature (updates only on stage change, so label fades are the only
 * React renders the scroll causes).
 */
export function useScrollSequence(trackRef: RefObject<HTMLElement | null>): FeatureName {
  const [activeFeature, setActiveFeature] = useState<FeatureName>('overview');

  useEffect(() => {
    window.City3D_React = { activeFeature: () => currentFeature };

    const track = trackRef.current;
    if (!track) return;

    const setFeature = (f: FeatureName) => {
      if (f === currentFeature) return;
      currentFeature = f;
      setActiveFeature(f);
      window.dispatchEvent(new CustomEvent('city3d:feature', { detail: { feature: f } }));
    };

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      // Static at rest: no ScrollTrigger, everything grounded, full light.
      applyProgress(0);
      setFeature('overview');
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate: (self) => {
        applyProgress(self.progress);
        setFeature(featureFor(self.progress));
      },
    });
    // Initialize to the current scroll position (e.g. reload mid-page).
    applyProgress(st.progress);
    setFeature(featureFor(st.progress));

    return () => {
      st.kill();
      currentFeature = 'overview';
    };
  }, [trackRef]);

  return activeFeature;
}
