import { describe, expect, it } from 'vitest';
import { computeMarketPrice } from '../priceModel';
import { makeContext } from './fixtures';

describe('computeMarketPrice', () => {
  it('returns "Donnees insuffisantes" when the comparable pool is too small and no history exists', () => {
    const ctx = makeContext({ comparablePrices: [50, 55], historicalPriceStats: null });
    const result = computeMarketPrice({ price: 50 }, ctx);
    expect(result.source).toBe('Donnees insuffisantes');
    expect(result.marketPrice).toBe(0);
  });

  it('computes a median-of-comparables price when the pool is large enough (preserves prior behavior)', () => {
    const ctx = makeContext({ comparablePrices: [40, 50, 60, 70], historicalPriceStats: null });
    const result = computeMarketPrice({ price: 40 }, ctx);
    expect(result.marketPrice).toBeGreaterThan(0);
    expect(result.source).toContain('Vinted comps');
  });

  it('falls back to historical stats when the current batch is too small but history exists', () => {
    const ctx = makeContext({
      comparablePrices: [50],
      historicalPriceStats: { median: 80, mean: 80, min: 60, max: 100, sampleSize: 12 },
    });
    const result = computeMarketPrice({ price: 50 }, ctx);
    expect(result.marketPrice).toBe(80);
    expect(result.source).toContain('Historique');
  });

  it('never computes a dispersion value when the pool is too small', () => {
    const ctx = makeContext({ comparablePrices: [50], historicalPriceStats: null });
    const result = computeMarketPrice({ price: 50 }, ctx);
    expect(result.dispersion).toBeNull();
  });
});
