/**
 * partnerManifest.ts — the single source of truth for who appears in the
 * orbital system.
 *
 * To replace a logo:  change `logoUrl` (or drop a new file at the same path).
 * To add a partner:   append one entry. Nothing else in the scene changes.
 * To move a partner:  change `ring` (0..RINGS.length-1) and optionally `phase`.
 * To hide a partner:  set `active: false`.
 *
 * `phase` is the starting angle in radians on its ring. Phases are validated
 * at load so two partners on the same ring can never stack on top of each other.
 */

export type LogoTone = 'light' | 'dark' | 'mixed';

/**
 * Which carrier a mark sits on.
 *   'none'  — the artwork alone, no plaque behind it
 *   'dark'  — smoked-glass plaque with a machined edge
 *   'light' — frosted plaque, for marks drawn in dark ink
 */
export type PlateStyle = 'none' | 'dark' | 'light';

export interface PartnerDefinition {
  /** Stable slug, also used as the texture filename. */
  id: string;
  /** Human name — used for the accessible DOM list and alt text. */
  name: string;
  /** Path relative to the hero's asset root. */
  logoUrl: string;
  /** Index into RINGS. */
  ring: number;
  /** Starting orbital angle, radians. */
  phase: number;
  /** Multiplier on medallion size. */
  scale: number;
  /** 0..1 — brightness/presence of the medallion. Defaults to 0.72. */
  emphasis?: number;
  /** Fraction of the medallion radius kept clear around the logo. 0..0.5 */
  padding?: number;
  /** Measured luminance class of the artwork; drives plate treatment. */
  tone?: LogoTone;
  /**
   * Overrides the plate chosen from `tone`. Set this when a mark reads badly
   * on the default plate — it is the only lawful contrast lever, since partner
   * trademarks must never be recoloured.
   */
  plate?: PlateStyle;
  /**
   * 0..1 light outline traced around the artwork's own silhouette, used
   * only when `plate` is 'none'. It follows the letterforms rather than
   * sitting behind them as a disc, so a mark drawn in dark ink stays legible
   * without reintroducing a bubble. Set to 0 for the artwork completely bare.
   */
  halo?: number;
  /** Extra emissive lift for logos that read dim against the plate. */
  emissiveIntensity?: number;
  /**
   * Width/height of the artwork, from public/partners/assets.json.
   * Used only to size the plaque and frame the camera before the texture has
   * loaded; the real aspect from the decoded image always wins afterwards, and
   * a mismatch is reported in development.
   */
  aspectHint?: number;
  active?: boolean;
}

/**
 * Ring assignment follows the artwork, not the alphabet: compact, near-square
 * marks sit on the tight inner rings where arc length is short, and the wide
 * wordmarks (3.5:1 and 7:1) live on the outer rings where their capsule
 * plaques have room to breathe without crowding the central mark.
 */
export const PARTNERS: PartnerDefinition[] = [
  {
    id: 'ram-global',
    name: 'RAM Global',
    logoUrl: 'partners/ram-global.webp',
    ring: 0,
    phase: 0.5,
    scale: 0.86,
    emphasis: 0.94,
    padding: 0.05,
    tone: 'light',
    plate: 'none',
    aspectHint: 1.0,
    active: true,
  },
  {
    id: 'solr-energy',
    name: 'SOLR Energy',
    logoUrl: 'partners/solr-energy.webp',
    ring: 0,
    phase: 3.64,
    scale: 0.86,
    emphasis: 0.92,
    padding: 0.05,
    tone: 'light',
    plate: 'none',
    aspectHint: 1.2361,
    active: true,
  },
  {
    id: 'tlg-consulting',
    name: 'TLG Consulting',
    logoUrl: 'partners/tlg-consulting.webp',
    ring: 1,
    phase: 1.7,
    scale: 0.86,
    emphasis: 0.86,
    padding: 0.05,
    tone: 'mixed',
    // Deep-blue wordmark under the lion: no plaque, but a feathered glow so
    // the dark type still separates from the field.
    plate: 'none',
    halo: 0.58,
    aspectHint: 1.3778,
    active: true,
  },
  {
    id: 'bright-sun-solar',
    name: 'Bright Sun Solar',
    logoUrl: 'partners/bright-sun-solar.webp',
    ring: 2,
    phase: 4.4,
    scale: 0.87,
    emphasis: 0.86,
    padding: 0.05,
    tone: 'light',
    plate: 'none',
    aspectHint: 1.4504,
    active: true,
  },
  {
    id: 'ess',
    name: 'Energy Storage Solutions',
    logoUrl: 'partners/ess.webp',
    ring: 3,
    phase: 2.4,
    scale: 0.92,
    emphasis: 0.8,
    padding: 0.05,
    tone: 'mixed',
    // Dark green and black type: no plaque, but a feathered glow so the dark
    // type still separates from the field.
    plate: 'none',
    halo: 0.62,
    aspectHint: 3.5068,
    active: true,
  },
  {
    id: 'velatech',
    name: 'Vela Tech',
    logoUrl: 'partners/velatech.webp',
    ring: 4,
    phase: 5.5,
    scale: 0.94,
    emphasis: 0.74,
    padding: 0.05,
    tone: 'mixed',
    plate: 'none',
    aspectHint: 7.0137,
    active: true,
  },
];

export interface ManifestIssue {
  level: 'error' | 'warning';
  partnerId: string;
  message: string;
}

