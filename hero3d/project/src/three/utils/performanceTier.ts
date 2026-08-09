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

/**
 * Pure scoring function so the decision is unit-testable.
 *
 * The earlier version of this function penalised a device for having a touch
 * screen and penalised it AGAIN for having a high-DPR panel. Those two signals
 * together describe every flagship phone made, so a current iPhone scored 0 and
 * was handed the cheapest tier: antialiasing off, half-resolution rendering,
 * anisotropy 2. The rendering artefacts that produced read as "low-poly game",
 * which is the opposite of what the panel is for.
 *
 * The scoring is therefore re-based on what the signals actually mean:
 *
 *   - A dense panel is EVIDENCE OF a capable device, not a burden on it. No
 *     manufacturer ships a 3x display on a GPU that cannot drive one.
 *   - A small viewport is fewer pixels to shade, not a weaker machine.
 *   - `deviceMemory` is unimplemented in Safari, so `undefined` is the normal
 *     reading on every iPhone and iPad and must not be scored as a deficit.
 *
 * A coarse pointer still costs a little, because a phone is genuinely more
 * thermally constrained than a desktop. It is a nudge now, not a veto.
 */
export function scoreDevice(signals: DeviceSignals): QualityTier {
  if (signals.saveData) return 'low';
  if (signals.renderer && SOFTWARE_RENDERER.test(signals.renderer)) return 'low';
  // Genuinely weak hardware, whatever else it reports.
  if (signals.hardwareConcurrency <= 2) return 'low';

  let score = 0;
  score +=
    signals.hardwareConcurrency >= 8 ? 2 : signals.hardwareConcurrency >= 6 ? 1.5 : signals.hardwareConcurrency >= 4 ? 1 : 0;
  if (signals.deviceMemory !== undefined) {
    score += signals.deviceMemory >= 8 ? 2 : signals.deviceMemory >= 4 ? 1 : 0;
  } else {
    // Not reported by Safari at all: assume mid rather than penalise.
    score += 1.5;
  }
  score += signals.viewportWidth >= 1280 ? 2 : signals.viewportWidth >= 820 ? 1.5 : signals.viewportWidth >= 380 ? 1 : 0;
  // A dense panel indicates capable hardware behind it.
  if (signals.devicePixelRatio >= 2) score += 0.5;
  // Thermal headroom, not capability: a nudge, not a veto.
  if (signals.coarsePointer) score -= 0.5;

  if (score >= 5) return 'high';
  if (score >= 2.5) return 'medium';
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
