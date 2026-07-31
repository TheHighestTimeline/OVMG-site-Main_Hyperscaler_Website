/**
 * heroRuntime.ts — the shared mutable animation state.
 *
 * Every animated component reads from one plain object that is mutated inside
 * useFrame. Nothing here ever touches React state, so the hero renders at
 * 60fps without a single re-render after mount.
 */

import { createContext, useContext } from 'react';
import type { LogoLayerMode, QualityProfile, ResponsiveProfile } from './heroConfig';

export interface HeroRuntime {
  /** Animation clock in seconds. Advances only while the hero is active. */
  elapsed: number;
  /** Wall-clock seconds since mount, used for telemetry only. */
  wallClock: number;
  /** Smoothed pointer, -1..1 on each axis. */
  pointerX: number;
  pointerY: number;
  /** Raw pointer target before damping. */
  pointerTargetX: number;
  pointerTargetY: number;
  /** Smoothed scroll progress through the hero, 0..1. */
  scroll: number;
  scrollTarget: number;
  /** True when the tab is hidden or the hero is scrolled out of view. */
  paused: boolean;
  reducedMotion: boolean;
  motionIntensity: number;
  pointerResponse: number;
  scrollResponse: number;
  quality: QualityProfile;
  responsive: ResponsiveProfile;
  /** Mirrors HeroConfig.background; the backdrop plane is dark-mode only. */
  transparentBackground: boolean;
  /** Mirrors HeroConfig.logoLayer. */
  logoLayer: LogoLayerMode;
  /** Rolling frame time in ms, for telemetry and adaptive quality. */
  frameMs: number;
  frameCount: number;
  /** Snapshot of the previous complete frame, including postprocessing passes. */
  drawCalls: number;
  triangles: number;
  /** Set once the first frame with all assets applied has been drawn. */
  ready: boolean;
}

export function createHeroRuntime(
  quality: QualityProfile,
  responsive: ResponsiveProfile,
  overrides: Partial<HeroRuntime> = {},
): HeroRuntime {
  return {
    elapsed: 0,
    wallClock: 0,
    pointerX: 0,
    pointerY: 0,
    pointerTargetX: 0,
    pointerTargetY: 0,
    scroll: 0,
    scrollTarget: 0,
    paused: false,
    reducedMotion: false,
    motionIntensity: 1,
    pointerResponse: 1,
    scrollResponse: 1,
    quality,
    responsive,
    transparentBackground: false,
    logoLayer: 'always-front',
    frameMs: 16.7,
    frameCount: 0,
    drawCalls: 0,
    triangles: 0,
    ready: false,
    ...overrides,
  };
}

export const HeroRuntimeContext = createContext<HeroRuntime | null>(null);

export function useHeroRuntime(): HeroRuntime {
  const runtime = useContext(HeroRuntimeContext);
  if (!runtime) throw new Error('useHeroRuntime must be used inside <PartnerOrbitScene>');
  return runtime;
}

/**
 * Reduced-motion users, social-preview crawlers and the very first paint all
 * see one frozen frame, so it should be the best frame in the cycle rather
 * than whatever t=0 produces. This value is not hand-picked: it is the winner
 * of a search over the full cycle scoring medallion separation, clearance from
 * the central mark and angular evenness (scripts/find-static-pose.mjs).
 *
 * The search scores the worst of the desktop and smallest-phone breakpoints,
 * so the frozen frame holds up on both. At the chosen moment the closest two
 * medallions sit 1.6x their touching distance apart on a phone and 2.1x on
 * desktop, and no medallion is framed inside the mark's opening.
 */
export const REDUCED_MOTION_POSE_SECONDS = 530;
