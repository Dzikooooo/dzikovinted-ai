import { describe, expect, it } from 'vitest';
import { computeRiskLevel } from '../risk';
import { MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE } from '../constants';
import { makeContext } from './fixtures';

describe('computeRiskLevel', () => {
  it('returns "faible" when no risk factor applies', () => {
    const ctx = makeContext({ delistingSamples: [] });
    const result = computeRiskLevel(
      { confidence: 90, priceModel: { marketPrice: 50, source: 'x', dispersion: 0.05 }, competingListingsCount: 3, itemPrice: 45 },
      ctx
    );
    expect(result.riskLevel).toBe('faible');
  });

  it('excludes the liquidity factor entirely when delisting history is insufficient (absence of signal is not a negative signal)', () => {
    const ctx = makeContext({ delistingSamples: [{ daysVisible: 60 }] }); // below the minimum sample size
    const result = computeRiskLevel(
      { confidence: 90, priceModel: { marketPrice: 50, source: 'x', dispersion: 0.05 }, competingListingsCount: 3, itemPrice: 45 },
      ctx
    );
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('revente'))).toBe(false);
  });

  it('activates the liquidity factor once enough delisting samples accumulate, with no code change needed', () => {
    const slowSamples = Array.from({ length: MIN_DELISTED_SAMPLES_FOR_RESALE_ESTIMATE }, () => ({ daysVisible: 45 }));
    const ctx = makeContext({ delistingSamples: slowSamples });
    const result = computeRiskLevel(
      { confidence: 90, priceModel: { marketPrice: 50, source: 'x', dispersion: 0.05 }, competingListingsCount: 3, itemPrice: 45 },
      ctx
    );
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('revente'))).toBe(true);
  });

  it('raises the risk level when multiple factors stack up', () => {
    const ctx = makeContext({ delistingSamples: [] });
    const result = computeRiskLevel(
      { confidence: 15, priceModel: { marketPrice: 50, source: 'x', dispersion: 0.5 }, competingListingsCount: 20, itemPrice: 45 },
      ctx
    );
    expect(result.riskLevel).not.toBe('faible');
  });

  it('flags "eleve" for an extreme underpricing case, even with a stable/large comparable pool (real scan regression)', () => {
    // Preuve reelle : scan du 2026-07-11, "doudoune the north face nuptse 700"
    // a 1 euro pour un marche estime a 85 euros - aucun autre facteur de
    // risque ne l'aurait signale (comparables stables, forte confiance,
    // faible concurrence).
    const ctx = makeContext({ delistingSamples: [] });
    const result = computeRiskLevel(
      { confidence: 100, priceModel: { marketPrice: 85, source: 'x', dispersion: 0.02 }, competingListingsCount: 5, itemPrice: 1 },
      ctx
    );
    expect(result.riskLevel).toBe('eleve');
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('marché'))).toBe(true);
  });

  it('does not flag underpricing risk for a plausible price close to the market estimate', () => {
    const ctx = makeContext({ delistingSamples: [] });
    const result = computeRiskLevel(
      { confidence: 90, priceModel: { marketPrice: 50, source: 'x', dispersion: 0.05 }, competingListingsCount: 3, itemPrice: 42 },
      ctx
    );
    expect(result.breakdown.some((e) => e.label.toLowerCase().includes('marché'))).toBe(false);
  });
});
