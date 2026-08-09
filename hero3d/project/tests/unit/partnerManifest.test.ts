import { describe, expect, it } from 'vitest';
import { RINGS } from '../../src/hero/heroConfig';
import {
  PARTNERS,
  plateForTone,
  distributePhases,
  normalisePhase,
  partnerNames,
  resolvePartners,
  validateManifest,
  type PartnerDefinition,
} from '../../src/hero/partnerManifest';

const base: PartnerDefinition = {
  id: 'test',
  name: 'Test',
  logoUrl: 'partners/test.webp',
  ring: 0,
  phase: 0,
  scale: 1,
};

describe('shipped manifest', () => {
  it('validates cleanly against the ring table', () => {
    const issues = validateManifest(PARTNERS, RINGS.length);
    expect(issues).toEqual([]);
  });

  it('has a unique id and its own texture file per partner', () => {
    const ids = PARTNERS.map((p) => p.id);
    const urls = PARTNERS.map((p) => p.logoUrl);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('never atlases: every logoUrl is a distinct standalone file', () => {
    for (const partner of PARTNERS) {
      expect(partner.logoUrl).toMatch(/^partners\/[a-z0-9-]+\.(webp|png)$/);
      expect(partner.logoUrl).toContain(partner.id);
    }
  });

  it('assigns every partner to a real ring', () => {
    for (const partner of PARTNERS) {
      expect(partner.ring).toBeGreaterThanOrEqual(0);
      expect(partner.ring).toBeLessThan(RINGS.length);
    }
  });

  it('spreads partners across more than one ring', () => {
    const rings = new Set(PARTNERS.map((p) => p.ring));
    expect(rings.size).toBeGreaterThanOrEqual(3);
  });

  it('exposes every active partner name for assistive technology', () => {
    const names = partnerNames(PARTNERS);
    expect(names.length).toBe(PARTNERS.filter((p) => p.active !== false).length);
    for (const name of names) expect(name.length).toBeGreaterThan(1);
  });
});

describe('validateManifest', () => {
  it('rejects an out-of-range ring', () => {
    const issues = validateManifest([{ ...base, ring: 9 }], RINGS.length);
    expect(issues.some((i) => i.level === 'error' && /outside/.test(i.message))).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const issues = validateManifest([base, { ...base, phase: 3 }], RINGS.length);
    expect(issues.some((i) => /duplicate/.test(i.message))).toBe(true);
  });

  it('rejects an empty logoUrl', () => {
    const issues = validateManifest([{ ...base, logoUrl: '' }], RINGS.length);
    expect(issues.some((i) => /logoUrl/.test(i.message))).toBe(true);
  });

  it('rejects a non-positive scale', () => {
    const issues = validateManifest([{ ...base, scale: 0 }], RINGS.length);
    expect(issues.some((i) => /scale/.test(i.message))).toBe(true);
  });

  it('rejects a non-finite phase', () => {
    const issues = validateManifest([{ ...base, phase: Number.NaN }], RINGS.length);
    expect(issues.some((i) => /phase/.test(i.message))).toBe(true);
  });

  it('warns when two partners cluster on one ring', () => {
    const issues = validateManifest(
      [base, { ...base, id: 'other', logoUrl: 'partners/other.webp', phase: 0.1 }],
      RINGS.length,
    );
    expect(issues.some((i) => i.level === 'warning' && /rad from/.test(i.message))).toBe(true);
  });

  it('ignores inactive partners when checking clustering', () => {
    const issues = validateManifest(
      [base, { ...base, id: 'other', logoUrl: 'partners/other.webp', phase: 0.1, active: false }],
      RINGS.length,
    );
    expect(issues).toEqual([]);
  });
});

describe('resolvePartners', () => {
  it('applies defaults', () => {
    const [resolved] = resolvePartners([base]);
    expect(resolved.emphasis).toBeGreaterThan(0);
    expect(resolved.padding).toBeGreaterThan(0);
    expect(resolved.active).toBe(true);
  });

  it('drops inactive entries but keeps manifest order', () => {
    const resolved = resolvePartners([
      base,
      { ...base, id: 'hidden', active: false },
      { ...base, id: 'third', phase: 2 },
    ]);
    expect(resolved.map((p) => p.id)).toEqual(['test', 'third']);
    expect(resolved[0].index).toBeLessThan(resolved[1].index);
  });

  it('normalises phases into [0, 2pi)', () => {
    const [resolved] = resolvePartners([{ ...base, phase: -1 }]);
    expect(resolved.phase).toBeGreaterThanOrEqual(0);
    expect(resolved.phase).toBeLessThan(Math.PI * 2);
  });

  it('honours an explicit plate override', () => {
    const [resolved] = resolvePartners([{ ...base, plate: 'light' }]);
    expect(resolved.plate).toBe('light');
  });

  it('adding a partner requires only a manifest entry', () => {
    const extended = [...PARTNERS, { ...base, id: 'new-partner', logoUrl: 'partners/new-partner.webp', ring: 2, phase: 5.0 }];
    expect(validateManifest(extended, RINGS.length).filter((i) => i.level === 'error')).toEqual([]);
    expect(resolvePartners(extended).length).toBe(PARTNERS.length + 1);
  });
});

describe('tone handling', () => {
  it('puts dark-ink artwork on a light plate and everything else on a dark one', () => {
    // Partner trademarks may never be recoloured, so the plate is the only
    // lawful contrast lever for a mark drawn in dark ink.
    expect(plateForTone('dark')).toBe('light');
    expect(plateForTone('light')).toBe('dark');
    expect(plateForTone('mixed')).toBe('dark');
  });

  it('gives every shipped partner a valid carrier', () => {
    for (const partner of resolvePartners(PARTNERS)) {
      expect(['none', 'dark', 'light']).toContain(partner.plate);
    }
  });

  it('ships every mark bare, with no plaque behind it', () => {
    for (const partner of resolvePartners(PARTNERS)) {
      expect(partner.plate, `${partner.id} still has a plaque`).toBe('none');
    }
  });

  it('gives only the dark-ink marks an outline to read against', () => {
    const byId = new Map(resolvePartners(PARTNERS).map((p) => [p.id, p]));
    // Dark green/black type needs something behind it.
    expect(byId.get('ess')!.halo).toBeGreaterThan(0);
    // Bright marks read on their own and get nothing.
    expect(byId.get('velatech')!.halo).toBe(0);
    expect(byId.get('ram-global')!.halo).toBe(0);
    expect(byId.get('solr-energy')!.halo).toBe(0);
    expect(byId.get('bright-sun-solar')!.halo).toBe(0);
  });

  it('keeps every outline subtle enough not to read as a plaque', () => {
    for (const partner of resolvePartners(PARTNERS)) {
      expect(partner.halo).toBeLessThanOrEqual(0.65);
    }
  });
});

describe('distributePhases', () => {
  it('spaces every ring evenly', () => {
    const spread = distributePhases(resolvePartners(PARTNERS));
    const byRing = new Map<number, number[]>();
    for (const partner of spread) {
      const list = byRing.get(partner.ring) ?? [];
      list.push(partner.phase);
      byRing.set(partner.ring, list);
    }
    for (const phases of byRing.values()) {
      if (phases.length < 2) continue;
      const sorted = [...phases].sort((a, b) => a - b);
      const expected = (Math.PI * 2) / phases.length;
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i] - sorted[i - 1]).toBeCloseTo(expected, 6);
      }
    }
  });

  it('preserves manifest order', () => {
    const resolved = resolvePartners(PARTNERS);
    const spread = distributePhases(resolved);
    expect(spread.map((p) => p.id)).toEqual(resolved.map((p) => p.id));
  });
});

describe('normalisePhase', () => {
  it('wraps negatives and multiples of 2pi', () => {
    expect(normalisePhase(-0.5)).toBeCloseTo(Math.PI * 2 - 0.5, 10);
    expect(normalisePhase(Math.PI * 4 + 1)).toBeCloseTo(1, 10);
  });
});
