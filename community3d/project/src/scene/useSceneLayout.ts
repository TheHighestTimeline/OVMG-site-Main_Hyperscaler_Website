/**
 * useSceneLayout — resize-aware access to the sceneLayout config.
 * The layout constants are static; only `isMobile` is stateful.
 */
import { useEffect, useState } from 'react';
import {
  PLOT, ROAD, SIDEWALKS, CROSSWALK, FOOTPRINTS, MARKET, COMMUNITY_CENTER,
  LAMPS, CAMERA, LIFTS, STAGES, LIGHTING, QUALITY,
} from './sceneLayout';

function computeIsMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < CAMERA.mobileBreakpoint;
}

export function useSceneLayout() {
  const [isMobile, setIsMobile] = useState<boolean>(computeIsMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(computeIsMobile());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return {
    isMobile,
    PLOT, ROAD, SIDEWALKS, CROSSWALK, FOOTPRINTS,
    MARKET, COMMUNITY_CENTER, LAMPS,
    CAMERA, LIFTS, STAGES, LIGHTING, QUALITY,
  } as const;
}
