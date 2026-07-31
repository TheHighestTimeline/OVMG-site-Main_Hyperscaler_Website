/**
 * App.tsx — the standalone page.
 *
 * Serves two routes:
 *   /            the hero on its own, exactly as the iframe/Framer embed shows it
 *   /#hero-debug the development inspector (dev builds only)
 *
 * Query flags used by the screenshot harness:
 *   ?only=central|rings|partners|stars   isolate part of the scene
 *   ?motion=0                            simulate reduced motion
 *   ?speed=<n>                           orbit speed multiplier (fast-forward)
 *   ?quality=low|medium|high             force a quality tier
 *   ?layer=occluded|always-front         whether the mark may hide a partner
 *   ?scroll=1                            render the page tall enough to scroll
 */

import { useEffect, useMemo, useState } from 'react';
import { PartnerOrbitHero } from './hero/PartnerOrbitHero';
import { FULL_SCENE, type SceneVisibility } from './hero/PartnerOrbitScene';
import type { QualityTier } from './hero/heroConfig';
import HeroDebugPage from './pages/HeroDebugPage';
import './app.css';

const ISOLATIONS: Record<string, SceneVisibility> = {
  central: { central: true, rings: false, partners: false, stars: false, atmosphere: false },
  rings: { central: false, rings: true, partners: false, stars: false, atmosphere: false },
  partners: { central: false, rings: false, partners: true, stars: false, atmosphere: false },
  stars: { central: false, rings: false, partners: false, stars: true, atmosphere: true },
};

function useHashRoute(): string {
  const [hash, setHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  const params = useMemo(
    () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search),
    [],
  );

  const isDebug =
    import.meta.env.DEV &&
    (hash === '#hero-debug' || (typeof window !== 'undefined' && window.location.pathname.endsWith('/hero-debug')));

  if (isDebug) return <HeroDebugPage />;

  const only = params.get('only');
  const visibility = only && ISOLATIONS[only] ? ISOLATIONS[only] : FULL_SCENE;
  const quality = (params.get('quality') as QualityTier | null) ?? 'auto';
  const reducedMotion = params.get('motion') === '0' ? true : undefined;
  const tall = params.get('scroll') === '1';
  const speed = params.has('speed') ? Number(params.get('speed')) : 1;
  const layer = params.get('layer') as 'occluded' | 'always-front' | null;

  return (
    <div className={`standalone${tall ? ' standalone--tall' : ''}`}>
      <PartnerOrbitHero
        height="100vh"
        minHeight="420px"
        quality={quality}
        visibility={visibility}
        forceReducedMotion={reducedMotion}
        motionIntensity={Number.isFinite(speed) && speed > 0 ? speed : 1}
        {...(layer ? { logoLayer: layer } : {})}
      />
      {tall ? <section className="standalone__after">Next section</section> : null}
    </div>
  );
}

export default App;
