/**
 * performanceTier.ts — picks a quality profile from what the device tells us.
 * Deliberately conservative: a wrong guess upward costs frame rate on the
 * device least able to afford it.
 */

import { QUALITY_PROFILES, type QualityProfile, type QualityTier } from '../../hero/heroConfig';

export interface DeviceSignals {
  hardwareConcurrency: number;
  deviceMemory: number | undefined;
  coarsePointer: boolean;
  viewportWidth: number;
  devicePixelRatio: number;
  /** Unmasked WebGL renderer string when available. */
  renderer: string | undefined;
  saveData: boolean;
}

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

export function readDeviceSignals(): DeviceSignals {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const memory = nav ? (nav as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  const connection = nav
    ? (nav as Navigator & { connection?: { saveData?: boolean } }).connection
    : undefined;

  let renderer: string | undefined;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
        const lose = gl.getExtension('WEBGL_lose_context');
        lose?.loseContext();
      }
    } catch {
      renderer = undefined;
    }
  }

  return {
    hardwareConcurrency: nav?.hardwareConcurrency ?? 4,
    deviceMemory: memory,
    coarsePointer:
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    renderer,
    saveData: Boolean(connection?.saveData),
  };
}

/** Pure scoring function so the decision is unit-testable. */
export function scoreDevice(signals: DeviceSignals): QualityTier {
  if (signals.saveData) return 'low';
  if (signals.renderer && SOFTWARE_RENDERER.test(signals.renderer)) return 'low';

  let score = 0;
  score += signals.hardwareConcurrency >= 8 ? 2 : signals.hardwareConcurrency >= 4 ? 1 : 0;
  if (signals.deviceMemory !== undefined) {
    score += signals.deviceMemory >= 8 ? 2 : signals.deviceMemory >= 4 ? 1 : 0;
  } else {
    score += 1; // unknown: assume mid
  }
  score += signals.viewportWidth >= 1280 ? 2 : signals.viewportWidth >= 820 ? 1 : 0;
  if (signals.coarsePointer) score -= 1;
  // A phone pushing 3x DPR is doing far more work per CSS pixel.
  if (signals.devicePixelRatio >= 3 && signals.coarsePointer) score -= 1;

  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

export function resolveQualityProfile(requested: QualityTier | 'auto', signals?: DeviceSignals): QualityProfile {
  if (requested !== 'auto') return QUALITY_PROFILES[requested];
  return QUALITY_PROFILES[scoreDevice(signals ?? readDeviceSignals())];
}

/** DPR actually handed to the renderer. */
export function clampDpr(profile: QualityProfile, devicePixelRatio: number): number {
  return Math.min(profile.maxDpr, Math.max(1, devicePixelRatio));
}