export interface ResolvedPartner
  extends Required<Omit<PartnerDefinition, 'emissiveIntensity' | 'aspectHint' | 'plate' | 'halo'>> {
  emissiveIntensity: number;
  aspectHint: number;
  plate: PlateStyle;
  halo: number;
  /** Position in the manifest, used for deterministic tie-breaks. */
  index: number;
}

const DEFAULTS = {
  emphasis: 0.72,
  padding: 0.05,
  tone: 'mixed' as LogoTone,
  emissiveIntensity: 0.16,
  aspectHint: 1,
  active: true,
};

/**
 * Default carrier for a mark, from its measured tone.
 *
 * The shipped manifest sets 'none' explicitly on every partner — the marks
 * read as objects in their own right rather than badges on plaques. This
 * remains the fallback for a partner added without an explicit , and
 * for dark-ink artwork it picks the light plaque, since partner trademarks may
 * never be recoloured and the plate is the only lawful contrast lever.
 */
export function plateForTone(tone: LogoTone): PlateStyle {
  return tone === 'dark' ? 'light' : 'dark';
}

const TWO_PI = Math.PI * 2;

export function normalisePhase(phase: number): number {
  const wrapped = phase % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/**
 * Validates the manifest against the ring table. Pure — no three.js, no DOM —
 * so it is directly unit-testable.
 */
export function validateManifest(
  partners: PartnerDefinition[],
  ringCount: number,
  minAngularSeparation = 0.55,
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const seenIds = new Set<string>();
  const byRing = new Map<number, { id: string; phase: number }[]>();

  for (const partner of partners) {
    if (seenIds.has(partner.id)) {
      issues.push({ level: 'error', partnerId: partner.id, message: `duplicate partner id "${partner.id}"` });
    }
    seenIds.add(partner.id);

    if (!partner.logoUrl) {
      issues.push({ level: 'error', partnerId: partner.id, message: 'logoUrl is empty' });
    }
    if (!Number.isInteger(partner.ring) || partner.ring < 0 || partner.ring >= ringCount) {
      issues.push({
        level: 'error',
        partnerId: partner.id,
        message: `ring ${partner.ring} is outside 0..${ringCount - 1}`,
      });
      continue;
    }
    if (!Number.isFinite(partner.phase)) {
      issues.push({ level: 'error', partnerId: partner.id, message: 'phase must be a finite number' });
      continue;
    }
    if (!(partner.scale > 0)) {
      issues.push({ level: 'error', partnerId: partner.id, message: 'scale must be > 0' });
    }
    if (partner.active === false) continue;

    const list = byRing.get(partner.ring) ?? [];
    list.push({ id: partner.id, phase: normalisePhase(partner.phase) });
    byRing.set(partner.ring, list);
  }

  // Clustering check: same ring, near-identical phase means overlapping medallions.
  for (const [ring, entries] of byRing) {
    const sorted = [...entries].sort((a, b) => a.phase - b.phase);
    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      const next = sorted[(i + 1) % sorted.length];
      if (sorted.length < 2) break;
      let gap = next.phase - current.phase;
      if (gap < 0) gap += TWO_PI;
      if (gap < minAngularSeparation) {
        issues.push({
          level: 'warning',
          partnerId: current.id,
          message: `only ${gap.toFixed(2)}rad from "${next.id}" on ring ${ring} (min ${minAngularSeparation})`,
        });
      }
    }
  }

  return issues;
}

/** Applies defaults and drops inactive entries. Deterministic ordering. */
export function resolvePartners(partners: PartnerDefinition[] = PARTNERS): ResolvedPartner[] {
  return partners
    .map((partner, index) => ({ partner, index }))
    .filter(({ partner }) => partner.active !== false)
    .map(({ partner, index }) => {
      const tone = partner.tone ?? DEFAULTS.tone;
      return {
        id: partner.id,
        name: partner.name,
        logoUrl: partner.logoUrl,
        ring: partner.ring,
        phase: normalisePhase(partner.phase),
        scale: partner.scale,
        emphasis: partner.emphasis ?? DEFAULTS.emphasis,
        padding: partner.padding ?? DEFAULTS.padding,
        tone,
        emissiveIntensity: partner.emissiveIntensity ?? DEFAULTS.emissiveIntensity,
        aspectHint: partner.aspectHint ?? DEFAULTS.aspectHint,
        plate: partner.plate ?? plateForTone(tone),
        halo: partner.halo ?? 0,
        active: true,
        index,
      };
    });
}

/**
 * Evenly redistributes phases on each ring while preserving manifest order.
 * Used by the debug panel and as a repair path when validation reports
 * clustering; never mutates the manifest itself.
 */
export function distributePhases(partners: ResolvedPartner[], jitter = 0): ResolvedPartner[] {
  const byRing = new Map<number, ResolvedPartner[]>();
  for (const partner of partners) {
    const list = byRing.get(partner.ring) ?? [];
    list.push(partner);
    byRing.set(partner.ring, list);
  }
  const result: ResolvedPartner[] = [];
  for (const [ring, list] of byRing) {
    const step = TWO_PI / list.length;
    list.forEach((partner, i) => {
      const offset = ring * 0.7; // stagger rings so nothing lines up radially
      result.push({ ...partner, phase: normalisePhase(offset + i * step + jitter * (i % 2 ? 1 : -1)) });
    });
  }
  return result.sort((a, b) => a.index - b.index);
}

/** Partner names for the accessible DOM list. */
export function partnerNames(partners: PartnerDefinition[] = PARTNERS): string[] {
  return partners.filter((p) => p.active !== false).map((p) => p.name);
}
