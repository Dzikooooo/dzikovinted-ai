import { describe, expect, it } from 'vitest';
import { buildContext } from '../context';
import { computeScores } from '../scoring';
import { AGING_STOCK_DAYS } from '../constants';
import { daysAgo, makeListing } from './fixtures';

describe('computeScores', () => {
  it('stays at the neutral baseline (50) when there is no signal at all', () => {
    const listing = makeListing({ views: null, favourites: null, purchase_price: null });
    const ctx = buildContext([listing], [], []);
    const scores = computeScores(ctx);
    expect(scores.get(listing.id)?.score).toBe(50);
  });

  it('never fabricates a ROI bonus or penalty when purchase_price is unknown', () => {
    const listing = makeListing({ status: 'vendu', sold_price: 5, purchase_price: null });
    const ctx = buildContext([listing], [], []);
    const scores = computeScores(ctx);
    const breakdown = scores.get(listing.id)?.breakdown ?? [];
    expect(breakdown.some((entry) => entry.label.toLowerCase().includes('roi'))).toBe(false);
  });

  it('penalises an active listing that has been online far longer than the aging threshold', () => {
    const listing = makeListing({
      vinted_status: 'online',
      created_at: daysAgo(AGING_STOCK_DAYS * 3),
    });
    const ctx = buildContext([listing], [], []);
    const scores = computeScores(ctx);
    expect(scores.get(listing.id)?.score).toBeLessThan(50);
  });

  it('clamps the score between 0 and 100', () => {
    const listing = makeListing({
      status: 'vendu',
      sold_price: 1000,
      purchase_price: 1,
      fees: 0,
    });
    const ctx = buildContext([listing], [], []);
    const scores = computeScores(ctx);
    const score = scores.get(listing.id)?.score ?? -1;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
