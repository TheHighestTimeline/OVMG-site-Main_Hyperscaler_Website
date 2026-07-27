/**
 * App — pinned scroll experience. A ~600vh track wraps a sticky 100svh
 * viewport containing the 3D canvas plus DOM feature labels (never in-canvas).
 * Labels fade per activeFeature; host pages can hide them by setting
 * window.CITY3D_DISABLE_LABELS = true and listening to `city3d:feature`.
 */
import { useRef } from 'react';
import { WorldScene } from '../scene/WorldScene';
import { useScrollSequence } from '../scene/useScrollSequence';
import type { FeatureName } from '../scene/sceneLayout';

const LABELS: { feature: FeatureName; kicker: string; text: string }[] = [
  { feature: 'overview', kicker: 'OVMG', text: 'A block built for the community' },
  { feature: 'market', kicker: 'Feature 01', text: 'Neighborhood Market' },
  { feature: 'community-center', kicker: 'Feature 02', text: 'Community Center' },
  { feature: 'street-lights', kicker: 'Feature 03', text: 'Street Lighting' },
];

function FeatureLabel({ active, kicker, text, feature }: { active: boolean; kicker: string; text: string; feature: string }) {
  return (
    <div data-feature={feature} className={`city3d-label${active ? ' is-active' : ''}`}>
      <span className="city3d-label-kicker">{kicker}</span>
      <span className="city3d-label-text">{text}</span>
      <span className="city3d-label-line" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  const trackRef = useRef<HTMLElement | null>(null);
  const activeFeature = useScrollSequence(trackRef);
  const hideLabels = typeof window !== 'undefined' && window.CITY3D_DISABLE_LABELS === true;

  return (
    <>
      <section className="city3d-track" ref={trackRef}>
        <div className="city3d-viewport">
          <div className="city3d-canvas-wrap">
            <WorldScene />
          </div>
          {!hideLabels && (
            <div className="city3d-labels">
              {LABELS.map((l) => (
                <FeatureLabel
                  key={l.feature}
                  feature={l.feature}
                  active={activeFeature === l.feature}
                  kicker={l.kicker}
                  text={l.text}
                />
              ))}
            </div>
          )}
          <div className="city3d-scroll-hint" aria-hidden="true">Scroll</div>
        </div>
      </section>

      <footer className="city3d-footer">
        <p className="city3d-footer-kicker">One Vibe Media Group</p>
        <p className="city3d-footer-text">
          The block settles back to rest — and the page keeps scrolling, exactly as it should.
        </p>
      </footer>
    </>
  );
}
