/**
 * PartnerOrbitHero.tsx — the public component.
 *
 * Owns the DOM shell: sizing, background mode, the loading state, the
 * accessible partner list and the shared runtime object. Renders no headline
 * copy of its own — the surrounding page places text above or beside the
 * canvas, guided by `safeZone`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DEFAULT_HERO_CONFIG,
  resolveResponsiveProfile,
  type HeroConfig,
  type ResponsiveProfile,
} from './heroConfig';
import { createHeroRuntime, HeroRuntimeContext } from './heroRuntime';
import { installTelemetry } from './heroTelemetry';
import { PARTNERS, partnerNames, resolvePartners, validateManifest } from './partnerManifest';
import { RINGS } from './heroConfig';
import { FULL_SCENE, PartnerOrbitScene, type SceneVisibility } from './PartnerOrbitScene';
import { useHeroScroll } from './useHeroScroll';
import { usePointerParallax } from './usePointerParallax';
import { useReducedMotion } from './useReducedMotion';
import { clampDpr, resolveQualityProfile } from '../three/utils/performanceTier';
import { disposeTextureCache } from '../three/utils/assetLoader';
import heroCss from './hero.css?inline';

/**
 * Styles are injected rather than imported as a CSS asset so the embed bundle
 * stays a single file the static site can drop in with one script tag.
 */
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.dataset.ovmgHero = '';
  style.textContent = heroCss;
  document.head.appendChild(style);
}

export interface PartnerOrbitHeroProps extends Partial<HeroConfig> {
  className?: string;
  /** Overrides the manifest; the manifest remains the default source of truth. */
  partners?: typeof PARTNERS;
  /** Debug only: isolate parts of the scene. */
  visibility?: SceneVisibility;
  showHelpers?: boolean;
  /** Debug only: force reduced motion on or off. */
  forceReducedMotion?: boolean;
  ariaLabel?: string;
}

/**
 * Picks the responsive profile from the hero's own container, not the window.
 *
 * The hero is not always full-bleed: on the marketing page it occupies one
 * column of a two-column layout, so a 1440-wide window can hand it a 560-wide
 * box. Keying off `window.innerWidth` there gave it the desktop profile — full
 * orbit spread squeezed into half the width, which shrank the mark to a speck.
 * Measuring the container makes the hero correct in any slot it is dropped into.
 */
function useContainerProfile(host: RefObject<HTMLElement | null>): ResponsiveProfile {
  const [profile, setProfile] = useState<ResponsiveProfile>(() =>
    resolveResponsiveProfile(typeof window === 'undefined' ? 1440 : window.innerWidth),
  );

  useEffect(() => {
    const element = host.current;
    if (typeof window === 'undefined' || !element) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = element.clientWidth || window.innerWidth;
        setProfile((current) => {
          const next = resolveResponsiveProfile(width);
          return next.label === current.label ? current : next;
        });
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    window.addEventListener('orientationchange', update);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('orientationchange', update);
    };
  }, [host]);

  return profile;
}

export function PartnerOrbitHero(props: PartnerOrbitHeroProps) {
  const config: HeroConfig = { ...DEFAULT_HERO_CONFIG, ...props };
  const {
    className,
    partners: partnerSource = PARTNERS,
    visibility = FULL_SCENE,
    showHelpers = false,
    forceReducedMotion,
    ariaLabel = 'OneVibeMediaGroup partner ecosystem, visualised as partner marks orbiting the OVMG mark',
  } = props;

  injectStyles();

  const host = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion(forceReducedMotion);
  const responsive = useContainerProfile(host);
  const [loaded, setLoaded] = useState(false);

  const quality = useMemo(() => resolveQualityProfile(config.quality), [config.quality]);

  const partners = useMemo(() => {
    const issues = validateManifest(partnerSource, RINGS.length);
    for (const issue of issues) {
      const message = `[ovmg-hero] manifest ${issue.level} for "${issue.partnerId}": ${issue.message}`;
      if (issue.level === 'error') console.error(message);
      else console.warn(message);
    }
    return resolvePartners(partnerSource.filter((p) => p.ring >= 0 && p.ring < RINGS.length));
  }, [partnerSource]);

  const runtime = useMemo(
    () => createHeroRuntime(quality, responsive),
    // The runtime object is intentionally stable; quality/responsive are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  runtime.quality = quality;
  runtime.responsive = responsive;
  runtime.reducedMotion = reducedMotion;
  runtime.transparentBackground = config.background === 'transparent';
  runtime.logoLayer = config.logoLayer;
  runtime.motionIntensity = config.motionIntensity;
  runtime.pointerResponse = reducedMotion ? 0 : config.pointerResponse;
  runtime.scrollResponse = reducedMotion ? 0 : config.scrollResponse;

  usePointerParallax({ enabled: !reducedMotion && config.pointerResponse > 0, element: host, runtime });
  useHeroScroll({ enabled: !reducedMotion && config.scrollResponse > 0, element: host, runtime });

  useEffect(
    () =>
      installTelemetry({
        seek: (seconds) => {
          runtime.elapsed = seconds;
        },
      }),
    [runtime],
  );
  useEffect(() => () => disposeTextureCache(), []);

  const dpr = useMemo(
    () => clampDpr(quality, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1),
    [quality],
  );

  const names = useMemo(() => partnerNames(partnerSource), [partnerSource]);

  return (
    <div
      ref={host}
      className={['ovmg-hero', `ovmg-hero--${config.layout}`, `ovmg-hero--bg-${config.background}`, className]
        .filter(Boolean)
        .join(' ')}
      style={{
        height: config.height,
        minHeight: config.minHeight,
        ['--ovmg-safe-left' as string]: `${config.safeZone.left}%`,
        ['--ovmg-safe-right' as string]: `${config.safeZone.right}%`,
      }}
      data-quality={quality.tier}
      data-responsive={responsive.label}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-loaded={loaded ? 'true' : 'false'}
    >
      <div className="ovmg-hero__canvas" aria-hidden="true">
        <Canvas
          dpr={dpr}
          shadows={quality.shadows}
          frameloop="always"
          gl={{
            antialias: true,
            alpha: config.background === 'transparent',
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
          camera={{
            fov: responsive.fov,
            // Provisional pose; CameraRig solves the real one on the first frame.
            position: [
              0,
              Math.sin(responsive.cameraElevation) * responsive.minCameraDistance,
              Math.cos(responsive.cameraElevation) * responsive.minCameraDistance,
            ],
          }}
          onCreated={({ gl, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.94;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            if (config.background === 'dark') {
              scene.background = null; // the CSS gradient shows through the clear colour
              gl.setClearColor(0x05070d, 1);
            } else {
              gl.setClearColor(0x000000, 0);
            }
            requestAnimationFrame(() => setLoaded(true));
          }}
        >
          <HeroRuntimeContext.Provider value={runtime}>
            <PartnerOrbitScene partners={partners} visibility={visibility} showHelpers={showHelpers} />
          </HeroRuntimeContext.Provider>
        </Canvas>
      </div>

      <div className="ovmg-hero__veil" aria-hidden="true" />

      <div className={`ovmg-hero__loader${loaded ? ' is-done' : ''}`} aria-hidden="true">
        <span className="ovmg-hero__loader-ring" />
      </div>

      {/* The canvas is decorative; the partner list is the accessible source. */}
      <div className="ovmg-hero__a11y" role="group" aria-label={ariaLabel}>
        <p>OneVibeMediaGroup partner ecosystem</p>
        <ul>
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PartnerOrbitHero;
