import { describe, expect, it } from 'vitest';
import { computeConfidence } from '../confidence';

describe('computeConfidence', () => {
  it('preserves the prior data-sufficiency formula (n comparables * 5, capped at 100)', () => {
    const result = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: null }, 50);
    expect(result.confidence).toBe(50);
  });

  it('caps confidence at 100 regardless of sample size', () => {
    const result = computeConfidence(50, { marketPrice: 50, source: 'x', dispersion: null }, 50);
    expect(result.confidence).toBe(100);
  });

  it('never applies a dispersion penalty when dispersion is not computable', () => {
    const result = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: null }, 50);
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('dispers'))).toBe(false);
  });

  it('applies a penalty when price dispersion is high, even with a large sample', () => {
    const stable = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: 0.05 }, 50);
    const volatile = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: 0.5 }, 50);
    expect(volatile.confidence).toBeLessThan(stable.confidence);
  });

  it('never lets an extreme underpricing case reach 100% confidence, even with 20+ comparables (real scan regression)', () => {
    // Preuve reelle : scan du 2026-07-11, "doudoune the north face nuptse 700"
    // a 1 euro pour un marche estime a 85 euros, confiance 100% avec l'ancienne
    // formule (min(100, n*5) sature des que n>=20).
    const result = computeConfidence(20, { marketPrice: 85, source: 'x', dispersion: null }, 1);
    expect(result.confidence).toBeLessThan(100);
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('marché estimé'))).toBe(true);
  });

  it('does not penalize a plausible price close to the market estimate', () => {
    const result = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: null }, 45);
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('marché'))).toBe(false);
  });

  it('explicitly confirms price stability with a zero-delta entry when dispersion is low (below PRICE_DISPERSION_MODERATE)', () => {
    const result = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: 0.05 }, 50);
    const stableEntry = result.breakdown.find((e) => e.label.toLowerCase().includes('stable'));
    expect(stableEntry).toBeDefined();
    expect(stableEntry?.delta).toBe(0);
  });

  it('does not produce a stability confirmation when dispersion is moderate or high', () => {
    const moderate = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: 0.2 }, 50);
    const high = computeConfidence(10, { marketPrice: 50, source: 'x', dispersion: 0.5 }, 50);
    expect(moderate.breakdown.some((e) => e.label.toLowerCase().includes('stable'))).toBe(false);
    expect(high.breakdown.some((e) => e.label.toLowerCase().includes('stable'))).toBe(false);
  });
});
