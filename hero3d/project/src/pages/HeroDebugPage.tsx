/**
 * HeroDebugPage.tsx — development-only inspector.
 *
 * Reachable at /#hero-debug (or /hero-debug via the dev server) and stripped
 * from production: App only mounts it when import.meta.env.DEV is true.
 */

import { useEffect, useMemo, useState } from 'react';
import { PartnerOrbitHero } from '../hero/PartnerOrbitHero';
import { FULL_SCENE, type SceneVisibility } from '../hero/PartnerOrbitScene';
import { PARTNERS } from '../hero/partnerManifest';
import { RINGS, type QualityTier } from '../hero/heroConfig';
import type { HeroTelemetry } from '../hero/heroTelemetry';

type Isolation = 'full' | 'central' | 'rings' | 'partners' | 'stars';

const ISOLATIONS: Record<Isolation, SceneVisibility> = {
  full: FULL_SCENE,
  central: { central: true, rings: false, partners: false, stars: false, atmosphere: false },
  rings: { central: false, rings: true, partners: false, stars: false, atmosphere: false },
  partners: { central: false, rings: false, partners: true, stars: false, atmosphere: false },
  stars: { central: false, rings: false, partners: false, stars: true, atmosphere: true },
};

function useTelemetry(active: boolean): HeroTelemetry | null {
  const [state, setState] = useState<HeroTelemetry | null>(null);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setState(window.__OVMG_HERO__?.getState() ?? null);
    }, 500);
    return () => window.clearInterval(id);
  }, [active]);
  return state;
}

export function HeroDebugPage() {
  const [isolation, setIsolation] = useState<Isolation>('full');
  const [quality, setQuality] = useState<QualityTier | 'auto'>('auto');
  const [motionIntensity, setMotionIntensity] = useState(1);
  const [pointerResponse, setPointerResponse] = useState(1);
  const [scrollResponse, setScrollResponse] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [helpers, setHelpers] = useState(false);
  const [showStats, setShowStats] = useState(true);

  const telemetry = useTelemetry(showStats);
  const visibility = useMemo(() => ISOLATIONS[isolation], [isolation]);

  return (
    <div className="debug-root">
      <div className="debug-stage">
        <PartnerOrbitHero
          height="100vh"
          quality={quality}
          motionIntensity={motionIntensity}
          pointerResponse={pointerResponse}
          scrollResponse={scrollResponse}
          forceReducedMotion={reducedMotion}
          visibility={visibility}
          showHelpers={helpers}
        />
      </div>

      <aside className="debug-panel">
        <h1>Hero debug</h1>

        <label>
          Isolate
          <select value={isolation} onChange={(event) => setIsolation(event.target.value as Isolation)}>
            <option value="full">Complete scene</option>
            <option value="central">Central O only</option>
            <option value="rings">Orbital rings only</option>
            <option value="partners">Partner logos only</option>
            <option value="stars">Starfield only</option>
          </select>
        </label>

        <label>
          Quality
          <select value={quality} onChange={(event) => setQuality(event.target.value as QualityTier | 'auto')}>
            <option value="auto">auto</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low (mobile)</option>
          </select>
        </label>

        <label>
          Orbit speed <span>{motionIntensity.toFixed(2)}x</span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.05}
            value={motionIntensity}
            onChange={(event) => setMotionIntensity(Number(event.target.value))}
          />
        </label>

        <label>
          Pointer response <span>{pointerResponse.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={pointerResponse}
            onChange={(event) => setPointerResponse(Number(event.target.value))}
          />
        </label>

        <label>
          Scroll response <span>{scrollResponse.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.05}
            value={scrollResponse}
            onChange={(event) => setScrollResponse(Number(event.target.value))}
          />
        </label>

        <label className="debug-check">
          <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
          Simulate prefers-reduced-motion
        </label>

        <label className="debug-check">
          <input type="checkbox" checked={helpers} onChange={(e) => setHelpers(e.target.checked)} />
          Axes helper
        </label>

        <label className="debug-check">
          <input type="checkbox" checked={showStats} onChange={(e) => setShowStats(e.target.checked)} />
          FPS / stats
        </label>

        {showStats && telemetry ? (
          <div className="debug-stats">
            <div>
              <b>{telemetry.fps.toFixed(0)}</b> fps · {telemetry.frameMs.toFixed(1)} ms
            </div>
            <div>
              draws <b>{telemetry.drawCalls}</b> · tris <b>{(telemetry.triangles / 1000).toFixed(1)}k</b>
            </div>
            <div>
              geo {telemetry.geometries} · tex {telemetry.textures} · programs {telemetry.programs}
            </div>
            <div>
              tier <b>{telemetry.quality}</b> · {telemetry.responsive} · stars {telemetry.starCount}
            </div>
            <div>
              scroll {telemetry.scroll.toFixed(2)} · pointer {telemetry.pointerX.toFixed(2)},
              {telemetry.pointerY.toFixed(2)}
            </div>
            {telemetry.assetIssues.length > 0 ? (
              <div className="debug-error">
                {telemetry.assetIssues.length} asset issue(s): {telemetry.assetIssues.map((i) => i.path).join(', ')}
              </div>
            ) : null}
            <table>
              <thead>
                <tr>
                  <th>partner</th>
                  <th>ring</th>
                  <th>z</th>
                  <th>occl</th>
                  <th>tex</th>
                </tr>
              </thead>
              <tbody>
                {telemetry.partners.map((partner) => (
                  <tr key={partner.id}>
                    <td>{partner.id}</td>
                    <td>{partner.ring}</td>
                    <td>{partner.z.toFixed(2)}</td>
                    <td>{partner.occludedByCentral ? 'yes' : ''}</td>
                    <td>{partner.hasLogoTexture ? 'ok' : 'missing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="debug-meta">
          {RINGS.length} rings · {PARTNERS.filter((p) => p.active !== false).length} partners
        </div>
      </aside>
    </div>
  );
}

export default HeroDebugPage;
