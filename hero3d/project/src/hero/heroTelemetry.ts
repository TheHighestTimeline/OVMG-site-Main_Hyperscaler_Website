/**
 * heroTelemetry.ts — a read-only window hook the browser tests drive.
 *
 * Everything here is observation: frame timing, draw calls, live partner
 * positions and their projected screen coordinates. Nothing in the scene reads
 * from it, so it can never influence what is rendered.
 */

import type { AssetIssue } from '../three/utils/assetLoader';

export interface PartnerTelemetry {
  id: string;
  name: string;
  ring: number;
  /** World position. */
  x: number;
  y: number;
  z: number;
  /** Normalised device coordinates, -1..1. */
  ndcX: number;
  ndcY: number;
  /** True when the medallion centre is inside the frustum. */
  onScreen: boolean;
  /** True when the central O is between the medallion and the camera. */
  occludedByCentral: boolean;
  /** Distance from the camera. */
  distance: number;
  hasLogoTexture: boolean;
  /**
   * True when this mark is drawn over the central object rather than depth
   * tested against it — i.e. it stays visible even while geometrically behind.
   */
  drawnInFront: boolean;
}

export interface HeroTelemetry {
  ready: boolean;
  reducedMotion: boolean;
  quality: string;
  responsive: string;
  elapsed: number;
  scroll: number;
  pointerX: number;
  pointerY: number;
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  starCount: number;
  ringCount: number;
  partners: PartnerTelemetry[];
  assetIssues: AssetIssue[];
  centralPresent: boolean;
  logoLayer: string;
}

export interface HeroTelemetryApi {
  getState(): HeroTelemetry;
  /**
   * Test hook: jump the animation clock to an absolute time in seconds.
   *
   * Screenshot runs need a specific moment in the orbit, and under a software
   * rasteriser the clock advances far slower than wall time, so waiting is not
   * viable. Seeking makes every captured frame reproducible. It has no effect
   * on how the scene renders — the clock is the same one the render loop
   * already advances.
   */
  seek(seconds: number): void;
  version: string;
}

export interface TelemetryControls {
  seek(seconds: number): void;
}

declare global {
  interface Window {
    __OVMG_HERO__?: HeroTelemetryApi;
  }
}

const EMPTY: HeroTelemetry = {
  ready: false,
  reducedMotion: false,
  quality: 'unknown',
  responsive: 'unknown',
  elapsed: 0,
  scroll: 0,
  pointerX: 0,
  pointerY: 0,
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  programs: 0,
  geometries: 0,
  textures: 0,
  starCount: 0,
  ringCount: 0,
  partners: [],
  assetIssues: [],
  centralPresent: false,
  logoLayer: 'unknown',
};

let current: HeroTelemetry = { ...EMPTY };

export function publishTelemetry(next: HeroTelemetry): void {
  current = next;
}

export function installTelemetry(controls: TelemetryControls): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.__OVMG_HERO__ = {
    version: '1.0.0',
    getState: () => current,
    seek: (seconds: number) => controls.seek(seconds),
  };
  return () => {
    delete window.__OVMG_HERO__;
    current = { ...EMPTY };
  };
}
